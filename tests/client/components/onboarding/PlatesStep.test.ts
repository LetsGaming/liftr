import { describe, expect, it } from "vitest";
import PlatesStep from "~client/components/onboarding/PlatesStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { OnboardingDraft } from "~client/components/onboarding/OnboardingDraft";

function mountPlatesStep(draft: OnboardingDraft = createOnboardingDraft()) {
  const wrapper = mountWithProviders(PlatesStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
  return { wrapper, draft };
}

describe("PlatesStep", () => {
  it("renders no bar rows and hides the plate-count section for a bodyweight-only draft", () => {
    const { wrapper } = mountPlatesStep(); // default draft: equipment = {"bodyweight"}

    expect(wrapper.findAll(".plate-row")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("Scheiben pro Größe");
  });

  it("renders a barbell row at its default weight plus the 8-size plate-count section", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    const { wrapper } = mountPlatesStep(draft);

    const rows = wrapper.findAll(".plate-row");
    expect(rows).toHaveLength(1 + 8); // 1 bar row + 8 plate-size rows
    expect(rows[0]!.text()).toContain("Langhantel");
    expect(rows[0]!.find(".tnum").text()).toContain("20");
    expect(wrapper.text()).toContain("Scheiben pro Größe");

    const sizes = ["25", "20", "15", "10", "5", "2.5", "1.25", "1"];
    for (const size of sizes) {
      expect(wrapper.text()).toContain(`${size} kg`);
    }
  });

  it("increments a bar's weight on + and writes it to the draft", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    const { wrapper, draft: d } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Mehr Langhantel"]').trigger("click");

    expect(d.barWeightsKg.get("barbell")).toBe(21);
    expect(wrapper.find(".plate-row .tnum").text()).toContain("21");
  });

  it("clamps a barbell's weight at its minimum of 5kg", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    draft.barWeightsKg.set("barbell", 5);
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Weniger Langhantel"]').trigger("click");

    expect(draft.barWeightsKg.get("barbell")).toBe(5);
  });

  it("clamps a barbell's weight at its maximum of 50kg", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    draft.barWeightsKg.set("barbell", 50);
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Mehr Langhantel"]').trigger("click");

    expect(draft.barWeightsKg.get("barbell")).toBe(50);
  });

  it("increments and decrements a plate size's owned count", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Mehr 20kg"]').trigger("click");
    await wrapper.find('button[aria-label="Mehr 20kg"]').trigger("click");
    expect(draft.plates.get(20)).toBe(2);

    await wrapper.find('button[aria-label="Weniger 20kg"]').trigger("click");
    expect(draft.plates.get(20)).toBe(1);
  });

  it("removes the map entry (rather than storing 0) once a plate count is decremented back to zero", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Mehr 25kg"]').trigger("click");
    expect(draft.plates.has(25)).toBe(true);

    await wrapper.find('button[aria-label="Weniger 25kg"]').trigger("click");
    expect(draft.plates.has(25)).toBe(false);
    expect(wrapper.text()).toContain("25 kg");
  });

  it("does not decrement a plate count below zero", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Weniger 15kg"]').trigger("click");

    expect(draft.plates.has(15)).toBe(false);
  });

  it("labels the dumbbell handle row distinctly and clamps it to its own 1-10kg range", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("dumbbell");
    const { wrapper } = mountPlatesStep(draft);

    const rows = wrapper.findAll(".plate-row");
    expect(rows).toHaveLength(1); // bar row only — no plate-count section for dumbbell-only
    expect(rows[0]!.text()).toContain("Kurzhantel-Griff");
    expect(rows[0]!.find(".tnum").text()).toContain("2.5");
    expect(wrapper.text()).not.toContain("Scheiben pro Größe");

    await wrapper.find('button[aria-label="Mehr Kurzhantel-Griff"]').trigger("click");
    expect(draft.barWeightsKg.get("dumbbell")).toBe(3.5);
  });

  it("clamps the dumbbell handle's weight at its maximum of 10kg", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("dumbbell");
    draft.barWeightsKg.set("dumbbell", 10);
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Mehr Kurzhantel-Griff"]').trigger("click");

    expect(draft.barWeightsKg.get("dumbbell")).toBe(10);
  });

  it("clamps the dumbbell handle's weight at its minimum of 1kg", async () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("dumbbell");
    draft.barWeightsKg.set("dumbbell", 1);
    const { wrapper } = mountPlatesStep(draft);

    await wrapper.find('button[aria-label="Weniger Kurzhantel-Griff"]').trigger("click");

    expect(draft.barWeightsKg.get("dumbbell")).toBe(1);
  });

  it("renders one bar row per owned bar-family item, and the plate-count section stays scoped to the barbell family", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    draft.equipment.add("dumbbell");
    const { wrapper } = mountPlatesStep(draft);

    const rows = wrapper.findAll(".plate-row");
    expect(rows).toHaveLength(2 + 8); // barbell + dumbbell rows, plus 8 plate-size rows
    expect(wrapper.text()).toContain("Langhantel");
    expect(wrapper.text()).toContain("Kurzhantel-Griff");
    expect(wrapper.text()).toContain("Scheiben pro Größe");
  });
});
