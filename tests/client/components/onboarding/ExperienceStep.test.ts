import { describe, expect, it } from "vitest";
import ExperienceStep from "~client/components/onboarding/ExperienceStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { OnboardingDraft } from "~client/components/onboarding/OnboardingDraft";

function mountExperienceStep(draft: OnboardingDraft = createOnboardingDraft()) {
  const wrapper = mountWithProviders(ExperienceStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
  return { wrapper, draft };
}

describe("ExperienceStep", () => {
  it("renders all three experience options with their labels and hints", () => {
    const { wrapper } = mountExperienceStep();
    const rows = wrapper.findAll(".option-row");

    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain("Anfänger");
    expect(rows[0]!.text()).toContain("Noch nie oder erst seit kurzem trainiert");
    expect(rows[1]!.text()).toContain("Fortgeschritten");
    expect(rows[2]!.text()).toContain("Erfahren");
  });

  it("has no option marked active when the draft has no experience level yet", () => {
    const { wrapper } = mountExperienceStep();
    expect(wrapper.findAll(".option-row.active")).toHaveLength(0);
  });

  it("selects beginner on click and updates the draft", async () => {
    const { wrapper, draft } = mountExperienceStep();
    const rows = wrapper.findAll(".option-row");

    await rows[0]!.trigger("click");

    expect(draft.experienceLevel).toBe("beginner");
    expect(rows[0]!.classes()).toContain("active");
    expect(rows[1]!.classes()).not.toContain("active");
    expect(rows[2]!.classes()).not.toContain("active");
  });

  it("selecting a different option moves the active state instead of adding to it", async () => {
    const { wrapper, draft } = mountExperienceStep();
    const rows = wrapper.findAll(".option-row");

    await rows[0]!.trigger("click");
    await rows[2]!.trigger("click");

    expect(draft.experienceLevel).toBe("advanced");
    expect(rows[2]!.classes()).toContain("active");
    expect(rows[0]!.classes()).not.toContain("active");
  });

  it("reflects a pre-populated draft's experience level as already active", () => {
    const draft = createOnboardingDraft();
    draft.experienceLevel = "intermediate";
    const { wrapper } = mountExperienceStep(draft);

    const rows = wrapper.findAll(".option-row");
    expect(rows[1]!.classes()).toContain("active");
  });
});
