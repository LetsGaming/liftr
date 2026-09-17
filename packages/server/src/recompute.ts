/**
 * `pnpm --filter @liftr/server recompute` — force-recomputes every exercise's rank and every
 * running category's rank.
 *
 * Rank recompute normally only happens as a side effect of logging a set or syncing a run, so if
 * you edit curated.yaml's anchor ratios, re-run `pnpm ingest --standards`, or re-run
 * `pnpm ingest --running-standards` with new numbers, existing `ranks`/`runRanks` rows go stale
 * until someone happens to log a set or a rank-eligible run again. This closes that gap: run it
 * after any standards change (strength or running) to bring every rank up to date immediately.
 * Safe to run any time — `ranks`/`prs`/`runRanks`/`runPrs` are derived caches, never the source
 * of truth.
 */
import { exercises, users } from "@liftr/db";
import { RUN_CATEGORIES } from "@liftr/shared";
import { db } from "./db.js";
import { recomputeRankForExercise } from "./services/rankService.js";
import { recomputeRunRank } from "./services/runRankService.js";

async function main() {
  const allUsers = await db.select({ id: users.id }).from(users);
  const all = await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises);
  let recomputed = 0;
  let skipped = 0;

  for (const user of allUsers) {
    for (const ex of all) {
      const result = await recomputeRankForExercise(db, user.id, ex.id);
      if (result) {
        recomputed++;
      } else {
        skipped++; // no logged sets yet, or no standards for this exercise (e.g. plank)
      }
    }
  }

  console.log(`recompute: ${recomputed} ranks updated, ${skipped} skipped (no sets or no standards)`);

  let runRecomputed = 0;
  let runSkipped = 0;

  for (const user of allUsers) {
    for (const category of RUN_CATEGORIES) {
      const result = await recomputeRunRank(db, user.id, category);
      if (result) {
        runRecomputed++;
      } else {
        runSkipped++; // no rank-eligible runs yet, or no standards for this category
      }
    }
  }

  console.log(
    `recompute: ${runRecomputed} run ranks updated, ${runSkipped} skipped (no runs or no standards)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
