import { describe, expect, it, vi } from "vitest";
import type { Equipment } from "@liftr/shared";
import type { CatalogEntry } from "~ingest/catalogSchema.js";
import { logEquipmentResolutionSummary, resolveEquipmentForCatalog } from "~ingest/equipment/resolveEquipment.js";
import type { EquipmentSourceAdapter } from "~ingest/equipment/types.js";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "back-squat",
    wgerId: null,
    freeExerciseDbId: null,
    wgerImageId: null,
    nameDe: "Kniebeuge",
    nameEn: "Back Squat",
    equipment: null,
    requiresEquipment: null,
    movementPattern: "squat",
    primaryMuscles: [],
    secondaryMuscles: [],
    isBodyweight: false,
    bodyweightLeverage: null,
    anchor: null,
    ratio: null,
    trust: "derived",
    ...overrides,
  };
}

function source(name: string, index: Record<string, Equipment | null>): EquipmentSourceAdapter {
  return {
    name,
    async buildIndex() {
      return new Map(Object.entries(index));
    },
  };
}

describe("resolveEquipmentForCatalog", () => {
  it("keeps curated.yaml's hand-set equipment and never consults any source for it", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", equipment: "barbell" })];
    const sources = [source("free-exercise-db", { Squat: "dumbbell" })];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("back-squat")).toBe("barbell");
    expect(summary.handSet).toBe(1);
    expect(summary.resolvedFromSource).toBe(0);
  });

  it("fills in equipment from the first source whose join key resolves, when curated.yaml leaves it null", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", equipment: null })];
    const sources = [source("free-exercise-db", { Squat: "barbell" })];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("back-squat")).toBe("barbell");
    expect(summary.resolvedFromSource).toBe(1);
    expect(summary.unresolved).toEqual([]);
  });

  it("falls through to the next source in order when the first has no entry for the join key", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", wgerId: 42, equipment: null })];
    const sources = [source("free-exercise-db", {}), source("wger", { "42": "barbell" })];

    const { equipmentBySlug } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("back-squat")).toBe("barbell");
  });

  it("leaves equipment unresolved and reports the slug when no source has a value and curated.yaml is null", async () => {
    const entries = [entry({ slug: "mystery-lift", freeExerciseDbId: null, wgerId: null, equipment: null })];
    const sources = [source("free-exercise-db", {})];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("mystery-lift")).toBeNull();
    expect(summary.unresolved).toEqual(["mystery-lift"]);
  });

  it("logs a conflict (but keeps curated.yaml's value) when a source disagrees with a hand-set value", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", equipment: "barbell" })];
    const sources = [source("free-exercise-db", { Squat: "machine" })];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("back-squat")).toBe("barbell");
    expect(summary.conflicts).toEqual([
      { slug: "back-squat", curated: "barbell", source: "free-exercise-db", sourceValue: "machine" },
    ]);
  });

  it("does not report a conflict when the source agrees with the hand-set value", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", equipment: "barbell" })];
    const sources = [source("free-exercise-db", { Squat: "barbell" })];

    const { summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(summary.conflicts).toEqual([]);
  });

  it("joins free-exercise-db by freeExerciseDbId and wger by the string form of wgerId", async () => {
    const entries = [
      entry({ slug: "a", freeExerciseDbId: "Free_A", wgerId: null, equipment: null }),
      entry({ slug: "b", freeExerciseDbId: null, wgerId: 99, equipment: null }),
    ];
    const sources = [source("free-exercise-db", { Free_A: "dumbbell" }), source("wger", { "99": "kettlebell" })];

    const { equipmentBySlug } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("a")).toBe("dumbbell");
    expect(equipmentBySlug.get("b")).toBe("kettlebell");
  });

  it("degrades to skipping a source that throws while building its index, instead of aborting the run", async () => {
    const entries = [entry({ slug: "back-squat", freeExerciseDbId: "Squat", wgerId: 1, equipment: null })];
    const failing: EquipmentSourceAdapter = {
      name: "flaky",
      async buildIndex() {
        throw new Error("network down");
      },
    };
    const sources = [failing, source("wger", { "1": "barbell" })];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("back-squat")).toBe("barbell");
    expect(summary.resolvedFromSource).toBe(1);
  });

  it("resolves every entry independently across a mixed batch", async () => {
    const entries = [
      entry({ slug: "hand-set", freeExerciseDbId: "X", equipment: "barbell" }),
      entry({ slug: "auto-resolved", freeExerciseDbId: "Y", equipment: null }),
      entry({ slug: "unresolved", freeExerciseDbId: null, wgerId: null, equipment: null }),
    ];
    const sources = [source("free-exercise-db", { Y: "dumbbell" })];

    const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, sources);

    expect(equipmentBySlug.get("hand-set")).toBe("barbell");
    expect(equipmentBySlug.get("auto-resolved")).toBe("dumbbell");
    expect(equipmentBySlug.get("unresolved")).toBeNull();
    expect(summary).toMatchObject({ handSet: 1, resolvedFromSource: 1, unresolved: ["unresolved"] });
  });
});

describe("logEquipmentResolutionSummary", () => {
  it("logs the hand-set/auto-resolved/unresolved counts on one line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logEquipmentResolutionSummary({ handSet: 3, resolvedFromSource: 2, unresolved: [], conflicts: [] });

    expect(log).toHaveBeenCalledWith("equipment: 3 hand-set, 2 auto-resolved, 0 unresolved");
  });

  it("lists the unresolved slugs only when there are any", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logEquipmentResolutionSummary({ handSet: 0, resolvedFromSource: 0, unresolved: ["a", "b"], conflicts: [] });

    expect(log).toHaveBeenCalledWith("  unresolved: a, b");
  });

  it("warns once per conflict with the curated vs. source values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logEquipmentResolutionSummary({
      handSet: 1,
      resolvedFromSource: 0,
      unresolved: [],
      conflicts: [{ slug: "back-squat", curated: "barbell", source: "free-exercise-db", sourceValue: "machine" }],
    });

    expect(warn).toHaveBeenCalledWith(
      '  ! equipment mismatch for "back-squat": curated.yaml says "barbell", free-exercise-db says "machine" — kept curated.yaml',
    );
  });
});
