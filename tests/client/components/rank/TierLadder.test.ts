import { describe, expect, it } from "vitest";
import { TIER_DIVISION_COUNT, TIERS } from "@liftr/shared";
import TierLadder from "~client/components/rank/TierLadder.vue";
import { DIVISION_LABEL, TIER_LABEL_DE } from "~client/lib/tierIcons";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("TierLadder", () => {
  it("renders all 9 tiers, apex-first (reverse of TIERS)", () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: null } });

    const rungs = wrapper.findAll(".rung");
    expect(rungs).toHaveLength(TIERS.length);
    const labels = rungs.map((r) => r.find(".rung-label-row").text());
    expect(labels[0]).toContain(TIER_LABEL_DE.apex);
    expect(labels[labels.length - 1]).toContain(TIER_LABEL_DE.initiate);
  });

  it("with no currentTier, only Initiate is lit ('current'); everything else is 'ahead'", () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: null } });

    const rungs = wrapper.findAll(".rung");
    const initiateRung = rungs.find((r) => r.classes().includes("t-initiate"))!;
    expect(initiateRung.classes()).toContain("current");

    const others = rungs.filter((r) => !r.classes().includes("t-initiate"));
    for (const rung of others) {
      expect(rung.classes()).toContain("ahead");
    }
  });

  it("marks tiers below current as 'reached', the current tier as 'current', and above as 'ahead'", () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: "athlete", currentDivision: 2 } });

    const byTier = (tier: string) => wrapper.findAll(".rung").find((r) => r.classes().includes(`t-${tier}`))!;

    expect(byTier("initiate").classes()).toContain("reached");
    expect(byTier("apprentice").classes()).toContain("reached");
    expect(byTier("trainee").classes()).toContain("reached");
    expect(byTier("athlete").classes()).toContain("current");
    expect(byTier("lifter").classes()).toContain("ahead");
    expect(byTier("apex").classes()).toContain("ahead");
  });

  it("shows the current division badge on the current rung", () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: "athlete", currentDivision: 2 } });

    const currentRung = wrapper.findAll(".rung").find((r) => r.classes().includes("current"))!;
    expect(currentRung.find(".rung-label-row b").text()).toBe(DIVISION_LABEL[2]);
  });

  it("shows a division count ('N Stufen') on rungs that are ahead, not on reached/current ones", () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: "athlete", currentDivision: 2 } });

    const eliteRung = wrapper.findAll(".rung").find((r) => r.classes().includes("t-elite"))!;
    expect(eliteRung.find(".rung-count").text()).toBe(`${TIER_DIVISION_COUNT.elite} Stufen`);

    const currentRung = wrapper.findAll(".rung").find((r) => r.classes().includes("current"))!;
    expect(currentRung.find(".rung-count").exists()).toBe(false);
  });

  it("expands a rung's division list on click, showing count-down division chips, and collapses on a second click", async () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: null } });

    const advancedRung = wrapper.findAll(".rung").find((r) => r.classes().includes("t-advanced"))!;
    expect(advancedRung.find(".division-list").exists()).toBe(false);
    expect(advancedRung.find(".rung-row").attributes("aria-expanded")).toBe("false");

    await advancedRung.find(".rung-row").trigger("click");

    expect(advancedRung.find(".rung-row").attributes("aria-expanded")).toBe("true");
    const chips = advancedRung.findAll(".division-chip");
    // TIER_DIVISION_COUNT.advanced === 3, counting down III, II, I
    expect(chips.map((c) => c.text())).toEqual([DIVISION_LABEL[3], DIVISION_LABEL[2], DIVISION_LABEL[1]]);

    await advancedRung.find(".rung-row").trigger("click");

    expect(advancedRung.find(".division-list").exists()).toBe(false);
    expect(advancedRung.find(".rung-row").attributes("aria-expanded")).toBe("false");
  });

  it("acts as an accordion: expanding a second rung collapses the first", async () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: null } });

    const advancedRung = wrapper.findAll(".rung").find((r) => r.classes().includes("t-advanced"))!;
    const eliteRung = wrapper.findAll(".rung").find((r) => r.classes().includes("t-elite"))!;

    await advancedRung.find(".rung-row").trigger("click");
    expect(advancedRung.find(".division-list").exists()).toBe(true);

    await eliteRung.find(".rung-row").trigger("click");

    expect(advancedRung.find(".division-list").exists()).toBe(false);
    expect(eliteRung.find(".division-list").exists()).toBe(true);
  });

  it("marks the matching division chip as 'current' only inside the currently-expanded current rung", async () => {
    const wrapper = mountWithProviders(TierLadder, { props: { currentTier: "athlete", currentDivision: 2 } });

    const currentRung = wrapper.findAll(".rung").find((r) => r.classes().includes("current"))!;
    await currentRung.find(".rung-row").trigger("click");

    const chips = currentRung.findAll(".division-chip");
    const currentChip = chips.find((c) => c.classes().includes("current"))!;
    expect(currentChip.text()).toBe(DIVISION_LABEL[2]);
  });

  it("shows a peak caption on the current rung when the current position is below peak", () => {
    const wrapper = mountWithProviders(TierLadder, {
      props: { currentTier: "initiate", currentDivision: 5, peakTier: "initiate", peakDivision: 1 },
    });

    const currentRung = wrapper.findAll(".rung").find((r) => r.classes().includes("current"))!;
    expect(currentRung.find(".rung-peak").text()).toBe(`Schon mal erreicht: ${TIER_LABEL_DE.initiate} ${DIVISION_LABEL[1]}`);
  });

  it("shows no peak caption when currently at peak, or when no peak data is supplied", () => {
    const atPeak = mountWithProviders(TierLadder, {
      props: { currentTier: "initiate", currentDivision: 1, peakTier: "initiate", peakDivision: 1 },
    });
    expect(atPeak.find(".rung-peak").exists()).toBe(false);

    const noPeakData = mountWithProviders(TierLadder, { props: { currentTier: "initiate", currentDivision: 5 } });
    expect(noPeakData.find(".rung-peak").exists()).toBe(false);
  });
});
