import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogEntry } from "~ingest/catalogSchema.js";
import { generateExerciseI18n } from "~ingest/generateI18n.js";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "back-squat",
    wgerId: null,
    freeExerciseDbId: null,
    wgerImageId: null,
    nameDe: "Kniebeuge",
    nameEn: "Back Squat",
    equipment: "barbell",
    requiresEquipment: null,
    movementPattern: "squat",
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    isBodyweight: false,
    bodyweightLeverage: null,
    anchor: null,
    ratio: null,
    trust: "derived",
    ...overrides,
  };
}

describe("generateExerciseI18n", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("writes a nested exercise.<slug>.{name,howto} JSON file vue-i18n expects", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));
    const outPath = join(tmpDir, "exercises.de.json");

    await generateExerciseI18n(
      [entry({ slug: "back-squat", nameDe: "Kniebeuge", movementPattern: "squat", primaryMuscles: ["quads"] })],
      outPath,
    );

    const written = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(written).toEqual({
      exercise: {
        "back-squat": {
          name: "Kniebeuge",
          howto: "Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in den vorderen Oberschenkel.",
        },
      },
    });
  });

  it("creates any missing parent directories for the output path", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));
    const outPath = join(tmpDir, "nested", "does", "not", "exist", "exercises.de.json");
    expect(existsSync(outPath)).toBe(false);

    await generateExerciseI18n([entry()], outPath);

    expect(existsSync(outPath)).toBe(true);
  });

  it("writes one entry per catalog entry, keyed by slug", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));
    const outPath = join(tmpDir, "exercises.de.json");

    await generateExerciseI18n(
      [entry({ slug: "back-squat", nameDe: "Kniebeuge" }), entry({ slug: "bench-press", nameDe: "Bankdrücken" })],
      outPath,
    );

    const written = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(Object.keys(written.exercise)).toEqual(["back-squat", "bench-press"]);
    expect(written.exercise["bench-press"].name).toBe("Bankdrücken");
  });
});
