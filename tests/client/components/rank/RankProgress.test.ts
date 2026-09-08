import { describe, expect, it } from "vitest";
import RankProgress from "~client/components/rank/RankProgress.vue";
import { TIER_BADGE_PATH, TIER_LABEL_DE, DIVISION_LABEL } from "~client/lib/tierIcons";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("RankProgress", () => {
  it("renders the tier badge path, label, division and LP for a basic card", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 57 },
    });

    expect(wrapper.classes()).toContain("t-athlete");
    expect(wrapper.classes()).toContain("card");
    expect(wrapper.find(".badge svg path").attributes("d")).toBe(TIER_BADGE_PATH.athlete);
    expect(wrapper.find(".rp-tier").text()).toContain(TIER_LABEL_DE.athlete);
    expect(wrapper.find(".rp-tier").text()).toContain(DIVISION_LABEL[2]);
    expect(wrapper.find(".rp-lp").text()).toBe("57 LP");
  });

  it("rounds a fractional lp for display", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "lifter", division: 1, lp: 57.6 } });
    expect(wrapper.find(".rp-lp").text()).toBe("58 LP");
  });

  it.each([
    [-15, 0],
    [0, 0],
    [150, 100],
    [100, 100],
  ])("clamps lp=%d to %d for both the readout and the bar-fill scaleX below the top band", (lp, expected) => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "initiate", division: 5, lp } });

    expect(wrapper.find(".rp-lp").text()).toBe(`${expected} LP`);
    expect(wrapper.find(".bar-fill").attributes("style")).toContain(`scaleX(${expected / 100})`);
  });

  it("shows an uncapped readout and a full bar for a top-band rank past 100 lp", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "apex", division: 1, lp: 250 } });

    expect(wrapper.find(".rp-lp").text()).toBe("250 LP");
    expect(wrapper.find(".bar-fill").attributes("style")).toContain("scaleX(1)");
  });

  it("shows a partially-filled bar for a decayed top-band rank (does not hardcode a full bar at apex)", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "apex", division: 1, lp: 40 } });

    expect(wrapper.find(".rp-lp").text()).toBe("40 LP");
    expect(wrapper.find(".bar-fill").attributes("style")).toContain("scaleX(0.4)");
  });

  it("rounds a fractional uncapped top-band lp for display", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "apex", division: 1, lp: 250.6 } });

    expect(wrapper.find(".rp-lp").text()).toBe("251 LP");
  });

  it("shows no trust marker/caption for the default 'real' trust", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "trainee", division: 3, lp: 10 } });

    expect(wrapper.find(".trust-marker").exists()).toBe(false);
    expect(wrapper.find(".rp-trust").exists()).toBe(false);
  });

  it("shows a '≈' marker and 'Abgeleiteter Standard' caption for a derived trust level", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "trainee", division: 3, lp: 10, trust: "derived" },
    });

    expect(wrapper.find(".trust-marker").exists()).toBe(true);
    expect(wrapper.find(".rp-trust").text()).toBe("Abgeleiteter Standard");
  });

  it("shows 'Geschätzter Standard' for a synthetic trust level", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "trainee", division: 3, lp: 10, trust: "synthetic" },
    });

    expect(wrapper.find(".rp-trust").text()).toBe("Geschätzter Standard");
  });

  it("shows '???' as the next target when nextTargetReps is null (top of modeled standards)", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "apex", division: 1, lp: 100, nextTargetReps: null, nextTargetWeightKg: null },
    });

    expect(wrapper.find(".rp-next").text()).toBe("Nächstes Ziel: ???");
  });

  it("shows a weight x reps next target when both are present", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 40, nextTargetWeightKg: 82.5, nextTargetReps: 6 },
    });

    expect(wrapper.find(".rp-next").text()).toBe("Nächstes Ziel: 82.5 kg × 6");
  });

  it("shows a reps-only next target for a bodyweight exercise (no weight target)", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 40, nextTargetWeightKg: null, nextTargetReps: 12 },
    });

    expect(wrapper.find(".rp-next").text()).toBe("Nächstes Ziel: 12 Wdh.");
  });

  it("shows a decay caption naming the peak when the current position is below peak", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: {
        tier: "initiate",
        division: 5,
        lp: 10,
        peakTier: "initiate",
        peakDivision: 1,
      },
    });

    expect(wrapper.find(".rp-decay").exists()).toBe(true);
    expect(wrapper.find(".rp-decay").text()).toBe(`Schon mal erreicht: ${TIER_LABEL_DE.initiate} ${DIVISION_LABEL[1]}`);
  });

  it("shows no decay caption when currently at or above the peak", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: {
        tier: "initiate",
        division: 1,
        lp: 10,
        peakTier: "initiate",
        peakDivision: 1,
      },
    });

    expect(wrapper.find(".rp-decay").exists()).toBe(false);
  });

  it("shows no decay caption when no peak data is supplied", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "initiate", division: 5, lp: 10 } });
    expect(wrapper.find(".rp-decay").exists()).toBe(false);
  });

  it("renders an optional one-time recovery-gain caption when provided", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 40, recoveryGainLabel: "+18 LP" },
    });

    expect(wrapper.find(".rp-recovery").text()).toBe("+18 LP");
  });

  it("renders an optional plausibility note when provided", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 40, plausibilityNote: "Reduziert wegen ungewöhnlicher Steigerung." },
    });

    expect(wrapper.find(".rp-plausibility").text()).toBe("Reduziert wegen ungewöhnlicher Steigerung.");
  });

  it("applies the 'inline' variant class (and panel-reward) instead of 'card' when requested", () => {
    const wrapper = mountWithProviders(RankProgress, {
      props: { tier: "athlete", division: 2, lp: 40, variant: "inline" },
    });

    expect(wrapper.classes()).toContain("inline");
    expect(wrapper.classes()).toContain("panel-reward");
    expect(wrapper.classes()).not.toContain("card");
  });

  it("does not add panel-reward for the default 'card' variant", () => {
    const wrapper = mountWithProviders(RankProgress, { props: { tier: "athlete", division: 2, lp: 40 } });
    expect(wrapper.classes()).not.toContain("panel-reward");
  });
});
