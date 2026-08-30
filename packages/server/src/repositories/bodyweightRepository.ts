import { desc, eq } from "drizzle-orm";
import { bodyweightLogs, type LiftrDb } from "@liftr/db";

/** All bodyweight queries (data-persistence.md: "all queries live in a repository/data
 *  module") — routes and rankEngine.ts's `getCurrentBodyweightKg` call these, never Drizzle
 *  directly. */
export function findRecentBodyweightLogs(db: LiftrDb, limit = 60) {
  return db.query.bodyweightLogs.findMany({ orderBy: desc(bodyweightLogs.date), limit });
}

export function findLatestBodyweightLog(db: LiftrDb) {
  return db.query.bodyweightLogs.findFirst({ orderBy: desc(bodyweightLogs.date) });
}

/** Upsert-by-date: logging twice on the same day corrects that day's entry rather than
 *  duplicating. Shared by the direct bodyweight route and the onboarding profile save
 *  (settings.ts's "current weight" question) so both go through one write path — a second,
 *  independent insert path could drift (e.g. forgetting the upsert-by-date behavior). */
export async function upsertBodyweightLog(db: LiftrDb, date: string, weightKg: number) {
  const existing = await db.query.bodyweightLogs.findFirst({ where: eq(bodyweightLogs.date, date) });
  if (existing) {
    const [row] = await db.update(bodyweightLogs).set({ weightKg }).where(eq(bodyweightLogs.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db.insert(bodyweightLogs).values({ date, weightKg }).returning();
  return row!;
}
