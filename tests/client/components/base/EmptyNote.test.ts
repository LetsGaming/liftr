import { describe, expect, it } from "vitest";
import EmptyNote from "~client/components/base/EmptyNote.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("EmptyNote", () => {
  it("renders a <p class=\"empty-note\"> with center alignment by default", () => {
    const wrapper = mountWithProviders(EmptyNote, { slots: { default: "Noch nichts hier." } });
    expect(wrapper.element.tagName).toBe("P");
    expect(wrapper.classes()).toContain("empty-note");
    expect(wrapper.classes()).toContain("align-center");
    expect(wrapper.text()).toBe("Noch nichts hier.");
  });

  it("applies the start alignment class when requested", () => {
    const wrapper = mountWithProviders(EmptyNote, { props: { align: "start" } });
    expect(wrapper.classes()).toContain("align-start");
    expect(wrapper.classes()).not.toContain("align-center");
  });

  it("forwards an arbitrary class and data attribute to the <p> element itself", () => {
    const wrapper = mountWithProviders(EmptyNote, { attrs: { class: "tile-empty", "data-testid": "empty" } });
    expect(wrapper.classes()).toContain("tile-empty");
    expect(wrapper.classes()).toContain("empty-note");
    expect(wrapper.attributes("data-testid")).toBe("empty");
  });
});
