import { describe, expect, it } from "vitest";
import AboutStep from "~client/components/onboarding/AboutStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft, parsedBirthYear, parsedWeightKg } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";

function mountAboutStep(draft = createOnboardingDraft()) {
  const wrapper = mountWithProviders(AboutStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
  return { wrapper, draft };
}

describe("AboutStep", () => {
  it("renders the heading, hint, and both inputs with no selection active", () => {
    const { wrapper } = mountAboutStep();

    expect(wrapper.find("h2").text()).toBe("Über dich");
    expect(wrapper.text()).toContain("Alles optional");
    expect(wrapper.findAll(".chip.active")).toHaveLength(0);
    expect(wrapper.find('input[inputmode="numeric"]').exists()).toBe(true);
    expect(wrapper.find('input[inputmode="decimal"]').exists()).toBe(true);
  });

  it("sets sex to male on clicking the Männlich chip, and marks only that chip active", async () => {
    const { wrapper, draft } = mountAboutStep();

    const chips = wrapper.findAll(".chip");
    const maleChip = chips[0]!;
    const femaleChip = chips[1]!;
    await maleChip.trigger("click");

    expect(draft.sex).toBe("male");
    expect(maleChip.classes()).toContain("active");
    expect(femaleChip.classes()).not.toContain("active");
  });

  it("sets sex to female on clicking the Weiblich chip", async () => {
    const { wrapper, draft } = mountAboutStep();

    const chips = wrapper.findAll(".chip");
    const maleChip = chips[0]!;
    const femaleChip = chips[1]!;
    await femaleChip.trigger("click");

    expect(draft.sex).toBe("female");
    expect(femaleChip.classes()).toContain("active");
    expect(maleChip.classes()).not.toContain("active");
  });

  it("switching between chips flips which one is active", async () => {
    const { wrapper, draft } = mountAboutStep();
    const chips = wrapper.findAll(".chip");
    const maleChip = chips[0]!;
    const femaleChip = chips[1]!;

    await maleChip.trigger("click");
    expect(draft.sex).toBe("male");

    await femaleChip.trigger("click");
    expect(draft.sex).toBe("female");
    expect(femaleChip.classes()).toContain("active");
    expect(maleChip.classes()).not.toContain("active");
  });

  it("writes typed birth year into the draft via v-model", async () => {
    const { wrapper, draft } = mountAboutStep();

    await wrapper.find('input[inputmode="numeric"]').setValue("1995");

    expect(draft.birthYearInput).toBe("1995");
    expect(parsedBirthYear(draft)).toBe(1995);
  });

  it("writes typed body weight into the draft via v-model, comma decimal included", async () => {
    const { wrapper, draft } = mountAboutStep();

    await wrapper.find('input[inputmode="decimal"]').setValue("72,5");

    expect(draft.weightInput).toBe("72,5");
    expect(parsedWeightKg(draft)).toBe(72.5);
  });
});
