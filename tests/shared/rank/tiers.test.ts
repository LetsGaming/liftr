import { describe, expect, it } from "vitest";
import {
  TIERS,
  TIER_DIVISION_COUNT,
  MAX_ORDINAL,
  nextLoadTarget,
  nextRepTarget,
  ratchetPeak,
  resolveRank,
  ordinal,
  ordinalToBand,
  positionToBand,
  rankRepMultiplier,
  type StandardThreshold,
} from "@liftr/shared";

const loadThresholds: StandardThreshold[] = [
  { tier: "initiate", division: 6, threshold: 0.5, trust: "real" },
  { tier: "initiate", division: 5, threshold: 0.7, trust: "real" },
  { tier: "initiate", division: 4, threshold: 0.9, trust: "real" },
  { tier: "apprentice", division: 5, threshold: 1.1, trust: "real" },
];

describe("resolveRank", () => {
  it("resolves a value inside a tier band with correct LP", () => {
    const r = resolveRank(0.8, loadThresholds); // between initiate-5 (0.7) and initiate-4 (0.9)
    expect(r.tier).toBe("initiate");
    expect(r.division).toBe(5);
    expect(r.lp).toBeCloseTo(50, 0);
    expect(r.nextTarget?.threshold).toBe(0.9);
  });

  it("handles a value below the lowest threshold", () => {
    const r = resolveRank(0.2, loadThresholds);
    expect(r.tier).toBe("initiate");
    expect(r.division).toBe(6);
    expect(r.lp).toBeLessThan(100);
  });

  it("lp = 100 exactly at the top threshold (no discontinuity at the old hard cap)", () => {
    const r = resolveRank(1.1, loadThresholds); // exactly at the top threshold, x = 0
    expect(r.tier).toBe("apprentice");
    expect(r.division).toBe(5);
    expect(r.lp).toBe(100);
    expect(r.nextTarget).toBeNull();
  });

  it("grows lp past 100 (logarithmically, not clamped) once value exceeds the top threshold", () => {
    const r = resolveRank(1.5, loadThresholds);
    expect(r.tier).toBe("apprentice");
    expect(r.division).toBe(5);
    expect(r.lp).toBeGreaterThan(100);
    expect(r.nextTarget).toBeNull();
  });

  it("doubling the overshoot (1 + x) past the top threshold adds exactly another 100 lp", () => {
    // interval width below the top threshold is 1.1 - 0.9 = 0.2. x = 1 -> (1+x) = 2;
    // x = 3 -> (1+x) = 4, i.e. exactly double.
    const atX1 = resolveRank(1.1 + 1 * 0.2, loadThresholds); // x = 1, lp = 100*(1+log2(2)) = 200
    const atX3 = resolveRank(1.1 + 3 * 0.2, loadThresholds); // x = 3, lp = 100*(1+log2(4)) = 300
    expect(atX3.lp - atX1.lp).toBeCloseTo(100, 6);
  });

  it("lp growth past the top threshold is monotonic with diminishing increments", () => {
    // Equal-sized steps in x (0, 1, 2, 3, 4) — the log curve's increments per step shrink as x grows.
    const values = [0, 1, 2, 3, 4].map((x) => 1.1 + x * 0.2);
    const lps = values.map((v) => resolveRank(v, loadThresholds).lp);
    for (let i = 1; i < lps.length; i++) {
      expect(lps[i]).toBeGreaterThan(lps[i - 1]!);
    }
    const increments = [];
    for (let i = 1; i < lps.length; i++) increments.push(lps[i]! - lps[i - 1]!);
    for (let i = 1; i < increments.length; i++) {
      expect(increments[i]).toBeLessThan(increments[i - 1]!);
    }
  });

  it("falls back sanely past a single-threshold table (interval width = the threshold itself)", () => {
    const single: StandardThreshold[] = [{ tier: "apex", division: 1, threshold: 2.0, trust: "real" }];
    const atThreshold = resolveRank(2.0, single);
    expect(atThreshold.lp).toBe(100);
    const beyond = resolveRank(4.0, single); // x = (4-2)/2 = 1
    expect(beyond.lp).toBeCloseTo(100 * (1 + Math.log2(2)), 6);
    expect(beyond.lp).toBeGreaterThan(100);
  });

  it("surfaces the trust tier of the current threshold", () => {
    const mixed: StandardThreshold[] = [
      { tier: "initiate", division: 6, threshold: 0.5, trust: "synthetic" },
      { tier: "apprentice", division: 5, threshold: 1.0, trust: "real" },
    ];
    expect(resolveRank(0.6, mixed).trust).toBe("synthetic");
    expect(resolveRank(1.1, mixed).trust).toBe("real");
  });
});

describe("nextLoadTarget", () => {
  it("finds a concrete weight x reps pair crossing the target ratio", () => {
    // Rank scoring resolves ratios via `rankSkillScore` (XP/rank balancing redesign §2), not
    // Epley — the suggested target must be verified against the same curve it was derived from.
    const target = nextLoadTarget(1.1, 80, 6);
    const impliedScore = target.weightKg * rankRepMultiplier(target.reps);
    expect(impliedScore).toBeGreaterThanOrEqual(1.1 * 80 - 1); // within rounding
    expect(target.reps).toBeGreaterThanOrEqual(4);
    expect(target.reps).toBeLessThanOrEqual(8);
  });
});

describe("nextRepTarget", () => {
  const repThresholds: StandardThreshold[] = [
    { tier: "initiate", division: 6, threshold: 5, trust: "real" },
    { tier: "apprentice", division: 5, threshold: 15, trust: "real" },
  ];
  it("returns the next rep threshold above current reps", () => {
    expect(nextRepTarget(repThresholds, 6)).toBe(15);
  });
  it("returns null once past the top threshold", () => {
    expect(nextRepTarget(repThresholds, 20)).toBeNull();
  });
});

describe("ratchetPeak", () => {
  // Every existing behavior below is verified with `isCorroborated: true` — corroboration itself
  // (whether a result *gets* to be compared at all) is tested separately below.

  it("adopts current as peak when there is no stored peak yet", () => {
    const peak = ratchetPeak({ tier: "initiate", division: 5, lp: 40, e1rm: 100 }, 1000, null, true);
    expect(peak).toEqual({ tier: "initiate", division: 5, lp: 40, e1rm: 100, achievedAt: 1000 });
  });

  it("never regresses when a later bodyweight increase alone would lower the naive ratio", () => {
    // Simulates: PR set at bodyweight 80kg reaches trainee-4 (trainee's weakest division), then
    // bodyweight climbs to 90kg with no strength change, so recomputing the ratio today against
    // the same absolute e1RM would resolve to a *lower* band (apprentice-1). Peak must stay put.
    const peakAfterPr = ratchetPeak({ tier: "trainee", division: 4, lp: 20, e1rm: 120 }, 1000, null, true);
    const peakAfterBodyweightIncrease = ratchetPeak(
      { tier: "apprentice", division: 1, lp: 80, e1rm: 120 },
      2000,
      peakAfterPr,
      true,
    );
    expect(peakAfterBodyweightIncrease).toEqual(peakAfterPr);
  });

  it("ratchets forward when a genuinely stronger tier/division is reached", () => {
    const first = ratchetPeak({ tier: "initiate", division: 6, lp: 10, e1rm: 50 }, 1000, null, true);
    const stronger = ratchetPeak({ tier: "initiate", division: 4, lp: 5, e1rm: 70 }, 2000, first, true);
    expect(stronger).toEqual({ tier: "initiate", division: 4, lp: 5, e1rm: 70, achievedAt: 2000 });
  });

  it("ratchets forward on a higher LP within the same tier/division", () => {
    const first = ratchetPeak({ tier: "trainee", division: 5, lp: 30, e1rm: 90 }, 1000, null, true);
    const higherLp = ratchetPeak({ tier: "trainee", division: 5, lp: 60, e1rm: 95 }, 2000, first, true);
    expect(higherLp?.lp).toBe(60);
    expect(higherLp?.achievedAt).toBe(2000);
  });

  it("does not regress on a lower LP within the same tier/division", () => {
    const first = ratchetPeak({ tier: "trainee", division: 5, lp: 60, e1rm: 95 }, 1000, null, true);
    const lowerLp = ratchetPeak({ tier: "trainee", division: 5, lp: 30, e1rm: 90 }, 2000, first, true);
    expect(lowerLp).toEqual(first);
  });

  describe("corroboration gating (XP/rank balancing redesign §3)", () => {
    it("does not establish a first-ever peak when uncorroborated", () => {
      const peak = ratchetPeak({ tier: "initiate", division: 5, lp: 40, e1rm: 100 }, 1000, null, false);
      expect(peak).toBeNull();
    });

    it("does not advance an existing peak when the stronger result is uncorroborated", () => {
      const first = ratchetPeak({ tier: "initiate", division: 6, lp: 10, e1rm: 50 }, 1000, null, true);
      const uncorroborated = ratchetPeak(
        { tier: "initiate", division: 4, lp: 5, e1rm: 70 },
        2000,
        first,
        false,
      );
      expect(uncorroborated).toEqual(first); // unchanged, not the stronger uncorroborated result
    });

    it("never demotes an already-confirmed peak just because a later result is uncorroborated", () => {
      const confirmed = ratchetPeak({ tier: "trainee", division: 3, lp: 50, e1rm: 100 }, 1000, null, true);
      const laterWeakerUncorroborated = ratchetPeak(
        { tier: "initiate", division: 6, lp: 10, e1rm: 30 },
        2000,
        confirmed,
        false,
      );
      expect(laterWeakerUncorroborated).toEqual(confirmed);
    });

    it("does eventually advance once a later call reports corroboration", () => {
      const first = ratchetPeak({ tier: "initiate", division: 6, lp: 10, e1rm: 50 }, 1000, null, true);
      // A second day reaches the same strong result and the caller now reports it corroborated.
      const confirmed = ratchetPeak({ tier: "initiate", division: 4, lp: 5, e1rm: 70 }, 3000, first, true);
      expect(confirmed).toEqual({ tier: "initiate", division: 4, lp: 5, e1rm: 70, achievedAt: 3000 });
    });
  });
});

describe("9-tier ladder", () => {
  it("has exactly 9 tiers with the documented names, in order", () => {
    expect(TIERS).toEqual([
      "initiate", "apprentice", "trainee", "athlete", "lifter",
      "advanced", "elite", "expert", "apex",
    ]);
  });

  it("has the documented division count per tier, summing to 27 bands", () => {
    expect(TIER_DIVISION_COUNT).toEqual({
      initiate: 5, apprentice: 4, trainee: 4, athlete: 3, lifter: 3,
      advanced: 3, elite: 2, expert: 2, apex: 1,
    });
    const total = Object.values(TIER_DIVISION_COUNT).reduce((a, b) => a + b, 0);
    expect(total).toBe(27);
    expect(MAX_ORDINAL).toBe(26);
  });

  it("ordinal: division N (weakest) in a tier is always the tier's lowest ordinal", () => {
    expect(ordinal("initiate", 5)).toBe(0);
    expect(ordinal("initiate", 1)).toBe(4);
    expect(ordinal("apprentice", 4)).toBe(5); // right after initiate's 5 bands (0-4)
    expect(ordinal("apprentice", 1)).toBe(8);
    expect(ordinal("apex", 1)).toBe(26); // last band overall
  });

  it("ordinalToBand inverts ordinal exactly across the whole range", () => {
    for (let o = 0; o <= MAX_ORDINAL; o++) {
      const band = ordinalToBand(o);
      expect(ordinal(band.tier, band.division)).toBe(o);
    }
  });

  it("ordinalToBand clamps above MAX_ORDINAL to apex division 1", () => {
    expect(ordinalToBand(MAX_ORDINAL + 5)).toEqual({ tier: "apex", division: 1 });
  });
});

describe("positionToBand", () => {
  it("round-trips an ordinary mid-ladder position", () => {
    // ordinal("trainee", 2) * 100 + 55 should resolve back to trainee/2/55.
    const ord = ordinal("trainee", 2);
    expect(positionToBand(ord * 100 + 55)).toEqual({ tier: "trainee", division: 2, lp: 55 });
  });

  it("a position sitting exactly at a band's top edge resolves as lp:0 of the next band, matching resolveRank's own >= threshold convention", () => {
    const ord = ordinal("trainee", 2);
    const nextBand = ordinalToBand(ord + 1);
    expect(positionToBand(ord * 100 + 100)).toEqual({ ...nextBand, lp: 0 });
  });

  it("preserves excess lp past Apex instead of clamping to 100", () => {
    expect(positionToBand(MAX_ORDINAL * 100 + 250)).toEqual({ tier: "apex", division: 1, lp: 250 });
  });

  it("the old clamp point (exactly Apex's own top) still resolves to exactly 100", () => {
    expect(positionToBand(MAX_ORDINAL * 100 + 100)).toEqual({ tier: "apex", division: 1, lp: 100 });
  });

  it("floors a negative position at 0", () => {
    expect(positionToBand(-50)).toEqual({ tier: "initiate", division: 5, lp: 0 });
  });
});
