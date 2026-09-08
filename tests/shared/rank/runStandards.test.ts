import { describe, expect, it } from "vitest";
import {
  buildRunStandards,
  RUN_ANCHOR_STANDARDS,
  RUN_CATEGORIES,
  TIER_DIVISION_COUNT,
  TIERS,
} from "@liftr/shared";

describe("buildRunStandards", () => {
  it("produces exactly 5 categories * 2 sexes * 27 divisions = 270 rows", () => {
    const standards = buildRunStandards();
    expect(standards).toHaveLength(270);
  });

  it("includes all 5 run categories with both male and female for each", () => {
    const standards = buildRunStandards();
    const categoryCount = new Map<string, Set<string>>();

    for (const row of standards) {
      if (!categoryCount.has(row.category)) {
        categoryCount.set(row.category, new Set());
      }
      categoryCount.get(row.category)!.add(row.sex);
    }

    expect(categoryCount.size).toBe(5); // 5 categories
    for (const sexSet of categoryCount.values()) {
      expect(sexSet.size).toBe(2); // male and female
    }
  });

  it("marks all rows with trust: 'derived'", () => {
    const standards = buildRunStandards();
    for (const row of standards) {
      expect(row.trust).toBe("derived");
    }
  });

  it("Mile/male Beginner's weakest division resolves to approximately 2.848 m/s", () => {
    const standards = buildRunStandards();
    const mileM = standards.filter(
      (s) => s.category === "mile" && s.sex === "male" && s.tier === "apprentice" && s.division === TIER_DIVISION_COUNT.apprentice,
    );
    expect(mileM).toHaveLength(1);
    expect(mileM[0]!.threshold).toBeCloseTo(2.848, 2); // Beginner tier is mapped to apprentice
  });

  it("each category/sex has all 9 tiers with correct division counts", () => {
    const standards = buildRunStandards();

    for (const category of ["mile", "5k", "10k", "half_marathon", "marathon"]) {
      for (const sex of ["male", "female"]) {
        const forCategorySex = standards.filter((s) => s.category === category && s.sex === sex);

        // Should have exactly 27 rows (sum of all TIER_DIVISION_COUNT values)
        expect(forCategorySex).toHaveLength(27);

        // Check each tier is present with correct division count
        for (const tier of TIERS) {
          const forTier = forCategorySex.filter((s) => s.tier === tier);
          const expectedCount = TIER_DIVISION_COUNT[tier];
          expect(forTier).toHaveLength(expectedCount);
        }
      }
    }
  });

  it("thresholds within each tier/sex are strictly ascending (weakest to strongest)", () => {
    const standards = buildRunStandards();

    for (const category of ["mile", "5k", "10k", "half_marathon", "marathon"]) {
      for (const sex of ["male", "female"]) {
        const forCategorySex = standards.filter((s) => s.category === category && s.sex === sex);

        for (const tier of TIERS) {
          const forTier = forCategorySex
            .filter((s) => s.tier === tier)
            .sort((a, b) => b.division - a.division); // weakest (highest division) to strongest (division 1)

          for (let i = 1; i < forTier.length; i++) {
            expect(forTier[i]!.threshold).toBeGreaterThan(forTier[i - 1]!.threshold);
          }
        }
      }
    }
  });

  it("Mile/female Beginner anchor is approximately 2.514 m/s", () => {
    const standards = buildRunStandards();
    const mileF = standards.filter(
      (s) => s.category === "mile" && s.sex === "female" && s.tier === "apprentice" && s.division === TIER_DIVISION_COUNT.apprentice,
    );
    expect(mileF).toHaveLength(1);
    expect(mileF[0]!.threshold).toBeCloseTo(2.514, 2);
  });
});

describe("RUN_ANCHOR_STANDARDS", () => {
  it("exports all 5 categories with male and female anchors", () => {
    expect(Object.keys(RUN_ANCHOR_STANDARDS)).toHaveLength(5);
    for (const category of RUN_CATEGORIES) {
      expect(RUN_ANCHOR_STANDARDS[category]).toBeDefined();
      expect(RUN_ANCHOR_STANDARDS[category]!.male).toHaveLength(5);
      expect(RUN_ANCHOR_STANDARDS[category]!.female).toHaveLength(5);
    }
  });

  it("Mile male anchors match the sourced values from the brief", () => {
    const mileM = RUN_ANCHOR_STANDARDS.mile.male;
    const expected = [2.848, 3.439, 4.043, 4.651, 5.226];
    for (let i = 0; i < expected.length; i++) {
      expect(mileM[i]!).toBeCloseTo(expected[i]!, 3);
    }
  });

  it("Marathon female anchors match the sourced values from the brief", () => {
    const marathonF = RUN_ANCHOR_STANDARDS.marathon.female;
    const expected = [2.102, 2.453, 2.816, 3.176, 3.516];
    for (let i = 0; i < expected.length; i++) {
      expect(marathonF[i]!).toBeCloseTo(expected[i]!, 3);
    }
  });
});
