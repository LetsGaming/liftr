import { describe, expect, it } from "vitest";
import AppIcon from "~client/components/ui/AppIcon.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("AppIcon", () => {
  it("renders an svg with the requested icon's own name class and viewBox", () => {
    const wrapper = mountWithProviders(AppIcon, { props: { name: "flame" } });

    const svg = wrapper.find("svg");
    expect(svg.exists()).toBe(true);
    expect(svg.classes()).toContain("app-icon--flame");
    expect(svg.attributes("viewBox")).toBe("0 0 24 24");
  });

  it("renders different, non-empty path markup for different icon names", () => {
    const flame = mountWithProviders(AppIcon, { props: { name: "flame" } });
    const trophy = mountWithProviders(AppIcon, { props: { name: "trophy" } });

    const flameHtml = flame.find("svg").html();
    const trophyHtml = trophy.find("svg").html();
    expect(flameHtml).toContain("<path");
    expect(trophyHtml).toContain("<path");
    expect(flameHtml).not.toBe(trophyHtml);
  });

  it("switches the rendered path markup when the name prop changes", async () => {
    const wrapper = mountWithProviders(AppIcon, { props: { name: "play" } });
    const playHtml = wrapper.find("svg").html();

    await wrapper.setProps({ name: "pause" });

    const pauseHtml = wrapper.find("svg").html();
    expect(pauseHtml).not.toBe(playHtml);
    expect(wrapper.find("svg").classes()).toContain("app-icon--pause");
  });

  it("is aria-hidden (decorative, always paired with adjacent text)", () => {
    const wrapper = mountWithProviders(AppIcon, { props: { name: "check" } });
    expect(wrapper.find("svg").attributes("aria-hidden")).toBe("true");
  });

  it("has no fixed width/height style by default, sizing via the 1em CSS rule instead", () => {
    const wrapper = mountWithProviders(AppIcon, { props: { name: "check" } });
    expect(wrapper.find("svg").attributes("style")).toBeUndefined();
  });

  it("applies a fixed pixel size when the size prop is set", () => {
    const wrapper = mountWithProviders(AppIcon, { props: { name: "check", size: 32 } });
    const style = wrapper.find("svg").attributes("style");
    expect(style).toContain("width: 32px");
    expect(style).toContain("height: 32px");
  });
});
