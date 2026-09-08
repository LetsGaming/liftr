import { describe, expect, it } from "vitest";
import {
  computeRunXp,
  quantizeDistanceForDecay,
  repeatRunMultiplier,
  RUN_XP_PER_KM,
  type RunXpInput,
} from "@liftr/shared";

function run(overrides: Partial<RunXpInput> & Pick<RunXpInput, "runId" | "distanceM" | "loggedAt">): RunXpInput {
  return { durationS: 1800, ...overrides };
}

describe("computeRunXp", () => {
  it("scales with distance for a single run", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const shortRun = computeRunXp([run({ runId: "a", distanceM: 3000, loggedAt: day1 })]);
    const longRun = computeRunXp([run({ runId: "b", distanceM: 6000, loggedAt: day1 })]);
    expect(longRun).toBeCloseTo(shortRun * 2, 5);
    expect(shortRun).toBeCloseTo((3000 / 1000) * RUN_XP_PER_KM, 5);
  });

  it("shows diminishing XP for repeated similar (5K) distances on different days", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const day2 = new Date("2026-01-03T08:00:00Z");
    const day3 = new Date("2026-01-05T08:00:00Z");
    const r1 = run({ runId: "r1", distanceM: 5000, loggedAt: day1 });
    const r2 = run({ runId: "r2", distanceM: 5050, loggedAt: day2 }); // same bucket (nearest 500m)
    const r3 = run({ runId: "r3", distanceM: 4980, loggedAt: day3 }); // same bucket

    // Per-run XP should decay across occurrences 1, 2, 3 within the same bucket.
    const xpFirstOnly = computeRunXp([r1]);
    const xpFirstTwo = computeRunXp([r1, r2]);
    const xpAllThree = computeRunXp([r1, r2, r3]);

    const secondRunXp = xpFirstTwo - xpFirstOnly;
    const thirdRunXp = xpAllThree - xpFirstTwo;

    expect(secondRunXp).toBeLessThan(xpFirstOnly);
    expect(thirdRunXp).toBeLessThan(secondRunXp);
  });

  it("does NOT share a decay bucket between a 5K and a 10K (different distances)", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const day2 = new Date("2026-01-02T08:00:00Z");

    const fiveK = run({ runId: "5k", distanceM: 5000, loggedAt: day1 });
    const tenK = run({ runId: "10k", distanceM: 10000, loggedAt: day2 });

    const soloFiveK = computeRunXp([fiveK]);
    const soloTenK = computeRunXp([tenK]);
    const combined = computeRunXp([fiveK, tenK]);

    // Neither run should be discounted by the other's presence — each is occurrence 1 in its own
    // bucket, so the combined total is exactly the sum of the two solo runs.
    expect(combined).toBeCloseTo(soloFiveK + soloTenK, 5);
  });

  it("applies the plausibility multiplier to scale XP down", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const full = computeRunXp([run({ runId: "a", distanceM: 5000, loggedAt: day1, plausibilityMultiplier: 1 })]);
    const discounted = computeRunXp([
      run({ runId: "a", distanceM: 5000, loggedAt: day1, plausibilityMultiplier: 0.5 }),
    ]);
    expect(discounted).toBeCloseTo(full * 0.5, 6);
  });

  it("defaults the plausibility multiplier to 1 (no discount) when omitted", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const withDefault = computeRunXp([run({ runId: "a", distanceM: 5000, loggedAt: day1 })]);
    const withExplicit1 = computeRunXp([
      run({ runId: "a", distanceM: 5000, loggedAt: day1, plausibilityMultiplier: 1 }),
    ]);
    expect(withDefault).toBeCloseTo(withExplicit1, 6);
  });

  it("computes total XP as chronological order, regardless of input array order", () => {
    const day1 = new Date("2026-01-01T08:00:00Z");
    const day2 = new Date("2026-01-03T08:00:00Z");
    const runs: RunXpInput[] = [
      run({ runId: "r1", distanceM: 5000, loggedAt: day1 }),
      run({ runId: "r2", distanceM: 5000, loggedAt: day2 }),
    ];
    const forward = computeRunXp(runs);
    const reversed = computeRunXp([...runs].reverse());
    expect(reversed).toBeCloseTo(forward, 6);
  });
});

describe("repeatRunMultiplier", () => {
  it("is monotonically non-increasing", () => {
    let prev = repeatRunMultiplier(1);
    for (let n = 2; n <= 20; n++) {
      const cur = repeatRunMultiplier(n);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it("never decays below the floor multiplier, however many repeats", () => {
    expect(repeatRunMultiplier(1000)).toBeCloseTo(0.5, 5);
  });

  it("applies no decay on the first occurrence", () => {
    expect(repeatRunMultiplier(1)).toBe(1);
  });
});

describe("quantizeDistanceForDecay", () => {
  it("buckets nearby distances (within 500m rounding) into the same bucket", () => {
    expect(quantizeDistanceForDecay(5000)).toBe(quantizeDistanceForDecay(5050));
    expect(quantizeDistanceForDecay(5000)).toBe(quantizeDistanceForDecay(4980));
  });

  it("buckets a 5K and a 10K into different buckets", () => {
    expect(quantizeDistanceForDecay(5000)).not.toBe(quantizeDistanceForDecay(10000));
  });
});
