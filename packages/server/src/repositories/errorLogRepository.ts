import { desc, lt } from "drizzle-orm";
import { errorLogs, type LiftrDb } from "@liftr/db";

export type ErrorLogRow = typeof errorLogs.$inferSelect;

export async function insertErrorLog(
  db: LiftrDb,
  values: { method: string; url: string; statusCode: number; message: string; stack?: string; occurredAt?: Date },
): Promise<void> {
  await db.insert(errorLogs).values(values);
}

/** Ring-buffer cap — keeps the table from growing unbounded on an instance that's up for years.
 *  Two queries instead of a single subquery-based DELETE: sqlite's DELETE ... WHERE id NOT IN
 *  (correlated subquery) works, but "find the cutoff timestamp, delete anything older" reads
 *  clearly and costs nothing extra at this table's actual write rate (unexpected errors only). */
export async function pruneErrorLogs(db: LiftrDb, keep = 200): Promise<void> {
  const cutoffRow = await db.query.errorLogs.findFirst({
    orderBy: desc(errorLogs.occurredAt),
    offset: keep - 1,
    columns: { occurredAt: true },
  });
  if (cutoffRow) {
    await db.delete(errorLogs).where(lt(errorLogs.occurredAt, cutoffRow.occurredAt));
  }
}

export function findRecentErrorLogs(db: LiftrDb, limit = 100): Promise<ErrorLogRow[]> {
  return db.query.errorLogs.findMany({ orderBy: desc(errorLogs.occurredAt), limit });
}
