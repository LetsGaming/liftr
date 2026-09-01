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

/**
 * Best e1RM-based load ratio (e1RM / bodyweight) across a set of logged sets, honoring
 * bodyweight-relative leverage the same way rankService.ts's own per-set loop does. Extracted
 * so a caller that only needs the single best ratio (not the whole tier-resolution machinery —
 * e.g. syncService.ts's plausibility gate, which runs before the full recompute) doesn't have to
 * duplicate the e1RM/bodyweight-leverage math and risk drifting from it. Only meaningful for
 * `load_ratio`-metric exercises; a rep-based (`metric === "reps"`) exercise has no load-ratio
 * concept at all (its `e1rm` field is actually a raw rep count) — callers must not call this for
 * those, since there is nothing here that would flag it.
 */
export function bestLoadRatio(
  sets: { weightKg: number | null; reps: number }[],
  bodyweightKg: number,
  bodyweightConfig: { isBodyweight: boolean; leverageFactor: number } | null,
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const load = bodyweightConfig?.isBodyweight
      ? bodyweightLoad(bodyweightKg, bodyweightConfig.leverageFactor, s.weightKg ?? 0)
      : (s.weightKg ?? 0);
    const ratio = estimateE1rm(load, s.reps).e1rm / bodyweightKg;
    if (best == null || ratio > best) best = ratio;
  }
  return best;
}
