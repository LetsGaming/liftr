/**
 * Shared by scripts/seed-mock-data.ts (full-seed path) and scripts/ensure-images.ts (cache-hit
 * path, invoked by dev-up.mjs — see scripts/lib/seedCache.mjs) since both need catalog exercise
 * images and muscle-map assets present on disk, independent of whether this session's database was
 * freshly seeded or copied in from the seed cache. Fetches into the given `imagesDir` only if it's
 * not already populated — these assets are static, network-fetched, and content-identical across
 * every session (see dev-up.mjs's own doc comment), so a machine that already has them never
 * refetches.
 */
import fs from "node:fs";
import path from "node:path";
import { loadCatalog } from "../../packages/ingest/src/ingestCatalog.js";
import { ingestImages } from "../../packages/ingest/src/ingestImages.js";
import { ingestMuscleAssets } from "../../packages/ingest/src/ingestMuscleAssets.js";

export async function ensureCatalogImages(catalogPath: string, imagesDir: string): Promise<void> {
  // Checking "does IMAGES_DIR have any content at all" would treat exercise images and muscle
  // assets as one atomic unit: a machine that got exercise photos but was interrupted before
  // muscle assets (or vice versa) would skip the missing half forever. Check each independently.
  const hasExerciseImages = () =>
    fs.existsSync(imagesDir) && fs.readdirSync(imagesDir).some((name) => name !== "muscles" && name !== ".lock");
  const hasMuscleAssets = () => fs.existsSync(path.join(imagesDir, "muscles", "front-body.svg"));
  if (hasExerciseImages() && hasMuscleAssets()) {
    console.log(`  ${imagesDir} already has exercise images and muscle assets — skipping fetch.`);
    return;
  }

  // data/images/ is shared across every concurrent dev-up.mjs session (unlike the per-session DB),
  // so two sessions starting at once can both see it empty and ingest concurrently, corrupting
  // muscle SVGs that ingestMuscleAssets writes then immediately re-reads. This lock dir makes that
  // a single-writer critical section. ponytail: fixed poll count, no cross-process notify — fine
  // for a handful of local dev sessions, revisit if that stops being true.
  const lockDir = path.join(imagesDir, ".lock");
  fs.mkdirSync(imagesDir, { recursive: true });
  let haveLock = false;
  for (let i = 0; i < 120; i++) {
    try {
      fs.mkdirSync(lockDir);
      haveLock = true;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!haveLock) {
    console.warn(`  ! timed out waiting for ${lockDir} — proceeding without it (stale lock?).`);
  }

  try {
    if (hasExerciseImages() && hasMuscleAssets()) {
      console.log(`  ${imagesDir} was fully populated by another session while waiting — skipping fetch.`);
      return;
    }
    const entries = await loadCatalog(catalogPath);
    if (!hasExerciseImages()) {
      console.log("  fetching catalog exercise images, this can take a minute...");
      await ingestImages(entries, imagesDir);
    }
    if (!hasMuscleAssets()) {
      console.log("  fetching muscle-map assets...");
      await ingestMuscleAssets(imagesDir);
    }
  } catch (err) {
    // Not fatal: exercises without a photo already fall back to the icon UI — a real, supported
    // state, not a broken one — so a flaky/offline network here shouldn't fail the whole session.
    console.warn(`  ! image/muscle-asset fetch failed (continuing without photos): ${(err as Error).message}`);
  } finally {
    if (haveLock) fs.rmSync(lockDir, { recursive: true, force: true });
  }
}
