/**
 * Server-side run-rank recompute — the run-analog of `rankService.ts`'s
 * `recomputeRankForExercise`. Same algorithm shape (scan full history -> track best value + a
 * daily-best map for corroboration -> resolve rank -> corroborate -> reconstruct stored peak ->
 * eligibility gates -> ratchet peak -> decay/recovery if untrained -> next-target -> insert rank
 * event if ranked up -> upsert rank -> PR detection/insert), adapted for cardio: a rank bucket
 * (a `RunCategory` for running's distance-ladder, or "all" for a single-speed activity like
 * walk/hike) instead of exercise, average speed (m/s, higher = better) instead of load-ratio/e1RM.
 * Always safe to re-run: `runRanks`/`runPrs` are derived caches, never the source of truth.
 *
 * Running Riegel-normalizes onto its bucket's exact distance before computing speed; single-speed
 * activities use the run's raw distance/duration average with no normalization at all, and are
 * additionally gated on `isRankEligible` — a run below that activity's minimum distance/duration
 * never enters the aggregate (still earns XP/streak, just not rank). See cardioActivities.ts.
 */
import type { LiftrDb } from "@liftr/db";
import {
  cardioActivity,
  isRankEligible,
  nextTargetAtOrdinal,
  runRankValue,
  RUN_CATEGORY_DISTANCE_M,
  ordinal,
  type StandardThreshold,
  type RunPlausibilityReason,
  type RankBucket,
  type RankedActivityType,
} from "@liftr/shared";
import { computeRankCore } from "./rankAlgorithm.js";
import {
  findRunStandardsForBucket,
  findLoggedRunsForBucket,
  findRunRankByBucket,
  upsertRunRank,
  findBestRunPrByKind,
  insertRunPr,
  insertRunRankEvent,
} from "../repositories/runRankRepository.js";
import { getUserSex, PEAK_ELIGIBILITY_FLOOR, PR_ELIGIBILITY_FLOOR, type RecomputeResult } from "./rankService.js";

/** A run's rank-comparable speed (m/s), dispatched by the activity's rank mode: Riegel-normalized
 *  onto the bucket's exact distance for a "distance-ladder" activity (running), or a plain
 *  distance/duration average for "single-speed" (walk/hike) — see this file's module comment for
 *  why single-speed skips normalization entirely. */
function cardioSpeedMps(activityType: RankedActivityType, distanceM: number, durationS: number): number {
  const def = cardioActivity(activityType);
  if (def.rank.mode === "distance-ladder") return runRankValue(distanceM, durationS).speedMps;
  return distanceM / durationS;
}

/**
 * Recompute one activity's rank bucket from its full rank-eligible run history, detect PRs, and
 * persist both. Called after every finished/synced GPS-tracked run, once per touched bucket
 * (mirrors `recomputeRankForExercise`'s "once per touched exercise" call convention).
 */
export async function recomputeRunRank(
  db: LiftrDb,
  userId: string,
  bucket: RankBucket,
  activityType: RankedActivityType,
  plausibilityMultiplier = 1,
  plausibilityReason: RunPlausibilityReason | null = null,
): Promise<RecomputeResult | null> {
  const def = cardioActivity(activityType);

  const sex = await getUserSex(db, userId);
  const thresholdRows = (await findRunStandardsForBucket(db, bucket, activityType)).filter((t) => t.sex === sex);
  if (thresholdRows.length === 0) return null; // no standards ingested yet for this bucket/activity type

  const thresholds: StandardThreshold[] = thresholdRows.map((t) => ({
    tier: t.tier,
    division: t.division,
    threshold: t.threshold,
    trust: t.trust,
  }));

  const allLoggedRuns = await findLoggedRunsForBucket(db, userId, bucket, activityType, { rankEligibleOnly: true });
  // Single-speed activities additionally gate on the activity's minimum distance/duration — a
  // short walk still earns XP/streak (see runImportService.ts), it just never enters the rank
  // aggregate. Running has no such floor (isRankEligible returns true for every distance-ladder
  // activity).
  const loggedRuns = allLoggedRuns.filter((r) => isRankEligible(activityType, r.distanceM, r.durationS));
  if (loggedRuns.length === 0) return null;

  let bestSpeedMps = -Infinity;
  let bestRun: (typeof loggedRuns)[number] | null = null;
  // Peak corroboration: every run's rank-comparable speed + calendar day is recorded here in the
  // same pass, mirroring rankService.ts's `dailyBest` map exactly.
  const dailyBest = new Map<string, number>(); // day key -> that day's best speedMps

  for (const run of loggedRuns) {
    const speedMps = cardioSpeedMps(activityType, run.distanceM, run.durationS);
    // A degenerate historical row (distanceM<=0 or durationS<=0, e.g. from a malformed GPX/FIT
    // import that skipped manual-entry's `.positive()` validation) produces a non-finite speed —
    // skip it here so one bad row can't poison this bucket's whole rank with a NaN that would
    // otherwise flow into resolveRank and get persisted on the runRanks row.
    if (!Number.isFinite(speedMps)) continue;
    if (speedMps > bestSpeedMps) {
      bestSpeedMps = speedMps;
      bestRun = run;
    }
    const dayKey = run.startedAt.toISOString().slice(0, 10);
    const prevDayBest = dailyBest.get(dayKey);
    if (prevDayBest == null || speedMps > prevDayBest) dailyBest.set(dayKey, speedMps);
  }
  if (!bestRun) return null;

  const bestDayKey = bestRun.startedAt.toISOString().slice(0, 10);

  const previousRank = await findRunRankByBucket(db, userId, bucket, activityType);

  // Ratchet-only peak snapshot, reconstructed from the prior runRanks row — same nullable-until-
  // fully-populated convention as rankService.ts's `storedPeak`. `e1rm` here holds the
  // rank-comparable speed (m/s); `ratchetPeak`'s PeakSnapshot type is metric-agnostic (it just
  // compares tier/division/lp and carries one extra numeric field through untouched).
  const storedPeak =
    previousRank?.peakTier != null &&
    previousRank.peakDivision != null &&
    previousRank.peakLp != null &&
    previousRank.peakSpeedMps != null &&
    previousRank.peakAchievedAt != null
      ? {
          tier: previousRank.peakTier,
          division: previousRank.peakDivision,
          lp: previousRank.peakLp,
          e1rm: previousRank.peakSpeedMps,
          achievedAt: previousRank.peakAchievedAt.getTime(),
        }
      : null;

  // Same eligibility floors as strength, imported (not re-declared) from rankService.ts.
  const peakEligible = plausibilityMultiplier >= PEAK_ELIGIBILITY_FLOOR;
  const prEligible = plausibilityMultiplier >= PR_ELIGIBILITY_FLOOR;

  // Current-rank decay/recovery, using the run's own startedAt for "days since last trained" —
  // days since the most recent rank-eligible run in this bucket.
  const lastTrainedAtMs = loggedRuns.reduce((max, r) => Math.max(max, r.startedAt.getTime()), 0);
  const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));

  const previousCurrentBand = previousRank
    ? { tier: previousRank.tier, division: previousRank.division, lp: previousRank.lp }
    : null;

  // Resolve/corroborate/ratchet/decay — identical mechanics to rankService.ts's
  // `recomputeRankForExercise`, factored out into rankAlgorithm.ts's `computeRankCore`. Running
  // has a single metric (speed), so `bestValue` and `peakMetricValue` are the same number here,
  // unlike strength where rank-score and e1RM diverge.
  const { rank, peak, rankedUp, currentBand } = computeRankCore({
    thresholds,
    dailyBest,
    bestValue: bestSpeedMps,
    peakMetricValue: bestSpeedMps,
    bestDayKey,
    bestAchievedAtMs: bestRun.startedAt.getTime(),
    storedPeak,
    previousCurrentBand,
    peakEligible,
    plausibilityMultiplier,
    daysSinceLastTrained,
  });

  // Next-target prediction follows the decayed current band, same as rankService.ts. Running has
  // a single metric (speed) — no load_ratio/reps split, so no nextLoadTarget/nextRepTarget
  // conversion is needed; the raw threshold speed IS the next target.
  const currentOrdinal = ordinal(currentBand.tier, currentBand.division);
  const decayedNextTarget = nextTargetAtOrdinal(thresholds, currentOrdinal);
  const nextTargetSpeedMps = decayedNextTarget?.threshold ?? null;

  if (rankedUp && peak) {
    await insertRunRankEvent(db, userId, {
      activityType,
      category: bucket,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestRun.startedAt,
      plausibilityReason,
    });
  }

  await upsertRunRank(db, userId, bucket, activityType, {
    tier: currentBand.tier,
    division: currentBand.division,
    lp: currentBand.lp,
    bestSpeedMps,
    trust: rank.trust,
    nextTargetSpeedMps,
    peakTier: peak?.tier ?? null,
    peakDivision: peak?.division ?? null,
    peakLp: peak?.lp ?? null,
    peakSpeedMps: peak?.e1rm ?? null,
    peakAchievedAt: peak ? new Date(peak.achievedAt) : null,
  });

  // PR detection: independently gated by prEligible, mirroring rankService.ts's PR hard-block —
  // a badly-flagged run cannot produce a PR record at all.
  let newPr: RecomputeResult["newPr"] = null;
  if (prEligible) {
    const existingSpeedPr = await findBestRunPrByKind(db, userId, bucket, activityType, "speed");
    if (!existingSpeedPr || bestSpeedMps > existingSpeedPr.value) {
      await insertRunPr(db, userId, {
        activityType,
        category: bucket,
        kind: "speed",
        value: bestSpeedMps,
        runId: bestRun.id,
        achievedAt: bestRun.startedAt,
      });
      newPr = { kind: "speed", value: bestSpeedMps };
    }

    // The "time" PR only makes sense for a distance-ladder bucket, where there's a fixed exact
    // distance (RUN_CATEGORY_DISTANCE_M) to divide by — a single-speed bucket ("all") has no such
    // distance, so it gets a speed PR only. The category-equivalent time is the exact reciprocal
    // of the already-computed (Riegel-normalized) bestSpeedMps — not the run's raw wall-clock
    // durationS. For an exact-category-distance run these are numerically identical (the Riegel
    // adjustment is a no-op), but for an off-distance run storing the raw duration produces a
    // materially false record (e.g. an 8000m run bucketed into "10k" would otherwise store its
    // raw 8K time as a "10K" record).
    if (def.rank.mode === "distance-ladder" && bucket !== "all") {
      const equivalentTimeS = RUN_CATEGORY_DISTANCE_M[bucket] / bestSpeedMps;
      const existingTimePr = await findBestRunPrByKind(db, userId, bucket, activityType, "time");
      if (!existingTimePr || equivalentTimeS < existingTimePr.value) {
        await insertRunPr(db, userId, {
          activityType,
          category: bucket,
          kind: "time",
          value: equivalentTimeS,
          runId: bestRun.id,
          achievedAt: bestRun.startedAt,
        });
        if (!newPr) newPr = { kind: "time", value: equivalentTimeS };
      }
    }
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
