/**
 * XP / level system (plan Phase 6.4) — purely additive, never gates or replaces the rank
 * system. Per-set XP scales with the exercise's current rank tier so raw volume on an easy
 * lift doesn't outweigh real strength progress on a hard one; bodyweight sets (no logged
 * weight) use a nominal implied load rather than earning zero.
 */
import type { Tier } from "../rank/tiers.js";

export const TIER_XP_MULTIPLIER: Record<Tier, number> = {
  initiate: 0.9,
  apprentice: 1,
  trainee: 1.05,
  athlete: 1.15,
  lifter: 1.2,
  advanced: 1.3,
  elite: 1.4,
  expert: 1.5,
  apex: 1.75,
};

export const BODYWEIGHT_NOMINAL_LOAD_KG = 30;

/** Feedback: "doing the same exact exercise (same reps, same weight) should give less and less
 *  xp... it should engage the user to get further and further in their training." Decays toward
 *  a floor rather than to zero — grinding the identical numbers still earns *something*, it just
 *  earns progressively less, which is what nudges someone toward more weight or more reps instead
 *  of feeling punished for repeating a workout at all. */
export const REPEAT_XP_DECAY_STEP = 0.15;
export const REPEAT_XP_FLOOR_MULTIPLIER = 0.5;

/** Multiplier for the Nth time (1-indexed, `occurrence` = 1 on first-ever performance) an
 *  identical exercise+weight+reps combo has been logged. */
export function repeatSetMultiplier(occurrence: number): number {
  return Math.max(REPEAT_XP_FLOOR_MULTIPLIER, 1 / (1 + REPEAT_XP_DECAY_STEP * (occurrence - 1)));
}

/** Load-bucket quantization used only for the repeat-decay occurrence key in `computeTotalXp`
 *  (see below) — sized proportionally to load so a cosmetic nudge means less on a heavy lift and
 *  more on a light one. Exported so the sizing/anti-cheat properties can be tested directly. */
const LOAD_BUCKET_RATIO = 0.05; // ~5% of load per bucket step
const LOAD_BUCKET_MIN_KG = 1.25; // smallest real plate increment — floor so light lifts aren't over-bucketed

/** Quantizes a weight into a coarse "load band" string for use in the repeat-decay occurrence
 *  key (`computeTotalXp`), NOT for XP magnitude (see `computeSetXp` below, which no longer uses
 *  weight at all). Anti-cheat purpose: since XP magnitude no longer depends on typed weight, a
 *  user could otherwise dodge `repeatSetMultiplier`'s decay forever by nudging the typed weight
 *  by a fraction of a kg between otherwise-identical sets, since each "new" weight would look like
 *  a first-ever occurrence. Bucketing collapses cosmetic nudges into the same key while still
 *  letting a genuinely different load (a real progression) register as a new occurrence-1 key.
 *
 *  Implementation note: this buckets in *log space*, not by computing `step = weightKg * ratio`
 *  and rounding `weightKg / step` directly — that naive version is a no-op, since
 *  `weightKg / (weightKg * ratio)` always reduces to the constant `1 / ratio` before rounding, so
 *  it never actually separates two different weights into different buckets above the floor.
 *  Instead, each band is a fixed-width step in `ln(weightKg)` (band width `ln(1 + ratio)`, so
 *  crossing one band multiplies the load by roughly `(1 + ratio)`), which is what gives a
 *  genuinely load-proportional bucket width: 0.5kg is a big jump relative to a 10kg lift (few
 *  bands wide) but negligible relative to a 200kg lift (same band). Returning the band *index*
 *  (not a re-derived weight) avoids a second rounding step that could itself wobble. */
export function quantizeLoadForDecay(weightKg: number | null): string {
  if (weightKg == null) return "bw"; // bodyweight sets: unchanged, one bucket
  const clamped = Math.max(weightKg, LOAD_BUCKET_MIN_KG);
  const bandWidth = Math.log1p(LOAD_BUCKET_RATIO); // ln(1 + ratio): the log-space step per band
  const band = Math.round(Math.log(clamped / LOAD_BUCKET_MIN_KG) / bandWidth);
  return String(band);
}

export function computeSetXp(
  // Intentionally still a parameter, even though it no longer affects the returned magnitude
  // below (see the design rationale in the module comment and in `quantizeLoadForDecay`): the
  // repeat-decay anti-cheat key computed by `computeTotalXp` still needs the raw typed weight to
  // derive its quantized load bucket. Do NOT "clean up" this parameter — removing it here is fine
  // for this function's own math, but keeping the signature stable keeps every call site passing
  // the real weight through, which is what `computeTotalXp` depends on.
  weightKg: number | null,
  reps: number,
  tier: Tier | null,
  repeatOccurrence = 1,
  plausibilityMultiplier = 1,
): number {
  void weightKg; // no longer used for load magnitude — see comment above
  const load = BODYWEIGHT_NOMINAL_LOAD_KG;
  const multiplier = tier ? TIER_XP_MULTIPLIER[tier] : 1;
  return load * reps * multiplier * repeatSetMultiplier(repeatOccurrence) * plausibilityMultiplier;
}

export interface XpSetInput {
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  tier: Tier | null;
  /** epoch ms — determines occurrence order for the repeat-set decay above. */
  loggedAt: number;
  /** Defaults to 1 (no discount) when omitted — most callers don't have a flagged workout. */
  plausibilityMultiplier?: number;
}

/** Sums XP across a full set history, applying the repeat-set decay per exercise+weight+reps
 *  combo in chronological order. The single source of truth for "how much XP has this person
 *  earned in total" — GET /api/xp and anything that needs the same number must go through this
 *  rather than re-summing `computeSetXp` itself, or the repeat-decay would silently not apply. */
export function computeTotalXp(sets: XpSetInput[]): number {
  const sorted = [...sets].sort((a, b) => a.loggedAt - b.loggedAt);
  const occurrenceByKey = new Map<string, number>();
  let total = 0;
  for (const s of sorted) {
    const key = `${s.exerciseId}|${quantizeLoadForDecay(s.weightKg)}|${s.reps}`;
    const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
    occurrenceByKey.set(key, occurrence);
    total += computeSetXp(s.weightKg, s.reps, s.tier, occurrence, s.plausibilityMultiplier ?? 1);
  }
  return total;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

/** level = floor(sqrt(totalXp / 100)) — an accelerating curve, so early levels come fast. */
export function computeLevel(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  const level = Math.floor(Math.sqrt(xp / 100));
  const levelFloorXp = level ** 2 * 100;
  const nextLevelXp = (level + 1) ** 2 * 100;
  const xpIntoLevel = xp - levelFloorXp;
  const xpForNextLevel = nextLevelXp - levelFloorXp;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: xpForNextLevel > 0 ? Math.round((xpIntoLevel / xpForNextLevel) * 100) : 0,
  };
}

/** Fires once per finished workout (see the streak/XP mechanics redesign spec,
 *  `docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md`, §2). Structurally
 *  un-fabricable: requires genuine, calendar-spread finished workouts via the existing
 *  `computeStreak` mechanism (unchanged, token-protected). Deliberately monotonic and
 *  milestone-free — `Math.sqrt` of a capped streak length means the curve rises fast early
 *  (satisfying "day 1 already feels like a real reward") and flattens smoothly, never dips, and
 *  never has a threshold to "reset and re-farm." This is what makes maintaining a streak always
 *  at least as good as breaking and rebuilding one. */
export const CONSISTENCY_BASE = 300;
export const CONSISTENCY_SCALE = 550;
/** ~75 days: in the 60-90 day range the spec calls for (roughly 5-7.5 months at 3
 *  sessions/week) — a beginner sees this term visibly climbing through their entire early
 *  habit-forming period, not a multi-year plateau. */
export const CONSISTENCY_STREAK_CAP = 75;

export function computeConsistencyBonus(streakDays: number): number {
  const cappedDays = Math.min(Math.max(0, streakDays), CONSISTENCY_STREAK_CAP);
  return CONSISTENCY_BASE + CONSISTENCY_SCALE * Math.sqrt(cappedDays);
}

/** Fires once per finished workout (see the redesign spec §3). Additive-only by construction —
 *  `newMuscleCount` can never be negative and the result is a plain non-negative product, so this
 *  term can never read as a penalty. Purely a count of muscles trained this session that weren't
 *  trained in the immediately-preceding finished session — never punishes specialization, since
 *  the comparison is always against the user's own prior session, never a full-body checklist. */
export const VARIETY_PER_MUSCLE = 500;
export const VARIETY_MAX_MUSCLES_PER_SESSION = 5;

export function computeVarietyBonus(newMuscleCount: number): number {
  const count = Math.min(Math.max(0, newMuscleCount), VARIETY_MAX_MUSCLES_PER_SESSION);
  return VARIETY_PER_MUSCLE * count;
}

/**
 * Worked sizing table (for product-owner review before this workstream merges), a hypothetical
 * consistent 3x/week user. Per-set XP is a rough estimate for a ~10-set typical session — early
 * on, sets are mostly first-occurrence (no repeat-decay, since `computeSetXp` no longer scales
 * with weight, only with reps/tier/decay); by month 1+, repeated weekly combos accrue meaningful
 * repeat-decay, which is why per-set XP is *highest* right at day 1 and settles lower afterward,
 * even as tier multiplier creeps up with real progress. `streakDays` is approximated as elapsed
 * calendar days (token-protected rest days mean a 3x/week cadence keeps the streak alive).
 * `totalXp` is a rough running sum across ~3 sessions/week up to that point (not an exact
 * simulation — averaging each period's per-session total against the prior one).
 *
 * | Point    | streakDays | Per-set XP (session) | Consistency bonus | Variety bonus | Session XP | ~totalXp | Level |
 * |----------|-----------:|----------------------:|-------------------:|---------------:|-----------:|---------:|------:|
 * | Day 1    |          1 |                  2280 |                 850 |           1500 |       4630 |     4630 |     6 |
 * | Week 2   |         14 |                  2040 |                2358 |           1000 |       5398 |    30084 |    17 |
 * | Month 1  |         30 |                  1390 |                3312 |           1500 |       6202 |    70408 |    26 |
 * | Month 3  |         90 |                  1380 |    5063 (cap @ d75) |           1500 |       7943 |   245175 |    49 |
 * | Month 6  |        180 |                  1440 |    5063 (cap @ d75) |           1500 |       8003 |   486371 |    69 |
 *
 * Ordering check (binding per the spec, "past their first month"): at Month 1/3/6, per-set XP
 * (1390/1380/1440) < variety bonus (1500) < consistency bonus (3312/5063/5063) — consistency is
 * the largest single contributor, per-set is the smallest, variety sits between. The Month 3 vs.
 * Month 6 rows also demonstrate the required flat-past-cap property directly: the consistency
 * bonus is identical at both points because `CONSISTENCY_STREAK_CAP` (75 days) is reached before
 * Month 3 — streak-resetting after that point could only ever cost XP, never gain it.
 */
