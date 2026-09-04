/** All `/api/exercises*` HTTP calls — stores/composables call these, never `api.*` directly
 *  (vue.md: "route all external communication through a dedicated service module"). */
import type { TieredRequirement } from "@liftr/shared";
import { api } from "../lib/api";

export interface CatalogExercise {
  id: string;
  slug: string;
  /** Literal display name — set for custom exercises, null for catalog exercises (which resolve
   *  their name via i18n on `slug` instead; see useExerciseName.ts). */
  name: string | null;
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

export interface CreateExerciseInput {
  slug: string;
  name: string;
  equipment?: string;
  movementPattern: string;
  isBodyweight: boolean;
  muscleSlugs?: { slug: string; role: "primary" | "secondary" }[];
}

/** POST /api/exercises — custom user-added exercise. Server always returns isCustom: true; the
 *  response shape is the same row `insertCustomExercise` returns, not the full `CatalogExercise`
 *  join shape (no `muscles`/`requiredEquipment`/`hasImage` computed fields) — callers should
 *  re-fetch the catalog (catalogStore.load()) rather than splice this response directly into a
 *  CatalogExercise[] list. */
export function createExercise(input: CreateExerciseInput): Promise<{ id: string; slug: string }> {
  return api.post<{ id: string; slug: string }>("/api/exercises", input);
}
