import { describe, expect, it } from "vitest";
import { computeRankCore } from "~server/services/rankAlgorithm.js";
import { ordinal, type StandardThreshold } from "@liftr/shared";

/** A flat, evenly-spaced threshold ladder simple enough to reason about by hand: one division per
 *  tier, threshold == division number * 10 (initiate=10 ... apex=90), so `resolveRank` and the
 *  decay math stay easy to verify without needing the real anchor tables. */
const THRESHOLDS: StandardThreshold[] = [
  { tier: "initiate", division: 1, threshold: 10, trust: "real" },
  { tier: "apprentice", division: 1, threshold: 20, trust: "real" },
  { tier: "trainee", division: 1, threshold: 30, trust: "real" },
  { tier: "athlete", division: 1, threshold: 40, trust: "real" },
  { tier: "lifter", division: 1, threshold: 50, trust: "real" },
  { tier: "advanced", division: 1, threshold: 60, trust: "real" },
  { tier: "elite", division: 1, threshold: 70, trust: "real" },
  { tier: "expert", division: 1, threshold: 80, trust: "real" },
  { tier: "apex", division: 1, threshold: 90, trust: "real" },
];

function baseParams(overrides: Partial<Parameters<typeof computeRankCore>[0]> = {}) {
  return {
    thresholds: THRESHOLDS,
    dailyBest: new Map<string, number>([["2024-01-01", 80]]),
    bestValue: 80,
    peakMetricValue: 80,
    bestDayKey: "2024-01-01",
    bestAchievedAtMs: Date.parse("2024-01-01"),
    storedPeak: null,
    previousCurrentBand: null,
    peakEligible: true,
    plausibilityMultiplier: 1,
    daysSinceLastTrained: 0,
    ...overrides,
  };
}

describe("computeRankCore — uncorroborated bands", () => {
  it("with no corroborating day and no decay backlog, shows the plain resolved band", () => {
    const result = computeRankCore(baseParams({ daysSinceLastTrained: 0 }));
    expect(result.peak).toBeNull();
    expect(result.currentBand).toEqual({ tier: "expert", division: 1, lp: 0 });
  });

  it("an uncorroborated band still ages once past the decay grace period", () => {
    // Regression guard: previously, `peak == null` returned the resolved band verbatim forever,
    // since decay ran only off a stored peak — corroboration refusing to create a peak meant a
    // one-off outlier could never decay. Past RANK_DECAY_GRACE_DAYS (21) it must start moving
    // toward the floor even with no peak established.
    const fresh = computeRankCore(baseParams({ daysSinceLastTrained: 0 }));
    const decayed = computeRankCore(baseParams({ daysSinceLastTrained: 40 }));

    expect(fresh.peak).toBeNull();
    expect(decayed.peak).toBeNull();

    const positionOf = (b: { tier: import("@liftr/shared").Tier; division: number; lp: number }) =>
      ordinal(b.tier, b.division) * 100 + b.lp;
    expect(positionOf(decayed.currentBand)).toBeLessThan(positionOf(fresh.currentBand));
  });

  it("within the grace period, an uncorroborated band does not move at all", () => {
    const day0 = computeRankCore(baseParams({ daysSinceLastTrained: 0 }));
    const day21 = computeRankCore(baseParams({ daysSinceLastTrained: 21 }));
    expect(day21.currentBand).toEqual(day0.currentBand);
  });

  it("corroborating on a second day still establishes a real peak and stops the free-floating decay", () => {
    const params = baseParams({
      dailyBest: new Map([
        ["2024-01-01", 80],
        ["2024-01-02", 80],
      ]),
    });
    const result = computeRankCore(params);
    expect(result.peak).not.toBeNull();
    expect(result.peak?.tier).toBe("expert");
  });
});
