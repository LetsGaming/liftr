/**
 * Server-side run-rank recompute — the run-analog of `rankService.ts`'s
 * `recomputeRankForExercise`. Same algorithm shape (scan full history -> track best value + a
 * daily-best map for corroboration -> resolve rank -> corroborate -> reconstruct stored peak ->
 * eligibility gates -> ratchet peak -> decay/recovery if untrained -> next-target -> insert rank
 * event if ranked up -> upsert rank -> PR detection/insert), adapted for running: category
 * instead of exercise, Riegel-adjusted speed (m/s, higher = better) instead of load-ratio/e1RM.
 * Always safe to re-run: `runRanks`/`runPrs` are derived caches, never the source of truth.
 */
import type { LiftrDb } from "@liftr/db";
import {
  nextTargetAtOrdinal,
  runRankValue,
  RUN_CATEGORY_DISTANCE_M,
  ordinal,
  type StandardThreshold,
  type RunPlausibilityReason,
  type RunCategory,
} from "@liftr/shared";
import { computeRankCore } from "./rankAlgorithm.js";
import {
  findRunStandardsForCategory,
  findLoggedRunsForCategory,
  findRunRankByCategory,
  upsertRunRank,
  findBestRunPrByKind,
  insertRunPr,
  insertRunRankEvent,
} from "../repositories/runRankRepository.js";
import { getUserSex, PEAK_ELIGIBILITY_FLOOR, PR_ELIGIBILITY_FLOOR, type RecomputeResult } from "./rankService.js";

/**
 * Recompute one running category's rank from its full rank-eligible run history, detect PRs, and
 * persist both. Called after every finished/synced GPS-tracked run, once per touched category
 * (mirrors `recomputeRankForExercise`'s "once per touched exercise" call convention).
 */
export async function recomputeRunRank(
  db: LiftrDb,
  userId: string,
  category: RunCategory,
  plausibilityMultiplier = 1,
  plausibilityReason: RunPlausibilityReason | null = null,
): Promise<RecomputeResult | null> {
  const sex = await getUserSex(db, userId);
  const thresholdRows = (await findRunStandardsForCategory(db, category)).filter((t) => t.sex === sex);
  if (thresholdRows.length === 0) return null; // no standards ingested yet for this category

  const thresholds: StandardThreshold[] = thresholdRows.map((t) => ({
    tier: t.tier,
    division: t.division,
    threshold: t.threshold,
    trust: t.trust,
  }));

  const loggedRuns = await findLoggedRunsForCategory(db, userId, category, { rankEligibleOnly: true });
  if (loggedRuns.length === 0) return null;

  let bestSpeedMps = -Infinity;
  let bestRun: (typeof loggedRuns)[number] | null = null;
  // Peak corroboration: every run's Riegel-adjusted speed + calendar day is recorded here in the
  // same pass, mirroring rankService.ts's `dailyBest` map exactly.
  const dailyBest = new Map<string, number>(); // day key -> that day's best speedMps

  for (const run of loggedRuns) {
    const { speedMps } = runRankValue(run.distanceM, run.durationS);
    // A degenerate historical row (distanceM<=0 or durationS<=0, e.g. from a malformed GPX/FIT
    // import that skipped manual-entry's `.positive()` validation) produces a non-finite speed via
    // Riegel's division — skip it here so one bad row can't poison this category's whole rank with
    // a NaN that would otherwise flow into resolveRank and get persisted on the runRanks row.
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

  const previousRank = await findRunRankByCategory(db, userId, category);

  // Ratchet-only peak snapshot, reconstructed from the prior runRanks row — same nullable-until-
  // fully-populated convention as rankService.ts's `storedPeak`. `e1rm` here holds the Riegel-
  // adjusted speed (m/s); `ratchetPeak`'s PeakSnapshot type is metric-agnostic (it just compares
  // tier/division/lp and carries one extra numeric field through untouched).
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
  // days since the most recent rank-eligible run in this category.
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
      category,
      tier: peak.tier,
      division: peak.division,
      occurredAt: bestRun.startedAt,
      plausibilityReason,
    });
  }

  await upsertRunRank(db, userId, category, {
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
  // a badly-flagged run cannot produce a PR record at all. Two kinds tracked (speed, time) since
  // they're both meaningful to a runner even though they're mathematically tied to the same
  // bestRun; both are driven off the same bestRun/bestSpeedMps this recompute already found, so
  // they always move together (never independently, unlike strength's mutually-exclusive
  // reps/e1rm kinds) — `newPr` reports whichever kind is checked first when both improve.
  let newPr: RecomputeResult["newPr"] = null;
  if (prEligible) {
    const existingSpeedPr = await findBestRunPrByKind(db, userId, category, "speed");
    if (!existingSpeedPr || bestSpeedMps > existingSpeedPr.value) {
      await insertRunPr(db, userId, {
        category,
        kind: "speed",
        value: bestSpeedMps,
        runId: bestRun.id,
        achievedAt: bestRun.startedAt,
      });
      newPr = { kind: "speed", value: bestSpeedMps };
    }

    // The "time" PR must be the category-equivalent time at the category's exact distance — the
    // exact reciprocal of the already-computed (Riegel-normalized) bestSpeedMps — not the run's raw
    // wall-clock durationS. For an exact-category-distance run these are numerically identical (the
    // Riegel adjustment is a no-op), but for an off-distance run storing the raw duration produces
    // a materially false record (e.g. an 8000m run bucketed into "10k" would otherwise store its
    // raw 8K time as a "10K" record).
    const equivalentTimeS = RUN_CATEGORY_DISTANCE_M[category] / bestSpeedMps;
    const existingTimePr = await findBestRunPrByKind(db, userId, category, "time");
    if (!existingTimePr || equivalentTimeS < existingTimePr.value) {
      await insertRunPr(db, userId, {
        category,
        kind: "time",
        value: equivalentTimeS,
        runId: bestRun.id,
        achievedAt: bestRun.startedAt,
      });
      if (!newPr) newPr = { kind: "time", value: equivalentTimeS };
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
