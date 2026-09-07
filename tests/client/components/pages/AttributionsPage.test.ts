import { describe, expect, it } from "vitest";
import AttributionsPage from "~client/pages/AttributionsPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("AttributionsPage", () => {
  it("renders the licenses list with every third-party source", () => {
    const wrapper = mountWithProviders(AttributionsPage);

    expect(wrapper.text()).toContain("Quellen & Lizenzen");
    expect(wrapper.text()).toContain("wger Exercise Database");
    expect(wrapper.text()).toContain("OpenStreetMap");
    expect(wrapper.text()).toContain("OpenPowerlifting");
    expect(wrapper.findAll("li.surface-hybrid")).toHaveLength(6);
  });
});
