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
