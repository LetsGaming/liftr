import { api } from "../lib/api";

export interface WorkoutSetDetail {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number;
  isWarmup: boolean;
  loggedAt: string | null;
  /** True when this set produced a personal record — see GET /api/workouts/:id. */
  isPr: boolean;
}

export interface WorkoutDetailExercise {
  id: string;
  exerciseId: string;
  orderIndex: number;
  exercise: { id: string; slug: string; name: string | null; isBodyweight: boolean; equipment: string };
  sets: WorkoutSetDetail[];
}

export interface WorkoutDetail {
  id: string;
  routineId: string | null;
  startedAt: string;
  endedAt: string | null;
  pausedSeconds: number;
  notes: string | null;
  workoutExercises: WorkoutDetailExercise[];
}

export function getWorkout(id: string): Promise<WorkoutDetail> {
  return api.get<WorkoutDetail>(`/api/workouts/${id}`);
}

/** Feedback: "not possible to delete past workouts" — the server cascades sets and recomputes
 *  rank for every touched exercise (server's routes/workouts.ts), so LP/XP are already correct
 *  by the time this resolves. */
export function deleteWorkout(id: string): Promise<void> {
  return api.del(`/api/workouts/${id}`);
}
