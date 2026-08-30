/**
 * Routine (template) CRUD (plan 1.4). This is the one place friction is acceptable — you
 * build a routine once, then "one-tap start" reuses it forever. Talks to /api/routines
 * directly (not through the offline sync queue): building/editing a routine is a planning
 * activity done at a desk with signal, not part of the gym-basement logging loop.
 */
import { defineStore } from "pinia";
import {
  advanceMesocycle,
  createRoutine,
  deleteRoutine,
  endMesocycle,
  getRoutines,
  startMesocycle,
  suggestExercises,
  updateRoutine,
  type Routine,
  type RoutineExerciseInput,
  type SuggestedExercise,
} from "../services/routineService";

export type { Mesocycle, Routine, RoutineExercise, RoutineExerciseInput, SetTarget, SuggestedExercise } from "../services/routineService";

export const useRoutineStore = defineStore("routine", {
  state: () => ({
    routines: [] as Routine[],
    loaded: false,
  }),
  actions: {
    async load() {
      try {
        this.routines = await getRoutines();
        this.loaded = true;
      } catch {
        // offline with no cache — routine list stays empty; quick-start remains available
      }
    },

    async create(name: string, exercises: RoutineExerciseInput[]) {
      const routine = await createRoutine(name, exercises);
      await this.load();
      return routine;
    },

    async remove(id: string) {
      await deleteRoutine(id);
      this.routines = this.routines.filter((r) => r.id !== id);
    },

    /**
     * Edit an existing routine (rename and/or replace its exercise list wholesale, including
     * order and supersets). The server side of this (`PATCH /api/routines/:id`) has existed
     * since the routine routes were first built — it was simply never called from the client,
     * so the only "edit" path was delete-and-rebuild. `exercises` replaces the full list; omit
     * it to only rename.
     */
    async update(id: string, payload: { name?: string; exercises?: RoutineExerciseInput[] }) {
      await updateRoutine(id, payload);
      await this.load();
    },

    async duplicate(routine: Routine) {
      const exercises: RoutineExerciseInput[] = routine.routineExercises
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((re) => ({
          exerciseId: re.exerciseId,
          orderIndex: re.orderIndex,
          targetSets: re.targetSets,
          supersetGroup: re.supersetGroup,
          restBetweenSetsSeconds: re.restBetweenSetsSeconds,
          restAfterExerciseSeconds: re.restAfterExerciseSeconds,
        }));
      return this.create(`${routine.name} (Kopie)`, exercises);
    },

    async startMesocycle(routineId: string, totalWeeks: number) {
      await startMesocycle(routineId, totalWeeks);
      await this.load();
    },

    async endMesocycle(routineId: string) {
      await endMesocycle(routineId);
      await this.load();
    },

    /** Called once a finished workout's routine has an active cycle (plan §6.8) — fire-and-forget from finishWorkout(). */
    async advanceMesocycle(routineId: string) {
      await advanceMesocycle(routineId);
      await this.load();
    },

    /** Feature: "quickly create new routines based on past experience and a selection of
     *  muscle groups" — server analyzes stats (or falls back to entry-level standards for a
     *  brand-new lifter) and returns a draft exercise list + recommended sets/reps/weight for
     *  the wizard to prefill, never saved until the user reviews and taps save themselves. */
    async suggest(muscleSlugs: string[], exercisesPerMuscle?: number): Promise<SuggestedExercise[]> {
      return suggestExercises(muscleSlugs, exercisesPerMuscle);
    },
  },
});
