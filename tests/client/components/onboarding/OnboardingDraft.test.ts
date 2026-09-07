import { describe, expect, it, vi } from "vitest";
import {
  BAR_TYPES,
  DEFAULT_BAR_WEIGHTS_KG,
  MAX_BAR_WEIGHT_KG,
  MIN_BAR_WEIGHT_KG,
  ONBOARDING_DRAFT_KEY,
  createOnboardingDraft,
  needsPlatesStep,
  parsedBirthYear,
  parsedWeightKg,
  useOnboardingDraft,
  type OnboardingDraft,
} from "~client/components/onboarding/OnboardingDraft";
import { withSetup } from "../../helpers/withSetup";

describe("createOnboardingDraft", () => {
  it("returns the wizard's default starting values", () => {
    const draft = createOnboardingDraft();

    expect(draft.sex).toBeNull();
    expect(draft.birthYearInput).toBe("");
    expect(draft.weightInput).toBe("");
    expect(draft.experienceLevel).toBeNull();
    expect(draft.workoutsPerWeek).toBe(3);
    expect([...draft.equipment]).toEqual(["bodyweight"]);
    expect(draft.barWeightsKg.size).toBe(0);
    expect(draft.plates.size).toBe(0);
  });

  it("is reactive — mutations on the returned object are observed directly", () => {
    const draft = createOnboardingDraft();
    draft.sex = "female";
    draft.equipment.add("barbell");

    expect(draft.sex).toBe("female");
    expect(draft.equipment.has("barbell")).toBe(true);
  });
});

describe("useOnboardingDraft", () => {
  it("throws when called outside OnboardingGuide's provide scope", () => {
    // Vue's own inject() warns to the console when called outside an active component instance
    // and returns undefined; useOnboardingDraft() then converts that into its own descriptive
    // error. Silence the expected Vue warning so the test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => useOnboardingDraft()).toThrow(
      "useOnboardingDraft() called outside OnboardingGuide's provide scope",
    );
    warnSpy.mockRestore();
  });

  it("returns the exact draft object provided by an ancestor", () => {
    const draft = createOnboardingDraft();
    const { result, unmount } = withSetup(() => useOnboardingDraft(), {
      global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
    });

    expect(result).toBe(draft);
    unmount();
  });
});

describe("parsedWeightKg", () => {
  function draftWithWeight(weightInput: string): OnboardingDraft {
    const draft = createOnboardingDraft();
    draft.weightInput = weightInput;
    return draft;
  }

  it("parses a German comma-decimal input as a number", () => {
    expect(parsedWeightKg(draftWithWeight("72,5"))).toBe(72.5);
  });

  it("parses a plain dot-decimal input as a number", () => {
    expect(parsedWeightKg(draftWithWeight("72.5"))).toBe(72.5);
  });

  it("returns null for an empty input", () => {
    expect(parsedWeightKg(draftWithWeight(""))).toBeNull();
  });

  it("returns null for zero or negative weight", () => {
    expect(parsedWeightKg(draftWithWeight("0"))).toBeNull();
    expect(parsedWeightKg(draftWithWeight("-5"))).toBeNull();
  });

  it("returns null at and above the 400kg ceiling", () => {
    expect(parsedWeightKg(draftWithWeight("400"))).toBeNull();
    expect(parsedWeightKg(draftWithWeight("399.9"))).toBeCloseTo(399.9);
  });

  it("returns null for non-numeric input", () => {
    expect(parsedWeightKg(draftWithWeight("abc"))).toBeNull();
  });
});

describe("parsedBirthYear", () => {
  function draftWithBirthYear(birthYearInput: string): OnboardingDraft {
    const draft = createOnboardingDraft();
    draft.birthYearInput = birthYearInput;
    return draft;
  }

  it("parses a valid 4-digit year", () => {
    expect(parsedBirthYear(draftWithBirthYear("1995"))).toBe(1995);
  });

  it("returns null below 1900", () => {
    expect(parsedBirthYear(draftWithBirthYear("1899"))).toBeNull();
  });

  it("returns null for a year in the future", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(parsedBirthYear(draftWithBirthYear(String(nextYear)))).toBeNull();
  });

  it("accepts the current year as the upper bound", () => {
    const currentYear = new Date().getFullYear();
    expect(parsedBirthYear(draftWithBirthYear(String(currentYear)))).toBe(currentYear);
  });

  it("returns null for a non-integer input", () => {
    expect(parsedBirthYear(draftWithBirthYear("1995.5"))).toBeNull();
  });

  it("returns null for an empty input", () => {
    expect(parsedBirthYear(draftWithBirthYear(""))).toBeNull();
  });
});

describe("needsPlatesStep", () => {
  it("is false for a draft with only bodyweight equipment", () => {
    const draft = createOnboardingDraft();
    expect(needsPlatesStep(draft)).toBe(false);
  });

  it.each(["barbell", "ez-bar", "trap-bar", "dumbbell"] as const)(
    "is true when the draft owns a %s",
    (barType) => {
      const draft = createOnboardingDraft();
      draft.equipment.add(barType);
      expect(needsPlatesStep(draft)).toBe(true);
    },
  );

  it("is false for equipment with no bar-family item", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("machine");
    draft.equipment.add("cable");
    expect(needsPlatesStep(draft)).toBe(false);
  });
});

describe("bar weight constants", () => {
  it("define a default/min/max entry for every bar type", () => {
    for (const type of BAR_TYPES) {
      expect(DEFAULT_BAR_WEIGHTS_KG[type]).toBeGreaterThan(0);
      expect(MIN_BAR_WEIGHT_KG[type]).toBeLessThanOrEqual(DEFAULT_BAR_WEIGHTS_KG[type]);
      expect(DEFAULT_BAR_WEIGHTS_KG[type]).toBeLessThanOrEqual(MAX_BAR_WEIGHT_KG[type]);
    }
  });

  it("caps the adjustable-dumbbell handle far lower than the barbell family", () => {
    expect(MAX_BAR_WEIGHT_KG.dumbbell).toBe(10);
    expect(MAX_BAR_WEIGHT_KG.barbell).toBe(50);
    expect(MAX_BAR_WEIGHT_KG["ez-bar"]).toBe(50);
    expect(MAX_BAR_WEIGHT_KG["trap-bar"]).toBe(50);
  });
});
