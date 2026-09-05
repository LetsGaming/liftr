/**
 * Shape of tools/catalog/curated.yaml (plan 0.3) — the hand-curated ~90-exercise source of
 * truth. wgerId/freeExerciseDbId are the pre-verified join keys into the two upstream
 * datasets (audit §4); the ingest pipeline fetches those once and never again at runtime.
 *
 * `equipment` no longer has to be hand-typed here: ingestCatalog.ts auto-resolves it from
 * free-exercise-db/wger by these same join keys when left null — see equipment/resolveEquipment.
 * A value set here still wins over both sources (and any disagreement gets logged, not silently
 * overwritten), for the cases where this app's own movement variant needs a specific override.
 */
import { z } from "zod";

export const catalogEntrySchema = z.object({
  slug: z.string(),
  wgerId: z.number().int().nullable().default(null),
  freeExerciseDbId: z.string().nullable().default(null),
  /** wger *exercise* id (not the numeric image id) whose main `/api/v2/exerciseimage/` photo
   *  should be mirrored, for the handful of gaps free-exercise-db has no photo for at all (see
   *  audit/missing-photo-sourcing-research.md §3). CC-BY-SA 4.0, not Unlicense like
   *  freeExerciseDbId — ingestImages.ts only reaches for this when freeExerciseDbId is unset,
   *  and AttributionsPage.vue names wger's image licence separately from its catalog-data one.
   *  Deliberately distinct from `wgerId` above (which some of these entries already use for
   *  equipment-tag resolution and can point at a *different* wger exercise with no photo of its
   *  own — e.g. single-leg-rdl's wgerId 1388 has no images; wgerImageId 1736 is a separate wger
   *  entry for the same movement that does). Only a single photo exists per entry here (wger's
   *  image set isn't a start/end pair like free-exercise-db's) — mirrored to start.jpg only;
   *  end.jpg is deliberately left unmirrored and ExerciseDemo.vue already degrades per-frame. */
  wgerImageId: z.number().int().nullable().default(null),
  nameDe: z.string(),
  nameEn: z.string(),
  equipment: z.string().nullable().default(null),
  /** Full physical requirement list override (equipment.ts requirements module) — wins over
   *  the rule-based deriveRequirements() for the handful of exercises the rules get wrong
   *  (e.g. bench-press needs plates+bench, not just the barbell `equipment` field implies). */
  requiresEquipment: z.array(z.string()).nullable().default(null),
  movementPattern: z.string(),
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  isBodyweight: z.boolean().default(false),
  bodyweightLeverage: z.number().nullable().default(null),
  /** Tier A (anchor) entries omit these. Tier B/C declare the anchor slug + derivation ratio. */
  anchor: z.string().nullable().default(null),
  ratio: z.number().nullable().default(null),
  /** 'real' only applies to the 5 audit-anchor lifts + bodyweight rep norms; else derived/synthetic. */
  trust: z.enum(["real", "derived", "synthetic"]).default("derived"),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogFileSchema = z.object({
  exercises: z.array(catalogEntrySchema),
});
