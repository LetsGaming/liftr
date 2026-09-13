import { describe, expect, it } from "vitest";
import RanksPage from "~client/pages/RanksPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Kraft/Lauf section internals are covered at their own layer now (RankLifterSection.test.ts /
// RankRunnerSection.test.ts) — this page only owns the switcher and which section is mounted.
const STUBS = { RankLifterSection: true, RankRunnerSection: true };

describe("RanksPage", () => {
  it("mounts the Kraft section by default", () => {
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent({ name: "RankLifterSection" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "RankRunnerSection" }).exists()).toBe(false);
  });

  it("switches to the Lauf section on tap, unmounting Kraft", async () => {
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    const [kraftTab, laufTab] = wrapper.findAll(".switcher-pill");
    expect(kraftTab!.classes()).toContain("active");

    await laufTab!.trigger("click");

    expect(laufTab!.classes()).toContain("active");
    expect(wrapper.findComponent({ name: "RankRunnerSection" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "RankLifterSection" }).exists()).toBe(false);
  });

  it("always shows the Rekorde link regardless of which section is active", async () => {
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Rekorde ansehen");

    await wrapper.findAll(".switcher-pill")[1]!.trigger("click");
    expect(wrapper.text()).toContain("Rekorde ansehen");
  });
});
