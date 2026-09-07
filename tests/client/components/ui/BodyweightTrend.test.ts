import { describe, expect, it } from "vitest";
import BodyweightTrend from "~client/components/ui/BodyweightTrend.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

describe("BodyweightTrend", () => {
  it("renders nothing when there are no entries (computeBodyweightTrend returns null)", () => {
    const wrapper = mountWithProviders(BodyweightTrend, { props: { entries: [] } });

    expect(wrapper.find(".bw-trend").exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("renders the EMA weight, 'stabil' label, and no sparkline for a single entry", () => {
    const wrapper = mountWithProviders(BodyweightTrend, {
      props: { entries: [{ date: "2026-08-01", weightKg: 80 }] },
    });

    expect(wrapper.find(".bw-trend").exists()).toBe(true);
    expect(wrapper.text()).toContain("80.0 kg");
    expect(wrapper.text()).toContain("stabil");
    expect(wrapper.text()).toContain("0 Tage");
    // a single point can't draw a polyline
    expect(wrapper.find("svg.spark").exists()).toBe(false);
  });

  it("labels a clear upward EMA move as 'steigend' and draws a sparkline", () => {
    const entries = [
      { date: "2026-08-01", weightKg: 80 },
      { date: "2026-08-08", weightKg: 82 },
      { date: "2026-08-15", weightKg: 84 },
      { date: "2026-08-22", weightKg: 86 },
      { date: "2026-08-29", weightKg: 88 },
    ];
    const wrapper = mountWithProviders(BodyweightTrend, { props: { entries } });

    expect(wrapper.text()).toContain("steigend");
    const svg = wrapper.find("svg.spark");
    expect(svg.exists()).toBe(true);
    const polyline = svg.find("polyline");
    expect(polyline.exists()).toBe(true);
    // one point per entry
    expect(polyline.attributes("points")?.trim().split(/\s+/)).toHaveLength(entries.length);
  });

  it("labels a clear downward EMA move as 'fallend'", () => {
    const entries = [
      { date: "2026-08-01", weightKg: 88 },
      { date: "2026-08-08", weightKg: 86 },
      { date: "2026-08-15", weightKg: 84 },
      { date: "2026-08-22", weightKg: 82 },
      { date: "2026-08-29", weightKg: 80 },
    ];
    const wrapper = mountWithProviders(BodyweightTrend, { props: { entries } });

    expect(wrapper.text()).toContain("fallend");
  });

  it("labels a near-flat weight history as 'stabil' (inside the dead zone)", () => {
    const entries = [
      { date: "2026-08-01", weightKg: 80 },
      { date: "2026-08-08", weightKg: 80.05 },
      { date: "2026-08-15", weightKg: 79.95 },
      { date: "2026-08-22", weightKg: 80.05 },
    ];
    const wrapper = mountWithProviders(BodyweightTrend, { props: { entries } });

    expect(wrapper.text()).toContain("stabil");
  });

  it("sorts out-of-order entries by date before rendering the days-span and sparkline", () => {
    const outOfOrder = [
      { date: "2026-08-15", weightKg: 84 },
      { date: "2026-08-01", weightKg: 80 },
      { date: "2026-08-08", weightKg: 82 },
    ];
    const sorted = [outOfOrder[1]!, outOfOrder[2]!, outOfOrder[0]!];

    const a = mountWithProviders(BodyweightTrend, { props: { entries: outOfOrder } });
    const b = mountWithProviders(BodyweightTrend, { props: { entries: sorted } });

    expect(a.text()).toBe(b.text());
  });
});
