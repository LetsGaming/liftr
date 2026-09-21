/**
 * Run by scripts/dev-up.mjs on a seed-cache hit (see scripts/lib/seedCache.mjs) — never invoked
 * directly. On a cache hit, dev-up.mjs skips scripts/seed-mock-data.ts entirely (that's the whole
 * point), but exercise/muscle images still need to exist on a machine that's never fetched them
 * before, since IMAGES_DIR is shared across sessions rather than part of the cached database file.
 * This is the same ensureCatalogImages() step seed-mock-data.ts itself runs — pulled out so it can
 * run standalone without paying for the full catalog-ingest + mock-data seed.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCatalogImages } from "./lib/ensureCatalogImages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const CATALOG_PATH = path.join(repoRoot, "tools/catalog/curated.yaml");
const IMAGES_DIR = process.env.LIFTR_IMAGES_DIR;
if (!IMAGES_DIR) throw new Error("LIFTR_IMAGES_DIR must be set — run this via scripts/dev-up.mjs, not directly.");

ensureCatalogImages(CATALOG_PATH, IMAGES_DIR).catch((err) => {
  console.error(err);
  process.exit(1);
});
