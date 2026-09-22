/**
 * GET /api/runs/ranks — every rank bucket with a computed rank, for one cardio activity type
 * (`?activityType=run|walk|hike`, defaults to "run"). Own dedicated route file, mirroring how
 * `routes/ranks.ts` (the strength analog) is separate from `routes/workouts.ts` — see Ruling 4 in
 * this task's brief.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { findAllRunRanks } from "../repositories/runRankRepository.js";
import { rankBucketSchema, rankedActivityTypeSchema, tierSchema, trustSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const runRanksQuery = z.object({ activityType: rankedActivityTypeSchema.default("run") });

const runRankResponse = z.object({
  activityType: rankedActivityTypeSchema,
  category: rankBucketSchema,
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
  app.get(
    "/api/runs/ranks",
    { schema: { querystring: runRanksQuery, response: { 200: z.array(runRankResponse) } } },
    async (request) => {
      const rows = await findAllRunRanks(db, request.userId, request.query.activityType);
      return rows
        .map((r) => ({
          activityType: r.activityType,
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
    },
  );
}
