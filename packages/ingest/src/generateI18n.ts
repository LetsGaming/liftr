/**
 * `pnpm ingest --catalog` also regenerates the exercise i18n files (closes the "raw slugs in
 * the UI" gap): each exercise's name (curated.yaml's nameDe/nameEn, the source of truth) and
 * a short "how do I log this" cue per locale (packages/ingest/src/generateHowTo.ts — templated,
 * not hand-written, see that file's header for why). Reshaped into the nested-key JSON vue-i18n
 * expects: `exercise.<slug>.name` / `exercise.<slug>.howto`. Fully offline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogEntry } from "./catalogSchema.js";
import { howToTextFor } from "./generateHowTo.js";

async function writeLocaleFile(entries: CatalogEntry[], outPath: string, nameField: "nameDe" | "nameEn", locale: "de" | "en") {
  const exercise: Record<string, { name: string; howto: string }> = {};
  for (const entry of entries) {
    exercise[entry.slug] = { name: entry[nameField], howto: howToTextFor(entry, locale) };
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ exercise }, null, 2) + "\n", "utf-8");
  console.log(`i18n: wrote ${Object.keys(exercise).length} exercise names + how-to cues to ${outPath}`);
}

/** `localesDir` is the directory holding exercises.de.json / exercises.en.json. */
export async function generateExerciseI18n(entries: CatalogEntry[], localesDir: string) {
  await writeLocaleFile(entries, path.join(localesDir, "exercises.de.json"), "nameDe", "de");
  await writeLocaleFile(entries, path.join(localesDir, "exercises.en.json"), "nameEn", "en");
}
