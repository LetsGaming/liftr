/**
 * GET /api/prs — Personal Records ledger (workplan-v1 §2). Same shape as `overallRank.ts`: the
 * route is a thin schema wrapper, the actual query lives in `prService.ts`.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { getPrs } from "../services/prService.js";
import type { ZodFastifyInstance } from "../types.js";

const prListResponse = z.array(
  z.object({
    id: z.string(),
    exerciseId: z.string(),
    exerciseSlug: z.string(),
    exerciseName: z.string().nullable(),
    kind: z.enum(["e1rm", "weight", "reps", "volume"]),
    value: z.number(),
    achievedAt: z.string(),
    workoutId: z.string().nullable(),
  }),
);

export function registerPrRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/prs", { schema: { response: { 200: prListResponse } } }, async () => {
    return getPrs(db);
  });
}
