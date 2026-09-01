import { describe, expect, it } from "vitest";
import { computeWorkoutPlausibility, PLAUSIBILITY_FLOOR } from "./plausibility.js";

const noExercises = { totalSetCount: 0, effectiveDurationSeconds: 0, exercises: [] };

describe("computeWorkoutPlausibility", () => {
  it("returns multiplier 1 and no reason for a normal-paced session with normal lifts", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 20,
      effectiveDurationSeconds: 45 * 60, // 45 minutes, 20 sets = 135s/set
      exercises: [
        { exerciseId: "back-squat", sessionBestRatio: 1.8, storedPeakRatio: 1.75, apexThreshold: 2.5 },
      ],
    });
    expect(result).toEqual({ multiplier: 1, reason: null });
  });

  it("flags a session with an unrealistic sets-per-minute pace", () => {
    // your example: 5 exercises, ~4 sets each, one minute total
    const result = computeWorkoutPlausibility({
      totalSetCount: 20,
      effectiveDurationSeconds: 60,
      exercises: [],
    });
    expect(result.reason).toBe("pace");
    expect(result.multiplier).toBeLessThan(1);
  });

  it("does not flag pace at or above the 12s/set floor", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 10,
      effectiveDurationSeconds: 120, // exactly 12s/set
      exercises: [],
    });
    expect(result.reason).not.toBe("pace");
  });

  it("floors pace severity to the minimum multiplier at or below 4s/set", () => {
    const at4s = computeWorkoutPlausibility({ totalSetCount: 15, effectiveDurationSeconds: 60, exercises: [] });
    const at1s = computeWorkoutPlausibility({ totalSetCount: 60, effectiveDurationSeconds: 60, exercises: [] });
    expect(at4s.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
    expect(at1s.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("flags an improbable jump vs. stored peak (>40%)", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 2.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("improbable_jump");
  });

  it("does not flag a jump under 40%", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 1.6, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).not.toBe("improbable_jump");
  });

  it("does not flag improbable_jump when there is no stored peak yet (first-ever set)", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 3.0, storedPeakRatio: null, apexThreshold: 5 }],
    });
    expect(result.reason).not.toBe("improbable_jump");
  });

  it("flags a value exceeding 1.5x the apex threshold outright", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 8.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("exceeds_ceiling");
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("combines checks by taking the worst (lowest) resulting multiplier, not an average", () => {
    // pace is borderline-fine, but the value ceiling check is maximally severe
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 300, // 60s/set, fine
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 8.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("returns multiplier 1 for a workout with zero sets (nothing to evaluate)", () => {
    expect(computeWorkoutPlausibility(noExercises)).toEqual({ multiplier: 1, reason: null });
  });
});
