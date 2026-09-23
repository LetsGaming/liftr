/**
 * `pnpm ingest --run-standards`. Thin wrapper around `@liftr/db`'s `syncCardioStandards` — the
 * writer itself lives there so server boot (app.ts's self-heal) can reuse the exact same
 * change-detecting rewrite this CLI step performs.
 */
import { syncCardioStandards, type LiftrDb } from "@liftr/db";
import { buildCardioStandards } from "@liftr/shared";

export async function ingestRunStandards(db: LiftrDb) {
  await syncCardioStandards(db);

  const rows = buildCardioStandards();
  const byActivity = new Map<string, number>();
  for (const r of rows) byActivity.set(r.activityType, (byActivity.get(r.activityType) ?? 0) + 1);
  const breakdown = [...byActivity.entries()].map(([activity, count]) => `${count} ${activity}`).join(", ");
  console.log(`run-standards: wrote ${rows.length} threshold rows (${breakdown})`);
}
