/**
 * GET /api/rank-events — rank-ups grouped by weekday over the current rolling week (engagement
 * rework W8). Feeds the Ränge page's "Rangaufstiege" calendar strip. Same shape as
 * `readiness.ts`: the route is a thin schema wrapper, the actual reduction (repository fetches
 * raw rows, service groups them) lives in `rankService.ts`'s `computeRankEventsByWeekday`.
 */
import { z } from "zod";
import type { AppDb } from "../db.js";
import { computeRankEventsByWeekday } from "../services/rankService.js";
import type { ZodFastifyInstance } from "../types.js";

const rankEventsResponse = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    count: z.number().int().min(0),
    flaggedCount: z.number().int().min(0),
  }),
);

export function registerRankEventsRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/rank-events", { schema: { response: { 200: rankEventsResponse } } }, async () => {
    return computeRankEventsByWeekday(db);
  });
}
