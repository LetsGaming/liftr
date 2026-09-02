import { describe, expect, it } from "vitest";
import {
  computeWorkoutPlausibility,
  PLAUSIBILITY_FLOOR,
  PACE_FINE_THRESHOLD_S,
  PACE_MAX_SEVERITY_THRESHOLD_S,
  JUMP_FINE_THRESHOLD,
  JUMP_MAX_SEVERITY_THRESHOLD,
  CEILING_MULTIPLE,
} from "./plausibility.js";

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

  it("does not flag pace at or above the fine-threshold seconds/set", () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 10,
      effectiveDurationSeconds: 10 * PACE_FINE_THRESHOLD_S, // exactly at the fine threshold
      exercises: [],
    });
    expect(result.reason).not.toBe("pace");
  });

  it("floors pace severity to the minimum multiplier at or below the max-severity seconds/set", () => {
    const atMaxSeverity = computeWorkoutPlausibility({
      totalSetCount: 60 / PACE_MAX_SEVERITY_THRESHOLD_S,
      effectiveDurationSeconds: 60,
      exercises: [],
    });
    const faster = computeWorkoutPlausibility({ totalSetCount: 60, effectiveDurationSeconds: 60, exercises: [] });
    expect(atMaxSeverity.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
    expect(faster.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it(`flags an improbable jump vs. stored peak (>${JUMP_FINE_THRESHOLD * 100}%)`, () => {
    const storedPeakRatio = 1.3;
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [
        { exerciseId: "deadlift", sessionBestRatio: storedPeakRatio * (1 + JUMP_FINE_THRESHOLD + 0.05), storedPeakRatio, apexThreshold: 5 },
      ],
    });
    expect(result.reason).toBe("improbable_jump");
  });

  it(`does not flag a jump under ${JUMP_FINE_THRESHOLD * 100}%`, () => {
    const storedPeakRatio = 1.3;
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [
        { exerciseId: "deadlift", sessionBestRatio: storedPeakRatio * (1 + JUMP_FINE_THRESHOLD - 0.05), storedPeakRatio, apexThreshold: 5 },
      ],
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

  it("a genuine mid-range breakthrough jump is only lightly discounted, not floored", () => {
    // Guards the engagement-audit-v3 Phase 3 risk explicitly: JUMP_MAX_SEVERITY_THRESHOLD was
    // tightened from 1.0 to 0.75, but a jump only slightly past where discounting *starts* — the
    // ~40-60% range a real short-rest/good-day PR session might land in — must stay well above
    // the floor, not get crushed by the same heuristic meant to catch a fabricated set.
    const storedPeakRatio = 1.3;
    const midRangeJump = JUMP_FINE_THRESHOLD + (JUMP_MAX_SEVERITY_THRESHOLD - JUMP_FINE_THRESHOLD) * 0.3;
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: storedPeakRatio * (1 + midRangeJump), storedPeakRatio, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("improbable_jump");
    expect(result.multiplier).toBeGreaterThan(0.5);
  });

  it("an outlandish jump beyond the tightened max-severity threshold hits the floor", () => {
    const storedPeakRatio = 1.3;
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [
        { exerciseId: "deadlift", sessionBestRatio: storedPeakRatio * (1 + JUMP_MAX_SEVERITY_THRESHOLD + 0.1), storedPeakRatio, apexThreshold: 5 },
      ],
    });
    expect(result.reason).toBe("improbable_jump");
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it(`flags a value exceeding ${CEILING_MULTIPLE}x the apex threshold outright`, () => {
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 8.0, storedPeakRatio: 1.3, apexThreshold: 5 }],
    });
    expect(result.reason).toBe("exceeds_ceiling");
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("does not flag exceeds_ceiling just under the tightened ceiling multiple", () => {
    // storedPeakRatio: null isolates this from the jump heuristic, which would otherwise also
    // fire on a session-best this far above zero prior history and mask what's being tested.
    const result = computeWorkoutPlausibility({
      totalSetCount: 5,
      effectiveDurationSeconds: 600,
      exercises: [{ exerciseId: "deadlift", sessionBestRatio: 5 * CEILING_MULTIPLE - 0.01, storedPeakRatio: null, apexThreshold: 5 }],
    });
    expect(result.reason).not.toBe("exceeds_ceiling");
    expect(result.multiplier).toBe(1);
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
