import { EXERCISE_SLUG_PATTERN, type TieredRequirement } from "@liftr/shared";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppDb } from "../db.js";
import { findAllExercisesWithMuscles, insertCustomExercise } from "../repositories/exerciseRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const tieredRequirementResponse = z.object({
  item: z.string(),
  tier: z.enum(["required", "recommended", "optional"]),
});

const exerciseResponse = z.object({
  id: z.string(),
  slug: z.string(),
  /** Literal display name — set for custom (user-created) exercises. Null for catalog exercises,
   *  which resolve their name client-side via i18n keyed on `slug` (see the client's
   *  useExerciseName.ts). */
  name: z.string().nullable(),
  equipment: z.string().nullable(),
  requiredEquipment: z.array(tieredRequirementResponse),
  movementPattern: z.string(),
  isBodyweight: z.boolean(),
  isCustom: z.boolean(),
  demoStartImage: z.string().nullable(),
  demoEndImage: z.string().nullable(),
  howToKey: z.string().nullable(),
  hasImage: z.boolean(),
  muscles: z.array(z.object({ slug: z.string(), role: z.enum(["primary", "secondary"]) })),
});

/** Same tolerant parse as routineSuggestionService.ts — a legacy row ingested before the
 *  requiredEquipment column existed (or before it moved to a tiered shape) is null/malformed,
 *  which just means "no requirements known" rather than an error. */
function parseRequiredEquipment(raw: string | null): TieredRequirement[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TieredRequirement[];
  } catch {
    return [];
  }
}

const customExerciseSchema = z.object({
  // Constrained to the same slug shape every catalog entry already follows (SEC-02): closes a
  // path-traversal-shaped gap, since `slug` is later joined into a filesystem path unmodified
  // (`hasImage` below) — a `../` sequence with no format check would probe outside `imagesRoot`.
  slug: z.string().regex(EXERCISE_SLUG_PATTERN, "slug must be lowercase, alphanumeric, hyphen-separated"),
  name: z.string().min(1),
  equipment: z.string().optional(),
  movementPattern: z.string().min(1),
  isBodyweight: z.boolean().default(false),
  muscleSlugs: z.array(z.object({ slug: z.string(), role: z.enum(["primary", "secondary"]) })).optional(),
});

/**
 * `imagesRoot` (already resolved once in app.ts) lets this route tell the client up front
 * whether an exercise's demo photo actually exists — feedback: image 404s for the ~11 catalog
 * slugs with no mirrored photo (documented in ExerciseThumb.vue: no open-licensed source exists
 * for them) were spamming the console, because the client had no way to know except by
 * attempting the request and catching the failure. `demoStartImage`/`demoEndImage` are separate,
 * still-unused DB columns (ingest never writes them) — not repurposed here since fixing that
 * would mean also changing ingestImages.ts's write path; a live existsSync check against the
 * already-mirrored files is simpler and can't drift from what's actually on disk.
 */
export function registerExerciseRoutes(app: ZodFastifyInstance, db: AppDb, imagesRoot: string) {
  // GET /api/exercises — full catalog + muscle tags. Cacheable: catalog only changes on ingest.
  app.get("/api/exercises", { schema: { response: { 200: z.array(exerciseResponse) } } }, async (_req, reply) => {
    const rows = await findAllExercisesWithMuscles(db);
    reply.header("Cache-Control", "public, max-age=300");
    return rows.map((ex) => ({
      id: ex.id,
      slug: ex.slug,
      name: ex.name,
      equipment: ex.equipment,
      requiredEquipment: parseRequiredEquipment(ex.requiredEquipment),
      movementPattern: ex.movementPattern,
      isBodyweight: ex.isBodyweight,
      isCustom: ex.isCustom,
      demoStartImage: ex.demoStartImage,
      demoEndImage: ex.demoEndImage,
      howToKey: ex.howToKey,
      hasImage: existsSync(path.join(imagesRoot, ex.slug, "start.jpg")),
      muscles: ex.exerciseMuscles.map((em) => ({ slug: em.muscle.slug, role: em.role })),
    }));
  });

  // POST /api/exercises — custom user-added exercise (audit §3 must-have: catalog extensibility).
  app.post("/api/exercises", { schema: { body: customExerciseSchema } }, async (req, reply) => {
    const row = await insertCustomExercise(db, req.body);
    reply.code(201);
    return row;
  });
}
