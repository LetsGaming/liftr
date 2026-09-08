import { z } from "zod";
import type { AppDb } from "../db.js";
import { findAllRanksWithExercise } from "../repositories/rankRepository.js";
import { tierSchema, trustSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const rankResponse = z.object({
  exerciseId: z.string(),
  slug: z.string(),
  /** Literal display name — set for custom exercises. Null for catalog exercises (resolved
   *  client-side via i18n on `slug`). Custom exercises get ranked like any other, so this
   *  route needs it too, not just /api/exercises. */
  name: z.string().nullable(),
  isBodyweight: z.boolean(),
  tier: tierSchema,
  division: z.number(),
  lp: z.number(),
  e1rm: z.number(),
  trust: trustSchema,
  nextTargetWeightKg: z.number().nullable(),
  nextTargetReps: z.number().nullable(),
  /** Peak snapshot — nullable only for a row never recomputed since peak tracking was added;
   *  a normal row always has all four set together. */
  peakTier: tierSchema.nullable(),
  peakDivision: z.number().nullable(),
});

/** GET /api/ranks — every exercise with a computed rank. */
export function registerRankRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/ranks", { schema: { response: { 200: z.array(rankResponse) } } }, async (request) => {
    const rows = await findAllRanksWithExercise(db, request.userId);
    return rows
      .map((r) => ({
        exerciseId: r.exerciseId,
        slug: r.exercise.slug,
        name: r.exercise.name,
        isBodyweight: r.exercise.isBodyweight,
        tier: r.tier,
        division: r.division,
        lp: r.lp,
        e1rm: r.e1rm,
        trust: r.trust,
        nextTargetWeightKg: r.nextTargetWeightKg,
        nextTargetReps: r.nextTargetReps,
        peakTier: r.peakTier,
        peakDivision: r.peakDivision,
      }))
      .sort((a, b) => b.lp - a.lp);
  });
}
