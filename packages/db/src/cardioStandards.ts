/**
 * Change-detecting sync for the `run_standards` table, built from `@liftr/shared`'s
 * `buildCardioStandards()` (pure/offline — walks the cardio activity registry through the same
 * anchor-interpolation pipeline strength standards use). Used both by the CLI ingest step
 * (`ingestRunStandards.ts`, a thin wrapper around this) and by server-boot self-heal (`app.ts`) —
 * the latter needs to know whether anything actually changed so it only pays for a full rank
 * recompute when it must.
 */
import type { CardioStandardRow } from "@liftr/shared";
import { buildCardioStandards } from "@liftr/shared";
import { runStandards } from "./schema.js";
import type { LiftrDb } from "./client.js";

function rowKey(r: { activityType: string; category: string; sex: string; tier: string; division: number }): string {
  return `${r.activityType}|${r.category}|${r.sex}|${r.tier}|${r.division}`;
}

/** True unless `existing` has exactly the same rows (key set + thresholds) as `built` — a row
 *  count mismatch is the cheap, common case (e.g. an install that never got walk/hike rows at
 *  all), but a same-count table with a changed anchor/threshold value must also be caught. */
function standardsDiverge(existing: (typeof runStandards.$inferSelect)[], built: CardioStandardRow[]): boolean {
  if (existing.length !== built.length) return true;
  const existingByKey = new Map(existing.map((r) => [rowKey(r), r.threshold]));
  return built.some((row) => existingByKey.get(rowKey(row)) !== row.threshold);
}

/**
 * Idempotent, change-detecting rewrite of `run_standards`: rebuilds the full table from
 * `buildCardioStandards()` and only touches the database when the result actually differs from
 * what's stored — so calling this on every server boot is cheap on the (overwhelmingly common)
 * no-op path.
 */
export async function syncCardioStandards(db: LiftrDb): Promise<{ changed: boolean }> {
  const rows = buildCardioStandards();
  const existing = await db.select().from(runStandards);
  if (!standardsDiverge(existing, rows)) return { changed: false };

  await db.delete(runStandards);
  await db.insert(runStandards).values(
    rows.map((r) => ({
      activityType: r.activityType,
      category: r.category,
      sex: r.sex,
      tier: r.tier,
      division: r.division,
      threshold: r.threshold,
      trust: r.trust,
    })),
  );
  return { changed: true };
}
