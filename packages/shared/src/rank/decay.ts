/**
 * Current-rank decay and recovery. A fixed-window heuristic, not physiology or a real demotion
 * system — same "honest heuristic" convention as recovery.ts. Current rank can soften with
 * inactivity, but is hard-floored at the bottom of the peak tier, so it never risks losing all
 * progress. Returning from a decayed state is a buffed multi-session climb (not an instant snap)
 * — see applySessionRecoveryGain below.
 */
import { TIER_DIVISION_COUNT, ordinal, positionToBand, type Tier } from "./tiers.js";

/** No decay before this many days since the exercise was last trained. */
export const RANK_DECAY_GRACE_DAYS = 21;
/** Linear decay from the grace-day mark down to the floor over this many additional days. */
export const RANK_DECAY_WINDOW_DAYS = 60;

/** Unbuffed recovery gain per session, as a fraction of the tier's own max intra-tier span. */
export const RECOVERY_BASE_FRACTION_PER_SESSION = 0.125;
/** Buff applied when the gap is at its largest (just returned from being fully floored); tapers
 *  linearly to 1x (no buff) as current approaches peak. */
export const RECOVERY_MAX_BUFF = 2.5;

export interface RankBand {
  tier: Tier;
  division: number;
  lp: number;
}

/** Continuous strength position: each tier/division band spans 100 units, LP fills it. */
function bandPosition(band: RankBand): number {
  return ordinal(band.tier, band.division) * 100 + band.lp;
}

/**
 * Soften `peak` toward the floor (weakest division / 0 LP of the peak's own tier — never lower)
 * as a linear function of `daysSinceLastTrained`. Within the grace period, returns `peak`
 * unchanged. Past `grace + window` days, returns the floor exactly. This is the passive decay
 * curve, not the return-from-decay path below.
 */
export function computeCurrentBand(peak: RankBand, daysSinceLastTrained: number): RankBand {
  if (daysSinceLastTrained <= RANK_DECAY_GRACE_DAYS) return peak;

  const floor: RankBand = { tier: peak.tier, division: TIER_DIVISION_COUNT[peak.tier], lp: 0 };
  const daysIntoDecay = daysSinceLastTrained - RANK_DECAY_GRACE_DAYS;
  const t = Math.min(1, daysIntoDecay / RANK_DECAY_WINDOW_DAYS);

  const peakPos = bandPosition(peak);
  const floorPos = bandPosition(floor);
  return positionToBand(peakPos + (floorPos - peakPos) * t);
}

/**
 * Buffed multi-session climb-back, replacing the old instant snap-to-peak. Called once per
 * finished workout session that touches this exercise, when the previously-stored
 * current band sits below peak. The buff is derived purely from *how far below peak you are right
 * now* — not from any remembered "how decayed were you when you started" state — so it's always
 * safe to call repeatedly across sessions without needing to track climb-back progress separately
 * from the `ranks` row itself.
 */
export function applySessionRecoveryGain(peak: RankBand, previousCurrent: RankBand): RankBand {
  const peakPos = bandPosition(peak);
  const prevPos = bandPosition(previousCurrent);
  if (prevPos >= peakPos) return peak;

  const tierSpan = TIER_DIVISION_COUNT[peak.tier] * 100;
  const gapFraction = (peakPos - prevPos) / tierSpan;
  const buff = 1 + gapFraction * (RECOVERY_MAX_BUFF - 1);
  const gain = RECOVERY_BASE_FRACTION_PER_SESSION * tierSpan * buff;

  const newPos = prevPos + gain;
  // Return `peak` verbatim rather than round-tripping through positionToBand: a peak stored at
  // e.g. LP 100 of its weakest-representable division and a peak stored as LP 0 of the next
  // division up are the same continuous position but different (tier, division, lp) labels —
  // only returning the original object guarantees byte-for-byte equality once the climb closes.
  if (newPos >= peakPos) return peak;
  return positionToBand(newPos);
}
