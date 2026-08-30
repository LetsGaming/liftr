import { z } from "zod";
import type { AppDb } from "../db.js";
import { getXpSummary } from "../services/xpService.js";
import type { ZodFastifyInstance } from "../types.js";

const xpResponse = z.object({
  totalXp: z.number(),
  level: z.number(),
  xpIntoLevel: z.number(),
  xpForNextLevel: z.number(),
  progressPercent: z.number(),
});

/** GET /api/xp — total XP across every logged non-warmup set + the resulting level (plan §6.4). */
export function registerXpRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/xp", { schema: { response: { 200: xpResponse } } }, async () => {
    return getXpSummary(db);
  });
}
