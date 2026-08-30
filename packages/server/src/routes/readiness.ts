/**
 * GET /api/readiness — last-trained timestamp per muscle, primary vs. secondary (engagement
 * rework W5). Feeds the Übersicht "Erholungszone" hero — the actual 0-1 readiness math lives
 * in @liftr/shared's computeReadiness (recovery/recovery.ts) and runs client-side against
 * these raw timestamps, same "server returns facts, shared computes the derived number"
 * split every other route in this app already follows (rankEngine.ts computes server-side
 * only because the standards table it joins against is server-only; this data has no such
 * constraint, and computing 15 numbers client-side avoids a recompute-on-every-page-load cost
 * for a value that's purely presentational).
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { computeMuscleLastTrained } from "../services/readinessService.js";
import type { ZodFastifyInstance } from "../types.js";

const readinessResponse = z.array(
  z.object({
    slug: z.string(),
    lastTrainedAt: z.string().nullable(),
    wasPrimary: z.boolean(),
  }),
);

export function registerReadinessRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/readiness", { schema: { response: { 200: readinessResponse } } }, async () => {
    return computeMuscleLastTrained(db);
  });
}
