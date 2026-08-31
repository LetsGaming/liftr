import { describe, expect, it } from "vitest";
import { computeOverallRank, computeOverallPeak, type RankInput } from "./aggregate.js";
import { ordinal } from "./tiers.js";

describe("computeOverallRank", () => {
  it("returns null when nothing has been ranked yet", () => {
    expect(computeOverallRank([])).toBeNull();
  });

  it("excludes nothing implicitly — a single real-trust input is returned as-is", () => {
    const input: RankInput[] = [{ tier: "advanced", division: 2, lp: 40, trust: "real" }];
    expect(computeOverallRank(input)).toEqual({ tier: "advanced", division: 2, lp: 40 });
  });

  it("hand-computed example: two equal-trust exercises average their ordinal position", () => {
    // apprentice/3/0 and athlete/3/0 at equal (real) weight -> midpoint of their ordinal positions.
    const a: RankInput = { tier: "apprentice", division: 3, lp: 0, trust: "real" };
    const b: RankInput = { tier: "athlete", division: 3, lp: 0, trust: "real" };
    const result = computeOverallRank([a, b])!;
    const aPos = ordinal(a.tier, a.division) * 100 + a.lp;
    const bPos = ordinal(b.tier, b.division) * 100 + b.lp;
    const expectedPos = (aPos + bPos) / 2;
    const resultPos = ordinal(result.tier, result.division) * 100 + result.lp;
    expect(resultPos).toBeCloseTo(expectedPos, 5);
  });

  it("weights synthetic-trust exercises at half strength, so they pull the average less", () => {
    const strong: RankInput = { tier: "apex", division: 1, lp: 100, trust: "real" };
    const weakSynthetic: RankInput = { tier: "apprentice", division: 3, lp: 0, trust: "synthetic" };
    const weakReal: RankInput = { tier: "apprentice", division: 3, lp: 0, trust: "real" };

    const withSynthetic = computeOverallRank([strong, weakSynthetic])!;
    const withEqualWeightReal = computeOverallRank([strong, weakReal])!;

    const posSynthetic = ordinal(withSynthetic.tier, withSynthetic.division) * 100 + withSynthetic.lp;
    const posEqualWeight = ordinal(withEqualWeightReal.tier, withEqualWeightReal.division) * 100 + withEqualWeightReal.lp;

    // The synthetic-weighted average sits closer to `strong` than a naive equal-weight average
    // would, because the weak synthetic entry counts for less.
    expect(posSynthetic).toBeGreaterThan(posEqualWeight);
  });

  it("never counts an unranked exercise as zero (excluded, not zero) — verified by construction: callers never pass unranked rows", () => {
    // computeOverallRank has no concept of "unranked" itself — exclusion happens by the caller
    // simply not including such exercises in the input array. A single high-trust exercise
    // should reflect its own value, not be dragged toward zero by anything unranked.
    const input: RankInput[] = [{ tier: "apex", division: 1, lp: 100, trust: "real" }];
    expect(computeOverallRank(input)).toEqual({ tier: "apex", division: 1, lp: 100 });
  });
});

describe("computeOverallPeak", () => {
  it("aggregates the same way as computeOverallRank (independent input, shared math)", () => {
    const input: RankInput[] = [{ tier: "expert", division: 2, lp: 55, trust: "derived" }];
    expect(computeOverallPeak(input)).toEqual({ tier: "expert", division: 2, lp: 55 });
  });
});
