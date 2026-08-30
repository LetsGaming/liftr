import { describe, expect, it } from "vitest";
import { normalizeFreeExerciseDbEquipment, normalizeWgerEquipment } from "./equipment.js";

describe("normalizeFreeExerciseDbEquipment", () => {
  it("maps known values to the canonical vocabulary", () => {
    expect(normalizeFreeExerciseDbEquipment("barbell")).toBe("barbell");
    expect(normalizeFreeExerciseDbEquipment("body only")).toBe("bodyweight");
    expect(normalizeFreeExerciseDbEquipment("kettlebells")).toBe("kettlebell");
    expect(normalizeFreeExerciseDbEquipment("e-z curl bar")).toBe("ez-bar");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeFreeExerciseDbEquipment("  Barbell  ")).toBe("barbell");
    expect(normalizeFreeExerciseDbEquipment("BODY ONLY")).toBe("bodyweight");
  });

  it("falls through to null for values with no canonical equivalent, instead of guessing", () => {
    expect(normalizeFreeExerciseDbEquipment("bands")).toBeNull();
    expect(normalizeFreeExerciseDbEquipment("medicine ball")).toBeNull();
    expect(normalizeFreeExerciseDbEquipment("other")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(normalizeFreeExerciseDbEquipment(null)).toBeNull();
    expect(normalizeFreeExerciseDbEquipment(undefined)).toBeNull();
    expect(normalizeFreeExerciseDbEquipment("")).toBeNull();
  });
});

describe("normalizeWgerEquipment", () => {
  it("maps a single recognized tag", () => {
    expect(normalizeWgerEquipment(["Kettlebell"])).toBe("kettlebell");
    expect(normalizeWgerEquipment(["none (bodyweight exercise)"])).toBe("bodyweight");
  });

  it("picks the highest-priority tag when an exercise carries multiple", () => {
    expect(normalizeWgerEquipment(["Bench", "Barbell"])).toBe("barbell");
    expect(normalizeWgerEquipment(["Dumbbell", "Incline bench"])).toBe("dumbbell");
  });

  it("never resolves a supporting prop alone (bench/mat/ball) to a real equipment category", () => {
    expect(normalizeWgerEquipment(["Bench"])).toBeNull();
    expect(normalizeWgerEquipment(["Gym mat", "Swiss Ball"])).toBeNull();
  });

  it("returns null for an empty or entirely unrecognized list", () => {
    expect(normalizeWgerEquipment([])).toBeNull();
    expect(normalizeWgerEquipment(["Resistance band"])).toBeNull();
  });
});
