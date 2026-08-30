/**
 * `pnpm ingest --images` (plan 0.4). Downloads free-exercise-db (Unlicense) start/end photos
 * for every curated exercise that declares a freeExerciseDbId, and mirrors them into
 * data/images/<slug>/. This is the one ingest step that touches the network — it must never
 * run outside this CLI (audit's "ingest once" rule) and the server must never hotlink these
 * URLs at request time.
 *
 * NOTE: images are saved as-downloaded (jpg/png). WebP re-encoding (plan 0.4's "two widths,
 * WebP") needs an image library (e.g. sharp) — deferred to keep this step dependency-light
 * while the local native-build toolchain is still being set up; swap in a resize pass later
 * without touching the rest of the pipeline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogEntry } from "./catalogSchema.js";

const FREE_EXERCISE_DB_RAW =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

async function downloadTo(url: string, destPath: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return true;
}

export async function ingestImages(entries: CatalogEntry[], imagesDir: string) {
  let ok = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.freeExerciseDbId) {
      skipped++;
      continue;
    }
    const dir = path.join(imagesDir, entry.slug);
    await mkdir(dir, { recursive: true });

    // free-exercise-db convention: <id>/0.jpg (start), <id>/1.jpg (end) — no "images/" subpath
    // (verified against the actual repo structure; an earlier version of this guessed wrong).
    const startOk = await downloadTo(
      `${FREE_EXERCISE_DB_RAW}/${entry.freeExerciseDbId}/0.jpg`,
      path.join(dir, "start.jpg"),
    );
    const endOk = await downloadTo(
      `${FREE_EXERCISE_DB_RAW}/${entry.freeExerciseDbId}/1.jpg`,
      path.join(dir, "end.jpg"),
    );
    if (startOk && endOk) ok++;
    else console.warn(`  ! missing image(s) for "${entry.slug}" (freeExerciseDbId=${entry.freeExerciseDbId})`);
  }

  console.log(`images: mirrored ${ok}, skipped ${skipped} (no freeExerciseDbId) of ${entries.length}`);
}
