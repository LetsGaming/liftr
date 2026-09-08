/**
 * Estimated one-rep-max formulas. Pure math, public domain — no data source.
 * Imported by both client (optimistic offline display) and server (authoritative recompute)
 * so the two must never diverge; this file is the single source of truth for both.
 */

/** Epley formula — primary estimator. */
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

/**
 * Rank's skill-score rep multiplier — replaces Epley's `1 + reps/30` for rank scoring
 * specifically. `epley`/`estimateE1rm` above are UNCHANGED and stay the honest 1RM estimate for
 * PR tracking and UI display; this is a deliberately separate curve, consumed only by
 * `rankSkillScore`/`bestRankSkillRatio` below.
 *
 * Three zones: hypertrophy shows no real "12-rep cliff" (the common claim is a myth), but the literature
 * supporting that relies entirely on failure-verified sets, and failure-dependency is asymmetric
 * by load — a heavy low-rep set's value barely depends on whether it was truly taken to failure,
 * while a high-rep set's value depends on it heavily. Since a logged set carries no failure signal,
 * high-rep credit is structurally more exploitable than low-rep credit. Hence three zones rather
 * than either an unbounded curve or a 12-rep cap:
 *
 *   - 1-12 reps: identical to Epley's own slope (1/30 per rep) — the well-supported,
 *     low-failure-ambiguity zone regardless of load.
 *   - 12-20 reps: a steeper slope (`ZONE_2_SLOPE_FACTOR` x the base slope) — real, evidence-backed
 *     credit for genuinely hard higher-rep work that Epley's flat linear slope underweights.
 *   - past 20 reps: the zone-2 slope damped by `ZONE_3_DAMPING` — reps keep earning credit (this is
 *     not a re-introduction of the debunked 12-rep cap), just at a heavily reduced marginal rate,
 *     reflecting that effort/failure-proximity gets progressively less verifiable from rep count
 *     alone the further out this goes.
 *
 * Deliberately a purpose-built piecewise curve rather than a classic formula (e.g. Wathan) reused
 * outside the rep range it was fit for: Wathan's constants asymptote toward ~2.05x and are
 * *lower* than Epley's own unbounded linear growth by the time reps reach the 20s, which would
 * give LESS credit for high reps than today, the opposite of this section's intent. Piecewise-
 * linear in the multiplier (not the load) keeps the curve trivially monotonic and continuous by
 * construction — each zone's floor is the previous zone's ceiling.
 */
const RANK_REP_BASE_SLOPE = 1 / 30; // same per-rep slope as Epley, through zone 1
export const RANK_REP_ZONE_1_MAX = 12;
export const RANK_REP_ZONE_2_MAX = 20;
export const RANK_REP_ZONE_2_SLOPE_FACTOR = 2.2;
export const RANK_REP_ZONE_3_DAMPING = 0.35;

/** The rank-scoring equivalent of Epley's `1 + reps/30` — see the doc comment above for the
 *  three-zone rationale. Exported standalone (rather than folded straight into `rankSkillScore`)
 *  so `nextLoadTarget` (`rank/tiers.ts`) can invert it directly the same way it already inverts
 *  Epley today. */
export function rankRepMultiplier(reps: number): number {
  if (reps <= 0) return 0;
  const zone1Reps = Math.min(reps, RANK_REP_ZONE_1_MAX);
  let multiplier = 1 + RANK_REP_BASE_SLOPE * zone1Reps;
  if (reps <= RANK_REP_ZONE_1_MAX) return multiplier;

  const zone2Slope = RANK_REP_BASE_SLOPE * RANK_REP_ZONE_2_SLOPE_FACTOR;
  const zone2Reps = Math.min(reps, RANK_REP_ZONE_2_MAX) - RANK_REP_ZONE_1_MAX;
  multiplier += zone2Slope * zone2Reps;
  if (reps <= RANK_REP_ZONE_2_MAX) return multiplier;

  const zone3Slope = zone2Slope * RANK_REP_ZONE_3_DAMPING;
  multiplier += zone3Slope * (reps - RANK_REP_ZONE_2_MAX);
  return multiplier;
}

/** Rank's skill-score equivalent of `epley()` — same shape (`load * multiplier`), different
 *  multiplier. Scoped to rank scoring only; see the doc comment on `rankRepMultiplier` above. */
export function rankSkillScore(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  return weightKg * rankRepMultiplier(reps);
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

/**
 * `bestLoadRatio`'s counterpart on rank's skill-score curve (`rankSkillScore`) instead of Epley.
 * Not currently wired into `syncService.ts`'s plausibility gate — that gate compares a session's
 * best Epley ratio against the stored (Epley) `peakE1rm`, which is self-consistent and orthogonal
 * to which curve tier-resolution uses (`ratchetPeak` itself compares tier/division/LP, never raw
 * e1RM, so there is no units mismatch to reconcile there). This export exists as the rank-curve
 * equivalent utility, mirroring `bestLoadRatio`'s own role, for any future caller that needs it.
 */
export function bestRankSkillRatio(
  sets: { weightKg: number | null; reps: number }[],
  bodyweightKg: number,
  bodyweightConfig: { isBodyweight: boolean; leverageFactor: number } | null,
): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const load = bodyweightConfig?.isBodyweight
      ? bodyweightLoad(bodyweightKg, bodyweightConfig.leverageFactor, s.weightKg ?? 0)
      : (s.weightKg ?? 0);
    const ratio = rankSkillScore(load, s.reps) / bodyweightKg;
    if (best == null || ratio > best) best = ratio;
  }
  return best;
}
