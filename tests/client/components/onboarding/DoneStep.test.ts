import { describe, expect, it } from "vitest";
import DoneStep from "~client/components/onboarding/DoneStep.vue";
import { ONBOARDING_DRAFT_KEY, createOnboardingDraft } from "~client/components/onboarding/OnboardingDraft";
import { mountWithProviders } from "../../helpers/mountWithProviders";
import type { OnboardingDraft } from "~client/components/onboarding/OnboardingDraft";

function mountDoneStep(draft: OnboardingDraft) {
  return mountWithProviders(DoneStep, {
    global: { provide: { [ONBOARDING_DRAFT_KEY as symbol]: draft } },
  });
}

describe("DoneStep", () => {
  it("renders the heading and the equipment count from the default draft", () => {
    const draft = createOnboardingDraft(); // equipment = {"bodyweight"} -> count 1
    const wrapper = mountDoneStep(draft);

    expect(wrapper.find("h2").text()).toBe("Fertig!");
    expect(wrapper.text()).toContain("1 ausgewählt");
  });

  it("reflects a larger equipment selection in the count", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("dumbbell");
    draft.equipment.add("machine");
    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).toContain("3 ausgewählt");
  });

  it("does not show the plates unlock line when no plates step is needed", () => {
    const draft = createOnboardingDraft(); // no bar-family equipment
    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).not.toContain("Exakte Scheiben-Anzeige");
  });

  it("does not show the plates unlock line when a bar is owned but no plate counts were entered", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell"); // needsPlatesStep true, but plates map still empty

    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).not.toContain("Exakte Scheiben-Anzeige");
  });

  it("shows the plates unlock line once a bar is owned and at least one plate count is positive", () => {
    const draft = createOnboardingDraft();
    draft.equipment.add("barbell");
    draft.plates.set(20, 2);

    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).toContain("Exakte Scheiben-Anzeige");
  });

  it("hides the plates line even with plate counts if no bar-family equipment is owned", () => {
    // Defensive: plates should only ever be populated alongside a bar type in practice, but
    // hasPlates is gated on needsPlatesStep(draft) first, not just plates.size — verify that gate.
    const draft = createOnboardingDraft();
    draft.plates.set(20, 2);

    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).not.toContain("Exakte Scheiben-Anzeige");
  });

  it("always renders the weight-suggestion and rank-calculation unlocks", () => {
    const draft = createOnboardingDraft();
    const wrapper = mountDoneStep(draft);

    expect(wrapper.text()).toContain("Gewichtsvorschläge passend zu deiner Erfahrung");
    expect(wrapper.text()).toContain("Rang-Berechnung basierend auf Körpergewicht und Geschlecht");
  });
});
