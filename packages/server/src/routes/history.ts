import { z } from "zod";
import type { AppDb } from "../db.js";
import { findSetHistoryForExercise } from "../repositories/historyRepository.js";
import { getHistoryPage } from "../services/historyService.js";
import type { ZodFastifyInstance } from "../types.js";

const historyQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const historyItemResponse = z.object({
  kind: z.enum(["workout", "run"]),
  id: z.string(),
  at: z.date(),
  title: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
});

const historyResponse = z.object({
  items: z.array(historyItemResponse),
  nextCursor: z.string().nullable(),
});

const exerciseHistoryParams = z.object({ id: z.string() });
const exerciseHistorySetResponse = z.object({
  setIndex: z.number(),
  weightKg: z.number().nullable(),
  reps: z.number(),
  loggedAt: z.date(),
  isWarmup: z.boolean(),
});
const exerciseHistoryResponse = z.object({ sets: z.array(exerciseHistorySetResponse) });

export function registerHistoryRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get(
    "/api/history",
    { schema: { querystring: historyQuery, response: { 200: historyResponse } } },
    async (req) => {
      const limit = Math.min(req.query.limit ?? 20, 50);
      return getHistoryPage(db, req.query.cursor, limit);
    },
  );

  // GET /api/exercises/:id/history — "last time" reference + chart series (plan 1.1, 2.5).
  app.get(
    "/api/exercises/:id/history",
    { schema: { params: exerciseHistoryParams, response: { 200: exerciseHistoryResponse } } },
    async (req) => {
      const rows = await findSetHistoryForExercise(db, req.params.id);
      return { sets: rows };
    },
  );
}
