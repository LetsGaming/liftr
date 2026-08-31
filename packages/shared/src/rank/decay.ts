/**
 * Current-rank decay (rank engine redesign R2). A fixed-window heuristic, not physiology or a
 * real demotion system — same "honest heuristic" convention as recovery.ts: current rank can
 * soften with inactivity, but is hard-floored at the bottom of the peak tier, so it never risks
 * losing all progress. Logging a new set for the exercise resets `daysSinceLastTrained` to 0,
 * snapping current rank back to peak instantly (not gradually) — there is no second "climb back
 * up" grind on top of the one that earned the peak in the first place.
 */
import { DIVISIONS, TIERS, ordinal, type Division, type Tier } from "./tiers.js";

/** No decay before this many days since the exercise was last trained. */
export const RANK_DECAY_GRACE_DAYS = 21;
/** Linear decay from the grace-day mark down to the floor over this many additional days. */
export const RANK_DECAY_WINDOW_DAYS = 60;

export interface RankBand {
  tier: Tier;
  division: Division;
  lp: number;
}

const MAX_ORDINAL = TIERS.length * DIVISIONS.length - 1;

/** Continuous strength position: each tier/division band spans 100 units, LP fills it. */
function bandPosition(band: RankBand): number {
  return ordinal(band.tier, band.division) * 100 + band.lp;
}

function positionToBand(position: number): RankBand {
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
 * Soften `peak` toward the floor (division III / 0 LP of the peak's own tier — never lower)
 * as a linear function of `daysSinceLastTrained`. Within the grace period, returns `peak`
 * unchanged. Past `grace + window` days, returns the floor exactly.
 */
export function computeCurrentBand(peak: RankBand, daysSinceLastTrained: number): RankBand {
  if (daysSinceLastTrained <= RANK_DECAY_GRACE_DAYS) return peak;

  const floor: RankBand = { tier: peak.tier, division: DIVISIONS[0], lp: 0 };
  const daysIntoDecay = daysSinceLastTrained - RANK_DECAY_GRACE_DAYS;
  const t = Math.min(1, daysIntoDecay / RANK_DECAY_WINDOW_DAYS);

  const peakPos = bandPosition(peak);
  const floorPos = bandPosition(floor);
  return positionToBand(peakPos + (floorPos - peakPos) * t);
}
