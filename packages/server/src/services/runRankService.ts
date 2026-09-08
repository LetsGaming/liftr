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
  resolveRank,
  ordinal,
  positionToBand,
  ratchetPeak,
  computeCurrentBand,
  applySessionRecoveryGain,
  nextTargetAtOrdinal,
  runRankValue,
  type StandardThreshold,
  type RunPlausibilityReason,
  type RunCategory,
} from "@liftr/shared";
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
    if (speedMps > bestSpeedMps) {
      bestSpeedMps = speedMps;
      bestRun = run;
    }
    const dayKey = run.startedAt.toISOString().slice(0, 10);
    const prevDayBest = dailyBest.get(dayKey);
    if (prevDayBest == null || speedMps > prevDayBest) dailyBest.set(dayKey, speedMps);
  }
  if (!bestRun) return null;

  const rank = resolveRank(bestSpeedMps, thresholds);

  // Corroboration: same band-position comparison as rankService.ts, not a raw-speed comparison —
  // a different day only counts if it reaches an equal-or-stronger *band*.
  const bestDayKey = bestRun.startedAt.toISOString().slice(0, 10);
  const candidatePosition = ordinal(rank.tier, rank.division) * 100 + rank.lp;
  let isPeakCorroborated = false;
  for (const [dayKey, dayBestSpeed] of dailyBest) {
    if (dayKey === bestDayKey) continue;
    const dayRank = resolveRank(dayBestSpeed, thresholds);
    const dayPosition = ordinal(dayRank.tier, dayRank.division) * 100 + dayRank.lp;
    if (dayPosition >= candidatePosition) {
      isPeakCorroborated = true;
      break;
    }
  }

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

  const peak = peakEligible
    ? ratchetPeak(
        { tier: rank.tier, division: rank.division, lp: rank.lp, e1rm: bestSpeedMps },
        bestRun.startedAt.getTime(),
        storedPeak,
        isPeakCorroborated,
      )
    : storedPeak;

  // A genuine rank-up is the *peak* advancing, not the displayed current band changing — same
  // reasoning as rankService.ts (decay softening/reversing current must never register as a
  // rank-up).
  const rankedUp = peak != null && (!storedPeak || storedPeak.tier !== peak.tier || storedPeak.division !== peak.division);

  // Current-rank decay/recovery, using the run's own startedAt for "days since last trained" —
  // days since the most recent rank-eligible run in this category.
  const lastTrainedAtMs = loggedRuns.reduce((max, r) => Math.max(max, r.startedAt.getTime()), 0);
  const daysSinceLastTrained = Math.floor((Date.now() - lastTrainedAtMs) / (24 * 60 * 60 * 1000));

  const previousCurrentBand = previousRank
    ? { tier: previousRank.tier, division: previousRank.division, lp: previousRank.lp }
    : null;

  let currentBand: { tier: (typeof rank)["tier"]; division: number; lp: number };
  if (peak == null) {
    currentBand = { tier: rank.tier, division: rank.division, lp: rank.lp };
  } else {
    const passivelyDecayedBand = computeCurrentBand(peak, daysSinceLastTrained);

    const storedPeakPos = storedPeak ? ordinal(storedPeak.tier, storedPeak.division) * 100 + storedPeak.lp : null;
    const hadDecayBacklog =
      previousCurrentBand != null &&
      storedPeakPos != null &&
      ordinal(previousCurrentBand.tier, previousCurrentBand.division) * 100 + previousCurrentBand.lp < storedPeakPos;

    if (hadDecayBacklog && previousCurrentBand && daysSinceLastTrained === 0) {
      const rawGainBand = applySessionRecoveryGain(peak, previousCurrentBand);
      const prevPos = ordinal(previousCurrentBand.tier, previousCurrentBand.division) * 100 + previousCurrentBand.lp;
      const rawGainPos = ordinal(rawGainBand.tier, rawGainBand.division) * 100 + rawGainBand.lp;
      const scaledPos = prevPos + (rawGainPos - prevPos) * plausibilityMultiplier;
      currentBand = positionToBand(scaledPos);
    } else {
      currentBand = passivelyDecayedBand;
    }
  }

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

    const existingTimePr = await findBestRunPrByKind(db, userId, category, "time");
    if (!existingTimePr || bestRun.durationS < existingTimePr.value) {
      await insertRunPr(db, userId, {
        category,
        kind: "time",
        value: bestRun.durationS,
        runId: bestRun.id,
        achievedAt: bestRun.startedAt,
      });
      if (!newPr) newPr = { kind: "time", value: bestRun.durationS };
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
