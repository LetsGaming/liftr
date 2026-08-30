import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { findRecentBodyweightLogs, upsertBodyweightLog } from "../repositories/bodyweightRepository.js";
import type { ZodFastifyInstance } from "../types.js";

/**
 * Bodyweight log (plan Phase 6 "nice-to-have", pulled forward). Not just a stats feature —
 * `rankEngine.ts` needs a current bodyweight to compute load_ratio ranks and falls back to a
 * hardcoded 75kg guess when no entry exists, which silently makes every loaded-lift rank wrong
 * for anyone who isn't close to that weight. This closes that gap.
 */
const logBodyweightInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  weightKg: z.number().positive().max(400),
});

const bodyweightLogResponse = z.object({
  id: z.string(),
  date: z.string(),
  weightKg: z.number(),
});

export function registerBodyweightRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.get("/api/bodyweight", { schema: { response: { 200: z.array(bodyweightLogResponse) } } }, async () => {
    return findRecentBodyweightLogs(db);
  });

  app.post(
    "/api/bodyweight",
    { schema: { body: logBodyweightInput, response: { 201: bodyweightLogResponse } } },
    async (req, reply) => {
      const row = await upsertBodyweightLog(db, req.body.date, req.body.weightKg);
      reply.code(201);
      return row;
    },
  );
}
