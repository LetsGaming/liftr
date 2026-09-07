import { describe, expect, it } from "vitest";
import { catalogEntrySchema, catalogFileSchema } from "~ingest/catalogSchema.js";

const minimalEntry = {
  slug: "back-squat",
  nameDe: "Kniebeuge",
  nameEn: "Back Squat",
  movementPattern: "squat",
};

describe("catalogEntrySchema", () => {
  it("accepts a minimal entry and fills in every optional field's documented default", () => {
    const parsed = catalogEntrySchema.parse(minimalEntry);
    expect(parsed).toEqual({
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
    });
  });

  it("accepts a fully-populated Tier B/C entry with an anchor + ratio", () => {
    const parsed = catalogEntrySchema.parse({
      ...minimalEntry,
      slug: "front-squat",
      wgerId: 123,
      freeExerciseDbId: "Front_Squat",
      wgerImageId: 456,
      equipment: "barbell",
      requiresEquipment: ["barbell", "plates", "rack"],
      primaryMuscles: ["quads"],
      secondaryMuscles: ["glutes"],
      isBodyweight: false,
      bodyweightLeverage: null,
      anchor: "back-squat",
      ratio: 0.85,
      trust: "derived",
    });
    expect(parsed.anchor).toBe("back-squat");
    expect(parsed.ratio).toBe(0.85);
    expect(parsed.requiresEquipment).toEqual(["barbell", "plates", "rack"]);
  });

  it("accepts a bodyweight entry with a leverage factor", () => {
    const parsed = catalogEntrySchema.parse({
      ...minimalEntry,
      slug: "pushup",
      isBodyweight: true,
      bodyweightLeverage: 0.64,
      equipment: "bodyweight",
    });
    expect(parsed.isBodyweight).toBe(true);
    expect(parsed.bodyweightLeverage).toBe(0.64);
  });

  it("rejects an entry missing a required field (nameEn)", () => {
    const { nameEn, ...missingNameEn } = minimalEntry;
    expect(() => catalogEntrySchema.parse(missingNameEn)).toThrow();
  });

  it("rejects an entry missing movementPattern", () => {
    const { movementPattern, ...missingPattern } = minimalEntry;
    expect(() => catalogEntrySchema.parse(missingPattern)).toThrow();
  });

  it("rejects a trust value outside the closed enum", () => {
    expect(() => catalogEntrySchema.parse({ ...minimalEntry, trust: "verified" })).toThrow();
  });

  it("rejects a non-integer wgerId", () => {
    expect(() => catalogEntrySchema.parse({ ...minimalEntry, wgerId: 1.5 })).toThrow();
  });

  it("rejects primaryMuscles that isn't an array of strings", () => {
    expect(() => catalogEntrySchema.parse({ ...minimalEntry, primaryMuscles: "quads" })).toThrow();
  });

  it("defaults trust to 'derived' when omitted, and accepts 'real'/'synthetic' explicitly", () => {
    expect(catalogEntrySchema.parse(minimalEntry).trust).toBe("derived");
    expect(catalogEntrySchema.parse({ ...minimalEntry, trust: "real" }).trust).toBe("real");
    expect(catalogEntrySchema.parse({ ...minimalEntry, trust: "synthetic" }).trust).toBe("synthetic");
  });
});

describe("catalogFileSchema", () => {
  it("accepts a file with an exercises array and parses each entry", () => {
    const parsed = catalogFileSchema.parse({ exercises: [minimalEntry] });
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.exercises[0]!.slug).toBe("back-squat");
  });

  it("accepts an empty exercises array", () => {
    expect(catalogFileSchema.parse({ exercises: [] }).exercises).toEqual([]);
  });

  it("rejects a file missing the exercises key", () => {
    expect(() => catalogFileSchema.parse({})).toThrow();
  });

  it("rejects a file whose exercises entry is invalid", () => {
    expect(() => catalogFileSchema.parse({ exercises: [{ slug: "only-a-slug" }] })).toThrow();
  });
});
