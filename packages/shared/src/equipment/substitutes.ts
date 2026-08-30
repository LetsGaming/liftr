import { canPerform, type TieredRequirement } from "./requirements.js";

export interface SubstituteCandidate {
  exerciseId: string;
  movementPattern: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  requiredEquipment: TieredRequirement[];
  isCustom: boolean;
}

export interface SubstituteTarget {
  exerciseId: string;
  movementPattern: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Below this, a candidate shares too little with the target to be a sane stand-in (e.g. a
 *  different movement pattern with only incidental muscle overlap) — better to show nothing
 *  than a wrong substitute. */
const MIN_SCORE = 0.35;

/**
 * Feature: "if there is a similar exercise that uses equipment the user actually has, that
 * should be used instead" of just dropping an unusable exercise from suggestions. Scored, not
 * hand-authored (curated.yaml already carries movementPattern + muscles for every exercise, so
 * a substitute graph would just be a second, driftable copy of the same information).
 *
 * Same movement pattern dominates the score — a substitute for a horizontal press should still
 * be a horizontal press. Muscle overlap (primary weighted above secondary) breaks ties between
 * same-pattern candidates. Returns null rather than guessing when nothing clears MIN_SCORE.
 */
export function findSubstitute(
  target: SubstituteTarget,
  candidates: SubstituteCandidate[],
  owned: string[] | null | undefined,
): SubstituteCandidate | null {
  let best: SubstituteCandidate | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (candidate.exerciseId === target.exerciseId) continue;
    if (!canPerform(candidate.requiredEquipment, owned)) continue;

    const sameMovementPattern = candidate.movementPattern === target.movementPattern ? 1 : 0;
    const primaryOverlap = jaccard(candidate.primaryMuscles, target.primaryMuscles);
    const secondaryOverlap = jaccard(candidate.secondaryMuscles, target.secondaryMuscles);
    const score = sameMovementPattern * 0.6 + primaryOverlap * 0.3 + secondaryOverlap * 0.1 + (candidate.isCustom ? 0 : 0.001);

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= MIN_SCORE ? best : null;
}
