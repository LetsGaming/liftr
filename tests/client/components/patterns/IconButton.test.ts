import { describe, expect, it, vi } from "vitest";
import IconButton from "~client/components/patterns/IconButton.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("IconButton", () => {
  it("renders a btn-icon button with the icon and aria-label by default", () => {
    const wrapper = mountWithProviders(IconButton, { props: { icon: "trash", label: "Löschen" } });
    expect(wrapper.classes()).toContain("btn-icon");
    expect(wrapper.attributes("aria-label")).toBe("Löschen");
    expect(wrapper.find("svg.app-icon--trash").exists()).toBe(true);
  });

  it("renders btn-close for the close variant", () => {
    const wrapper = mountWithProviders(IconButton, { props: { icon: "close", label: "Schließen", variant: "close" } });
    expect(wrapper.classes()).toContain("btn-close");
    expect(wrapper.classes()).not.toContain("btn-icon");
  });

  it("combines btn-icon with the danger/confirming modifier classes", () => {
    const danger = mountWithProviders(IconButton, { props: { icon: "trash", label: "Löschen", variant: "danger" } });
    expect(danger.classes()).toContain("btn-icon");
    expect(danger.classes()).toContain("danger");

    const confirming = mountWithProviders(IconButton, { props: { icon: "trash", label: "Löschen wirklich?", variant: "confirming" } });
    expect(confirming.classes()).toContain("btn-icon");
    expect(confirming.classes()).toContain("confirming");
  });

  it("renders the chromeless ghost variant instead of btn-icon", () => {
    const wrapper = mountWithProviders(IconButton, { props: { icon: "more", label: "Mehr", variant: "ghost" } });
    expect(wrapper.classes()).toContain("icon-btn-ghost");
    expect(wrapper.classes()).not.toContain("btn-icon");
  });

  it("applies the sm size modifier", () => {
    const wrapper = mountWithProviders(IconButton, { props: { icon: "more", label: "Mehr", size: "sm" } });
    expect(wrapper.classes()).toContain("icon-btn-sm");
  });

  it("renders default slot content instead of the icon when provided", () => {
    const wrapper = mountWithProviders(IconButton, {
      props: { icon: "trash", label: "Löschen wirklich?" },
      slots: { default: "Verwerfen?" },
    });
    expect(wrapper.text()).toBe("Verwerfen?");
    expect(wrapper.find("svg").exists()).toBe(false);
  });

  it("warns in dev when neither an icon nor default slot content is given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mountWithProviders(IconButton, { props: { label: "Aktion" } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
