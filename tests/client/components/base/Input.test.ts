import { describe, expect, it } from "vitest";
import Input from "~client/components/base/Input.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("Input", () => {
  it("renders a text input by default inside a flat wrapper", () => {
    const wrapper = mountWithProviders(Input);
    const input = wrapper.find("input");
    expect(input.exists()).toBe(true);
    expect(input.attributes("type")).toBe("text");
    expect(wrapper.classes()).toContain("input-wrap-flat");
  });

  it("renders the hybrid wrapper when surface is hybrid", () => {
    const wrapper = mountWithProviders(Input, { props: { surface: "hybrid" } });
    expect(wrapper.classes()).toContain("input-wrap-hybrid");
  });

  it("applies the invalid class to the wrapper, not the input", () => {
    const wrapper = mountWithProviders(Input, { props: { invalid: true } });
    expect(wrapper.classes()).toContain("invalid");
  });

  it("round-trips v-model: typing updates the bound value and the bound value updates the input", async () => {
    const wrapper = mountWithProviders(Input, { props: { modelValue: "start" } });
    await wrapper.setProps({ "onUpdate:modelValue": (v: string | number | undefined) => wrapper.setProps({ modelValue: v }) });
    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("start");

    await input.setValue("changed");
    expect((input.element as HTMLInputElement).value).toBe("changed");

    await wrapper.setProps({ modelValue: "external" });
    expect((input.element as HTMLInputElement).value).toBe("external");
  });

  it("renders the trailing slot only when provided", () => {
    const withTrailing = mountWithProviders(Input, { slots: { trailing: "kg" } });
    expect(withTrailing.find(".input-trailing").exists()).toBe(true);

    const withoutTrailing = mountWithProviders(Input);
    expect(withoutTrailing.find(".input-trailing").exists()).toBe(false);
  });

  it("forwards an arbitrary class and data attribute to the <input> element, not the wrapper", () => {
    const wrapper = mountWithProviders(Input, { attrs: { class: "search-input", "data-testid": "q" } });
    const input = wrapper.find("input");
    expect(input.classes()).toContain("search-input");
    expect(input.attributes("data-testid")).toBe("q");
    expect(wrapper.classes()).not.toContain("search-input");
  });
});
