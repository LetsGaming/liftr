import { describe, expect, it } from "vitest";
import CollapsibleCard from "~client/components/patterns/CollapsibleCard.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("CollapsibleCard", () => {
  it("starts collapsed by default (aria-expanded false, body hidden)", () => {
    const wrapper = mountWithProviders(CollapsibleCard, {
      props: { title: "Trainingsprofil" },
      slots: { default: "Formularinhalt" },
    });

    // v-show sets inline `display` rather than removing the element, so this checks the style
    // attribute directly — VTU's isVisible() proved unreliable across repeated re-renders of the
    // same element in this project's VTU version (it kept reporting `true` after a second toggle
    // even though the DOM's own `style="display: none"` was correct).
    expect(wrapper.text()).toContain("Trainingsprofil");
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".collapsible-body").attributes("style")).toContain("display: none");
  });

  it("opens on click, revealing the body, and closes again on a second click", async () => {
    const wrapper = mountWithProviders(CollapsibleCard, {
      props: { title: "Trainingsprofil" },
      slots: { default: "Formularinhalt" },
    });

    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".collapsible-body").attributes("style")).not.toContain("display: none");

    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".collapsible-body").attributes("style")).toContain("display: none");
  });

  it("respects defaultOpen", () => {
    const wrapper = mountWithProviders(CollapsibleCard, {
      props: { title: "Trainingsprofil", defaultOpen: true },
      slots: { default: "Formularinhalt" },
    });

    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".collapsible-body").attributes("style") ?? "").not.toContain("display: none");
  });
});
