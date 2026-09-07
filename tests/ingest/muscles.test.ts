import { describe, expect, it } from "vitest";
import { MUSCLES } from "~ingest/muscles.js";

describe("MUSCLES", () => {
  it("has exactly wger's 15 muscles", () => {
    expect(MUSCLES).toHaveLength(15);
  });

  it("has a unique slug per muscle", () => {
    const slugs = MUSCLES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has a unique wgerMuscleId per muscle", () => {
    const ids = MUSCLES.map((m) => m.wgerMuscleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stores svgRegionKey as the string form of wgerMuscleId — the asset-lookup join key", () => {
    for (const m of MUSCLES) {
      expect(m.svgRegionKey).toBe(String(m.wgerMuscleId));
    }
  });

  it("assigns wgerMuscleId 1..15 with no gaps or duplicates", () => {
    const ids = MUSCLES.map((m) => m.wgerMuscleId).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("every entry declares a boolean isFront", () => {
    for (const m of MUSCLES) {
      expect(typeof m.isFront).toBe("boolean");
    }
  });
});
