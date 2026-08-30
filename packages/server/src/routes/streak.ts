import { z } from "zod";
import { computeStreak } from "@liftr/shared";
import type { AppDb } from "../db.js";
import { findAllStreakDates } from "../repositories/streakRepository.js";
import { readJsonSetting } from "../repositories/settingsRepository.js";
import type { ZodFastifyInstance } from "../types.js";
import type { Profile } from "./settings.js";

const streakResponse = z.object({ streak: z.number(), tokensRemaining: z.number() });

/** GET /api/streak — current streak + remaining protection (plan Phase 2.4). Protection scales
 *  with the onboarding profile's `workoutsPerWeek` when set (QUAL-04: a lifter who trains 2x/week
 *  by design shouldn't have their on-schedule rest days read as a broken streak) — see
 *  @liftr/shared's computeStreak for the derivation. Falls back to the flat default pool when the
 *  profile question was never answered. */
export function registerStreakRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/streak", { schema: { response: { 200: streakResponse } } }, async () => {
    const [dates, profile] = await Promise.all([findAllStreakDates(db), readJsonSetting<Profile>(db, "profile")]);
    return computeStreak(dates, new Date(), profile?.workoutsPerWeek);
  });
}
