import { describe, expect, it } from "vitest";
import { nextLoadTarget, nextRepTarget, ratchetPeak, resolveRank, type StandardThreshold } from "./tiers.js";
import { epley } from "../math/e1rm.js";

const loadThresholds: StandardThreshold[] = [
  { tier: "bronze", division: 3, threshold: 0.5, trust: "real" },
  { tier: "bronze", division: 2, threshold: 0.7, trust: "real" },
  { tier: "bronze", division: 1, threshold: 0.9, trust: "real" },
  { tier: "silver", division: 3, threshold: 1.1, trust: "real" },
];

describe("resolveRank", () => {
  it("resolves a value inside a tier band with correct LP", () => {
    const r = resolveRank(0.8, loadThresholds); // between bronze-II (0.7) and bronze-I (0.9)
    expect(r.tier).toBe("bronze");
    expect(r.division).toBe(2);
    expect(r.lp).toBeCloseTo(50, 0);
    expect(r.nextTarget?.threshold).toBe(0.9);
  });

  it("handles a value below the lowest threshold", () => {
    const r = resolveRank(0.2, loadThresholds);
    expect(r.tier).toBe("bronze");
    expect(r.division).toBe(3);
    expect(r.lp).toBeLessThan(100);
  });

  it("handles a value at/above the top threshold (lp = 100, no next target)", () => {
    const r = resolveRank(1.5, loadThresholds);
    expect(r.tier).toBe("silver");
    expect(r.division).toBe(3);
    expect(r.lp).toBe(100);
    expect(r.nextTarget).toBeNull();
  });

  it("surfaces the trust tier of the current threshold", () => {
    const mixed: StandardThreshold[] = [
      { tier: "bronze", division: 3, threshold: 0.5, trust: "synthetic" },
      { tier: "silver", division: 3, threshold: 1.0, trust: "real" },
    ];
    expect(resolveRank(0.6, mixed).trust).toBe("synthetic");
    expect(resolveRank(1.1, mixed).trust).toBe("real");
  });
});

describe("nextLoadTarget", () => {
  it("finds a concrete weight x reps pair crossing the target ratio", () => {
    const target = nextLoadTarget(1.1, 80, 6);
    const impliedE1rm = epley(target.weightKg, target.reps);
    expect(impliedE1rm).toBeGreaterThanOrEqual(1.1 * 80 - 1); // within rounding
    expect(target.reps).toBeGreaterThanOrEqual(4);
    expect(target.reps).toBeLessThanOrEqual(8);
  });
});

describe("nextRepTarget", () => {
  const repThresholds: StandardThreshold[] = [
    { tier: "bronze", division: 3, threshold: 5, trust: "real" },
    { tier: "silver", division: 3, threshold: 15, trust: "real" },
  ];
  it("returns the next rep threshold above current reps", () => {
    expect(nextRepTarget(repThresholds, 6)).toBe(15);
  });
  it("returns null once past the top threshold", () => {
    expect(nextRepTarget(repThresholds, 20)).toBeNull();
  });
});

describe("ratchetPeak", () => {
  it("adopts current as peak when there is no stored peak yet", () => {
    const peak = ratchetPeak({ tier: "bronze", division: 2, lp: 40, e1rm: 100 }, 1000, null);
    expect(peak).toEqual({ tier: "bronze", division: 2, lp: 40, e1rm: 100, achievedAt: 1000 });
  });

  it("never regresses when a later bodyweight increase alone would lower the naive ratio", () => {
    // Simulates: PR set at bodyweight 80kg reaches gold-III, then bodyweight climbs to 90kg
    // with no strength change, so recomputing the ratio today against the same absolute e1RM
    // would resolve to a *lower* band (silver-I). Peak must stay at gold-III.
    const peakAfterPr = ratchetPeak({ tier: "gold", division: 3, lp: 20, e1rm: 120 }, 1000, null);
    const peakAfterBodyweightIncrease = ratchetPeak(
      { tier: "silver", division: 1, lp: 80, e1rm: 120 },
      2000,
      peakAfterPr,
    );
    expect(peakAfterBodyweightIncrease).toEqual(peakAfterPr);
  });

  it("ratchets forward when a genuinely stronger tier/division is reached", () => {
    const first = ratchetPeak({ tier: "bronze", division: 3, lp: 10, e1rm: 50 }, 1000, null);
    const stronger = ratchetPeak({ tier: "bronze", division: 1, lp: 5, e1rm: 70 }, 2000, first);
    expect(stronger).toEqual({ tier: "bronze", division: 1, lp: 5, e1rm: 70, achievedAt: 2000 });
  });

  it("ratchets forward on a higher LP within the same tier/division", () => {
    const first = ratchetPeak({ tier: "gold", division: 2, lp: 30, e1rm: 90 }, 1000, null);
    const higherLp = ratchetPeak({ tier: "gold", division: 2, lp: 60, e1rm: 95 }, 2000, first);
    expect(higherLp.lp).toBe(60);
    expect(higherLp.achievedAt).toBe(2000);
  });

  it("does not regress on a lower LP within the same tier/division", () => {
    const first = ratchetPeak({ tier: "gold", division: 2, lp: 60, e1rm: 95 }, 1000, null);
    const lowerLp = ratchetPeak({ tier: "gold", division: 2, lp: 30, e1rm: 90 }, 2000, first);
    expect(lowerLp).toEqual(first);
  });
});
