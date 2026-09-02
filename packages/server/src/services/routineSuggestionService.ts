/**
 * Feature: "quickly create new routines based on the user's past experience and a selection of
 * muscle groups they want to train... analyze their stats, find fitting exercises and
 * recommended sets, reps and weight." One function serves both a returning lifter (recommends
 * off their actual last performed set) and a brand-new one (falls back to the bronze/division-III
 * entry standard per exercise — see @liftr/shared's recommendExerciseSets) — there's
 * deliberately no separate hardcoded "starter preset" content system; a user with zero history
 * just takes the standards-only branch of the exact same recommendation for every candidate
 * exercise, so presets can never drift out of sync with the catalog or the rank thresholds.
 */
import {
  canPerform,
  findSubstitute,
  recommendExerciseSets,
  type ExperienceLevel,
  type RankMetric,
  type SubstituteCandidate,
  type TieredRequirement,
} from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { findStandardsForExercise } from "../repositories/rankRepository.js";
import {
  findExercisesByIds,
  findLastPerformedSet,
  findMusclesBySlugs,
  findPrimaryExerciseMusclesForMuscles,
} from "../repositories/routineSuggestionRepository.js";
import { readJsonSetting } from "../repositories/settingsRepository.js";
import { getCurrentBodyweightKg, getUserSex } from "./rankService.js";
import type { Profile } from "../routes/settings.js";

/** `exercises.requiredEquipment` is a JSON-encoded TieredRequirement[] column; older rows
 *  ingested before that column existed (or before it moved to a tiered shape) are null/malformed,
 *  treated as "no requirements known" (never filters them out — better to show a possibly-
 *  inaccurate suggestion than silently hide every legacy row). */
function parseRequiredEquipment(raw: string | null): TieredRequirement[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TieredRequirement[];
  } catch {
    return [];
  }
}

function toSubstituteCandidate(row: {
  exercise: { id: string; movementPattern: string; requiredEquipment: string | null; isCustom: boolean };
  muscleId: string;
}): SubstituteCandidate {
  return {
    exerciseId: row.exercise.id,
    movementPattern: row.exercise.movementPattern,
    // The candidate pool here is already scoped to one primary muscle per findSubstitute call
    // (see byMuscle below) — primaryMuscles/secondaryMuscles only need to carry that one slug
    // for the overlap score to work, not the exercise's full muscle tag set.
    primaryMuscles: [row.muscleId],
    secondaryMuscles: [],
    requiredEquipment: parseRequiredEquipment(row.exercise.requiredEquipment),
    isCustom: row.exercise.isCustom,
  };
}

export interface SuggestExercisesInput {
  muscleSlugs: string[];
  exercisesPerMuscle: number;
  /** Omit to fall back to the stored /api/settings/equipment value (single-user app — there's
   *  exactly one such setting, so the service can resolve it itself rather than requiring every
   *  caller to look it up and pass it through first). Explicitly empty array means "no
   *  restriction" (not "owns nothing"), same as the setting being unset. */
  ownedEquipment?: string[];
  /** Same fallback pattern, from /api/settings/profile.experienceLevel. */
  experienceLevel?: ExperienceLevel;
}

export interface SuggestedExercise {
  exerciseId: string;
  slug: string;
  targetSets: { reps: number; weightKg: number | null }[];
  /** Muscle-guided suggestions only: which requested muscle slug produced this pick. Absent for
   *  recommendForChosenExercises (manual picks, Quick Start) — there's no "requested muscle" to
   *  attribute those to. Engagement-audit-v4 Phase 1: surfaces the muscle→exercise mapping the
   *  suggester already computes internally so the wizard's Review step can show real coverage
   *  instead of discarding this and leaving the user to guess. */
  matchedMuscleSlug?: string;
  /** True when this pick replaced a preferred candidate the user couldn't perform with their
   *  owned equipment (see findSubstitute below) — surfaced so Review can flag it instead of
   *  silently presenting a swapped-in exercise as if it were the first choice. */
  isSubstitute?: boolean;
}

/** POST /api/routines/suggest's logic — muscle groups in, a draft exercise list + recommended
 *  sets out. Never writes anything; the client feeds the result into the routine wizard for the
 *  user to review/edit before actually saving, same as any other draft in that flow. */
export async function suggestExercisesForMuscles(db: LiftrDb, input: SuggestExercisesInput): Promise<SuggestedExercise[]> {
  const [storedEquipment, storedProfile] = await Promise.all([
    input.ownedEquipment ? null : readJsonSetting<string[]>(db, "ownedEquipment"),
    input.experienceLevel ? null : readJsonSetting<Profile>(db, "profile"),
  ]);
  const ownedEquipment = input.ownedEquipment ?? storedEquipment;
  const experienceLevel: ExperienceLevel = input.experienceLevel ?? storedProfile?.experienceLevel ?? "beginner";

  const muscleRows = await findMusclesBySlugs(db, input.muscleSlugs);
  if (muscleRows.length === 0) return [];
  const muscleIdBySlug = new Map(muscleRows.map((m) => [m.id, m.slug]));

  const taggedRowsUnfiltered = await findPrimaryExerciseMusclesForMuscles(db, [...muscleIdBySlug.keys()]);

  // Group candidate exercises per requested muscle first, *before* any equipment filtering —
  // this same unfiltered per-muscle pool doubles as the substitute search space below, so a
  // muscle group's own candidates (already the right movement family) are what an unusable
  // exercise gets swapped against, not the whole catalog.
  const byMuscle = new Map<string, typeof taggedRowsUnfiltered>();
  for (const row of taggedRowsUnfiltered) {
    const slug = muscleIdBySlug.get(row.muscleId)!;
    const list = byMuscle.get(slug) ?? [];
    list.push(row);
    byMuscle.set(slug, list);
  }

  // Feature: "map equipment to exercises accurately... if there is a similar exercise that uses
  // equipment the user actually has, that should be used instead" — canPerform checks the full
  // requirement list (not just the one primary `equipment` tag), and an unusable candidate gets
  // one shot at a same-muscle, same-pattern substitute before being dropped outright. A
  // null/empty ownedEquipment means "no restriction configured yet" (see SuggestExercisesInput).
  const restrictingEquipment = ownedEquipment && ownedEquipment.length > 0 ? ownedEquipment : null;

  // A Set naturally de-dupes an exercise primary to two requested muscles — it only needs to
  // survive being picked once, from whichever muscle iterates over it first. pickMeta tracks the
  // same two facts per exercise (which muscle earned it a slot, whether it's a substitute) so
  // they survive into the returned SuggestedExercise instead of being computed and discarded.
  const chosenExerciseIds = new Set<string>();
  const pickMeta = new Map<string, { muscleSlug: string; isSubstitute: boolean }>();
  for (const muscleSlug of input.muscleSlugs) {
    const candidates = byMuscle.get(muscleSlug) ?? [];
    // Prefer catalog (non-custom) exercises — a real sets/reps/weight recommendation from a
    // vetted, standards-modeled movement beats one built on a user's own untested custom entry.
    const ranked = [...candidates].sort((a, b) => Number(a.exercise.isCustom) - Number(b.exercise.isCustom));

    let addedForMuscle = 0;
    for (const c of ranked) {
      if (addedForMuscle >= input.exercisesPerMuscle) break;
      if (chosenExerciseIds.has(c.exercise.id)) continue;

      const requirements = parseRequiredEquipment(c.exercise.requiredEquipment);
      if (!restrictingEquipment || canPerform(requirements, restrictingEquipment)) {
        chosenExerciseIds.add(c.exercise.id);
        pickMeta.set(c.exercise.id, { muscleSlug, isSubstitute: false });
        addedForMuscle++;
        continue;
      }

      const substitute = findSubstitute(
        toSubstituteCandidate(c),
        ranked.filter((other) => other.exercise.id !== c.exercise.id && !chosenExerciseIds.has(other.exercise.id)).map(toSubstituteCandidate),
        restrictingEquipment,
      );
      if (substitute) {
        chosenExerciseIds.add(substitute.exerciseId);
        pickMeta.set(substitute.exerciseId, { muscleSlug, isSubstitute: true });
        addedForMuscle++;
      }
      // else: no usable substitute for this candidate — dropped, same as before this feature.
    }
  }

  return recommendForExercises(db, [...chosenExerciseIds], experienceLevel, pickMeta);
}

/**
 * The per-exercise recommendation loop, shared by two entry points: the muscle-group suggester
 * above (candidates chosen by muscle) and `recommendForChosenExercises` below (candidates
 * already chosen by the user, manually or via Quick Start) — one recommendation engine, not two
 * that could drift, per the module doc's "presets can never drift out of sync" principle.
 */
async function recommendForExercises(
  db: LiftrDb,
  exerciseIds: string[],
  experienceLevel: ExperienceLevel,
  pickMeta?: Map<string, { muscleSlug: string; isSubstitute: boolean }>,
): Promise<SuggestedExercise[]> {
  const chosenExercises = await findExercisesByIds(db, exerciseIds);
  const [bodyweightKg, sex] = await Promise.all([getCurrentBodyweightKg(db), getUserSex(db)]);

  const result: SuggestedExercise[] = [];
  for (const exercise of chosenExercises) {
    const thresholdRows = await findStandardsForExercise(db, exercise.id, sex);
    const metric: RankMetric | null = (thresholdRows[0]?.metric as RankMetric | undefined) ?? null;
    const lastPerformed = await findLastPerformedSet(db, exercise.id);

    const targetSets = recommendExerciseSets({
      isBodyweight: exercise.isBodyweight,
      metric,
      thresholds: thresholdRows.map((t) => ({ tier: t.tier, division: t.division as 1 | 2 | 3, threshold: t.threshold, trust: t.trust })),
      bodyweightKg,
      lastPerformed,
      experienceLevel,
    });

    const meta = pickMeta?.get(exercise.id);
    result.push({
      exerciseId: exercise.id,
      slug: exercise.slug,
      targetSets,
      ...(meta ? { matchedMuscleSlug: meta.muscleSlug, isSubstitute: meta.isSubstitute } : {}),
    });
  }

  return result;
}

/**
 * Recommendation for exercises the user has already chosen — manual routine-wizard picks and
 * Quick Start's first-4-catalog-exercises fallback both used to hardcode `reps: 8, weightKg: 0`
 * regardless of the lifter's stated experience level or history (QUAL-04); this reuses the exact
 * same engine the muscle-group suggester already uses instead of adding a second, simpler one.
 * No equipment filtering here — the exercises are already explicitly chosen, not candidates to
 * narrow down.
 */
export async function recommendForChosenExercises(db: LiftrDb, exerciseIds: string[], experienceLevel?: ExperienceLevel): Promise<SuggestedExercise[]> {
  const resolvedLevel = experienceLevel ?? (await readJsonSetting<Profile>(db, "profile"))?.experienceLevel ?? "beginner";
  return recommendForExercises(db, exerciseIds, resolvedLevel);
}
