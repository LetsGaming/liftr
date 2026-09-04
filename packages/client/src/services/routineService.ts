import type { SetKind } from "@liftr/shared";
import { api } from "../lib/api";

export interface SetTarget {
  reps: number;
  /** null = no weight target for this set (plain bodyweight movement); 0/positive = tracked,
   *  including "extra kg" added on top of bodyweight (weighted dips/pull-ups). */
  weightKg: number | null;
  /** Feature: "not possible to set what kind of set this is (warmup, normal, drop) when
   *  creating/editing a routine, not mid workout" — pre-plans a set's kind in the template.
   *  Absent/undefined means "normal", same as an old saved routine with no kind field at all
   *  (activeWorkoutStore.ts's session-start seeding treats the two identically). Still fully
   *  reclassifiable live via SetKindPicker.vue before a set is actually logged. */
  kind?: SetKind;
}

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  orderIndex: number;
  /** One {reps, weightKg} target per set (e.g. a 10/8/6 pyramid) — set count is this array's length. */
  targetSets: SetTarget[];
  supersetGroup: number | null;
  /** Per-exercise rest overrides (feedback: adjustable pause per set / per exercise) — null
   *  falls back to RestTimer's built-in default. `restBetweenSetsSeconds` applies between sets
   *  of this exercise; `restAfterExerciseSeconds` applies once after its last set, before moving
   *  to the next exercise. */
  restBetweenSetsSeconds: number | null;
  restAfterExerciseSeconds: number | null;
  exercise: { id: string; slug: string; nameKey: string; isBodyweight: boolean };
}

export interface Mesocycle {
  id: string;
  routineId: string;
  totalWeeks: number;
  currentWeek: number;
  weekPercents: number[];
}

export interface Routine {
  id: string;
  name: string;
  orderIndex: number;
  routineExercises: RoutineExercise[];
  mesocycle: Mesocycle | null;
}

/** One suggested exercise from POST /api/routines/suggest, keyed by exerciseId — the picker
 *  resolves display name/equipment/etc. from catalogStore itself, same as everywhere else. */
export interface SuggestedExercise {
  exerciseId: string;
  slug: string;
  targetSets: SetTarget[];
  /** Muscle-guided suggestions only — which requested muscle slug produced this pick. Mirrors
   *  server's routineSuggestionService.ts SuggestedExercise; see that file for how it's derived. */
  matchedMuscleSlug?: string;
  /** True when the suggester swapped in this exercise because the preferred pick needed
   *  equipment the user doesn't own (see @liftr/shared's findSubstitute). */
  isSubstitute?: boolean;
  /** Present only when isSubstitute is true — raw equipment item slugs (e.g. "barbell") the
   *  originally preferred exercise needed. Mirrors the server interface 1:1. */
  missingEquipment?: string[];
}

export interface RoutineExerciseInput {
  exerciseId: string;
  orderIndex: number;
  targetSets: SetTarget[];
  supersetGroup?: number | null;
  restBetweenSetsSeconds?: number | null;
  restAfterExerciseSeconds?: number | null;
}

export function getRoutines(): Promise<Routine[]> {
  return api.get<Routine[]>("/api/routines");
}

export function createRoutine(name: string, exercises: RoutineExerciseInput[]): Promise<Routine> {
  return api.post<Routine>("/api/routines", { name, exercises });
}

export function deleteRoutine(id: string): Promise<void> {
  return api.del(`/api/routines/${id}`);
}

/** `exercises` replaces the full list; omit it to only rename. `orderIndex` repositions the
 *  routine within the routine list (drag-to-reorder, plan C §3 Phase 3). */
export function updateRoutine(
  id: string,
  payload: { name?: string; exercises?: RoutineExerciseInput[]; orderIndex?: number },
): Promise<void> {
  return api.patch(`/api/routines/${id}`, payload);
}

export function startMesocycle(routineId: string, totalWeeks: number): Promise<Mesocycle> {
  return api.post(`/api/routines/${routineId}/mesocycle`, { totalWeeks });
}

export function endMesocycle(routineId: string): Promise<void> {
  return api.del(`/api/routines/${routineId}/mesocycle`);
}

export function advanceMesocycle(routineId: string): Promise<Mesocycle> {
  return api.post(`/api/routines/${routineId}/mesocycle/advance`, {});
}

/** Feature: "quickly create new routines based on past experience and a selection of muscle
 *  groups" — server analyzes stats (or falls back to entry-level standards for a brand-new
 *  lifter) and returns a draft exercise list + recommended sets/reps/weight for the wizard to
 *  prefill, never saved until the user reviews and taps save themselves. */
export async function suggestExercises(muscleSlugs: string[], exercisesPerMuscle?: number): Promise<SuggestedExercise[]> {
  const { exercises } = await api.post<{ exercises: SuggestedExercise[] }>("/api/routines/suggest", {
    muscleSlugs,
    ...(exercisesPerMuscle ? { exercisesPerMuscle } : {}),
  });
  return exercises;
}

/** Sets/reps/weight for exercises already picked (manual routine-wizard selection, Quick Start)
 *  — same recommendation engine as suggestExercises above, just skipping the muscle-candidate
 *  selection step since the caller already knows which exercises it wants (QUAL-04). */
export async function recommendExercises(exerciseIds: string[], experienceLevel?: string): Promise<SuggestedExercise[]> {
  const { exercises } = await api.post<{ exercises: SuggestedExercise[] }>("/api/routines/recommend", {
    exerciseIds,
    ...(experienceLevel ? { experienceLevel } : {}),
  });
  return exercises;
}
