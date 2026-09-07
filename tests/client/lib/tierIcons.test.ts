import { describe, expect, it } from "vitest";
import { DIVISION_LABEL, TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "~client/lib/tierIcons";

const ALL_TIERS: RankTier[] = [
  "initiate",
  "apprentice",
  "trainee",
  "athlete",
  "lifter",
  "advanced",
  "elite",
  "expert",
  "apex",
];

describe("TIER_BADGE_PATH", () => {
  it("has a glyph path for every rank tier", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_BADGE_PATH[tier], `missing TIER_BADGE_PATH entry for "${tier}"`).toBeTypeOf("string");
      expect(TIER_BADGE_PATH[tier]!.length).toBeGreaterThan(0);
    }
  });

  it("gives every path an SVG path-data string starting with a moveto command", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_BADGE_PATH[tier]!.trim().startsWith("M")).toBe(true);
    }
  });
});

describe("TIER_LABEL_DE", () => {
  it("has a non-empty German label for every rank tier", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_LABEL_DE[tier], `missing TIER_LABEL_DE entry for "${tier}"`).toBeTypeOf("string");
      expect(TIER_LABEL_DE[tier]!.length).toBeGreaterThan(0);
    }
  });

  it("gives every tier a distinct label", () => {
    const labels = ALL_TIERS.map((tier) => TIER_LABEL_DE[tier]);
    expect(new Set(labels).size).toBe(ALL_TIERS.length);
  });
});

describe("DIVISION_LABEL", () => {
  it("maps divisions 1 through 6 to their Roman numeral", () => {
    expect(DIVISION_LABEL[1]).toBe("I");
    expect(DIVISION_LABEL[2]).toBe("II");
    expect(DIVISION_LABEL[3]).toBe("III");
    expect(DIVISION_LABEL[4]).toBe("IV");
    expect(DIVISION_LABEL[5]).toBe("V");
    expect(DIVISION_LABEL[6]).toBe("VI");
  });

  it("has no entry for a division outside 1-6", () => {
    expect(DIVISION_LABEL[0]).toBeUndefined();
    expect(DIVISION_LABEL[7]).toBeUndefined();
  });
});
