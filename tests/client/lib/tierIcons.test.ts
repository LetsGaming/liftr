// @vitest-environment jsdom
//
// tierIcons.ts now calls i18n.ts's t(), which reads localStorage at module load (needs a DOM) —
// jsdom's navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would
// otherwise default the shared i18n singleton to "en" for the rest of the test process.
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import { DIVISION_LABEL, tierLabel, type RankTier } from "~client/lib/tierIcons";

beforeEach(() => {
  i18n.global.locale.value = "de";
});

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

describe("tierLabel", () => {
  it("has a non-empty German label for every rank tier", () => {
    for (const tier of ALL_TIERS) {
      expect(tierLabel(tier), `missing label for "${tier}"`).toBeTypeOf("string");
      expect(tierLabel(tier).length).toBeGreaterThan(0);
    }
  });

  it("gives every tier a distinct label", () => {
    const labels = ALL_TIERS.map((tier) => tierLabel(tier));
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
