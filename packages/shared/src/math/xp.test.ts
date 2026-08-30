import { describe, expect, it } from "vitest";
import { computeLevel, computeSetXp, computeTotalXp, repeatSetMultiplier } from "./xp.js";

describe("computeSetXp", () => {
  it("multiplies weight x reps x tier multiplier", () => {
    expect(computeSetXp(100, 5, "gold")).toBeCloseTo(650, 5); // 100*5*1.3
  });

  it("uses the nominal bodyweight load when weightKg is null", () => {
    expect(computeSetXp(null, 10, "bronze")).toBe(300); // 30*10*1
  });

  it("defaults the multiplier to 1 when there's no rank yet", () => {
    expect(computeSetXp(50, 8, null)).toBe(400);
  });

  it("applies no decay on the first occurrence", () => {
    expect(computeSetXp(100, 5, null, 1)).toBe(500);
  });

  it("decays xp for repeated identical occurrences", () => {
    expect(computeSetXp(100, 5, null, 2)).toBeCloseTo(500 / 1.15, 5);
    expect(computeSetXp(100, 5, null, 3)).toBeLessThan(computeSetXp(100, 5, null, 2));
  });

  it("never decays below the floor multiplier, however many repeats", () => {
    expect(computeSetXp(100, 5, null, 1000)).toBeCloseTo(250, 5); // 500 * 0.5 floor
  });
});

describe("repeatSetMultiplier", () => {
  it("is monotonically non-increasing", () => {
    let prev = repeatSetMultiplier(1);
    for (let n = 2; n <= 20; n++) {
      const cur = repeatSetMultiplier(n);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeTotalXp", () => {
  it("gives full xp for distinct exercises/weights/reps regardless of order", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 2 },
      { exerciseId: "squat", weightKg: 100, reps: 5, tier: null, loggedAt: 1 },
    ]);
    expect(total).toBeCloseTo(1000, 5); // both first-occurrence, no decay
  });

  it("decays repeats of the identical exercise+weight+reps combo in chronological order", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 20 }, // 2nd chronologically
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 10 }, // 1st chronologically
    ]);
    expect(total).toBeCloseTo(500 + 500 / 1.15, 5);
  });

  it("does not decay across different exercises or different weight/reps", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 1 },
      { exerciseId: "bench", weightKg: 102.5, reps: 5, tier: null, loggedAt: 2 },
      { exerciseId: "bench", weightKg: 100, reps: 6, tier: null, loggedAt: 3 },
      { exerciseId: "squat", weightKg: 100, reps: 5, tier: null, loggedAt: 4 },
    ]);
    expect(total).toBeCloseTo(500 + 512.5 + 600 + 500, 5);
  });
});

describe("computeLevel", () => {
  it("starts at level 0 with 0 xp", () => {
    expect(computeLevel(0)).toEqual({ level: 0, xpIntoLevel: 0, xpForNextLevel: 100, progressPercent: 0 });
  });

  it("is 50% through level 0 at 50 xp", () => {
    expect(computeLevel(50)).toEqual({ level: 0, xpIntoLevel: 50, xpForNextLevel: 100, progressPercent: 50 });
  });

  it("hits level 2 exactly at 400 xp (2^2 * 100)", () => {
    expect(computeLevel(400)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 500, progressPercent: 0 });
  });

  it("is 50% through level 2 at 650 xp", () => {
    expect(computeLevel(650)).toEqual({ level: 2, xpIntoLevel: 250, xpForNextLevel: 500, progressPercent: 50 });
  });
});
