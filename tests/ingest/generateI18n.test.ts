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

  it("writes a nested exercise.<slug>.{name,howto} JSON file vue-i18n expects, per locale", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));

    await generateExerciseI18n(
      [entry({ slug: "back-squat", nameDe: "Kniebeuge", nameEn: "Back Squat", movementPattern: "squat", primaryMuscles: ["quads"] })],
      tmpDir,
    );

    const written = JSON.parse(readFileSync(join(tmpDir, "exercises.de.json"), "utf-8"));
    expect(written).toEqual({
      exercise: {
        "back-squat": {
          name: "Kniebeuge",
          howto: "Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in den vorderen Oberschenkel.",
        },
      },
    });

    const writtenEn = JSON.parse(readFileSync(join(tmpDir, "exercises.en.json"), "utf-8"));
    expect(writtenEn).toEqual({
      exercise: {
        "back-squat": {
          name: "Back Squat",
          howto: "Keep your back straight, knees tracking over toes, lower under control — you'll feel it in the front of your thighs.",
        },
      },
    });
  });

  it("creates any missing parent directories for the output path", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));
    const localesDir = join(tmpDir, "nested", "does", "not", "exist");
    expect(existsSync(join(localesDir, "exercises.de.json"))).toBe(false);

    await generateExerciseI18n([entry()], localesDir);

    expect(existsSync(join(localesDir, "exercises.de.json"))).toBe(true);
    expect(existsSync(join(localesDir, "exercises.en.json"))).toBe(true);
  });

  it("writes one entry per catalog entry, keyed by slug", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-i18n-"));

    await generateExerciseI18n(
      [entry({ slug: "back-squat", nameDe: "Kniebeuge", nameEn: "Back Squat" }), entry({ slug: "bench-press", nameDe: "Bankdrücken", nameEn: "Bench Press" })],
      tmpDir,
    );

    const written = JSON.parse(readFileSync(join(tmpDir, "exercises.de.json"), "utf-8"));
    expect(Object.keys(written.exercise)).toEqual(["back-squat", "bench-press"]);
    expect(written.exercise["bench-press"].name).toBe("Bankdrücken");

    const writtenEn = JSON.parse(readFileSync(join(tmpDir, "exercises.en.json"), "utf-8"));
    expect(writtenEn.exercise["bench-press"].name).toBe("Bench Press");
  });
});
