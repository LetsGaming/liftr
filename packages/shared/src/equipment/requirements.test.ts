import { describe, expect, it } from "vitest";
import { canPerform, deriveRequirements, mapWgerEquipmentToRequirements, missingByTier } from "./requirements.js";

function items(reqs: ReturnType<typeof deriveRequirements>) {
  return reqs.map((r) => r.item);
}
function tierOf(reqs: ReturnType<typeof deriveRequirements>, item: string) {
  return reqs.find((r) => r.item === item)?.tier;
}

describe("deriveRequirements", () => {
  it("adds plates + bench (both required) for a bench-press-family barbell lift", () => {
    const reqs = deriveRequirements({ slug: "bench-press", equipment: "barbell", movementPattern: "push-horizontal" });
    expect(items(reqs)).toEqual(expect.arrayContaining(["barbell", "plates", "bench"]));
    expect(tierOf(reqs, "bench")).toBe("required");
    const inclineReqs = deriveRequirements({ slug: "incline-bench-press", equipment: "barbell", movementPattern: "push-horizontal" });
    expect(items(inclineReqs)).toEqual(expect.arrayContaining(["barbell", "plates", "bench", "incline-bench"]));
  });

  it("adds a required rack for barbell squats and overhead presses, not for deadlifts", () => {
    expect(items(deriveRequirements({ slug: "back-squat", equipment: "barbell", movementPattern: "squat" }))).toContain("rack");
    expect(items(deriveRequirements({ slug: "overhead-press", equipment: "barbell", movementPattern: "push-vertical" }))).toContain("rack");
    expect(items(deriveRequirements({ slug: "deadlift", equipment: "barbell", movementPattern: "hinge" }))).not.toContain("rack");
  });

  it("adds a required pullup-bar for dead-hang movements", () => {
    expect(items(deriveRequirements({ slug: "pullup", equipment: "bodyweight", movementPattern: "pull-vertical" }))).toContain("pullup-bar");
    expect(items(deriveRequirements({ slug: "hanging-leg-raise", equipment: "bodyweight", movementPattern: "isolation-core" }))).toContain(
      "pullup-bar",
    );
  });

  it("adds a mat as recommended (not required) for floor core work", () => {
    const reqs = deriveRequirements({ slug: "plank", equipment: "bodyweight", movementPattern: "isolation-core" });
    expect(items(reqs)).toContain("mat");
    expect(tierOf(reqs, "mat")).toBe("recommended");
  });

  it("doesn't add support equipment to unrelated exercises", () => {
    expect(items(deriveRequirements({ slug: "leg-press", equipment: "machine", movementPattern: "squat" }))).toEqual(["machine"]);
    expect(items(deriveRequirements({ slug: "dumbbell-curl", equipment: "dumbbell", movementPattern: "isolation-arms" }))).toEqual(["dumbbell"]);
  });

  it("returns an empty list for a null equipment entry", () => {
    expect(deriveRequirements({ slug: "unknown-exercise", equipment: null, movementPattern: "isolation-core" })).toEqual([]);
  });
});

describe("missingByTier / canPerform", () => {
  it("treats a null/empty owned list as no restriction", () => {
    const reqs = deriveRequirements({ slug: "bench-press", equipment: "barbell", movementPattern: "push-horizontal" });
    expect(missingByTier(reqs, null)).toEqual({ required: [], recommended: [], optional: [] });
    expect(missingByTier(reqs, [])).toEqual({ required: [], recommended: [], optional: [] });
    expect(canPerform(reqs, null)).toBe(true);
  });

  it("reports what's missing per tier when a restriction is set", () => {
    const reqs = deriveRequirements({ slug: "bench-press", equipment: "barbell", movementPattern: "push-horizontal" });
    expect(missingByTier(reqs, ["barbell", "plates"]).required).toEqual(["bench"]);
    expect(canPerform(reqs, ["barbell", "plates"])).toBe(false);
    expect(canPerform(reqs, ["barbell", "plates", "bench"])).toBe(true);
  });

  it("a missing recommended-tier item never blocks canPerform", () => {
    const reqs = deriveRequirements({ slug: "plank", equipment: "bodyweight", movementPattern: "isolation-core" });
    expect(missingByTier(reqs, ["bodyweight"]).recommended).toEqual(["mat"]);
    expect(missingByTier(reqs, ["bodyweight"]).required).toEqual([]);
    expect(canPerform(reqs, ["bodyweight"])).toBe(true);
  });

  it("always allows a pure bodyweight exercise even against an unrelated owned list", () => {
    const reqs = deriveRequirements({ slug: "pushup", equipment: "bodyweight", movementPattern: "push-horizontal" });
    expect(canPerform(reqs, ["barbell"])).toBe(true);
  });

  it("implies plate ownership from owning a barbell — no separate 'plates' tick required", () => {
    // deadlift needs barbell+plates but no support prop — ticking just "Barbell" must be enough.
    const reqs = deriveRequirements({ slug: "deadlift", equipment: "barbell", movementPattern: "hinge" });
    expect(items(reqs)).toContain("plates");
    expect(canPerform(reqs, ["barbell"])).toBe(true);
  });
});

describe("mapWgerEquipmentToRequirements", () => {
  it("maps wger's full multi-item tag list, folding in plates alongside a barbell-family item", () => {
    const reqs = mapWgerEquipmentToRequirements(["Barbell", "Bench"]);
    expect(reqs).toEqual(
      expect.arrayContaining([
        { item: "barbell", tier: "required" },
        { item: "bench", tier: "required" },
        { item: "plates", tier: "required" },
      ]),
    );
  });

  it("maps a gym mat to recommended, not required", () => {
    const reqs = mapWgerEquipmentToRequirements(["none (bodyweight exercise)", "Gym mat"]);
    expect(reqs).toEqual(
      expect.arrayContaining([
        { item: "bodyweight", tier: "required" },
        { item: "mat", tier: "recommended" },
      ]),
    );
  });

  it("drops equipment with no vocabulary equivalent rather than guessing", () => {
    const reqs = mapWgerEquipmentToRequirements(["Resistance band", "Swiss Ball"]);
    expect(reqs).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(mapWgerEquipmentToRequirements(["barbell"])).toEqual(expect.arrayContaining([{ item: "barbell", tier: "required" }]));
  });
});
