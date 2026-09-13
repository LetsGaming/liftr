/**
 * Server-side rank recompute, run here so results are consistent and cheap to re-derive. Pure
 * orchestration — all the actual math (e1RM, tier resolution, next-target search) lives in
 * @liftr/shared and is unit-tested there; this file only fetches the rows (via
 * rankRepository.ts) and calls it. Always safe to re-run: `ranks` and `prs` are derived caches,
 * never the source of truth.
 */
import type { LiftrDb } from "@liftr/db";
import {
  estimateE1rm,
  rankSkillScore,
  nextLoadTarget,
  nextTargetAtOrdinal,
  ordinal,
  type StandardThreshold,
  type PlausibilityReason,
} from "@liftr/shared";
import { computeRankCore } from "./rankAlgorithm.js";
import { findLatestBodyweightLog } from "../repositories/bodyweightRepository.js";
import {
  findBestPrByKind,
  findExerciseById,
  findLoggedSetsForExercise,
  findRankByExerciseId,
  findRankEventsSince,
  findStandardsForExercise,
  insertPr,
  insertRankEvent,
  upsertRank,
} from "../repositories/rankRepository.js";
import { readJsonSetting } from "../repositories/settingsRepository.js";
import type { Profile } from "../routes/settings.js";

/** No bodyweight-tracking UI exists yet — fall back to a configurable default. */
const FALLBACK_BODYWEIGHT_KG = 75;

/**
 * Peak-eligibility floor, hoisted to module scope (was function-local inside
 * `recomputeRankForExercise` below) so `runRankService.ts`'s run-analog recompute can import the
 * exact same value rather than re-declaring it — see that function's own gate for the full
 * rationale (a session has to be quite badly flagged to lose peak eligibility outright).
 */
export const PEAK_ELIGIBILITY_FLOOR = 0.3;

/**
 * PR hard-block floor, hoisted to module scope for the same single-source-of-truth reason as
 * `PEAK_ELIGIBILITY_FLOOR` above — see `recomputeRankForExercise`'s PR-detection block for the
 * full rationale (a PR is a permanent, high-stakes claim and gets zero credit at a much milder
 * degree of flagging than peak eligibility does).
 */
export const PR_ELIGIBILITY_FLOOR = 0.5;

export async function getCurrentBodyweightKg(db: LiftrDb, userId: string): Promise<number> {
  const latest = await findLatestBodyweightLog(db, userId);
  if (latest) return latest.weightKg;

  const defaultKg = await readJsonSetting<number>(db, userId, "defaultBodyweightKg");
  if (defaultKg != null) return Number(defaultKg);

  return FALLBACK_BODYWEIGHT_KG;
}

/**
 * Which standards population to rank against. Defaults to "male" when the onboarding profile
 * question is unanswered — the same population ANCHOR_STANDARDS was calibrated against before
 * FEMALE_ANCHOR_STANDARDS existed, so an unset profile keeps today's behavior rather than
 * silently guessing.
 */
export async function getUserSex(db: LiftrDb, userId: string): Promise<"male" | "female"> {
  const profile = await readJsonSetting<Profile>(db, userId, "profile");
  return profile?.sex ?? "male";
}

export interface RecomputeResult {
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  /** LP within the current tier/division band, 0-100 — returned on every recompute, not just
   *  rank-ups, so the client can animate the in-session rank bar on every logged set, not only
   *  the rare moment it crosses a division. */
  lp: number;
  /** LP before this set, so the client knows how far to animate from. Only meaningful when
   *  compared against `lp` for the *same* tier/division — a rank-up resets the band, so the
   *  client treats rankedUp as "bar fills to 100 then resets", not "prevLp -> lp directly". */
  prevLp: number;
}

/**
 * Recompute one exercise's rank from its full set history, detect PRs, and persist both.
 * Called after every finished workout, once per touched exercise (see services/syncService.ts).
 */
export async function recomputeRankForExercise(
  db: LiftrDb,
  userId: string,
  exerciseId: string,
  plausibilityMultiplier = 1,
  plausibilityReason: PlausibilityReason | null = null,
): Promise<RecomputeResult | null> {
  const exercise = await findExerciseById(db, exerciseId);
  if (!exercise) return null;

  const sex = await getUserSex(db, userId);
  const thresholdRows = await findStandardsForExercise(db, exerciseId, sex);
  if (thresholdRows.length === 0) return null; // e.g. plank/side-plank — no metric modeled yet

  const thresholds: StandardThreshold[] = thresholdRows.map((t) => ({
    tier: t.tier,
    division: t.division,
    threshold: t.threshold,
    trust: t.trust,
  }));

  const loggedSets = await findLoggedSetsForExercise(db, userId, exerciseId);
  if (loggedSets.length === 0) return null;

  const metric = thresholdRows[0]!.metric;
  const bodyweightKg = await getCurrentBodyweightKg(db, userId);

  let bestValue = -Infinity;
  let bestSet: (typeof loggedSets)[number] | null = null;
  let bestE1rm = 0;
  let preferredReps = 8;
  // Peak corroboration: every set's resolved value + calendar day is recorded here in the same
  // pass, so the corroboration check below can re-scan history without recomputing the
  // load/rankSkillScore formula a second time.
  const dailyBest = new Map<string, number>(); // day key -> that day's best `value`

  for (const s of loggedSets) {
    // `value` drives tier/rank resolution (resolveRank below) and picks which set is "best" —
    // it uses rank's own skill-score curve, NOT Epley. `e1rm` is the separate, unchanged Epley
    // estimate stored for display and PR tracking (rankRepository's `ranks.e1rm`/`peakE1rm`, and
    // the `prs` table below) — rank scoring and PR/e1RM tracking are deliberately independent
    // measures. The two can diverge (a high-rep set can be the rank-best set while a different,
    // heavier set holds the higher Epley PR); that's expected, not a bug — see rankSkillScore's
    // doc comment.
    let value: number;
    let e1rm: number;
    if (metric === "reps") {
      value = s.reps;
      e1rm = s.reps; // no load concept for pure rep-based exercises
    } else {
      const load = exercise.isBodyweight
        ? bodyweightKg * (exercise.bodyweightLeverage ?? 1) + (s.weightKg ?? 0)
        : (s.weightKg ?? 0);
      value = rankSkillScore(load, s.reps) / bodyweightKg;
      e1rm = estimateE1rm(load, s.reps).e1rm;
    }
    if (value > bestValue) {
      bestValue = value;
      bestSet = s;
      bestE1rm = e1rm;
      preferredReps = s.reps;
    }
    // UTC calendar day as the "session" proxy — simple, consistent with this loop's own
    // no-DB-round-trip style, and precise enough for "was this reached on a genuinely separate
    // occasion" (the actual property corroboration needs), not exact session boundaries.
    const dayKey = s.loggedAt.toISOString().slice(0, 10);
    const prevDayBest = dailyBest.get(dayKey);
    if (prevDayBest == null || value > prevDayBest) dailyBest.set(dayKey, value);
  }
  if (!bestSet) return null;

  const bestDayKey = bestSet.loggedAt.toISOString().slice(0, 10);

  const previousRank = await findRankByExerciseId(db, userId, exerciseId);

  // Ratchet-only peak snapshot: peak is locked in at the moment it's achieved and never
  // recomputed retroactively against today's bodyweight, so a legitimate bodyweight increase
  // alone can never erase a peak. `storedPeak` is null for a brand-new exercise (or one with no
  // prior peak yet) — `ratchetPeak`'s own corroboration gate applies here exactly like
  // everywhere else (`if (!isCorroborated) return storedPeak`), so a genuinely first-ever session
  // does NOT seed a peak by itself; it stays null until a second, separate day matches or exceeds
  // it (see the corroboration block below and tests/server/services/rankAntiCheat.test.ts).
  const storedPeak =
    previousRank?.peakTier != null &&
    previousRank.peakDivision != null &&
    previousRank.peakLp != null &&
    previousRank.peakE1rm != null &&
    previousRank.peakAchievedAt != null
      ? {
          tier: previousRank.peakTier,
          division: previousRank.peakDivision,
          lp: previousRank.peakLp,
          e1rm: previousRank.peakE1rm,
          achievedAt: previousRank.peakAchievedAt.getTime(),
        }
      : null;

  // Plausibility gate: a badly-flagged session's sets are excluded from peak
  // advancement entirely, not just discounted — the peak ratchet is the one thing in this system
  // meant to be un-fakeable. PEAK_ELIGIBILITY_FLOOR (module-level, see above) intentionally
  // matches the plausibility module's own PLAUSIBILITY_FLOOR-adjacent low end; a session has to be
  // quite badly flagged to lose peak eligibility outright, since most flagged sessions should
  // still discount rather than block.
  const peakEligible = plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR;

  // PR hard-block: stricter than peak eligibility on purpose. A PR is the single highest-trust,
  // highest-stakes artifact this system produces — it is a permanent, individually-displayed
  // claim ("you hit X on this exact date"), not a continuously-recomputable derived value the
  // way `peak`/`currentBand` are. Peak eligibility is deliberately forgiving (0.3 — only the most
  // badly flagged sessions lose it) because most flagged sessions should still discount rather
  // than block; a PR gets zero credit at a much milder degree of flagging instead of a discount.
  // With the plausibility.ts thresholds this works out to roughly: a same-session e1RM jump
  // beyond ~58% over the stored peak, a whole-session pace at/under ~10.5s/set, or (the ceiling
  // check is a hard 0/1, not a gradient) exceeding the value ceiling at all, which always zeroes
  // PR eligibility outright. That leaves a normal ~40-55% single-session breakthrough — a
  // legitimate "short rest, good day" case — still eligible for a PR, while a session flagged
  // enough to already be trending toward the peak-eligibility floor loses PR credit well before
  // it gets there. (PR_ELIGIBILITY_FLOOR is module-level, see above.)
  const prEligible = plausibilityMultiplier >= PR_ELIGIBILITY_FLOOR;

  // `peak` is `null` when either of two independent gates hasn't cleared yet — a badly flagged
  // session with no `storedPeak` yet (the improbable-jump check can't fire without a prior peak
  // to compare against, so a flagged first-ever session must not quietly seed one), OR a
  // genuinely plausible result that simply hasn't been corroborated on a second day yet. Either
  // way, a later session is what gets to establish/advance the peak — `ratchetPeak` itself
  // returns `storedPeak` unchanged (possibly still `null`) whenever `isCorroborated` is false, so
  // this is no longer unconditionally non-null once `peakEligible` is true.
  //
  // `rankedUp` is a *peak* advancing, not the displayed current band changing — decay softening
  // or reversing current must never register as a rank-up, only a real new best.
  //
  // Current-rank recovery (decay/recovery-gain) is throttled by `plausibilityMultiplier` only when
  // there was a genuine decay backlog going into this recompute (`previousCurrentBand` sat below
  // the OLD `storedPeak`) AND the recompute was triggered by a session logged today
  // (`daysSinceLastTrained === 0`) — a lifter fully caught up who hits a genuine new PR in the same
  // session must see it reflected immediately, not throttled as if returning from a decay gap.
  // `pnpm recompute`'s maintenance/rebuild path also calls this function and will also apply the
  // buffed path whenever it happens to run on the same day an exercise was trained — an accepted
  // simplification (the peak ratchet already has the same "not fully re-derivable from a single
  // from-scratch pass" property). See rankAlgorithm.ts's `computeRankCore` for the shared mechanics
  // (identical to runRankService.ts's `recomputeRunRank`) and this file's own tests for the exact
  // corroboration/decay/PR-eligibility scenarios these gates exist for.
  const lastTrainedAtMs = loggedSets.reduce((max, s) => Math.max(max, s.loggedAt.getTime()), 0);
  const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));

  const previousCurrentBand = previousRank
    ? { tier: previousRank.tier, division: previousRank.division, lp: previousRank.lp }
    : null;

  const { rank, peak, rankedUp, currentBand } = computeRankCore({
    thresholds,
    dailyBest,
    bestValue,
    peakMetricValue: bestE1rm,
    bestDayKey,
    bestAchievedAtMs: bestSet.loggedAt.getTime(),
    storedPeak,
    previousCurrentBand,
    peakEligible,
    plausibilityMultiplier,
    daysSinceLastTrained,
  });

  // Next-target predictions follow the *decayed* current band, not the freshly-resolved naive
  // value — a softened display would otherwise show a next target the lifter has technically
  // already cleared.
  const currentOrdinal = ordinal(currentBand.tier, currentBand.division);
  const decayedNextTarget = nextTargetAtOrdinal(thresholds, currentOrdinal);
  const nextTargetWeightKg =
    metric === "load_ratio" && decayedNextTarget
      ? nextLoadTarget(decayedNextTarget.threshold, bodyweightKg, preferredReps).weightKg
      : null;
  const nextTargetReps =
    metric === "load_ratio" && decayedNextTarget
      ? nextLoadTarget(decayedNextTarget.threshold, bodyweightKg, preferredReps).reps
      : metric === "reps"
        ? (decayedNextTarget?.threshold ?? null)
        : null;

  // Read-only history of this rank-up — not a new reward mechanic, just a log of the event
  // `rankedUp` above already detects. Fires exactly once per genuine peak
  // tier/division change, never per set logged and never on a decay-only recompute (decay can
  // only move `currentBand`, which `rankedUp` no longer depends on).
  if (rankedUp && peak) {
    await insertRankEvent(db, userId, {
      exerciseId,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestSet.loggedAt,
      plausibilityReason,
    });
  }

  await upsertRank(db, userId, {
    exerciseId,
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    e1rm: bestE1rm,
    trust: rank.trust,
    nextTargetWeightKg,
    nextTargetReps,
    peakTier: peak?.tier ?? null,
    peakDivision: peak?.division ?? null,
    peakLp: peak?.lp ?? null,
    peakE1rm: peak?.e1rm ?? null,
    peakAchievedAt: peak ? new Date(peak.achievedAt) : null,
  });

  // PR detection: a new best e1RM (or, for rep-based exercises, a new best rep count) is a PR —
  // but only when this session clears PR_ELIGIBILITY_FLOOR above. A badly-flagged session cannot
  // produce a PR record at all, not merely a discounted one: `bestE1rm` itself is never
  // discounted (unlike XP/LP), so without this gate a fabricated or mis-entered set would still
  // write a permanent PR row even while its XP/LP contribution was heavily reduced.
  const prKind = metric === "reps" ? "reps" : "e1rm";
  const existingPr = await findBestPrByKind(db, userId, exerciseId, prKind);
  let newPr: RecomputeResult["newPr"] = null;
  if (prEligible && (!existingPr || bestE1rm > existingPr.value)) {
    await insertPr(db, userId, {
      exerciseId,
      kind: prKind,
      value: bestE1rm,
      setId: bestSet.id,
      achievedAt: bestSet.loggedAt,
    });
    newPr = { kind: prKind, value: bestE1rm };
  }

  return {
    rankedUp,
    newPr,
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    prevLp: previousRank?.lp ?? 0,
  };
}

export interface RankEventsByWeekday {
  /** JS `Date.getDay()`-indexed: 0 = Sunday ... 6 = Saturday, same convention as the client's
   *  existing `DAY_ABBR` table (useWorkoutFinish.ts) — kept identical so a future caller never
   *  has to remap between the two. */
  weekday: number;
  count: number;
  /** Count of this weekday's rank-ups whose originating workout was plausibility-flagged — lets
   *  the client mute a day's dot when every rank-up logged that day was discounted, without
   *  omitting the day's existence outright the way dropping it from `count` entirely would. */
  flaggedCount: number;
}

/**
 * Rank-ups grouped by weekday over the current rolling week, for the "Rangaufstiege" calendar
 * strip — repository fetches the raw rows, this reduces them, the same split
 * `readinessService.ts`'s `computeMuscleLastTrained` already uses. Always returns all 7 weekdays
 * (zero-filled), so the client can render a fixed 7-cell strip without gaps.
 */
export async function computeRankEventsByWeekday(db: LiftrDb, userId: string, days = 7): Promise<RankEventsByWeekday[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await findRankEventsSince(db, userId, since);

  const counts = new Array<number>(7).fill(0);
  const flagged = new Array<number>(7).fill(0);
  for (const r of rows) {
    const weekday = r.occurredAt.getDay();
    counts[weekday]!++;
    if (r.plausibilityReason != null) flagged[weekday]!++;
  }
  return counts.map((count, weekday) => ({ weekday, count, flaggedCount: flagged[weekday]! }));
}
