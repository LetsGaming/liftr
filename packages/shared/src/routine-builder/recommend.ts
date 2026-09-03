/**
 * Feature: "quickly create new routines based on the user's past experience and a selection of
 * muscle groups they want to train" — the system analyzes their stats (best/last performed set
 * per candidate exercise) and recommends sets/reps/weight. Pure function, no DB access, so it's
 * unit-testable and shared between server (the authoritative /api/routines/suggest response) and
 * any future client-side preview — same split as the rank engine (rankEngine.ts orchestrates,
 * @liftr/shared's tiers.ts does the math).
 *
 * A brand-new user (no `lastPerformed` for a given exercise) doesn't get a hardcoded "8 reps,
 * 0 kg" placeholder — they fall back to that exercise's bronze/division-III entry standard via
 * the same resolveRank/nextLoadTarget machinery the rank engine already uses for "next target",
 * so their very first suggested weight is already a real, achievable number instead of a blank
 * stepper. This is also what makes "brand-new-user presets" not a separate hardcoded content
 * system: the exact same recommendation path degrades gracefully to standards-only, per exercise.
 */
import { nextLoadTarget, sortedThresholds, type RankMetric, type StandardThreshold } from "../rank/tiers.js";

export interface SetTarget {
  reps: number;
  weightKg: number | null;
}

export interface LastPerformedSet {
  weightKg: number | null;
  reps: number;
}

/** Feature: onboarding's "prior experience" question — shifts where along the standards ladder
 *  a first-time recommendation for a *never-logged* exercise starts. Only matters when
 *  `lastPerformed` is null; a lifter's own history always wins regardless of this. */
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface ExerciseRecommendationInput {
  isBodyweight: boolean;
  /** null when the exercise has no modeled standards at all (e.g. plank/side-plank — no
   *  anchor/ratio, skipped at ingest time). Falls back to a generic default in that case. */
  metric: RankMetric | null;
  thresholds: StandardThreshold[];
  bodyweightKg: number;
  /** The lifter's best recent set for this exercise, or null if they've never logged it. */
  lastPerformed: LastPerformedSet | null;
  setCount?: number;
  /** Defaults to "beginner" (bronze/division-III, the weakest modeled threshold) — the safest
   *  assumption when nothing is known about the lifter yet. */
  experienceLevel?: ExperienceLevel;
}

const DEFAULT_SET_COUNT = 3;
/** Used only when there's neither history nor any modeled standard for the exercise at all. */
const GENERIC_FALLBACK_REPS = 8;

/** Fraction of the way up the sorted threshold ladder each experience level starts a
 *  never-logged exercise at — beginner at the very bottom (bronze/III), advanced roughly
 *  two-thirds up (comfortably intermediate-to-advanced territory) rather than the same
 *  first-timer weight a beginner would get. There's no per-experience-level calibration data to
 *  draw on (unlike the bronze/III floor, which the rank engine's own standards already define),
 *  so this is a deliberately simple, explainable heuristic, not a fitted model. */
const EXPERIENCE_LADDER_FRACTION: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1 / 3,
  advanced: 2 / 3,
};

function repeat(target: SetTarget, count: number): SetTarget[] {
  return Array.from({ length: count }, () => ({ ...target }));
}

function entryThreshold(thresholds: StandardThreshold[], experienceLevel: ExperienceLevel): StandardThreshold | null {
  const sorted = sortedThresholds(thresholds);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * EXPERIENCE_LADDER_FRACTION[experienceLevel]));
  return sorted[index]!;
}

/** Recommends this session's target sets for one exercise, given what's known about the lifter. */
export function recommendExerciseSets(input: ExerciseRecommendationInput): SetTarget[] {
  const setCount = input.setCount ?? DEFAULT_SET_COUNT;

  if (input.lastPerformed) {
    return repeat({ reps: input.lastPerformed.reps, weightKg: input.lastPerformed.weightKg }, setCount);
  }

  if (input.metric && input.thresholds.length > 0) {
    const entry = entryThreshold(input.thresholds, input.experienceLevel ?? "beginner");
    if (entry) {
      if (input.metric === "reps") {
        // entry.threshold can be fractional for a derived/synthetic exercise (deriveStandards()
        // multiplies an anchor's integer threshold by a ratio like 0.25) — reps must be an
        // integer both because a fractional rep count is meaningless and because the server's
        // create/update routine schema rejects non-integer reps outright.
        return repeat({ reps: Math.max(1, Math.round(entry.threshold)), weightKg: null }, setCount);
      }
      const target = nextLoadTarget(entry.threshold, input.bodyweightKg, GENERIC_FALLBACK_REPS);
      // load_ratio target already accounts for bodyweight-leverage exercises via the caller's
      // bodyweightKg (see server: same bodyweightKg*leverage + weightKg convention rankEngine
      // uses); a bodyweight movement's weightKg here is "added" load on top, so 0 rather than
      // null once we have a concrete number to suggest, null being reserved for "no target at
      // all" (see routineStore.ts's SetTarget doc).
      return repeat({ reps: target.reps, weightKg: input.isBodyweight ? Math.max(0, target.weightKg) : target.weightKg }, setCount);
    }
  }

  return repeat({ reps: GENERIC_FALLBACK_REPS, weightKg: input.isBodyweight ? null : 0 }, setCount);
}
