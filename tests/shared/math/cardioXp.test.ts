import { describe, expect, it } from "vitest";
import {
  computeRunXp,
  HEALTHCONNECT_XP_BONUS_MULTIPLIER,
  OTHER_XP_PER_MINUTE,
  RUN_XP_PER_KM,
  runDecayKey,
  WALK_XP_PER_KM,
  type RunXpInput,
} from "@liftr/shared/math/runXp";

describe("cardio activity types in XP", () => {
  it("walking earns less XP per km than running", () => {
    expect(WALK_XP_PER_KM).toBeLessThan(RUN_XP_PER_KM);
  });

  it("computeRunXp for a walk uses WALK_XP_PER_KM, not RUN_XP_PER_KM", () => {
    const input: RunXpInput = {
      runId: "r1",
      distanceM: 5000,
      durationS: 3000,
      loggedAt: new Date("2026-01-01"),
      activityType: "walk",
    };
    expect(computeRunXp([input])).toBeCloseTo(5 * WALK_XP_PER_KM, 6);
  });

  it("computeRunXp for 'other' pays by duration, not distance", () => {
    const input: RunXpInput = {
      runId: "r1",
      distanceM: 10_000, // irrelevant for "other"
      durationS: 1800, // 30 minutes
      loggedAt: new Date("2026-01-01"),
      activityType: "other",
    };
    expect(computeRunXp([input])).toBeCloseTo(30 * OTHER_XP_PER_MINUTE, 6);
  });

  it("omitting activityType defaults to 'run', matching an explicit 'run'", () => {
    const base = { runId: "r1", distanceM: 5000, durationS: 1500, loggedAt: new Date("2026-01-01") };
    expect(computeRunXp([base])).toEqual(computeRunXp([{ ...base, activityType: "run" }]));
  });

  it("the Health Connect bonus applies equally to walk and other, not just run", () => {
    const loggedAt = new Date("2026-01-01");
    const walkNoBonus = computeRunXp([
      { runId: "w1", distanceM: 5000, durationS: 3000, loggedAt, activityType: "walk" },
    ]);
    const walkWithBonus = computeRunXp([
      { runId: "w1", distanceM: 5000, durationS: 3000, loggedAt, activityType: "walk", source: "healthconnect" },
    ]);
    expect(walkWithBonus).toBeCloseTo(walkNoBonus * HEALTHCONNECT_XP_BONUS_MULTIPLIER, 6);
  });

  it("runDecayKey namespaces run/walk/other into independent buckets", () => {
    expect(runDecayKey("run", 5000, 1500)).not.toBe(runDecayKey("walk", 5000, 1500));
    expect(runDecayKey("run", 5000, 1500)).toBe("run:10");
    expect(runDecayKey("walk", 5000, 1500)).toBe("walk:10");
  });

  it("a daily walk does not decay the occurrence counter for same-distance runs", () => {
    const run5k = (loggedAt: Date, activityType: "run" | "walk"): RunXpInput => ({
      runId: `${activityType}-${loggedAt.toISOString()}`,
      distanceM: 5000,
      durationS: 1500,
      loggedAt,
      activityType,
    });
    const day1 = new Date("2026-01-01");
    const day2 = new Date("2026-01-02");
    // Two runs, no walks: the second run decays.
    const twoRuns = computeRunXp([run5k(day1, "run"), run5k(day2, "run")]);
    // A run and a walk on separate days: the run should NOT decay from the walk sharing its bucket.
    const runThenWalk = computeRunXp([run5k(day1, "run"), run5k(day2, "walk")]);
    const soloRun = computeRunXp([run5k(day1, "run")]);
    const soloWalkOccurrence1 = 5 * WALK_XP_PER_KM; // first-ever walk at this bucket, no decay
    expect(runThenWalk).toBeCloseTo(soloRun + soloWalkOccurrence1, 6);
    expect(twoRuns).toBeLessThan(soloRun * 2); // sanity: the existing run-only decay still fires
  });
});
