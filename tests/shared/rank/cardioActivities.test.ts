import { describe, expect, it } from "vitest";
import {
  buildCardioStandards,
  buildRunStandards,
  cardioActivity,
  classifyHealthConnectWorkoutType,
  isRankEligible,
  rankedCardioActivities,
  resolveRank,
  sortedThresholds,
  TIER_DIVISION_COUNT,
  TIERS,
} from "@liftr/shared";

describe("cardioActivity", () => {
  it("returns the registry entry for a known id", () => {
    expect(cardioActivity("run").rank.mode).toBe("distance-ladder");
    expect(cardioActivity("walk").rank.mode).toBe("single-speed");
    expect(cardioActivity("hike").rank.mode).toBe("single-speed");
    expect(cardioActivity("other").rank.mode).toBe("none");
  });
});

describe("rankedCardioActivities", () => {
  it("excludes 'other' (rank.mode === 'none')", () => {
    const ids = rankedCardioActivities().map((a) => a.id);
    expect(ids).toContain("run");
    expect(ids).toContain("walk");
    expect(ids).toContain("hike");
    expect(ids).not.toContain("other");
  });
});

describe("classifyHealthConnectWorkoutType", () => {
  it("classifies running types", () => {
    expect(classifyHealthConnectWorkoutType("RUNNING")).toBe("run");
    expect(classifyHealthConnectWorkoutType("RUNNING_TREADMILL")).toBe("run");
  });

  it("classifies walking and hiking as distinct activities", () => {
    expect(classifyHealthConnectWorkoutType("WALKING")).toBe("walk");
    expect(classifyHealthConnectWorkoutType("HIKING")).toBe("hike");
  });

  it("is case-insensitive", () => {
    expect(classifyHealthConnectWorkoutType("walking")).toBe("walk");
  });

  it("falls back to 'other' for anything unrecognized", () => {
    expect(classifyHealthConnectWorkoutType("BIKING")).toBe("other");
    expect(classifyHealthConnectWorkoutType("ROWING_MACHINE")).toBe("other");
    expect(classifyHealthConnectWorkoutType("SWIMMING_POOL")).toBe("other");
  });
});

describe("isRankEligible", () => {
  it("running is always eligible (no floor)", () => {
    expect(isRankEligible("run", 1, 1)).toBe(true);
  });

  it("'other' is never eligible (no rank ladder)", () => {
    expect(isRankEligible("other", 100_000, 100_000)).toBe(false);
  });

  it("walk requires >= 1km AND >= 10min", () => {
    expect(isRankEligible("walk", 999, 600)).toBe(false); // distance just under
    expect(isRankEligible("walk", 1000, 599)).toBe(false); // duration just under
    expect(isRankEligible("walk", 1000, 600)).toBe(true); // exactly at both floors
    expect(isRankEligible("walk", 5000, 3000)).toBe(true);
  });

  it("hike requires >= 2km AND >= 30min", () => {
    expect(isRankEligible("hike", 1999, 1800)).toBe(false);
    expect(isRankEligible("hike", 2000, 1799)).toBe(false);
    expect(isRankEligible("hike", 2000, 1800)).toBe(true);
  });
});

describe("buildCardioStandards", () => {
  it("is exactly the concatenation of run + walk + hike standards", () => {
    const all = buildCardioStandards();
    const run = all.filter((r) => r.activityType === "run");
    const walk = all.filter((r) => r.activityType === "walk");
    const hike = all.filter((r) => r.activityType === "hike");
    expect(all.length).toBe(run.length + walk.length + hike.length);
    expect(run.length).toBe(270); // 5 categories x 2 sexes x 27 divisions
    expect(walk.length).toBe(54); // 1 bucket x 2 sexes x 27 divisions
    expect(hike.length).toBe(54);
    expect(all.length).toBe(378);
  });

  it("single-speed rows all carry category 'all'", () => {
    const all = buildCardioStandards();
    for (const row of all.filter((r) => r.activityType === "walk" || r.activityType === "hike")) {
      expect(row.category).toBe("all");
    }
  });

  it("run rows span all 5 categories, never 'all'", () => {
    const runRows = buildCardioStandards().filter((r) => r.activityType === "run");
    const categories = new Set(runRows.map((r) => r.category));
    expect(categories).toEqual(new Set(["mile", "5k", "10k", "half_marathon", "marathon"]));
  });

  it("each activity/bucket/sex combination has all 9 tiers with 27 total divisions", () => {
    const all = buildCardioStandards();
    const groups = new Map<string, typeof all>();
    for (const row of all) {
      const key = `${row.activityType}:${row.category}:${row.sex}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, rows] of groups) {
      const totalDivisions = Object.values(TIER_DIVISION_COUNT).reduce((a, b) => a + b, 0);
      expect(rows.length, key).toBe(totalDivisions);
      const tiersPresent = new Set(rows.map((r) => r.tier));
      expect(tiersPresent.size, key).toBe(TIERS.length);
    }
  });

  it("trust: run is 'derived', walk/hike are 'synthetic'", () => {
    const all = buildCardioStandards();
    expect(all.filter((r) => r.activityType === "run").every((r) => r.trust === "derived")).toBe(true);
    expect(all.filter((r) => r.activityType === "walk").every((r) => r.trust === "synthetic")).toBe(true);
    expect(all.filter((r) => r.activityType === "hike").every((r) => r.trust === "synthetic")).toBe(true);
  });

  it("a median-pace walk (1.4 m/s) resolves to a mid-ladder tier, consistent with a median 5K runner", () => {
    const walkThresholds = sortedThresholds(
      buildCardioStandards().filter((r) => r.activityType === "walk" && r.sex === "male"),
    );
    const walkResult = resolveRank(1.4, walkThresholds);

    const run5kThresholds = sortedThresholds(
      buildRunStandards().filter((r) => r.category === "5k" && r.sex === "male"),
    );
    const runResult = resolveRank(3.701, run5kThresholds); // the 5k male median anchor

    // Both should land in the same rough mid-ladder neighborhood (trainee/athlete/lifter), not at
    // the extremes — proof the two ladders are calibrated consistently rather than one being more
    // generous than the other.
    const midTiers = ["trainee", "athlete", "lifter", "advanced"];
    expect(midTiers).toContain(walkResult.tier);
    expect(midTiers).toContain(runResult.tier);
  });
});
