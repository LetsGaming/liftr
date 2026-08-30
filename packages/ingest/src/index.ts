/**
 * Ingest-once CLI (plan 0.4): `pnpm ingest --all` / `--catalog` / `--images` / `--muscles` /
 * `--standards`. Run manually, never from the running server. Every step is idempotent — safe
 * to re-run after editing tools/catalog/curated.yaml.
 */
import { createDb } from "@liftr/db";
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

const args = new Set(process.argv.slice(2));
const all = args.has("--all") || args.size === 0;

async function main() {
  const db = createDb(DB_PATH);

  if (all || args.has("--catalog") || args.has("--standards")) {
    // standards depends on exercises already existing, and both need the parsed catalog
    if (all || args.has("--catalog")) {
      console.log("== catalog ==");
      await ingestCatalog(db, CATALOG_PATH);
      const entries = await loadCatalog(CATALOG_PATH);
      await generateExerciseI18n(entries, I18N_OUT_PATH);
    }
    if (all || args.has("--standards")) {
      console.log("== standards ==");
      const entries = await loadCatalog(CATALOG_PATH);
      await ingestStandards(db, entries);
    }
  }

  if (all || args.has("--images")) {
    console.log("== images ==");
    const entries = await loadCatalog(CATALOG_PATH);
    await ingestImages(entries, IMAGES_DIR);
  }

  if (all || args.has("--muscles")) {
    console.log("== muscle assets ==");
    await ingestMuscleAssets(IMAGES_DIR);
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
