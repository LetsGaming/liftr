import { describe, expect, it } from "vitest";
import WelcomeStep from "~client/components/onboarding/WelcomeStep.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("WelcomeStep", () => {
  it("renders the welcome heading and intro copy", () => {
    // Pure copy — no draft injection needed, WelcomeStep never calls useOnboardingDraft().
    const wrapper = mountWithProviders(WelcomeStep);

    expect(wrapper.find("h2").text()).toBe("Willkommen bei Liftr");
    expect(wrapper.text()).toContain("Dauert unter einer Minute");
  });
});
