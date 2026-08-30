import { describe, expect, it } from "vitest";
import type { TieredRequirement } from "./requirements.js";
import { findSubstitute, type SubstituteCandidate, type SubstituteTarget } from "./substitutes.js";

function required(...items: string[]): TieredRequirement[] {
  return items.map((item) => ({ item: item as TieredRequirement["item"], tier: "required" as const }));
}

const benchPress: SubstituteTarget = {
  exerciseId: "bench-press",
  movementPattern: "push-horizontal",
  primaryMuscles: ["chest", "triceps"],
  secondaryMuscles: ["front-delts"],
};

const pushup: SubstituteCandidate = {
  exerciseId: "pushup",
  movementPattern: "push-horizontal",
  primaryMuscles: ["chest", "triceps"],
  secondaryMuscles: ["front-delts"],
  requiredEquipment: required("bodyweight"),
  isCustom: false,
};

const dumbbellBenchPress: SubstituteCandidate = {
  exerciseId: "dumbbell-bench-press",
  movementPattern: "push-horizontal",
  primaryMuscles: ["chest", "triceps"],
  secondaryMuscles: ["front-delts"],
  requiredEquipment: required("dumbbell", "bench"),
  isCustom: false,
};

const backSquat: SubstituteCandidate = {
  exerciseId: "back-squat",
  movementPattern: "squat",
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings"],
  requiredEquipment: required("barbell", "plates", "rack"),
  isCustom: false,
};

describe("findSubstitute", () => {
  it("picks a same-pattern, same-muscle candidate the user can actually perform", () => {
    const result = findSubstitute(benchPress, [pushup, dumbbellBenchPress, backSquat], ["bodyweight"]);
    expect(result?.exerciseId).toBe("pushup");
  });

  it("excludes candidates whose own equipment requirements aren't met either", () => {
    const result = findSubstitute(benchPress, [dumbbellBenchPress, backSquat], ["bodyweight"]);
    expect(result).toBeNull();
  });

  it("never substitutes across an unrelated movement pattern and muscle group", () => {
    const result = findSubstitute(benchPress, [backSquat], ["barbell", "plates", "rack"]);
    expect(result).toBeNull();
  });

  it("never returns the target itself even if present in candidates", () => {
    const result = findSubstitute(benchPress, [{ ...pushup, exerciseId: "bench-press" }], ["bodyweight"]);
    expect(result).toBeNull();
  });

  it("treats a null owned list as no restriction, same as the equipment filter", () => {
    const result = findSubstitute(benchPress, [dumbbellBenchPress], null);
    expect(result?.exerciseId).toBe("dumbbell-bench-press");
  });
});
