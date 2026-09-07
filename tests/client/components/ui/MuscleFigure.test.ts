import { describe, expect, it } from "vitest";
import MuscleFigure from "~client/components/ui/MuscleFigure.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("MuscleFigure", () => {
  it("always renders the front and back body outline images", () => {
    const wrapper = mountWithProviders(MuscleFigure, { props: {} });

    const srcs = wrapper.findAll("img").map((img) => img.attributes("src"));
    expect(srcs).toContain("/images/muscles/front-body.svg");
    expect(srcs).toContain("/images/muscles/back-body.svg");
  });

  it("renders no overlays when no primary/secondary/heat props are given", () => {
    const wrapper = mountWithProviders(MuscleFigure, { props: {} });
    expect(wrapper.findAll("img.overlay")).toHaveLength(0);
  });

  describe("trained-muscle mode (primary/secondary props)", () => {
    it("renders a 'main' overlay for a primary front muscle (chest, id 4)", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { primary: ["chest"] } });

      const overlays = wrapper.findAll("img.overlay").map((img) => img.attributes("src"));
      expect(overlays).toContain("/images/muscles/main/muscle-4.svg");
    });

    it("renders a 'secondary' overlay for a secondary muscle", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { secondary: ["biceps"] } });

      const overlays = wrapper.findAll("img.overlay").map((img) => img.attributes("src"));
      expect(overlays).toContain("/images/muscles/secondary/muscle-1.svg");
    });

    it("gives primary precedence when a slug appears in both primary and secondary", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { primary: ["chest"], secondary: ["chest"] } });

      const overlays = wrapper.findAll("img.overlay").map((img) => img.attributes("src"));
      expect(overlays).toContain("/images/muscles/main/muscle-4.svg");
      expect(overlays).not.toContain("/images/muscles/secondary/muscle-4.svg");
      expect(overlays.filter((s) => s === "/images/muscles/main/muscle-4.svg")).toHaveLength(1);
    });

    it("places a front muscle's overlay in the front figure and a back muscle's in the back figure", () => {
      // chest (front:true) and lats (front:false)
      const wrapper = mountWithProviders(MuscleFigure, { props: { primary: ["chest", "lats"] } });
      const figs = wrapper.findAll(".fig");
      expect(figs).toHaveLength(2);

      const frontImgs = figs[0]!.findAll("img").map((img) => img.attributes("src"));
      const backImgs = figs[1]!.findAll("img").map((img) => img.attributes("src"));

      expect(frontImgs).toContain("/images/muscles/main/muscle-4.svg"); // chest
      expect(backImgs).toContain("/images/muscles/main/muscle-12.svg"); // lats
      expect(frontImgs).not.toContain("/images/muscles/main/muscle-12.svg");
      expect(backImgs).not.toContain("/images/muscles/main/muscle-4.svg");
    });

    it("ignores an unknown muscle slug rather than throwing", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { primary: ["not-a-real-muscle"] } });
      expect(wrapper.findAll("img.overlay")).toHaveLength(0);
    });
  });

  describe("heat mode (heat prop)", () => {
    it("overrides primary/secondary rendering entirely when heat is set", () => {
      const wrapper = mountWithProviders(MuscleFigure, {
        props: { primary: ["biceps"], heat: { chest: 0.9 } },
      });

      const overlays = wrapper.findAll("img.overlay").map((img) => img.attributes("src"));
      expect(overlays).toContain("/images/muscles/main/muscle-4.svg"); // chest, from heat
      expect(overlays).not.toContain("/images/muscles/main/muscle-1.svg"); // biceps, ignored (primary mode not used)
    });

    it("renders a 'fatigue' overlay for a muscle below the 0.5 readiness midpoint", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { heat: { chest: 0.1 } } });

      const overlay = wrapper.find("img.overlay");
      expect(overlay.attributes("src")).toBe("/images/muscles/fatigue/muscle-4.svg");
    });

    it("renders a 'main' overlay for a muscle at/above the 0.5 readiness midpoint", () => {
      const wrapper = mountWithProviders(MuscleFigure, { props: { heat: { chest: 0.9 } } });

      const overlay = wrapper.find("img.overlay");
      expect(overlay.attributes("src")).toBe("/images/muscles/main/muscle-4.svg");
    });

    it("fades in a fatigue overlay's opacity as readiness approaches the 0.5 midpoint from below", () => {
      const lowReadiness = mountWithProviders(MuscleFigure, { props: { heat: { chest: 0.0 } } });
      const nearMidReadiness = mountWithProviders(MuscleFigure, { props: { heat: { chest: 0.49 } } });

      const lowOpacity = Number((lowReadiness.find("img.overlay").attributes("style") ?? "").match(/opacity:\s*([\d.]+)/)?.[1]);
      const nearMidOpacity = Number(
        (nearMidReadiness.find("img.overlay").attributes("style") ?? "").match(/opacity:\s*([\d.]+)/)?.[1],
      );

      // fatigue opacity = 0.45 + 0.55*(1 - readiness*2): highest at readiness=0, lower near 0.5
      expect(lowOpacity).toBeCloseTo(1.0, 5);
      expect(nearMidOpacity).toBeLessThan(lowOpacity);
    });

    it("renders one overlay per heat entry, split across front/back figures", () => {
      // chest is front, triceps is back
      const wrapper = mountWithProviders(MuscleFigure, { props: { heat: { chest: 0.8, triceps: 0.2 } } });
      const figs = wrapper.findAll(".fig");

      const frontImgs = figs[0]!.findAll("img.overlay").map((img) => img.attributes("src"));
      const backImgs = figs[1]!.findAll("img.overlay").map((img) => img.attributes("src"));

      expect(frontImgs).toEqual(["/images/muscles/main/muscle-4.svg"]);
      expect(backImgs).toEqual(["/images/muscles/fatigue/muscle-5.svg"]);
    });
  });

  it("applies a custom size via the --fig-w CSS variable", () => {
    const wrapper = mountWithProviders(MuscleFigure, { props: { size: 150 } });
    expect(wrapper.find(".muscle-figure").attributes("style")).toContain("--fig-w: 150px");
  });

  it("defaults to a 96px figure width when size isn't given", () => {
    const wrapper = mountWithProviders(MuscleFigure, { props: {} });
    expect(wrapper.find(".muscle-figure").attributes("style")).toContain("--fig-w: 96px");
  });
});
