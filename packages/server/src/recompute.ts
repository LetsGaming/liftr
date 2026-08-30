/**
 * `pnpm --filter @liftr/server recompute` — force-recomputes every exercise's rank.
 *
 * Rank recompute normally only happens as a side effect of logging a set (plan §2.2), so if
 * you edit curated.yaml's anchor ratios or re-run `pnpm ingest --standards` with new numbers,
 * existing `ranks` rows go stale until someone happens to log a set for that exercise again.
 * This closes that gap: run it after any standards change to bring every rank up to date
 * immediately. Safe to run any time — `ranks`/`prs` are derived caches (plan's "every derived
 * table is rebuildable"), never the source of truth.
 */
import { exercises } from "@liftr/db";
import { db } from "./db.js";
import { recomputeRankForExercise } from "./services/rankService.js";

async function main() {
  const all = await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises);
  let recomputed = 0;
  let skipped = 0;

  for (const ex of all) {
    const result = await recomputeRankForExercise(db, ex.id);
    if (result) {
      recomputed++;
    } else {
      skipped++; // no logged sets yet, or no standards for this exercise (e.g. plank)
    }
  }

  console.log(`recompute: ${recomputed} ranks updated, ${skipped} skipped (no sets or no standards)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
