import { describe, expect, it } from "vitest";
import Select from "~client/components/base/Select.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const OPTIONS = { slots: { default: '<option value="a">A</option><option value="b">B</option>' } };

describe("Select", () => {
  it("renders a select with the md size class by default", () => {
    const wrapper = mountWithProviders(Select, OPTIONS);
    const select = wrapper.find("select");
    expect(select.exists()).toBe(true);
    expect(select.classes()).toContain("select-md");
  });

  it("applies the lg size class", () => {
    const wrapper = mountWithProviders(Select, { props: { size: "lg" }, ...OPTIONS });
    expect(wrapper.find("select").classes()).toContain("select-lg");
  });

  it("applies the invalid class to the wrapper, not the select", () => {
    const wrapper = mountWithProviders(Select, { props: { invalid: true }, ...OPTIONS });
    expect(wrapper.classes()).toContain("invalid");
  });

  it("round-trips v-model: selecting an option updates the bound value and the bound value updates the selection", async () => {
    const wrapper = mountWithProviders(Select, { props: { modelValue: "a" }, ...OPTIONS });
    await wrapper.setProps({ "onUpdate:modelValue": (v: string | number | undefined) => wrapper.setProps({ modelValue: v }) });
    const select = wrapper.find("select");
    expect((select.element as HTMLSelectElement).value).toBe("a");

    await select.setValue("b");
    expect((select.element as HTMLSelectElement).value).toBe("b");

    await wrapper.setProps({ modelValue: "a" });
    expect((select.element as HTMLSelectElement).value).toBe("a");
  });

  it("forwards an arbitrary class and data attribute to the <select> element, not the wrapper", () => {
    const wrapper = mountWithProviders(Select, { attrs: { class: "filter-select", "data-testid": "f" }, ...OPTIONS });
    const select = wrapper.find("select");
    expect(select.classes()).toContain("filter-select");
    expect(select.attributes("data-testid")).toBe("f");
    expect(wrapper.classes()).not.toContain("filter-select");
  });
});
