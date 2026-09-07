import { describe, expect, it } from "vitest";
import EquipmentStep from "~client/components/onboarding/EquipmentStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { OnboardingDraft } from "~client/components/onboarding/OnboardingDraft";

function mountEquipmentStep(draft: OnboardingDraft = createOnboardingDraft()) {
  const wrapper = mountWithProviders(EquipmentStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
  return { wrapper, draft };
}

describe("EquipmentStep", () => {
  it("renders all 10 primary equipment chips and 7 support chips (plates excluded)", () => {
    const { wrapper } = mountEquipmentStep();
    const grids = wrapper.findAll(".chip-grid");

    expect(grids).toHaveLength(2);
    expect(grids[0]!.findAll(".equip-chip")).toHaveLength(10);
    // SUPPORT_EQUIPMENT_SLUGS has 8 entries; "plates" is filtered out here since owning a
    // barbell already implies plate ownership (see the component's own comment).
    expect(grids[1]!.findAll(".equip-chip")).toHaveLength(7);
    expect(wrapper.text()).not.toContain("Gewichtsscheiben");
  });

  it("starts with only bodyweight active, marked locked with a hint and aria-disabled", () => {
    const { wrapper } = mountEquipmentStep();
    const bodyweightChip = wrapper
      .findAll(".chip-grid")[0]!
      .findAll(".equip-chip")
      .find((c) => c.text().includes("Körpergewicht"))!;

    expect(bodyweightChip.classes()).toContain("active");
    expect(bodyweightChip.classes()).toContain("locked");
    expect(bodyweightChip.attributes("aria-pressed")).toBe("true");
    expect(bodyweightChip.attributes("aria-disabled")).toBe("true");
    expect(bodyweightChip.text()).toContain("Immer aktiv");

    expect(wrapper.findAll(".chip-grid")[0]!.findAll(".equip-chip.active")).toHaveLength(1);
  });

  it("clicking the locked bodyweight chip does not deselect it", async () => {
    const { wrapper, draft } = mountEquipmentStep();
    const bodyweightChip = wrapper
      .findAll(".equip-chip")
      .find((c) => c.text().includes("Körpergewicht"))!;

    await bodyweightChip.trigger("click");

    expect(draft.equipment.has("bodyweight")).toBe(true);
    expect(bodyweightChip.classes()).toContain("active");
  });

  it("toggles a non-bodyweight primary chip on and off", async () => {
    const { wrapper, draft } = mountEquipmentStep();
    const barbellChip = wrapper.findAll(".equip-chip").find((c) => c.text().includes("Langhantel"))!;

    await barbellChip.trigger("click");
    expect(draft.equipment.has("barbell")).toBe(true);
    expect(barbellChip.classes()).toContain("active");
    expect(barbellChip.attributes("aria-pressed")).toBe("true");

    await barbellChip.trigger("click");
    expect(draft.equipment.has("barbell")).toBe(false);
    expect(barbellChip.classes()).not.toContain("active");
    expect(barbellChip.attributes("aria-pressed")).toBe("false");
  });

  it("toggles a support-equipment chip on and off", async () => {
    const { wrapper, draft } = mountEquipmentStep();
    const benchChip = wrapper.findAll(".equip-chip").find((c) => c.text().includes("Flachbank"))!;

    await benchChip.trigger("click");
    expect(draft.equipment.has("bench")).toBe(true);
    expect(benchChip.classes()).toContain("active");

    await benchChip.trigger("click");
    expect(draft.equipment.has("bench")).toBe(false);
    expect(benchChip.classes()).not.toContain("active");
  });

  it("toggling one chip leaves the others' selection state untouched", async () => {
    const { wrapper, draft } = mountEquipmentStep();
    const dumbbellChip = wrapper.findAll(".equip-chip").find((c) => c.text().includes("Kurzhanteln"))!;

    await dumbbellChip.trigger("click");

    expect(draft.equipment.has("dumbbell")).toBe(true);
    expect(draft.equipment.has("bodyweight")).toBe(true);
    expect([...draft.equipment].sort()).toEqual(["bodyweight", "dumbbell"]);
  });
});
