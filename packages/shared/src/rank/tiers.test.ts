import { describe, expect, it } from "vitest";
import { nextLoadTarget, nextRepTarget, resolveRank, type StandardThreshold } from "./tiers.js";
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
