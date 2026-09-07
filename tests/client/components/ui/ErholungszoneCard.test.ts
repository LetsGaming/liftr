import { describe, expect, it } from "vitest";
import ErholungszoneCard from "~client/components/ui/ErholungszoneCard.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("ErholungszoneCard", () => {
  it("renders the loading skeleton (not the real content) while loaded is false", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: [], loaded: false, canStart: false },
    });

    expect(wrapper.find(".ez-skeleton").exists()).toBe(true);
    expect(wrapper.find(".ez-eyebrow").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Erholungszone");
  });

  it("renders the real card with the eyebrow once loaded", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: [], loaded: true, canStart: false },
    });

    expect(wrapper.find(".ez-skeleton").exists()).toBe(false);
    expect(wrapper.text()).toContain("Erholungszone");
    expect(wrapper.text()).toContain("DEIN STATUS");
  });

  it("shows the no-clear-winner verdict when recoveredSlugs is empty", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: [], loaded: true, canStart: false },
    });

    expect(wrapper.text()).toContain("Keine Muskelgruppe ist gerade eindeutig erholt");
  });

  it("names a single recovered muscle with the German label and singular verb", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: ["chest"], loaded: true, canStart: false },
    });

    expect(wrapper.text()).toContain("Brust ist vollständig erholt.");
  });

  it("joins multiple recovered muscles with commas and 'und', using the plural verb", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: ["chest", "biceps", "quads"], loaded: true, canStart: false },
    });

    expect(wrapper.text()).toContain("Brust, Bizeps und Quadrizeps sind vollständig erholt.");
  });

  it("caps the named muscles at the first three even if more are recovered", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: ["chest", "biceps", "quads", "glutes", "calves"], loaded: true, canStart: false },
    });

    expect(wrapper.text()).toContain("Brust, Bizeps und Quadrizeps sind vollständig erholt.");
    expect(wrapper.text()).not.toContain("Gesäß");
    expect(wrapper.text()).not.toContain("Waden");
  });

  it("falls back to the raw slug for an unknown muscle slug", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: ["mystery-muscle"], loaded: true, canStart: false },
    });

    expect(wrapper.text()).toContain("mystery-muscle ist vollständig erholt.");
  });

  it("hides the CTA button when canStart is false (no routine to jump into yet)", () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: [], loaded: true, canStart: false },
    });

    expect(wrapper.find("button.btn-primary").exists()).toBe(false);
  });

  it("shows the CTA and emits 'start' on click when canStart is true", async () => {
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat: {}, recoveredSlugs: [], loaded: true, canStart: true },
    });

    const cta = wrapper.find("button.btn-primary");
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toContain("Jetzt trainieren");

    await cta.trigger("click");

    expect(wrapper.emitted("start")).toHaveLength(1);
  });

  it("passes the heat map down to the MuscleFigure child", () => {
    const heat = { chest: 0.9, triceps: 0.2 };
    const wrapper = mountWithProviders(ErholungszoneCard, {
      props: { heat, recoveredSlugs: [], loaded: true, canStart: false },
    });

    // MuscleFigure renders one <img> per known muscle overlay when a heat map is set — with
    // two entries here (chest front, triceps back) it should render at least those two overlays
    // in addition to the two base body outlines.
    const imgs = wrapper.findAll("img");
    expect(imgs.length).toBeGreaterThanOrEqual(4);
  });
});
