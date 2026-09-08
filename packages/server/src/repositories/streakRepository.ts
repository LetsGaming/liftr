import { eq } from "drizzle-orm";
import { streaks, type LiftrDb } from "@liftr/db";

export async function findAllStreakDates(db: LiftrDb, userId: string): Promise<Set<string>> {
  const rows = await db.select({ date: streaks.date }).from(streaks).where(eq(streaks.userId, userId));
  return new Set(rows.map((r) => r.date));
}

/** Idempotent: a date already credited for this activity kind is a no-op, not a duplicate —
 *  both `services/syncService.ts` (finish_workout) and `services/runImportService.ts` (every
 *  run-creation path) credit through this one function. */
export function creditStreak(db: LiftrDb, userId: string, date: string, kind: "workout" | "run") {
  return db.insert(streaks).values({ userId, date, kind }).onConflictDoNothing();
}
