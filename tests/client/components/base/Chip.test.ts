import { describe, expect, it } from "vitest";
import Chip from "~client/components/base/Chip.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("Chip", () => {
  it("renders a span by default with the neutral/md classes", () => {
    const wrapper = mountWithProviders(Chip, { slots: { default: "5k" } });
    const el = wrapper.element;
    expect(el.tagName).toBe("SPAN");
    expect(el.classList.contains("chip-neutral")).toBe(true);
    expect(el.classList.contains("chip-md")).toBe(true);
    expect(wrapper.text()).toBe("5k");
  });

  it("renders as the requested element for each `as` value", () => {
    expect(mountWithProviders(Chip, { props: { as: "button" } }).element.tagName).toBe("BUTTON");
    expect(mountWithProviders(Chip, { props: { as: "li" } }).element.tagName).toBe("LI");
  });

  it("applies the requested variant and size classes", () => {
    const wrapper = mountWithProviders(Chip, { props: { variant: "danger", size: "sm" } });
    expect(wrapper.classes()).toContain("chip-danger");
    expect(wrapper.classes()).toContain("chip-sm");
  });

  it("adds the active class when active is true", () => {
    const wrapper = mountWithProviders(Chip, { props: { active: true } });
    expect(wrapper.classes()).toContain("active");
  });

  it("renders the leading slot only when provided", () => {
    const withLeading = mountWithProviders(Chip, { slots: { leading: "<b>L</b>", default: "text" } });
    expect(withLeading.find(".chip-leading").exists()).toBe(true);

    const withoutLeading = mountWithProviders(Chip, { slots: { default: "text" } });
    expect(withoutLeading.find(".chip-leading").exists()).toBe(false);
  });

  it("forwards an arbitrary class and data attribute to the chip element itself", () => {
    const wrapper = mountWithProviders(Chip, {
      attrs: { class: "coverage-chip", "data-testid": "cov" },
    });
    expect(wrapper.classes()).toContain("coverage-chip");
    expect(wrapper.classes()).toContain("chip-neutral");
    expect(wrapper.attributes("data-testid")).toBe("cov");
  });
});
