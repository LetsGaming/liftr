/**
 * slug -> wger muscle id + which side it's drawn on. Single source of truth for the client;
 * mirrors packages/ingest/src/muscles.ts (the ingest-side copy that seeds exercise_muscles and
 * recolors the mirrored SVG assets — a separate package, so it can't import this one without a
 * build-order cycle). Previously this table was hand-duplicated a second time inline inside
 * MuscleFigure.vue with a comment admitting as much; that's fixed by having MuscleFigure.vue
 * and ExercisesPage.vue both import this one copy instead of drifting independently.
 */
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

/** German display names (engagement rework W5, Erholungszone verdict line) — this app is
 *  German-only (see vue-i18n's single `de` locale), so a plain map here matches how every other
 *  short display-label lookup in this codebase is done (tierLabel/divisionLabel in
 *  RanksPage.vue, FinishSequence.vue, WorkoutPage.vue) rather than routing through the full
 *  i18n machinery for a handful of fixed nouns. */
export const MUSCLE_LABEL_DE: Record<string, string> = {
  biceps: "Bizeps",
  "front-delts": "vordere Schultern",
  serratus: "Serratus",
  chest: "Brust",
  triceps: "Trizeps",
  abs: "Bauch",
  calves: "Waden",
  glutes: "Gesäß",
  traps: "Trapezmuskel",
  quads: "Quadrizeps",
  hamstrings: "Hamstrings",
  lats: "Latissimus",
  brachialis: "Brachialis",
  obliques: "schräge Bauchmuskeln",
  soleus: "Soleus",
};
