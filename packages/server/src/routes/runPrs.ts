/**
 * GET /api/runs/prs — running Personal Records ledger. Own dedicated route file, mirroring how
 * `routes/prs.ts` (the strength analog) is separate from `routes/workouts.ts` — see Ruling 4 in
 * this task's brief. Unlike `routes/prs.ts`, no service layer/join is needed: `run_prs` carries
 * `category` directly (no exercise table to join to) and `runId` alone is the "jump to this run"
 * link, so this route reads straight off the repository.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { findAllRunPrs } from "../repositories/runRankRepository.js";
import { activityTypeSchema, rankBucketSchema } from "../schemas.js";
import type { ZodFastifyInstance } from "../types.js";

const runPrListResponse = z.array(
  z.object({
    id: z.string(),
    activityType: activityTypeSchema,
    category: rankBucketSchema,
    kind: z.enum(["time", "speed"]),
    value: z.number(),
    runId: z.string(),
    achievedAt: z.string(),
  }),
);

export function registerRunPrRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/runs/prs", { schema: { response: { 200: runPrListResponse } } }, async (request) => {
    // No activityType filter — both ladders' PRs come back together, same list the client already
    // renders; RecordsPage.vue distinguishes them by the new activityType field.
    const rows = await findAllRunPrs(db, request.userId);
    return rows.map((r) => ({
      id: r.id,
      activityType: r.activityType,
      category: r.category,
      kind: r.kind,
      value: r.value,
      runId: r.runId,
      achievedAt: r.achievedAt.toISOString(),
    }));
  });
}
