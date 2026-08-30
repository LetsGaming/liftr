/**
 * `pnpm ingest --catalog` also regenerates the exercise i18n file (closes the "raw slugs in
 * the UI" gap): each exercise's German name (curated.yaml's nameDe, the source of truth) and
 * a short "how do I log this" cue (packages/ingest/src/generateHowTo.ts — templated, not
 * hand-written, see that file's header for why). Reshaped into the nested-key JSON vue-i18n
 * expects: `exercise.<slug>.name` / `exercise.<slug>.howto`. Fully offline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogEntry } from "./catalogSchema.js";
import { howToTextFor } from "./generateHowTo.js";

export async function generateExerciseI18n(entries: CatalogEntry[], outPath: string) {
  const exercise: Record<string, { name: string; howto: string }> = {};
  for (const entry of entries) {
    exercise[entry.slug] = { name: entry.nameDe, howto: howToTextFor(entry) };
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ exercise }, null, 2) + "\n", "utf-8");
  console.log(`i18n: wrote ${Object.keys(exercise).length} exercise names + how-to cues to ${outPath}`);
}
