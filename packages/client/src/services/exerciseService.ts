/** All `/api/exercises*` HTTP calls — stores/composables call these, never `api.*` directly
 *  (vue.md: "route all external communication through a dedicated service module"). */
import type { TieredRequirement } from "@liftr/shared";
import { api } from "../lib/api";

export interface CatalogExercise {
  id: string;
  slug: string;
  nameKey: string;
  equipment: string | null;
  /** Full physical requirement list (@liftr/shared's TieredRequirement[]) — e.g. bench-press:
   *  barbell/plates/bench all "required", distinct from `equipment` above (just the icon-driving
   *  item). Only `required`-tier misses block an exercise; `recommended`/`optional` are hints. */
  requiredEquipment: TieredRequirement[];
  movementPattern: string;
  isBodyweight: boolean;
  isCustom: boolean;
  demoStartImage: string | null;
  demoEndImage: string | null;
  howToKey: string | null;
  /** Feedback: exercise-photo 404s (~11 catalog slugs have no mirrored demo photo) were
   *  spamming the console — this tells ExerciseThumb.vue/ExerciseDemo.vue not to even attempt
   *  the request instead of relying on the browser to fail it. Absent on a stale
   *  localStorage-cached catalog from before this field existed; call sites treat "unknown" the
   *  same as "assume it exists" (today's behavior) until the next successful /api/exercises
   *  fetch refreshes the cache. */
  hasImage: boolean;
  muscles: { slug: string; role: "primary" | "secondary" }[];
}

export function getExercises(): Promise<CatalogExercise[]> {
  return api.get<CatalogExercise[]>("/api/exercises");
}

export interface ExerciseHistorySet {
  setIndex: number;
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

export async function getExerciseHistory(exerciseId: string): Promise<ExerciseHistorySet[]> {
  const { sets } = await api.get<{ sets: ExerciseHistorySet[] }>(`/api/exercises/${exerciseId}/history`);
  return sets;
}
