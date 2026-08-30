import { describe, expect, it } from "vitest";
import { ANCHOR_STANDARDS, REP_STANDARDS } from "./defaultStandards.js";

describe("ANCHOR_STANDARDS", () => {
  it("orders thresholds strictly ascending within and across tiers (III < II < I, tier to tier)", () => {
    for (const [slug, thresholds] of Object.entries(ANCHOR_STANDARDS)) {
      // group by tier, division III/II/I mapped to divisions [3, 2, 1]
      const byTier = new Map<string, Map<number, number>>();
      for (const t of thresholds) {
        if (!byTier.has(t.tier)) byTier.set(t.tier, new Map());
        byTier.get(t.tier)!.set(t.division, t.threshold);
      }
      for (const [tier, divisions] of byTier) {
        const iii = divisions.get(3)!;
        const ii = divisions.get(2)!;
        const i = divisions.get(1)!;
        expect(iii, `${slug} ${tier} III should be < II`).toBeLessThan(ii);
        expect(ii, `${slug} ${tier} II should be < I`).toBeLessThan(i);
      }
    }
  });

  it("bronze's threshold is the lowest and diamond's is the highest for a known anchor", () => {
    const squat = ANCHOR_STANDARDS["back-squat"]!;
    const bronzeIII = squat.find((t) => t.tier === "bronze" && t.division === 3)!.threshold;
    const diamondI = squat.find((t) => t.tier === "diamond" && t.division === 1)!.threshold;
    expect(bronzeIII).toBeLessThan(diamondI);
    expect(bronzeIII).toBeCloseTo(0.75, 5); // matches the plan's proposed table (audit §7)
  });
});

describe("REP_STANDARDS", () => {
  it("is strictly ascending across tiers", () => {
    for (const thresholds of Object.values(REP_STANDARDS)) {
      const sorted = [...thresholds].sort((a, b) => a.threshold - b.threshold);
      expect(thresholds.map((t) => t.threshold)).toEqual(sorted.map((t) => t.threshold));
    }
  });
});
