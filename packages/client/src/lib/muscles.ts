/**
 * slug -> wger muscle id + which side it's drawn on. Single source of truth for the client;
 * mirrors packages/ingest/src/muscles.ts (the ingest-side copy that seeds exercise_muscles and
 * recolors the mirrored SVG assets — a separate package, so it can't import this one without a
 * build-order cycle). MuscleFigure.vue and ExercisesPage.vue both import this one copy so they
 * can't drift independently.
 */
import { t } from "../i18n";

export interface MuscleMeta {
  id: number;
  front: boolean;
}

export const MUSCLE_META: Record<string, MuscleMeta> = {
  biceps: { id: 1, front: true },
  "front-delts": { id: 2, front: true },
  serratus: { id: 3, front: true },
  chest: { id: 4, front: true },
  triceps: { id: 5, front: false },
  abs: { id: 6, front: true },
  calves: { id: 7, front: false },
  glutes: { id: 8, front: false },
  traps: { id: 9, front: false },
  quads: { id: 10, front: true },
  hamstrings: { id: 11, front: false },
  lats: { id: 12, front: false },
  brachialis: { id: 13, front: true },
  obliques: { id: 14, front: true },
  soleus: { id: 15, front: false },
};

export const MUSCLE_SLUGS = Object.keys(MUSCLE_META);

/** Keys into `muscles.*` (i18n.ts's t()), resolved at the point of use by muscleLabel() below so
 *  a locale switch is reflected wherever it's read next. */
const MUSCLE_LABEL_KEY: Record<string, string> = {
  biceps: "muscles.biceps",
  "front-delts": "muscles.front-delts",
  serratus: "muscles.serratus",
  chest: "muscles.chest",
  triceps: "muscles.triceps",
  abs: "muscles.abs",
  calves: "muscles.calves",
  glutes: "muscles.glutes",
  traps: "muscles.traps",
  quads: "muscles.quads",
  hamstrings: "muscles.hamstrings",
  lats: "muscles.lats",
  brachialis: "muscles.brachialis",
  obliques: "muscles.obliques",
  soleus: "muscles.soleus",
};

/**
 * Unions primary/secondary muscle involvement across a set of exercises — primary wins if an
 * exercise disagrees with another (e.g. it's primary for one movement, secondary for another
 * in the same list). Shared by WorkoutPage.vue's session-muscle preview (an active workout's
 * exercises) and the routine-card / launchpad previews (a routine's planned exercises) — same
 * aggregation, two different sources of exercise lists, previously duplicated per call site.
 */
export function aggregateMuscles(muscleLists: { slug: string; role: "primary" | "secondary" }[][]): { primary: string[]; secondary: string[] } {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const list of muscleLists) {
    for (const m of list) {
      if (m.role === "primary") primary.add(m.slug);
      else secondary.add(m.slug);
    }
  }
  for (const slug of primary) secondary.delete(slug);
  return { primary: [...primary], secondary: [...secondary] };
}

/** A muscle slug's display name in the current locale. Falls back to the slug itself for
 *  anything outside MUSCLE_META's vocabulary (e.g. a value from the exercise catalog that
 *  hasn't been added here yet). */
export function muscleLabel(slug: string): string {
  const key = MUSCLE_LABEL_KEY[slug];
  return key ? t(key) : slug;
}
