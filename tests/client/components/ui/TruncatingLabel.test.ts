import { describe, expect, it } from "vitest";
import TruncatingLabel from "~client/components/ui/TruncatingLabel.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("TruncatingLabel", () => {
  it("renders the default slot content", () => {
    const wrapper = mountWithProviders(TruncatingLabel, {
      slots: { default: "Barbell Bench Press (Incline, Close-Grip Variation)" },
    });

    expect(wrapper.text()).toBe("Barbell Bench Press (Incline, Close-Grip Variation)");
  });

  it("renders as a <span> by default", () => {
    const wrapper = mountWithProviders(TruncatingLabel, { slots: { default: "Kniebeuge" } });
    expect(wrapper.element.tagName).toBe("SPAN");
  });

  it("renders as whatever tag the `as` prop names", () => {
    const wrapper = mountWithProviders(TruncatingLabel, { props: { as: "div" }, slots: { default: "Kniebeuge" } });
    expect(wrapper.element.tagName).toBe("DIV");
  });

  it("defaults to single-line ellipsis truncation: no .multi-line class, no line-clamp style", () => {
    const wrapper = mountWithProviders(TruncatingLabel, { slots: { default: "Kniebeuge" } });

    expect(wrapper.classes()).not.toContain("multi-line");
    expect(wrapper.attributes("style")).toBeUndefined();
  });

  it("stays single-line for an explicit lines=1", () => {
    const wrapper = mountWithProviders(TruncatingLabel, { props: { lines: 1 }, slots: { default: "Kniebeuge" } });

    expect(wrapper.classes()).not.toContain("multi-line");
    expect(wrapper.attributes("style")).toBeUndefined();
  });

  it("switches to multi-line clamping once lines > 1, setting the webkit line-clamp style", () => {
    const wrapper = mountWithProviders(TruncatingLabel, { props: { lines: 3 }, slots: { default: "Kniebeuge" } });

    expect(wrapper.classes()).toContain("multi-line");
    const style = wrapper.attributes("style") ?? "";
    expect(style).toContain("-webkit-line-clamp: 3");
  });
});
