import { describe, expect, it } from "vitest";
import StatTile from "~client/components/ui/StatTile.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("StatTile", () => {
  it("renders the value and label", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 42, label: "Tage Serie" } });

    expect(wrapper.find("b").text()).toBe("42");
    expect(wrapper.find("span").text()).toBe("Tage Serie");
  });

  it("accepts a numeric or string value verbatim", () => {
    const numeric = mountWithProviders(StatTile, { props: { value: 7 } });
    expect(numeric.find("b").text()).toBe("7");

    const stringy = mountWithProviders(StatTile, { props: { value: "LEHRLING I" } });
    expect(stringy.find("b").text()).toBe("LEHRLING I");
  });

  it("defaults to the flat .panel look, not .panel-reward", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 1 } });
    const tile = wrapper.find(".stat-tile");

    expect(tile.classes()).toContain("panel");
    expect(tile.classes()).not.toContain("panel-reward");
  });

  it("switches to .panel-reward when reward is true", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 1, reward: true } });
    const tile = wrapper.find(".stat-tile");

    expect(tile.classes()).toContain("panel-reward");
    expect(tile.classes()).not.toContain("panel");
  });

  it("carries no accent class by default", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 1 } });
    const value = wrapper.find("b");

    expect(value.classes()).not.toContain("accent-fire");
    expect(value.classes()).not.toContain("accent-blue");
  });

  it("applies accent-fire for the streak tile's fire accent", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 1, accent: "fire" } });
    expect(wrapper.find("b").classes()).toContain("accent-fire");
  });

  it("applies accent-blue for the level tile's blue accent", () => {
    const wrapper = mountWithProviders(StatTile, { props: { value: 1, accent: "blue" } });
    expect(wrapper.find("b").classes()).toContain("accent-blue");
  });

  it("lets the #label slot override the label prop, e.g. for a streak's flame icon", () => {
    const wrapper = mountWithProviders(StatTile, {
      props: { value: 3, label: "ignored when slot is used" },
      slots: { label: "<span>🔥 3 Tage</span>" },
    });

    expect(wrapper.find("span").text()).toBe("🔥 3 Tage");
    expect(wrapper.text()).not.toContain("ignored when slot is used");
  });
});
