import { describe, expect, it } from "vitest";
import {
  bestLoadRatio,
  bestRankSkillRatio,
  bodyweightLoad,
  epley,
  estimateE1rm,
  rankRepMultiplier,
  rankSkillScore,
  RANK_REP_ZONE_1_MAX,
  RANK_REP_ZONE_2_MAX,
} from "@liftr/shared";

describe("epley", () => {
  it("matches the standard Epley formula", () => {
    expect(epley(100, 1)).toBeCloseTo(103.33, 1);
    expect(epley(100, 10)).toBeCloseTo(133.33, 1);
  });
  it("returns 0 for zero/negative reps", () => {
    expect(epley(100, 0)).toBe(0);
  });
});

describe("estimateE1rm", () => {
  it("flags low confidence above 12 reps", () => {
    expect(estimateE1rm(50, 12).lowConfidence).toBe(false);
    expect(estimateE1rm(50, 13).lowConfidence).toBe(true);
  });
});

describe("bodyweightLoad", () => {
  it("scales bodyweight by leverage and adds extra weight", () => {
    expect(bodyweightLoad(80, 0.64)).toBeCloseTo(51.2, 1);
    expect(bodyweightLoad(80, 1.0, 10)).toBe(90);
  });
});

describe("rankRepMultiplier", () => {
  it("matches Epley's own slope exactly through zone 1 (1-12 reps)", () => {
    for (let reps = 1; reps <= RANK_REP_ZONE_1_MAX; reps++) {
      expect(rankRepMultiplier(reps)).toBeCloseTo(1 + reps / 30, 10);
    }
  });

  it("returns 0 for zero/negative reps", () => {
    expect(rankRepMultiplier(0)).toBe(0);
    expect(rankRepMultiplier(-5)).toBe(0);
  });

  it("is strictly increasing across the whole curve (more reps is never worse)", () => {
    let prev = 0;
    for (let reps = 1; reps <= 100; reps++) {
      const m = rankRepMultiplier(reps);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it("grows faster in zone 2 (12-20) than Epley's own extension would", () => {
    // Epley's own linear continuation past 12 reps would give 1 + 20/30 ≈ 1.667 at 20 reps.
    // Zone 2's steeper slope must exceed that — this is the actual fix for "reps count for
    // more than a token bonus" in the well-supported 12-20 rep range.
    const epleyExtension20 = 1 + 20 / 30;
    expect(rankRepMultiplier(RANK_REP_ZONE_2_MAX)).toBeGreaterThan(epleyExtension20);
  });

  it("dampens marginal growth past zone 2 without ever plateauing or decreasing", () => {
    const atZone2Ceiling = rankRepMultiplier(RANK_REP_ZONE_2_MAX);
    const zone2MarginalPerRep = atZone2Ceiling - rankRepMultiplier(RANK_REP_ZONE_2_MAX - 1);
    const zone3MarginalPerRep = rankRepMultiplier(RANK_REP_ZONE_2_MAX + 1) - atZone2Ceiling;
    expect(zone3MarginalPerRep).toBeGreaterThan(0); // still earns something
    expect(zone3MarginalPerRep).toBeLessThan(zone2MarginalPerRep); // but visibly less per rep
  });

  it("is continuous at both zone boundaries (no cliff)", () => {
    const eps = 1e-6;
    const zone1to2Gap = Math.abs(
      rankRepMultiplier(RANK_REP_ZONE_1_MAX + eps) - rankRepMultiplier(RANK_REP_ZONE_1_MAX),
    );
    const zone2to3Gap = Math.abs(
      rankRepMultiplier(RANK_REP_ZONE_2_MAX + eps) - rankRepMultiplier(RANK_REP_ZONE_2_MAX),
    );
    expect(zone1to2Gap).toBeLessThan(1e-3);
    expect(zone2to3Gap).toBeLessThan(1e-3);
  });
});

describe("rankSkillScore", () => {
  it("matches epley exactly within zone 1", () => {
    expect(rankSkillScore(100, 5)).toBeCloseTo(epley(100, 5), 10);
  });

  it("does not encode a 12-rep cliff: a well-executed 15-rep set outscores a proportionally lighter 8-rep set", () => {
    // Same total volume-ish ballpark, different rep counts — the zone-2 boost means 15 reps at a
    // somewhat lower weight isn't automatically punished relative to a low-rep set.
    const fifteenRepScore = rankSkillScore(50, 15);
    const eightRepScore = rankSkillScore(50, 8);
    expect(fifteenRepScore).toBeGreaterThan(eightRepScore);
  });

  it("returns 0 for zero reps", () => {
    expect(rankSkillScore(100, 0)).toBe(0);
  });
});

describe("bestRankSkillRatio", () => {
  it("picks the set with the highest rank skill score, mirroring bestLoadRatio's shape", () => {
    const sets = [
      { weightKg: 100, reps: 5 },
      { weightKg: 60, reps: 20 },
    ];
    const ratio = bestRankSkillRatio(sets, 80, null);
    expect(ratio).not.toBeNull();
    expect(ratio).toBeCloseTo(Math.max(rankSkillScore(100, 5), rankSkillScore(60, 20)) / 80, 10);
  });

  it("returns null for an empty set list, same as bestLoadRatio", () => {
    expect(bestRankSkillRatio([], 80, null)).toBeNull();
    expect(bestLoadRatio([], 80, null)).toBeNull();
  });
});
