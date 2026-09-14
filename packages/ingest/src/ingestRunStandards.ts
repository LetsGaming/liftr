/**
 * `pnpm ingest --run-standards`. Fully offline, same spirit as ingestStandards.ts: builds the
 * running-standards threshold table from @liftr/shared's `buildRunStandards()` (RunningLevel-
 * derived anchors run through the same widenAnchorSpread -> interpolateNineTierAnchors -> expand
 * pipeline strength standards already use) and writes it into the `run_standards` table.
 *
 * Unlike `ingestStandards.ts`, `run_standards` isn't per-exercise — there's no exercises-table
 * join, no catalog entries to iterate, and no per-entry skip/warn cases. It's a flat "clear the
 * whole table, reinsert everything" idempotent rewrite of all 270 rows (5 categories x 2 sexes x
 * 27 divisions) every time this runs.
 */
import { runStandards, type LiftrDb } from "@liftr/db";
import { buildRunStandards } from "@liftr/shared";

export async function ingestRunStandards(db: LiftrDb) {
  const rows = buildRunStandards();

  // idempotent: clear the whole table and rewrite, rather than diffing row-by-row (mirrors
  // ingestStandards.ts's per-exercise delete+reinsert, just scoped to the whole table since there
  // is nothing to filter by here).
  await db.delete(runStandards);
  await db.insert(runStandards).values(
    rows.map((r) => ({
      category: r.category,
      sex: r.sex,
      tier: r.tier,
      division: r.division,
      threshold: r.threshold,
      trust: r.trust,
    })),
  );

  const categoryCount = new Set(rows.map((r) => r.category)).size;
  console.log(`run-standards: wrote ${rows.length} threshold rows across ${categoryCount} running categories (both sexes)`);
}
