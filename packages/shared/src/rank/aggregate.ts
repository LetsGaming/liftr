/**
 * Overall Lifter Rank (rank engine redesign R3) — a single account-level "how good a lifter am
 * I, overall" number, aggregated across every exercise with a computed rank. Liftr otherwise
 * has ~15+ *independent* per-exercise ladders and nothing answering that question; this is the
 * one genuinely new, single-player-safe idea from the redesign's competitive-games study.
 *
 * Weighted by trust tier so the long-tail synthetic catalog can't dilute or inflate the
 * headline number: `real` and `derived` standards count fully, `synthetic` at half weight.
 * Exercises with no rank yet are excluded entirely (not counted as zero), matching the
 * per-exercise "no rank yet" empty-state philosophy — a brand-new catalog addition can't drag
 * the aggregate down the moment it's added.
 */
import { ordinal, TIERS, DIVISIONS, type Division, type Tier, type TrustTier } from "./tiers.js";

export interface RankInput {
  tier: Tier;
  division: Division;
  lp: number;
  trust: TrustTier;
}

export interface OverallRank {
  tier: Tier;
  division: Division;
  lp: number;
}

const TRUST_WEIGHT: Record<TrustTier, number> = { real: 1, derived: 1, synthetic: 0.5 };

const MAX_ORDINAL = TIERS.length * DIVISIONS.length - 1;

function bandPosition(band: { tier: Tier; division: Division; lp: number }): number {
  return ordinal(band.tier, band.division) * 100 + band.lp;
}

function positionToBand(position: number): OverallRank {
  const clamped = Math.max(0, position);
  let bandIndex = Math.floor(clamped / 100);
  let lp = clamped - bandIndex * 100;
  if (bandIndex > MAX_ORDINAL) {
    bandIndex = MAX_ORDINAL;
    lp = 100;
  }
  const tier = TIERS[Math.floor(bandIndex / DIVISIONS.length)]!;
  const division = DIVISIONS[bandIndex % DIVISIONS.length]!;
  return { tier, division, lp };
}

/**
 * Trust-weighted average of continuous ordinal position (tier×division, continuous via LP
 * within band), mapped back to a display tier/division/LP triple. `null` when there's nothing
 * to aggregate yet (no exercise ranked).
 */
function weightedAverageBand(inputs: RankInput[]): OverallRank | null {
  if (inputs.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const input of inputs) {
    const weight = TRUST_WEIGHT[input.trust];
    weightedSum += bandPosition(input) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;

  return positionToBand(weightedSum / totalWeight);
}

export function computeOverallRank(perExerciseCurrent: RankInput[]): OverallRank | null {
  return weightedAverageBand(perExerciseCurrent);
}

export function computeOverallPeak(perExercisePeak: RankInput[]): OverallRank | null {
  return weightedAverageBand(perExercisePeak);
}
