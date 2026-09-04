import { describe, expect, it } from "vitest";
import {
  computeConsistencyBonus,
  computeLevel,
  computeSetXp,
  computeTotalXp,
  computeVarietyBonus,
  quantizeLoadForDecay,
  repeatSetMultiplier,
  BODYWEIGHT_NOMINAL_LOAD_KG,
  CONSISTENCY_BASE,
  CONSISTENCY_SCALE,
  CONSISTENCY_STREAK_CAP,
  VARIETY_MAX_MUSCLES_PER_SESSION,
  VARIETY_PER_MUSCLE,
} from "./xp.js";

describe("computeSetXp", () => {
  it("always uses the nominal bodyweight load, ignoring any typed weight", () => {
    // 30 (nominal) * 5 * 1.3 (advanced) — the typed 100kg no longer affects magnitude.
    expect(computeSetXp(100, 5, "advanced")).toBeCloseTo(30 * 5 * 1.3, 5);
  });

  it("uses the same nominal bodyweight load when weightKg is null", () => {
    expect(computeSetXp(null, 10, "apprentice")).toBe(BODYWEIGHT_NOMINAL_LOAD_KG * 10 * 1);
  });

  it("gives identical XP for the same reps/tier regardless of the typed weight", () => {
    expect(computeSetXp(5, 5, "athlete")).toBeCloseTo(computeSetXp(5000, 5, "athlete"), 5);
  });

  it("defaults the multiplier to 1 when there's no rank yet", () => {
    expect(computeSetXp(50, 8, null)).toBe(BODYWEIGHT_NOMINAL_LOAD_KG * 8);
  });

  it("applies no decay on the first occurrence", () => {
    expect(computeSetXp(100, 5, null, 1)).toBe(BODYWEIGHT_NOMINAL_LOAD_KG * 5);
  });

  it("decays xp for repeated identical occurrences", () => {
    expect(computeSetXp(100, 5, null, 2)).toBeCloseTo((BODYWEIGHT_NOMINAL_LOAD_KG * 5) / 1.15, 5);
    expect(computeSetXp(100, 5, null, 3)).toBeLessThan(computeSetXp(100, 5, null, 2));
  });

  it("never decays below the floor multiplier, however many repeats", () => {
    expect(computeSetXp(100, 5, null, 1000)).toBeCloseTo(BODYWEIGHT_NOMINAL_LOAD_KG * 5 * 0.5, 5);
  });

  it("discounts XP by the plausibility multiplier when given one", () => {
    const full = computeSetXp(100, 5, "athlete", 1, 1);
    const discounted = computeSetXp(100, 5, "athlete", 1, 0.5);
    expect(discounted).toBeCloseTo(full * 0.5, 6);
  });

  it("defaults the plausibility multiplier to 1 (no discount) when omitted", () => {
    expect(computeSetXp(100, 5, "athlete", 1)).toBeCloseTo(computeSetXp(100, 5, "athlete", 1, 1), 6);
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

describe("quantizeLoadForDecay", () => {
  it("maps null (bodyweight) to a single stable bucket", () => {
    expect(quantizeLoadForDecay(null)).toBe("bw");
  });

  it("buckets small cosmetic nudges around 20kg into the same bucket", () => {
    // step at 20kg = max(1.25, 20*0.05) = 1.25kg
    const a = quantizeLoadForDecay(20);
    const b = quantizeLoadForDecay(20.5);
    const c = quantizeLoadForDecay(20.25);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("separates a genuinely different load (20kg vs 25kg) into different buckets", () => {
    expect(quantizeLoadForDecay(20)).not.toBe(quantizeLoadForDecay(25));
  });

  it("resolves a boundary weight consistently in both rounding directions without float wobble", () => {
    // The log-space band boundary nearest 20kg falls at ~20.67kg (verified numerically):
    // 20.65kg still shares 20kg's band, 20.68kg is already in the next band up (same band as
    // 21.5kg). Both sides must be stable and must not straddle unpredictably.
    const justBelow = quantizeLoadForDecay(20.65);
    const justAbove = quantizeLoadForDecay(20.68);
    expect(justBelow).not.toBe(justAbove);
    expect(justBelow).toBe(quantizeLoadForDecay(20));
    expect(justAbove).toBe(quantizeLoadForDecay(21.5));
    // Stability: repeated evaluation of the same near-boundary value must never wobble between
    // buckets due to floating-point noise.
    const a = quantizeLoadForDecay(20.665);
    const b = quantizeLoadForDecay(20.665);
    const c = quantizeLoadForDecay(20.665);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("computeTotalXp", () => {
  it("gives full xp for distinct exercises/weights/reps regardless of order", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 2 },
      { exerciseId: "squat", weightKg: 100, reps: 5, tier: null, loggedAt: 1 },
    ]);
    expect(total).toBeCloseTo(BODYWEIGHT_NOMINAL_LOAD_KG * 5 * 2, 5); // both first-occurrence, no decay
  });

  it("decays repeats of the identical exercise+weight-bucket+reps combo in chronological order", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 20 }, // 2nd chronologically
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 10 }, // 1st chronologically
    ]);
    const base = BODYWEIGHT_NOMINAL_LOAD_KG * 5;
    expect(total).toBeCloseTo(base + base / 1.15, 5);
  });

  it("does not decay across different exercises or different reps", () => {
    const total = computeTotalXp([
      { exerciseId: "bench", weightKg: 100, reps: 5, tier: null, loggedAt: 1 },
      { exerciseId: "bench", weightKg: 100, reps: 6, tier: null, loggedAt: 3 },
      { exerciseId: "squat", weightKg: 100, reps: 5, tier: null, loggedAt: 4 },
    ]);
    const set5 = BODYWEIGHT_NOMINAL_LOAD_KG * 5;
    const set6 = BODYWEIGHT_NOMINAL_LOAD_KG * 6;
    expect(total).toBeCloseTo(set5 + set6 + set5, 5);
  });

  it("applies each set's own plausibilityMultiplier field", () => {
    const total = computeTotalXp([
      { exerciseId: "e", weightKg: 100, reps: 5, tier: "athlete", loggedAt: 1, plausibilityMultiplier: 0.5 },
    ]);
    const undiscounted = computeTotalXp([
      { exerciseId: "e", weightKg: 100, reps: 5, tier: "athlete", loggedAt: 1 },
    ]);
    expect(total).toBeCloseTo(undiscounted * 0.5, 6);
  });

  describe("anti-cheat: quantized load bucketing in the repeat-decay key", () => {
    it("nudge-cheat scenario: tiny cosmetic weight nudges still decay as repeats", () => {
      // Same exercise+reps, weight nudged by fractions of a kg each time (20, 20.5, 20, 20.25).
      // All four fall in the same load bucket, so the repeat-decay must progress across all four
      // rather than resetting to "first occurrence" (full XP) every time.
      const sets = [
        { exerciseId: "curl", weightKg: 20, reps: 10, tier: null, loggedAt: 1 },
        { exerciseId: "curl", weightKg: 20.5, reps: 10, tier: null, loggedAt: 2 },
        { exerciseId: "curl", weightKg: 20, reps: 10, tier: null, loggedAt: 3 },
        { exerciseId: "curl", weightKg: 20.25, reps: 10, tier: null, loggedAt: 4 },
      ];
      const base = BODYWEIGHT_NOMINAL_LOAD_KG * 10;
      const expected =
        computeSetXp(20, 10, null, 1) +
        computeSetXp(20, 10, null, 2) +
        computeSetXp(20, 10, null, 3) +
        computeSetXp(20, 10, null, 4);
      expect(computeTotalXp(sets)).toBeCloseTo(expected, 5);
      // Sanity: this is strictly less than 4x the undecayed value — decay actually happened.
      expect(computeTotalXp(sets)).toBeLessThan(base * 4);
      // And each successive set earned no more than the previous one (monotonic decay).
      const perSetValues = [
        computeSetXp(20, 10, null, 1),
        computeSetXp(20, 10, null, 2),
        computeSetXp(20, 10, null, 3),
        computeSetXp(20, 10, null, 4),
      ];
      for (let i = 1; i < perSetValues.length; i++) {
        expect(perSetValues[i]).toBeLessThanOrEqual(perSetValues[i - 1]!);
      }
    });

    it("genuine-progression scenario: a real load jump (20kg -> 25kg) is not falsely decayed", () => {
      const sets = [
        { exerciseId: "curl", weightKg: 20, reps: 10, tier: null, loggedAt: 1 },
        { exerciseId: "curl", weightKg: 25, reps: 10, tier: null, loggedAt: 2 },
      ];
      const total = computeTotalXp(sets);
      const bothFullValue = BODYWEIGHT_NOMINAL_LOAD_KG * 10 * 2; // both treated as occurrence 1
      expect(total).toBeCloseTo(bothFullValue, 5);
    });

    it("boundary scenario end-to-end: weights straddling a bucket boundary decay independently, matching ones don't", () => {
      // 20.65 shares a band with 20 (verified numerically above); 20.68 shares the next band up
      // with 21.5.
      const sets = [
        { exerciseId: "press", weightKg: 20, reps: 5, tier: null, loggedAt: 1 },
        { exerciseId: "press", weightKg: 20.65, reps: 5, tier: null, loggedAt: 2 }, // same band as 20 -> decays
        { exerciseId: "press", weightKg: 20.68, reps: 5, tier: null, loggedAt: 3 }, // new band -> full value
        { exerciseId: "press", weightKg: 21.5, reps: 5, tier: null, loggedAt: 4 }, // same band as 20.68 -> decays
      ];
      const total = computeTotalXp(sets);
      const base = BODYWEIGHT_NOMINAL_LOAD_KG * 5;
      const expected = computeSetXp(0, 5, null, 1) + computeSetXp(0, 5, null, 2) + computeSetXp(0, 5, null, 1) + computeSetXp(0, 5, null, 2);
      expect(total).toBeCloseTo(expected, 5);
      expect(total).toBeLessThan(base * 4);
    });
  });
});

describe("computeConsistencyBonus", () => {
  it("gives a meaningful, non-trivial reward on day 1", () => {
    const day1 = computeConsistencyBonus(1);
    expect(day1).toBeCloseTo(CONSISTENCY_BASE + CONSISTENCY_SCALE, 5);
    expect(day1).toBeGreaterThan(0);
  });

  it("grows partway through the streak cap", () => {
    const mid = computeConsistencyBonus(Math.round(CONSISTENCY_STREAK_CAP / 2));
    expect(mid).toBeGreaterThan(computeConsistencyBonus(1));
    expect(mid).toBeLessThan(computeConsistencyBonus(CONSISTENCY_STREAK_CAP));
  });

  it("reaches its maximum exactly at the streak cap", () => {
    const atCap = computeConsistencyBonus(CONSISTENCY_STREAK_CAP);
    expect(atCap).toBeCloseTo(CONSISTENCY_BASE + CONSISTENCY_SCALE * Math.sqrt(CONSISTENCY_STREAK_CAP), 5);
  });

  it("never decreases past the cap — flat, never a regression from resetting", () => {
    const atCap = computeConsistencyBonus(CONSISTENCY_STREAK_CAP);
    const pastCap = computeConsistencyBonus(CONSISTENCY_STREAK_CAP + 200);
    expect(pastCap).toBe(atCap);
  });

  it("is monotonically non-decreasing across the whole streak range, cap and beyond", () => {
    let prev = computeConsistencyBonus(1);
    for (let d = 2; d <= CONSISTENCY_STREAK_CAP + 50; d += 1) {
      const cur = computeConsistencyBonus(d);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeVarietyBonus", () => {
  it("is exactly 0 for zero new muscles", () => {
    expect(computeVarietyBonus(0)).toBe(0);
  });

  it("scales linearly with new muscle count up to the per-session cap", () => {
    expect(computeVarietyBonus(2)).toBeCloseTo(VARIETY_PER_MUSCLE * 2, 5);
    expect(computeVarietyBonus(VARIETY_MAX_MUSCLES_PER_SESSION)).toBeCloseTo(
      VARIETY_PER_MUSCLE * VARIETY_MAX_MUSCLES_PER_SESSION,
      5,
    );
  });

  it("caps at VARIETY_MAX_MUSCLES_PER_SESSION even with more muscles trained", () => {
    expect(computeVarietyBonus(VARIETY_MAX_MUSCLES_PER_SESSION + 10)).toBeCloseTo(
      VARIETY_PER_MUSCLE * VARIETY_MAX_MUSCLES_PER_SESSION,
      5,
    );
  });

  it("is never negative for any non-negative input (additive-only, never a penalty)", () => {
    for (const n of [0, 1, 2, 3, 5, 8, 20]) {
      expect(computeVarietyBonus(n)).toBeGreaterThanOrEqual(0);
    }
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
