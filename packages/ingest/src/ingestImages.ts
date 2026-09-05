/**
 * `pnpm ingest --images` (plan 0.4). Downloads free-exercise-db (Unlicense) start/end photos
 * for every curated exercise that declares a freeExerciseDbId, and mirrors them into
 * data/images/<slug>/. This is the one ingest step that touches the network — it must never
 * run outside this CLI (audit's "ingest once" rule) and the server must never hotlink these
 * URLs at request time.
 *
 * Fallback path (audit/missing-photo-sourcing-research.md §3): a handful of entries have no
 * free-exercise-db photo at all but do have a wger photo (`wgerImageId`) — CC-BY-SA 4.0, single
 * frame only, mirrored to start.jpg via the same "ingest once, never hotlink" rule. Checked only
 * when freeExerciseDbId is unset, so a slug never mixes frames from two different sources.
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
const WGER_API = "https://wger.de/api/v2";

async function downloadTo(url: string, destPath: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return true;
}

interface WgerImageListResponse {
  results: { image: string }[];
}

/** Looks up the main photo URL for a wger exercise id via the exerciseimage list endpoint
 *  (`?exercise=<id>` filter — confirmed against the live API, see the sourcing research doc).
 *  Returns null on any failure (offline, id has no image) rather than throwing — same
 *  "don't abort the whole ingest over one flaky upstream" rule the equipment resolvers follow. */
async function fetchWgerImageUrl(wgerImageId: number): Promise<string | null> {
  try {
    const res = await fetch(`${WGER_API}/exerciseimage/?exercise=${wgerImageId}&format=json`);
    if (!res.ok) return null;
    const data = (await res.json()) as WgerImageListResponse;
    return data.results[0]?.image ?? null;
  } catch {
    return null;
  }
}

export async function ingestImages(entries: CatalogEntry[], imagesDir: string) {
  let ok = 0;
  let wgerOk = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (entry.freeExerciseDbId) {
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
      continue;
    }

    if (entry.wgerImageId) {
      const dir = path.join(imagesDir, entry.slug);
      await mkdir(dir, { recursive: true });

      const url = await fetchWgerImageUrl(entry.wgerImageId);
      if (url && (await downloadTo(url, path.join(dir, "start.jpg")))) {
        wgerOk++;
      } else {
        console.warn(`  ! no wger image found for "${entry.slug}" (wgerImageId=${entry.wgerImageId})`);
      }
      continue;
    }

    skipped++;
  }

  console.log(
    `images: mirrored ${ok} (free-exercise-db) + ${wgerOk} (wger), skipped ${skipped} (no source id) of ${entries.length}`,
  );
}
