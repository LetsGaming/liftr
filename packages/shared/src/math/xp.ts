/**
 * XP / level system (plan Phase 6.4) — purely additive, never gates or replaces the rank
 * system. Per-set XP scales with the exercise's current rank tier so raw volume on an easy
 * lift doesn't outweigh real strength progress on a hard one; bodyweight sets (no logged
 * weight) use a nominal implied load rather than earning zero.
 */
import type { Tier } from "../rank/tiers.js";

export const TIER_XP_MULTIPLIER: Record<Tier, number> = {
  initiate: 0.9,
  apprentice: 1,
  trainee: 1.05,
  athlete: 1.15,
  lifter: 1.2,
  advanced: 1.3,
  elite: 1.4,
  expert: 1.5,
  apex: 1.75,
};

export const BODYWEIGHT_NOMINAL_LOAD_KG = 30;

/** Feedback: "doing the same exact exercise (same reps, same weight) should give less and less
 *  xp... it should engage the user to get further and further in their training." Decays toward
 *  a floor rather than to zero — grinding the identical numbers still earns *something*, it just
 *  earns progressively less, which is what nudges someone toward more weight or more reps instead
 *  of feeling punished for repeating a workout at all. */
export const REPEAT_XP_DECAY_STEP = 0.15;
export const REPEAT_XP_FLOOR_MULTIPLIER = 0.5;

/** Multiplier for the Nth time (1-indexed, `occurrence` = 1 on first-ever performance) an
 *  identical exercise+weight+reps combo has been logged. */
export function repeatSetMultiplier(occurrence: number): number {
  return Math.max(REPEAT_XP_FLOOR_MULTIPLIER, 1 / (1 + REPEAT_XP_DECAY_STEP * (occurrence - 1)));
}

export function computeSetXp(
  weightKg: number | null,
  reps: number,
  tier: Tier | null,
  repeatOccurrence = 1,
  plausibilityMultiplier = 1,
): number {
  const load = weightKg ?? BODYWEIGHT_NOMINAL_LOAD_KG;
  const multiplier = tier ? TIER_XP_MULTIPLIER[tier] : 1;
  return load * reps * multiplier * repeatSetMultiplier(repeatOccurrence) * plausibilityMultiplier;
}

export interface XpSetInput {
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  tier: Tier | null;
  /** epoch ms — determines occurrence order for the repeat-set decay above. */
  loggedAt: number;
  /** Defaults to 1 (no discount) when omitted — most callers don't have a flagged workout. */
  plausibilityMultiplier?: number;
}

/** Sums XP across a full set history, applying the repeat-set decay per exercise+weight+reps
 *  combo in chronological order. The single source of truth for "how much XP has this person
 *  earned in total" — GET /api/xp and anything that needs the same number must go through this
 *  rather than re-summing `computeSetXp` itself, or the repeat-decay would silently not apply. */
export function computeTotalXp(sets: XpSetInput[]): number {
  const sorted = [...sets].sort((a, b) => a.loggedAt - b.loggedAt);
  const occurrenceByKey = new Map<string, number>();
  let total = 0;
  for (const s of sorted) {
    const key = `${s.exerciseId}|${s.weightKg ?? "bw"}|${s.reps}`;
    const occurrence = (occurrenceByKey.get(key) ?? 0) + 1;
    occurrenceByKey.set(key, occurrence);
    total += computeSetXp(s.weightKg, s.reps, s.tier, occurrence, s.plausibilityMultiplier ?? 1);
  }
  return total;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

/** level = floor(sqrt(totalXp / 100)) — an accelerating curve, so early levels come fast. */
export function computeLevel(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  const level = Math.floor(Math.sqrt(xp / 100));
  const levelFloorXp = level ** 2 * 100;
  const nextLevelXp = (level + 1) ** 2 * 100;
  const xpIntoLevel = xp - levelFloorXp;
  const xpForNextLevel = nextLevelXp - levelFloorXp;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: xpForNextLevel > 0 ? Math.round((xpIntoLevel / xpForNextLevel) * 100) : 0,
  };
}
