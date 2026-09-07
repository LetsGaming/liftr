import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import RankDistributionDonut from "~client/components/rank/RankDistributionDonut.vue";
import { TIER_LABEL_DE } from "~client/lib/tierIcons";
import { useRanksStore, type RankRow } from "~client/stores/ranksStore";
import { i18n } from "~client/i18n";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function makeRow(overrides: Partial<RankRow> = {}): RankRow {
  return {
    exerciseId: "ex-1",
    slug: "bench-press",
    name: null,
    isBodyweight: false,
    tier: "initiate",
    division: 3,
    lp: 50,
    e1rm: 80,
    trust: "real",
    nextTargetWeightKg: 90,
    nextTargetReps: 5,
    peakTier: null,
    peakDivision: null,
    ...overrides,
  };
}

/** Component reads ranksStore directly rather than via props — seed a fresh, active pinia
 *  before mounting so the very first render already sees the intended state (no need to patch
 *  and await a re-render afterward). */
function mountDonut(rows: RankRow[], loaded = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRanksStore();
  store.$patch({ ranks: rows, loaded });
  return mountWithProviders(RankDistributionDonut, {
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

describe("RankDistributionDonut", () => {
  it("renders nothing while the store hasn't loaded yet", () => {
    const wrapper = mountDonut([], false);
    expect(wrapper.find(".rank-donut").exists()).toBe(false);
  });

  it("renders nothing once loaded but with zero exercises", () => {
    const wrapper = mountDonut([], true);
    expect(wrapper.find(".rank-donut").exists()).toBe(false);
  });

  it("shows the total exercise count in the center label", () => {
    const wrapper = mountDonut([makeRow({ exerciseId: "a", tier: "initiate" }), makeRow({ exerciseId: "b", tier: "advanced" })]);

    expect(wrapper.find(".rd-total").text()).toBe("2");
    expect(wrapper.find(".rd-total-label").text()).toBe("Übungen");
  });

  it("draws one full circle (100%) for a single tier, in tier-order-skipping-empties order otherwise", () => {
    const rows = [
      makeRow({ exerciseId: "a", tier: "initiate" }),
      makeRow({ exerciseId: "b", tier: "initiate" }),
      makeRow({ exerciseId: "c", tier: "advanced" }),
      makeRow({ exerciseId: "d", tier: "apex" }),
    ];
    const wrapper = mountDonut(rows);

    // total=4: initiate=2 (50%), advanced=1 (25%), apex=1 (25%) — tiers with zero count
    // (apprentice, trainee, athlete, lifter, elite, expert) contribute no segment/legend row.
    const legendRows = wrapper.findAll(".rd-legend-row");
    expect(legendRows).toHaveLength(3);
    expect(legendRows.map((r) => r.find(".rd-legend-label").text())).toEqual([
      TIER_LABEL_DE.initiate,
      TIER_LABEL_DE.advanced,
      TIER_LABEL_DE.apex,
    ]);
    expect(legendRows.map((r) => r.find(".rd-legend-count").text())).toEqual(["2", "1", "1"]);

    const arcCircles = wrapper.findAll(".rd-svg circle[stroke-dasharray]");
    expect(arcCircles).toHaveLength(3);

    const initiateArc = (2 / 4) * CIRCUMFERENCE;
    const advancedArc = (1 / 4) * CIRCUMFERENCE;
    const apexArc = (1 / 4) * CIRCUMFERENCE;

    expect(arcCircles[0]!.attributes("stroke-dasharray")).toBe(`${initiateArc} ${CIRCUMFERENCE - initiateArc}`);
    expect(arcCircles[0]!.attributes("stroke-dashoffset")).toBe("0");
    expect(arcCircles[0]!.attributes("stroke")).toBe("var(--initiate-3)");

    expect(arcCircles[1]!.attributes("stroke-dasharray")).toBe(`${advancedArc} ${CIRCUMFERENCE - advancedArc}`);
    expect(arcCircles[1]!.attributes("stroke-dashoffset")).toBe(`-${initiateArc}`);
    expect(arcCircles[1]!.attributes("stroke")).toBe("var(--advanced-3)");

    expect(arcCircles[2]!.attributes("stroke-dasharray")).toBe(`${apexArc} ${CIRCUMFERENCE - apexArc}`);
    expect(arcCircles[2]!.attributes("stroke-dashoffset")).toBe(`-${initiateArc + advancedArc}`);
    expect(arcCircles[2]!.attributes("stroke")).toBe("var(--apex-3)");
  });

  it("draws a single full-circle segment (100%) when every exercise sits in the same tier", () => {
    const rows = [makeRow({ exerciseId: "a", tier: "elite" }), makeRow({ exerciseId: "b", tier: "elite" })];
    const wrapper = mountDonut(rows);

    const arcCircles = wrapper.findAll(".rd-svg circle[stroke-dasharray]");
    expect(arcCircles).toHaveLength(1);
    expect(arcCircles[0]!.attributes("stroke-dasharray")).toBe(`${CIRCUMFERENCE} 0`);
    expect(arcCircles[0]!.attributes("stroke-dashoffset")).toBe("0");

    const legendRows = wrapper.findAll(".rd-legend-row");
    expect(legendRows).toHaveLength(1);
    expect(legendRows[0]!.find(".rd-legend-count").text()).toBe("2");
  });

  it("renders exactly one exercise (edge case) as a single 100% segment with count 1", () => {
    const wrapper = mountDonut([makeRow({ exerciseId: "solo", tier: "trainee" })]);

    expect(wrapper.find(".rd-total").text()).toBe("1");
    const legendRows = wrapper.findAll(".rd-legend-row");
    expect(legendRows).toHaveLength(1);
    expect(legendRows[0]!.find(".rd-legend-count").text()).toBe("1");
  });

  it("marks every arc circle as aria-hidden (fully redundant with the legend's own text)", () => {
    const wrapper = mountDonut([makeRow({ exerciseId: "a", tier: "initiate" })]);

    const arcCircles = wrapper.findAll(".rd-svg circle");
    for (const circle of arcCircles) {
      expect(circle.attributes("aria-hidden")).toBe("true");
    }
  });
});
