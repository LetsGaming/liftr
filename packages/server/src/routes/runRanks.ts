/**
 * GET /api/runs/ranks — every running category with a computed rank. Own dedicated route file,
 * mirroring how `routes/ranks.ts` (the strength analog) is separate from `routes/workouts.ts` —
 * see Ruling 4 in this task's brief.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { findAllRunRanks } from "../repositories/runRankRepository.js";
import { runCategorySchema, tierSchema, trustSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const runRankResponse = z.object({
  category: runCategorySchema,
  tier: tierSchema,
  division: z.number(),
  lp: z.number(),
  bestSpeedMps: z.number().nullable(),
  trust: trustSchema.nullable(),
  nextTargetSpeedMps: z.number().nullable(),
  /** Peak snapshot — nullable only for a row never recomputed since peak tracking was added;
   *  a normal row always has all four set together. Mirrors `routes/ranks.ts`'s own
   *  peakTier/peakDivision convention. */
  peakTier: tierSchema.nullable(),
  peakDivision: z.number().nullable(),
});

export function registerRunRankRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/runs/ranks", { schema: { response: { 200: z.array(runRankResponse) } } }, async (request) => {
    const rows = await findAllRunRanks(db, request.userId);
    return rows
      .map((r) => ({
        category: r.category,
        tier: r.tier,
        division: r.division,
        lp: r.lp,
        bestSpeedMps: r.bestSpeedMps,
        trust: r.trust,
        nextTargetSpeedMps: r.nextTargetSpeedMps,
        peakTier: r.peakTier,
        peakDivision: r.peakDivision,
      }))
      .sort((a, b) => b.lp - a.lp);
  });
}
