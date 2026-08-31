/**
 * Server-side rank recompute (plan Phase 2.2 / audit §5 "rank engine runs server-side so it's
 * consistent and cheap to re-derive"). Pure orchestration — all the actual math (e1RM, tier
 * resolution, next-target search) lives in @liftr/shared and is unit-tested there; this file
 * only fetches the rows (via rankRepository.ts) and calls it. Always safe to re-run: `ranks` and
 * `prs` are derived caches, never the source of truth (plan's "every derived table is
 * rebuildable").
 */
import type { LiftrDb } from "@liftr/db";
import {
  estimateE1rm,
  resolveRank,
  nextLoadTarget,
  nextTargetAtOrdinal,
  ordinal,
  ratchetPeak,
  computeCurrentBand,
  type StandardThreshold,
} from "@liftr/shared";
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

/** No bodyweight-tracking UI exists yet (plan Phase 6) — fall back to a configurable default. */
const FALLBACK_BODYWEIGHT_KG = 75;

export async function getCurrentBodyweightKg(db: LiftrDb): Promise<number> {
  const latest = await findLatestBodyweightLog(db);
  if (latest) return latest.weightKg;

  const defaultKg = await readJsonSetting<number>(db, "defaultBodyweightKg");
  if (defaultKg != null) return Number(defaultKg);

  return FALLBACK_BODYWEIGHT_KG;
}

/**
 * QUAL-04: which standards population to rank against. Defaults to "male" when the onboarding
 * profile question is unanswered — the same population ANCHOR_STANDARDS was calibrated against
 * before FEMALE_ANCHOR_STANDARDS existed, so an unset profile keeps today's behavior rather than
 * silently guessing.
 */
export async function getUserSex(db: LiftrDb): Promise<"male" | "female"> {
  const profile = await readJsonSetting<Profile>(db, "profile");
  return profile?.sex ?? "male";
}

export interface RecomputeResult {
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  /** LP within the current tier/division band, 0-100 (engagement rework W2) — returned on
   *  every recompute, not just rank-ups, so the client can animate the in-session rank bar on
   *  every logged set, not only the rare moment it crosses a division. */
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
export async function recomputeRankForExercise(db: LiftrDb, exerciseId: string): Promise<RecomputeResult | null> {
  const exercise = await findExerciseById(db, exerciseId);
  if (!exercise) return null;

  const sex = await getUserSex(db);
  const thresholdRows = await findStandardsForExercise(db, exerciseId, sex);
  if (thresholdRows.length === 0) return null; // e.g. plank/side-plank — no metric modeled yet

  const thresholds: StandardThreshold[] = thresholdRows.map((t) => ({
    tier: t.tier,
    division: t.division as 1 | 2 | 3,
    threshold: t.threshold,
    trust: t.trust,
  }));

  const loggedSets = await findLoggedSetsForExercise(db, exerciseId);
  if (loggedSets.length === 0) return null;

  const metric = thresholdRows[0]!.metric;
  const bodyweightKg = await getCurrentBodyweightKg(db);

  let bestValue = -Infinity;
  let bestSet: (typeof loggedSets)[number] | null = null;
  let bestE1rm = 0;
  let preferredReps = 8;

  for (const s of loggedSets) {
    let value: number;
    let e1rm: number;
    if (metric === "reps") {
      value = s.reps;
      e1rm = s.reps; // no load concept for pure rep-based exercises
    } else {
      const load = exercise.isBodyweight
        ? bodyweightKg * (exercise.bodyweightLeverage ?? 1) + (s.weightKg ?? 0)
        : (s.weightKg ?? 0);
      e1rm = estimateE1rm(load, s.reps).e1rm;
      value = e1rm / bodyweightKg;
    }
    if (value > bestValue) {
      bestValue = value;
      bestSet = s;
      bestE1rm = e1rm;
      preferredReps = s.reps;
    }
  }
  if (!bestSet) return null;

  const rank = resolveRank(bestValue, thresholds);

  const previousRank = await findRankByExerciseId(db, exerciseId);

  // Ratchet-only peak snapshot (rank engine redesign R1) — fixes the bodyweight-ratio
  // regression bug: peak is locked in at the moment it's achieved and never recomputed
  // retroactively against today's bodyweight, so a legitimate bodyweight increase alone can
  // never erase a peak. `storedPeak` is null on the first recompute after the R1 migration (or
  // for a brand-new exercise), which `ratchetPeak` treats as "current always becomes peak."
  const storedPeak =
    previousRank?.peakTier != null &&
    previousRank.peakDivision != null &&
    previousRank.peakLp != null &&
    previousRank.peakE1rm != null &&
    previousRank.peakAchievedAt != null
      ? {
          tier: previousRank.peakTier,
          division: previousRank.peakDivision as 1 | 2 | 3,
          lp: previousRank.peakLp,
          e1rm: previousRank.peakE1rm,
          achievedAt: previousRank.peakAchievedAt.getTime(),
        }
      : null;
  const peak = ratchetPeak(
    { tier: rank.tier, division: rank.division as 1 | 2 | 3, lp: rank.lp, e1rm: bestE1rm },
    bestSet.loggedAt.getTime(),
    storedPeak,
  );

  // A genuine rank-up (R2) is a *peak* advancing, not the displayed current band changing —
  // decay softening or reversing current must never register as a rank-up, only a real new
  // best. `rankedUp` was previously defined against the naive current value; redefining it
  // against peak also fixes a latent bug decay would otherwise introduce: without this, a
  // decay-reversal snap-back (current jumping from a softened band back up to an
  // already-known peak) would have looked like a fresh rank-up and logged a spurious event.
  const rankedUp = !storedPeak || storedPeak.tier !== peak.tier || storedPeak.division !== peak.division;

  // Current-rank decay (rank engine redesign R2) — floor-protected soft decay from peak, based
  // on days since this exercise was last trained (any logged set, not just the best one).
  // Only real training reverses it: logging a new set resets `daysSinceLastTrained` to 0, so
  // recompute (triggered by that same set) snaps current straight back to peak, not gradually.
  const lastTrainedAtMs = loggedSets.reduce((max, s) => Math.max(max, s.loggedAt.getTime()), 0);
  const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));
  const currentBand = computeCurrentBand(
    { tier: peak.tier, division: peak.division, lp: peak.lp },
    daysSinceLastTrained,
  );

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

  // Read-only history of this rank-up (engagement rework W8) — not a new reward mechanic, just
  // a log of the event `rankedUp` above already detects. Fires exactly once per genuine peak
  // tier/division change, never per set logged and never on a decay-only recompute (decay can
  // only move `currentBand`, which `rankedUp` no longer depends on).
  if (rankedUp) {
    await insertRankEvent(db, {
      exerciseId,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestSet.loggedAt,
    });
  }

  await upsertRank(db, {
    exerciseId,
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    e1rm: bestE1rm,
    trust: rank.trust,
    nextTargetWeightKg,
    nextTargetReps,
    peakTier: peak.tier,
    peakDivision: peak.division,
    peakLp: peak.lp,
    peakE1rm: peak.e1rm,
    peakAchievedAt: new Date(peak.achievedAt),
  });

  // PR detection: a new best e1RM (or, for rep-based exercises, a new best rep count) is a PR.
  const prKind = metric === "reps" ? "reps" : "e1rm";
  const existingPr = await findBestPrByKind(db, exerciseId, prKind);
  let newPr: RecomputeResult["newPr"] = null;
  if (!existingPr || bestE1rm > existingPr.value) {
    await insertPr(db, {
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
}

/**
 * Rank-ups grouped by weekday over the current rolling week (engagement rework W8's
 * "Rangaufstiege" calendar strip) — repository fetches the raw rows, this reduces them, the
 * same split `readinessService.ts`'s `computeMuscleLastTrained` already uses. Always returns
 * all 7 weekdays (zero-filled), so the client can render a fixed 7-cell strip without gaps.
 */
export async function computeRankEventsByWeekday(db: LiftrDb, days = 7): Promise<RankEventsByWeekday[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await findRankEventsSince(db, since);

  const counts = new Array<number>(7).fill(0);
  for (const r of rows) {
    counts[r.occurredAt.getDay()]!++;
  }
  return counts.map((count, weekday) => ({ weekday, count }));
}
