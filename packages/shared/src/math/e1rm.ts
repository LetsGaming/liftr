/**
 * Estimated one-rep-max formulas. Pure math, public domain — no data source.
 * Imported by both client (optimistic offline display) and server (authoritative recompute)
 * so the two must never diverge; this file is the single source of truth for both.
 */

/** Epley formula — primary estimator (per audit §5). */
export function epley(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

/** Brzycki formula — kept as an alternative/cross-check, not used by default. */
export function brzycki(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps >= 37) return weightKg; // formula degenerates at/above 37 reps
  return (weightKg * 36) / (37 - reps);
}

export interface E1rmResult {
  e1rm: number;
  /** true when reps > 12: single-set e1RM estimates lose reliability at high rep counts. */
  lowConfidence: boolean;
}

/** Estimate 1RM from a single logged set, flagging low-confidence high-rep estimates. */
export function estimateE1rm(weightKg: number, reps: number): E1rmResult {
  return {
    e1rm: epley(weightKg, reps),
    lowConfidence: reps > 12,
  };
}

/** Per-exercise leverage factor for bodyweight movements: how much of bodyweight is lifted. */
export const BODYWEIGHT_LEVERAGE: Record<string, number> = {
  pushup: 0.64,
  pullup: 1.0,
  chinup: 1.0,
  dip: 1.0,
  plank: 1.0,
};

/**
 * Effective "load" for a bodyweight exercise set, so it can be run through the same
 * e1RM/rank math as a loaded lift. `addedWeightKg` covers weighted dips/pull-ups/push-ups.
 */
export function bodyweightLoad(
  bodyweightKg: number,
  leverageFactor: number,
  addedWeightKg = 0,
): number {
  return bodyweightKg * leverageFactor + addedWeightKg;
}
