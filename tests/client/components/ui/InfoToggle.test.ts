import { describe, expect, it } from "vitest";
import InfoToggle from "~client/components/ui/InfoToggle.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("InfoToggle", () => {
  it("renders the label and starts collapsed (no slot content, aria-expanded false)", () => {
    const wrapper = mountWithProviders(InfoToggle, {
      props: { label: "Was ist LP?" },
      slots: { default: "LP misst deinen Leistungsfortschritt." },
    });

    expect(wrapper.text()).toContain("Was ist LP?");
    expect(wrapper.text()).not.toContain("LP misst deinen Leistungsfortschritt.");
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("false");
  });

  it("reveals the slot content and flips aria-expanded on click", async () => {
    const wrapper = mountWithProviders(InfoToggle, {
      props: { label: "Was ist LP?" },
      slots: { default: "LP misst deinen Leistungsfortschritt." },
    });

    await wrapper.find("button").trigger("click");

    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
    expect(wrapper.text()).toContain("LP misst deinen Leistungsfortschritt.");
  });

  it("hides the slot content again on a second click (toggles back)", async () => {
    const wrapper = mountWithProviders(InfoToggle, {
      props: { label: "Was ist LP?" },
      slots: { default: "LP misst deinen Leistungsfortschritt." },
    });

    await wrapper.find("button").trigger("click");
    await wrapper.find("button").trigger("click");

    expect(wrapper.find("button").attributes("aria-expanded")).toBe("false");
    expect(wrapper.text()).not.toContain("LP misst deinen Leistungsfortschritt.");
  });
});
