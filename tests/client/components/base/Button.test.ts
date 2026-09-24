import { describe, expect, it } from "vitest";
import Button from "~client/components/base/Button.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("Button", () => {
  it("renders a button with btn-primary by default", () => {
    const wrapper = mountWithProviders(Button, { slots: { default: "Speichern" } });
    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.classes()).toContain("btn-primary");
    expect(wrapper.attributes("type")).toBe("button");
    expect(wrapper.text()).toBe("Speichern");
  });

  it("renders btn-secondary for the secondary variant", () => {
    const wrapper = mountWithProviders(Button, { props: { variant: "secondary" } });
    expect(wrapper.classes()).toContain("btn-secondary");
    expect(wrapper.classes()).not.toContain("btn-primary");
  });

  it("applies btn-lg and btn-block modifiers", () => {
    const wrapper = mountWithProviders(Button, { props: { size: "lg", block: true } });
    expect(wrapper.classes()).toContain("btn-lg");
    expect(wrapper.classes()).toContain("btn-block");
  });

  it("renders as an anchor with an href when as is 'a'", () => {
    const wrapper = mountWithProviders(Button, { props: { as: "a", to: "/foo" } });
    expect(wrapper.element.tagName).toBe("A");
    expect(wrapper.attributes("href")).toBe("/foo");
    expect(wrapper.attributes("type")).toBeUndefined();
  });

  it("renders as a router-link when as is 'router-link'", () => {
    const wrapper = mountWithProviders(Button, { props: { as: "router-link", to: "/foo" } });
    expect(wrapper.element.tagName).toBe("A");
    expect(wrapper.attributes("href")).toBe("/foo");
  });

  it("disables a real button via the disabled attribute", () => {
    const wrapper = mountWithProviders(Button, { props: { disabled: true } });
    expect(wrapper.attributes("disabled")).toBeDefined();
  });

  it("marks a non-button as aria-disabled instead of using the disabled attribute", () => {
    const wrapper = mountWithProviders(Button, { props: { as: "a", to: "/foo", disabled: true } });
    expect(wrapper.attributes("aria-disabled")).toBe("true");
    expect(wrapper.attributes("disabled")).toBeUndefined();
  });

  it("renders the leading and trailing slots only when provided", () => {
    const wrapper = mountWithProviders(Button, { slots: { leading: "<i>L</i>", trailing: "<i>T</i>", default: "Go" } });
    expect(wrapper.find(".btn-leading").exists()).toBe(true);
    expect(wrapper.find(".btn-trailing").exists()).toBe(true);

    const plain = mountWithProviders(Button, { slots: { default: "Go" } });
    expect(plain.find(".btn-leading").exists()).toBe(false);
    expect(plain.find(".btn-trailing").exists()).toBe(false);
  });

  it("forwards an arbitrary class and data attribute to the button element itself", () => {
    const wrapper = mountWithProviders(Button, { attrs: { class: "profile-save", "data-testid": "save" } });
    expect(wrapper.classes()).toContain("profile-save");
    expect(wrapper.classes()).toContain("btn-primary");
    expect(wrapper.attributes("data-testid")).toBe("save");
  });
});
