/**
 * GET /api/runs/overall-rank — the account-level "how good a runner am I overall" aggregate.
 * Own dedicated route file, mirroring how `routes/overallRank.ts` (the strength analog) is
 * separate from `routes/workouts.ts`/`routes/runs.ts` — see Ruling 4 in this task's brief. Same
 * thin-schema-wrapper shape as `routes/overallRank.ts`: the actual aggregation lives in
 * `overallRunnerRankService.ts`.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { getOverallRunnerRank } from "../services/overallRunnerRankService.js";
import { tierSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const bandSchema = z.object({ tier: tierSchema, division: z.number(), lp: z.number() }).nullable();

const overallRunnerRankResponse = z.object({ current: bandSchema, peak: bandSchema });

export function registerOverallRunnerRankRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get(
    "/api/runs/overall-rank",
    { schema: { response: { 200: overallRunnerRankResponse } } },
    async (request) => {
      return getOverallRunnerRank(db, request.userId);
    },
  );
}
