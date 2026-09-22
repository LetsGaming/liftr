/**
 * `pnpm ingest --run-standards`. Fully offline, same spirit as ingestStandards.ts: builds the
 * cardio-standards threshold table from @liftr/shared's `buildCardioStandards()` — which walks
 * the full cardio activity registry (cardioActivities.ts) and runs each ranked activity's anchors
 * through the same widenAnchorSpread -> interpolateNineTierAnchors -> expand pipeline strength
 * standards already use — and writes it into the `run_standards` table.
 *
 * Unlike `ingestStandards.ts`, `run_standards` isn't per-exercise — there's no exercises-table
 * join, no catalog entries to iterate, and no per-entry skip/warn cases. It's a flat "clear the
 * whole table, reinsert everything" idempotent rewrite of every row every time this runs —
 * `buildCardioStandards()` is the single function that owns 100% of the table's rows, which is
 * what keeps the whole-table delete safe regardless of how many activities the registry holds.
 */
import { runStandards, type LiftrDb } from "@liftr/db";
import { buildCardioStandards } from "@liftr/shared";

export async function ingestRunStandards(db: LiftrDb) {
  const rows = buildCardioStandards();

  // idempotent: clear the whole table and rewrite, rather than diffing row-by-row (mirrors
  // ingestStandards.ts's per-exercise delete+reinsert, just scoped to the whole table since there
  // is nothing to filter by here).
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

  const byActivity = new Map<string, number>();
  for (const r of rows) byActivity.set(r.activityType, (byActivity.get(r.activityType) ?? 0) + 1);
  const breakdown = [...byActivity.entries()].map(([activity, count]) => `${count} ${activity}`).join(", ");
  console.log(`run-standards: wrote ${rows.length} threshold rows (${breakdown})`);
}
