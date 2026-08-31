import { describe, expect, it } from "vitest";
import { ANCHOR_STANDARDS, REP_STANDARDS, interpolateNineTierAnchors } from "./defaultStandards.js";
import { TIER_DIVISION_COUNT, TIERS } from "./tiers.js";

describe("ANCHOR_STANDARDS", () => {
  it("orders thresholds strictly ascending within and across tiers (weakest division to strongest, tier to tier)", () => {
    for (const [slug, thresholds] of Object.entries(ANCHOR_STANDARDS)) {
      // group by tier, division N (weakest) down to 1 (strongest)
      const byTier = new Map<string, Map<number, number>>();
      for (const t of thresholds) {
        if (!byTier.has(t.tier)) byTier.set(t.tier, new Map());
        byTier.get(t.tier)!.set(t.division, t.threshold);
      }
      for (const tier of TIERS) {
        const divisions = byTier.get(tier)!;
        const count = TIER_DIVISION_COUNT[tier];
        for (let d = count; d > 1; d--) {
          expect(divisions.get(d)!, `${slug} ${tier} division ${d} should be < division ${d - 1}`).toBeLessThan(
            divisions.get(d - 1)!,
          );
        }
      }
    }
  });

  it("initiate's threshold is the lowest and apex's is the highest for a known anchor", () => {
    const squat = ANCHOR_STANDARDS["back-squat"]!;
    const initiateWeakest = squat.find(
      (t) => t.tier === "initiate" && t.division === TIER_DIVISION_COUNT.initiate,
    )!.threshold;
    const apexStrongest = squat.find((t) => t.tier === "apex" && t.division === 1)!.threshold;
    expect(initiateWeakest).toBeLessThan(apexStrongest);
    const apprenticeEntry = squat.find(
      (t) => t.tier === "apprentice" && t.division === TIER_DIVISION_COUNT.apprentice,
    )!.threshold;
    expect(apprenticeEntry).toBeCloseTo(0.75, 5); // matches the plan's proposed table (audit §7)
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

describe("interpolateNineTierAnchors", () => {
  it("keeps the 4 even-indexed new tiers exactly equal to the old 5 anchors", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.apprentice).toBeCloseTo(0.75, 6);
    expect(result.athlete).toBeCloseTo(1.25, 6);
    expect(result.advanced).toBeCloseTo(1.75, 6);
    expect(result.expert).toBeCloseTo(2.25, 6);
  });

  it("sets each interior new tier to the geometric mean of its neighbors", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.trainee).toBeCloseTo(Math.sqrt(0.75 * 1.25), 6);
    expect(result.lifter).toBeCloseTo(Math.sqrt(1.25 * 1.75), 6);
    expect(result.elite).toBeCloseTo(Math.sqrt(1.75 * 2.25), 6);
  });

  it("extrapolates initiate below apprentice and apex above expert using the same rule in both directions", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    expect(result.initiate).toBeCloseTo(0.75 * (0.75 / result.trainee), 6);
    expect(result.apex).toBeCloseTo(2.25 * (2.25 / result.elite), 6);
  });

  it("produces a strictly increasing sequence across all 9 tiers", () => {
    const result = interpolateNineTierAnchors([0.75, 1.25, 1.75, 2.25, 2.75]);
    const values = TIERS.map((t) => result[t]);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });
});
