import { describe, expect, it } from "vitest";
import FormField from "~client/components/patterns/FormField.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("FormField", () => {
  it("renders the label and the default slot as the control", () => {
    const wrapper = mountWithProviders(FormField, {
      props: { label: "Geburtsjahr" },
      slots: { default: "<input />" },
    });
    expect(wrapper.find("label").text()).toBe("Geburtsjahr");
    expect(wrapper.find("input").exists()).toBe(true);
  });

  it("wires labelFor to the label's for attribute", () => {
    const wrapper = mountWithProviders(FormField, { props: { label: "Name", labelFor: "name-input" } });
    expect(wrapper.find("label").attributes("for")).toBe("name-input");
  });

  it("renders the hint when given and no error is present", () => {
    const wrapper = mountWithProviders(FormField, { props: { label: "Name", hint: "Optional" } });
    expect(wrapper.find(".hint").text()).toBe("Optional");
    expect(wrapper.find(".error").exists()).toBe(false);
  });

  it("renders the error instead of the hint when both are present", () => {
    const wrapper = mountWithProviders(FormField, { props: { label: "Name", hint: "Optional", error: "Pflichtfeld" } });
    expect(wrapper.find(".error").text()).toBe("Pflichtfeld");
    expect(wrapper.find(".hint").exists()).toBe(false);
  });

  it("renders neither hint nor error when not given", () => {
    const wrapper = mountWithProviders(FormField, { props: { label: "Name" } });
    expect(wrapper.find(".hint").exists()).toBe(false);
    expect(wrapper.find(".error").exists()).toBe(false);
  });

  it("lets the hint slot override the hint prop text", () => {
    const wrapper = mountWithProviders(FormField, {
      props: { label: "Name", hint: "fallback" },
      slots: { hint: "<span class='rich-hint'>Custom</span>" },
    });
    expect(wrapper.find(".hint .rich-hint").text()).toBe("Custom");
  });
});
