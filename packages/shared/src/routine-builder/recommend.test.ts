import { describe, expect, it } from "vitest";
import { recommendExerciseSets } from "./recommend.js";

const loadRatioThresholds = [
  { tier: "bronze" as const, division: 3 as const, threshold: 0.5, trust: "synthetic" as const },
  { tier: "bronze" as const, division: 2 as const, threshold: 0.7, trust: "synthetic" as const },
];

const repsThresholds = [
  { tier: "bronze" as const, division: 3 as const, threshold: 10, trust: "synthetic" as const },
  { tier: "bronze" as const, division: 2 as const, threshold: 20, trust: "synthetic" as const },
];

describe("recommendExerciseSets", () => {
  it("uses the lifter's last performed set when history exists, regardless of standards", () => {
    const sets = recommendExerciseSets({
      isBodyweight: false,
      metric: "load_ratio",
      thresholds: loadRatioThresholds,
      bodyweightKg: 80,
      lastPerformed: { weightKg: 60, reps: 10 },
    });
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.weightKg === 60 && s.reps === 10)).toBe(true);
  });

  it("falls back to the bronze entry standard (load_ratio) when there's no history", () => {
    const sets = recommendExerciseSets({
      isBodyweight: false,
      metric: "load_ratio",
      thresholds: loadRatioThresholds,
      bodyweightKg: 80,
      lastPerformed: null,
    });
    expect(sets).toHaveLength(3);
    // targetE1rm = 0.5 * 80 = 40; at 8 reps, weightKg = 40 / (1 + 8/30) ≈ 31.6 -> rounds to 1.25kg steps
    expect(sets[0]!.weightKg).toBeGreaterThan(0);
    expect(sets[0]!.reps).toBeGreaterThan(0);
  });

  it("falls back to the bronze entry standard (reps) when there's no history on a rep-based exercise", () => {
    const sets = recommendExerciseSets({
      isBodyweight: true,
      metric: "reps",
      thresholds: repsThresholds,
      bodyweightKg: 80,
      lastPerformed: null,
    });
    expect(sets).toEqual([
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
    ]);
  });

  it("falls back to a generic default when there's no history and no modeled standards at all", () => {
    const sets = recommendExerciseSets({
      isBodyweight: true,
      metric: null,
      thresholds: [],
      bodyweightKg: 80,
      lastPerformed: null,
    });
    expect(sets).toEqual([
      { reps: 8, weightKg: null },
      { reps: 8, weightKg: null },
      { reps: 8, weightKg: null },
    ]);
  });

  it("shifts the no-history entry point up the standards ladder by experience level", () => {
    const thresholds = [
      { tier: "bronze" as const, division: 3 as const, threshold: 0.5, trust: "synthetic" as const },
      { tier: "bronze" as const, division: 2 as const, threshold: 0.7, trust: "synthetic" as const },
      { tier: "bronze" as const, division: 1 as const, threshold: 0.9, trust: "synthetic" as const },
    ];
    const beginner = recommendExerciseSets({ isBodyweight: false, metric: "load_ratio", thresholds, bodyweightKg: 80, lastPerformed: null, experienceLevel: "beginner" });
    const advanced = recommendExerciseSets({ isBodyweight: false, metric: "load_ratio", thresholds, bodyweightKg: 80, lastPerformed: null, experienceLevel: "advanced" });
    expect(advanced[0]!.weightKg!).toBeGreaterThan(beginner[0]!.weightKg!);
  });

  it("still uses the lifter's own history over experience level when both are present", () => {
    const sets = recommendExerciseSets({
      isBodyweight: false,
      metric: "load_ratio",
      thresholds: loadRatioThresholds,
      bodyweightKg: 80,
      lastPerformed: { weightKg: 60, reps: 10 },
      experienceLevel: "beginner",
    });
    expect(sets[0]).toEqual({ reps: 10, weightKg: 60 });
  });

  it("respects a custom set count", () => {
    const sets = recommendExerciseSets({
      isBodyweight: false,
      metric: null,
      thresholds: [],
      bodyweightKg: 80,
      lastPerformed: { weightKg: 50, reps: 5 },
      setCount: 5,
    });
    expect(sets).toHaveLength(5);
  });
});
