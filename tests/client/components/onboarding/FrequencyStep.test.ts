import { describe, expect, it } from "vitest";
import FrequencyStep from "~client/components/onboarding/FrequencyStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { OnboardingDraft } from "~client/components/onboarding/OnboardingDraft";

function mountFrequencyStep(draft: OnboardingDraft = createOnboardingDraft()) {
  const wrapper = mountWithProviders(FrequencyStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
  return { wrapper, draft };
}

describe("FrequencyStep", () => {
  it("renders the default draft's workout count and pluralized label", () => {
    const { wrapper } = mountFrequencyStep(); // default workoutsPerWeek = 3

    expect(wrapper.find(".tnum").text()).toBe("3");
    expect(wrapper.find(".stepper-label").text()).toBe("Workouts / Woche");
  });

  it("uses the singular label when the count is exactly 1", () => {
    const draft = createOnboardingDraft();
    draft.workoutsPerWeek = 1;
    const { wrapper } = mountFrequencyStep(draft);

    expect(wrapper.find(".stepper-label").text()).toBe("Workout / Woche");
  });

  it("increments the count on clicking +", async () => {
    const { wrapper, draft } = mountFrequencyStep();

    await wrapper.find('button[aria-label="Mehr"]').trigger("click");

    expect(draft.workoutsPerWeek).toBe(4);
    expect(wrapper.find(".tnum").text()).toBe("4");
  });

  it("decrements the count on clicking −", async () => {
    const { wrapper, draft } = mountFrequencyStep();

    await wrapper.find('button[aria-label="Weniger"]').trigger("click");

    expect(draft.workoutsPerWeek).toBe(2);
  });

  it("clamps decrementing at a minimum of 1", async () => {
    const draft = createOnboardingDraft();
    draft.workoutsPerWeek = 1;
    const { wrapper } = mountFrequencyStep(draft);

    await wrapper.find('button[aria-label="Weniger"]').trigger("click");

    expect(draft.workoutsPerWeek).toBe(1);
  });

  it("clamps incrementing at a maximum of 14", async () => {
    const draft = createOnboardingDraft();
    draft.workoutsPerWeek = 14;
    const { wrapper } = mountFrequencyStep(draft);

    await wrapper.find('button[aria-label="Mehr"]').trigger("click");

    expect(draft.workoutsPerWeek).toBe(14);
  });
});
