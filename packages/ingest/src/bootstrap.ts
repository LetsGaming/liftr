/**
 * `pnpm --filter @liftr/ingest bootstrap` (or root `pnpm bootstrap`). Feedback: "deleting the
 * data folder has caused a lot of the third-party data to be removed and apparently it is not
 * being ingested again — this WILL break once we move into prod." Migrations already run
 * automatically on server boot (see @liftr/db's runMigrations, wired into buildApp); this
 * covers the rest of "starting from scratch" — the catalog/standards/images/muscle assets that
 * only ever come from this CLI (index.ts's own "never run from the running server" rule for the
 * network-bound steps still holds; this script is still the CLI, just auto-invoked at the start
 * of `pnpm dev` and meant to run once as part of a prod deploy too).
 *
 * Guarded on the exercises table being empty, so this is a no-op (fast) on every normal
 * `pnpm dev` once the environment is already seeded — it doesn't re-hit the network or re-walk
 * the catalog on every dev boot, only the first time (or after data/ is wiped again).
 */
import { createDb, runMigrations } from "@liftr/db";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateExerciseI18n } from "./generateI18n.js";
import { loadCatalog, ingestCatalog } from "./ingestCatalog.js";
import { ingestImages } from "./ingestImages.js";
import { ingestMuscleAssets } from "./ingestMuscleAssets.js";
import { ingestStandards } from "./ingestStandards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CATALOG_PATH = path.join(REPO_ROOT, "tools/catalog/curated.yaml");
const DB_PATH = process.env.LIFTR_DB_PATH ?? path.join(REPO_ROOT, "data/liftr.db");
const IMAGES_DIR = process.env.LIFTR_IMAGES_DIR ?? path.join(REPO_ROOT, "data/images");
const I18N_OUT_PATH = path.join(REPO_ROOT, "packages/client/src/locales/exercises.de.json");

async function main() {
  const db = createDb(DB_PATH);
  runMigrations(db);

  const existing = await db.query.exercises.findFirst();
  if (existing) {
    console.log("bootstrap: catalog already ingested, skipping.");
    return;
  }

  console.log("bootstrap: no exercises found — running full ingest (catalog, standards, images, muscle assets)...");
  const entries = await loadCatalog(CATALOG_PATH);
  await ingestCatalog(db, CATALOG_PATH);
  await generateExerciseI18n(entries, I18N_OUT_PATH);
  await ingestStandards(db, entries);
  await ingestImages(entries, IMAGES_DIR);
  await ingestMuscleAssets(IMAGES_DIR);
  console.log("bootstrap: done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
