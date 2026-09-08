/**
 * GET /api/overall-rank — the account-level "how good a lifter am I overall" aggregate. Same
 * shape as `readiness.ts`/`rankEvents.ts`: the route is a thin schema wrapper, the actual
 * aggregation lives in `overallRankService.ts`.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { getOverallRank } from "../services/overallRankService.js";
import { tierSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const bandSchema = z.object({ tier: tierSchema, division: z.number(), lp: z.number() }).nullable();

const overallRankResponse = z.object({ current: bandSchema, peak: bandSchema });

export function registerOverallRankRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/overall-rank", { schema: { response: { 200: overallRankResponse } } }, async (request) => {
    return getOverallRank(db, request.userId);
  });
}
