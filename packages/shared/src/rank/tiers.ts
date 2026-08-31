/**
 * Tiered rank engine (plan Phase 2.2 / audit §7). Pure functions — no DB access — so the
 * client can recompute optimistically offline and the server can recompute authoritatively
 * after sync, with guaranteed-identical results.
 */

export const TIERS = [
  "initiate", "apprentice", "trainee", "athlete", "lifter",
  "advanced", "elite", "expert", "apex",
] as const;
export type Tier = (typeof TIERS)[number];

/** Divisions per tier — deliberately more at the bottom (frequent rank-ups early) and fewer at
 *  the top (Apex has exactly 1: a single real milestone, not another grind). Within a tier of N
 *  divisions, values run N (weakest, entry) down to 1 (strongest, closest to promotion) — same
 *  "higher number = weaker" convention as the old fixed III/II/I, generalized to N divisions. */
export const TIER_DIVISION_COUNT: Record<Tier, number> = {
  initiate: 6, apprentice: 5, trainee: 5, athlete: 4, lifter: 4,
  advanced: 3, elite: 3, expert: 2, apex: 1,
};

export type Division = number;

export type TrustTier = "real" | "derived" | "synthetic";

export type RankMetric = "load_ratio" | "reps";

/** One threshold boundary: crossing it enters `tier`/`division`. */
export interface StandardThreshold {
  tier: Tier;
  division: Division;
  /** load_ratio: e1RM / bodyweight. reps: raw rep count (bodyweight exercises). */
  threshold: number;
  trust: TrustTier;
}

export interface RankResult {
  tier: Tier;
  division: Division;
  /** 0-100 position within the current tier/division band ("LP" in the mockup). */
  lp: number;
  trust: TrustTier;
  lowConfidence: boolean;
  nextTarget: { tier: Tier; division: Division; threshold: number } | null;
}

function cumulativeDivisionsBefore(tier: Tier): number {
  return TIERS.slice(0, TIERS.indexOf(tier)).reduce((sum, t) => sum + TIER_DIVISION_COUNT[t], 0);
}

/** Flatten (tier, division) into a single ascending-strength ordinal for comparison/iteration. */
export function ordinal(tier: Tier, division: number): number {
  return cumulativeDivisionsBefore(tier) + (TIER_DIVISION_COUNT[tier] - division);
}

export const MAX_ORDINAL = Object.values(TIER_DIVISION_COUNT).reduce((a, b) => a + b, 0) - 1;

/** Inverse of `ordinal` — clamped to the valid range (an ordinal past `MAX_ORDINAL` returns
 *  Apex's single division). Centralizes what `decay.ts` and `aggregate.ts` previously each
 *  duplicated as their own `positionToBand`, since that fixed-length-array inversion no longer
 *  works once tiers have different division counts. */
export function ordinalToBand(ord: number): { tier: Tier; division: number } {
  const clamped = Math.max(0, Math.min(MAX_ORDINAL, Math.round(ord)));
  let remaining = clamped;
  for (const tier of TIERS) {
    const count = TIER_DIVISION_COUNT[tier];
    if (remaining < count) return { tier, division: count - remaining };
    remaining -= count;
  }
  return { tier: "apex", division: 1 };
}

/** Sort thresholds ascending by strength (weakest first). Exported for callers that need to
 *  pick a specific point along the strength scale rather than resolve a lifter's actual value
 *  against it — e.g. the routine builder's experience-level entry point (recommend.ts). */
export function sortedThresholds(thresholds: StandardThreshold[]): StandardThreshold[] {
  return [...thresholds].sort((a, b) => ordinal(a.tier, a.division) - ordinal(b.tier, b.division));
}

/**
 * Resolve a metric value (load ratio or rep count) against a sorted threshold table into a
 * tier/division/LP/next-target. `thresholds` must be pre-sorted weakest-to-strongest via
 * `sortedThresholds` (callers normally pass the raw array; we sort defensively here).
 */
export function resolveRank(value: number, thresholds: StandardThreshold[]): RankResult {
  const sorted = sortedThresholds(thresholds);
  if (sorted.length === 0) {
    throw new Error("resolveRank: no thresholds provided");
  }

  // find the highest threshold at or below `value`; below the lowest = bottom of bottom tier
  let currentIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (value >= sorted[i]!.threshold) currentIdx = i;
    else break;
  }

  const first = sorted[0]!;
  if (currentIdx === -1) {
    return {
      tier: first.tier,
      division: first.division,
      lp: Math.max(0, Math.min(100, (value / first.threshold) * 100)),
      trust: first.trust,
      lowConfidence: false,
      nextTarget: { tier: first.tier, division: first.division, threshold: first.threshold },
    };
  }

  const current = sorted[currentIdx]!;
  const next = sorted[currentIdx + 1] ?? null;

  const lp = next
    ? Math.max(0, Math.min(100, ((value - current.threshold) / (next.threshold - current.threshold)) * 100))
    : 100;

  return {
    tier: current.tier,
    division: current.division,
    lp,
    trust: current.trust,
    lowConfidence: false,
    nextTarget: next ? { tier: next.tier, division: next.division, threshold: next.threshold } : null,
  };
}

/**
 * Given a next-tier threshold ratio and the lifter's bodyweight, find the minimum
 * (weight, reps) pair — biased toward the lifter's recent rep pattern — that crosses it.
 * Mirrors the mockup's "nächster: 10 kg × 6" display. Search is a small integer grid: it
 * doesn't need to be exact, it needs to read as an achievable, concrete next step.
 */
export function nextLoadTarget(
  nextThresholdRatio: number,
  bodyweightKg: number,
  preferredReps: number,
): { weightKg: number; reps: number } {
  const targetE1rm = nextThresholdRatio * bodyweightKg;
  // search reps within +/-2 of the lifter's recent pattern, clamped to a sane 1-15 range
  const repCandidates = [preferredReps, preferredReps - 1, preferredReps + 1, preferredReps - 2, preferredReps + 2]
    .filter((r) => r >= 1 && r <= 15);

  let best: { weightKg: number; reps: number } | null = null;
  for (const reps of repCandidates) {
    // invert epley: e1rm = w * (1 + reps/30) => w = e1rm / (1 + reps/30)
    const weightKg = targetE1rm / (1 + reps / 30);
    if (!best || weightKg < best.weightKg) best = { weightKg: roundToStep(weightKg, 1.25), reps };
  }
  return best ?? { weightKg: roundToStep(targetE1rm, 1.25), reps: preferredReps };
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** For rep-based (bodyweight) exercises: the next rep-count threshold to cross, verbatim. */
export function nextRepTarget(thresholds: StandardThreshold[], currentReps: number): number | null {
  const sorted = sortedThresholds(thresholds);
  const next = sorted.find((t) => t.threshold > currentReps);
  return next ? next.threshold : null;
}

/**
 * Find the next-target threshold, if any, strictly above a given ordinal position — mirrors
 * `resolveRank`'s own current/next search but keyed on tier/division ordinal rather than raw
 * metric value. Used by the rank-decay workstream (R2) to keep next-target predictions
 * consistent with a *decayed* current band instead of the freshly-resolved naive value.
 */
export function nextTargetAtOrdinal(
  thresholds: StandardThreshold[],
  currentOrdinal: number,
): { tier: Tier; division: Division; threshold: number } | null {
  const sorted = sortedThresholds(thresholds);
  let currentIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (ordinal(sorted[i]!.tier, sorted[i]!.division) <= currentOrdinal) currentIdx = i;
    else break;
  }
  const next = sorted[currentIdx + 1] ?? null;
  return next ? { tier: next.tier, division: next.division, threshold: next.threshold } : null;
}

/** Ratchet-only "best ever" snapshot (rank engine redesign R1). */
export interface PeakSnapshot {
  tier: Tier;
  division: Division;
  lp: number;
  e1rm: number;
  achievedAt: number;
}

/**
 * Compare a freshly-resolved rank against the stored peak and return whichever is stronger.
 * Peak is a ratchet: it is never recomputed retroactively (e.g. against today's bodyweight),
 * only compared-against and possibly replaced by a genuinely stronger result. `storedPeak`
 * being `null` (first recompute after the R1 migration, or a brand-new exercise) always yields
 * `current` as the peak.
 */
export function ratchetPeak(
  current: { tier: Tier; division: Division; lp: number; e1rm: number },
  achievedAt: number,
  storedPeak: PeakSnapshot | null,
): PeakSnapshot {
  const currentOrdinal = ordinal(current.tier, current.division);
  const isStronger =
    !storedPeak ||
    currentOrdinal > ordinal(storedPeak.tier, storedPeak.division) ||
    (currentOrdinal === ordinal(storedPeak.tier, storedPeak.division) && current.lp > storedPeak.lp);

  if (isStronger) {
    return { tier: current.tier, division: current.division, lp: current.lp, e1rm: current.e1rm, achievedAt };
  }
  return storedPeak;
}
