/**
 * Shared core of `rankService.ts`'s `recomputeRankForExercise` and `runRankService.ts`'s
 * `recomputeRunRank`: resolve a candidate value against thresholds, corroborate it against the
 * rest of the day-keyed history, ratchet the stored peak, detect a genuine rank-up, and run
 * decay/recovery on the displayed current band. Everything metric-specific (extracting `value`
 * per row, next-target unit conversion, PR persistence) stays in the two call sites — this
 * function is pure, metric-agnostic, and does no I/O.
 */
import {
  resolveRank,
  ordinal,
  positionToBand,
  ratchetPeak,
  computeCurrentBand,
  applySessionRecoveryGain,
  type StandardThreshold,
  type PeakSnapshot,
  type RankResult,
  type Tier,
} from "@liftr/shared";

export interface RankBandPosition {
  tier: Tier;
  division: number;
  lp: number;
}

export interface RankCoreResult {
  rank: RankResult;
  isPeakCorroborated: boolean;
  peak: PeakSnapshot | null;
  rankedUp: boolean;
  currentBand: RankBandPosition;
}

/** `position` helper used throughout the algorithm to compare tier/division/lp bands as one
 *  ordered number — hoisted out of both call sites verbatim (`ordinal(tier, division) * 100 + lp`). */
function position(band: { tier: Tier; division: number; lp: number }): number {
  return ordinal(band.tier, band.division) * 100 + band.lp;
}

/**
 * Resolve + corroborate + ratchet + decay/recover one metric's full history into this recompute's
 * rank result. See rankService.ts's `recomputeRankForExercise` for the full rationale behind each
 * step (corroboration, peak-eligibility floor, decay-backlog-gated recovery gain) — this function
 * only contains the mechanics, not the "why", to avoid duplicating that documentation.
 */
export function computeRankCore(params: {
  thresholds: StandardThreshold[];
  /** day key (e.g. UTC calendar day) -> that day's best resolved value */
  dailyBest: Map<string, number>;
  bestValue: number;
  /** Value carried into the peak snapshot's `e1rm` field. For running this is the same as
   *  `bestValue` (speed is both the ranking metric and the displayed peak metric); for strength
   *  this is the separate Epley e1RM estimate, since rank resolution uses the load-ratio/rep
   *  skill score while the peak/PR display uses e1RM — see rankService.ts's `value` vs `e1rm`. */
  peakMetricValue: number;
  bestDayKey: string;
  bestAchievedAtMs: number;
  storedPeak: PeakSnapshot | null;
  previousCurrentBand: RankBandPosition | null;
  peakEligible: boolean;
  plausibilityMultiplier: number;
  daysSinceLastTrained: number;
}): RankCoreResult {
  const {
    thresholds,
    dailyBest,
    bestValue,
    peakMetricValue,
    bestDayKey,
    bestAchievedAtMs,
    storedPeak,
    previousCurrentBand,
    peakEligible,
    plausibilityMultiplier,
    daysSinceLastTrained,
  } = params;

  const rank = resolveRank(bestValue, thresholds);

  // Corroboration: the candidate must have been reached (or bettered) on at least one OTHER day.
  const candidatePosition = position(rank);
  let isPeakCorroborated = false;
  for (const [dayKey, dayBestValue] of dailyBest) {
    if (dayKey === bestDayKey) continue;
    const dayRank = resolveRank(dayBestValue, thresholds);
    if (position(dayRank) >= candidatePosition) {
      isPeakCorroborated = true;
      break;
    }
  }

  const peak = peakEligible
    ? ratchetPeak(
        { tier: rank.tier, division: rank.division, lp: rank.lp, e1rm: peakMetricValue },
        bestAchievedAtMs,
        storedPeak,
        isPeakCorroborated,
      )
    : storedPeak;

  // A genuine rank-up is the *peak* advancing, not the displayed current band changing.
  const rankedUp = peak != null && (!storedPeak || storedPeak.tier !== peak.tier || storedPeak.division !== peak.division);

  let currentBand: RankBandPosition;
  if (peak == null) {
    // No corroborated peak: the freshly-resolved band is all we have, but it must still age —
    // otherwise a single uncorroborated outlier would display forever, since decay elsewhere
    // in this function runs off `peak`. Treat the resolved band as its own decay origin.
    currentBand = computeCurrentBand({ tier: rank.tier, division: rank.division, lp: rank.lp }, daysSinceLastTrained);
  } else {
    const passivelyDecayedBand = computeCurrentBand(peak, daysSinceLastTrained);

    const storedPeakPos = storedPeak ? position(storedPeak) : null;
    const hadDecayBacklog =
      previousCurrentBand != null && storedPeakPos != null && position(previousCurrentBand) < storedPeakPos;

    if (hadDecayBacklog && previousCurrentBand && daysSinceLastTrained === 0) {
      const rawGainBand = applySessionRecoveryGain(peak, previousCurrentBand);
      const prevPos = position(previousCurrentBand);
      const rawGainPos = position(rawGainBand);
      const scaledPos = prevPos + (rawGainPos - prevPos) * plausibilityMultiplier;
      currentBand = positionToBand(scaledPos);
    } else {
      currentBand = passivelyDecayedBand;
    }
  }

  return { rank, isPeakCorroborated, peak, rankedUp, currentBand };
}
