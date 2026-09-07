import { describe, expect, it } from "vitest";
import ProgressChart from "~client/components/rank/ProgressChart.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface HistorySet {
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

function set(overrides: Partial<HistorySet> = {}): HistorySet {
  return { weightKg: 100, reps: 10, loggedAt: "2026-01-01", isWarmup: false, ...overrides };
}

describe("ProgressChart", () => {
  it("renders the empty-state message and no sparkline/latest readout when there are no sets", () => {
    const wrapper = mountWithProviders(ProgressChart, { props: { sets: [], isBodyweight: false } });

    expect(wrapper.find(".empty").exists()).toBe(true);
    expect(wrapper.text()).toContain("Ab dem zweiten Trainingstag zeichnet sich hier eine Kurve.");
    expect(wrapper.find("svg.spark").exists()).toBe(false);
    expect(wrapper.find(".latest").exists()).toBe(false);
  });

  it("shows the empty-state message plus a latest readout (no sparkline) for a single day of data", () => {
    const wrapper = mountWithProviders(ProgressChart, {
      props: { sets: [set({ weightKg: 100, reps: 10, loggedAt: "2026-01-01" })], isBodyweight: false },
    });

    // Only one data point: still below the >=2 threshold for a polyline.
    expect(wrapper.find("svg.spark").exists()).toBe(false);
    expect(wrapper.find(".empty").exists()).toBe(true);
    // But `latest` only needs one point, so the readout renders independently.
    expect(wrapper.find(".latest").exists()).toBe(true);
    // e1rm = 100 * (1 + 10/30) = 133.33... -> rounds to 133
    expect(wrapper.find(".latest").text()).toBe("133 kg e1RM");
  });

  it("excludes warmup sets from the series entirely", () => {
    const wrapper = mountWithProviders(ProgressChart, {
      props: {
        sets: [set({ weightKg: 999, reps: 10, loggedAt: "2026-01-01", isWarmup: true })],
        isBodyweight: false,
      },
    });

    // The only set is a warmup, so the series is empty, same as passing no sets at all.
    expect(wrapper.find(".empty").exists()).toBe(true);
    expect(wrapper.find(".latest").exists()).toBe(false);
  });

  it("takes the best (max) value per calendar day when multiple non-warmup sets share a day", () => {
    const wrapper = mountWithProviders(ProgressChart, {
      props: {
        sets: [
          set({ weightKg: 80, reps: 10, loggedAt: "2026-01-01T09:00:00Z" }), // e1rm ~106.67
          set({ weightKg: 100, reps: 10, loggedAt: "2026-01-01T18:00:00Z" }), // e1rm ~133.33 (day's best)
        ],
        isBodyweight: false,
      },
    });

    expect(wrapper.find(".latest").text()).toBe("133 kg e1RM");
  });

  it("draws an ascending sparkline with exact SVG polyline coordinates and a green upward stroke", () => {
    const sets = [
      set({ weightKg: 100, reps: 10, loggedAt: "2026-01-01" }), // e1rm = 133.333...
      set({ weightKg: 120, reps: 10, loggedAt: "2026-01-03" }), // e1rm = 160
    ];
    const wrapper = mountWithProviders(ProgressChart, { props: { sets, isBodyweight: false } });

    const svg = wrapper.find("svg.spark");
    expect(svg.exists()).toBe(true);
    expect(svg.attributes("viewBox")).toBe("0 0 280 64");

    const polyline = svg.find("polyline");
    // W=280, H=64, PAD=4 -> first point x=4, last point x=276; min/max normalize y to
    // 60 (bottom, weakest) and 4 (top, strongest) for a strictly two-point series.
    expect(polyline.attributes("points")).toBe("4.0,60.0 276.0,4.0");
    expect(polyline.attributes("stroke")).toBe("var(--green)");

    expect(wrapper.find(".latest").text()).toBe("160 kg e1RM");
  });

  it("uses the dim (not accent) stroke and 'Abwärtstrend' label for a declining bodyweight-rep series", () => {
    const sets = [
      set({ reps: 12, loggedAt: "2026-02-01", weightKg: null }),
      set({ reps: 8, loggedAt: "2026-02-02", weightKg: null }),
    ];
    const wrapper = mountWithProviders(ProgressChart, { props: { sets, isBodyweight: true } });

    const polyline = wrapper.find("polyline");
    expect(polyline.attributes("stroke")).toBe("var(--dim)");
    expect(wrapper.find("svg.spark").attributes("aria-label")).toBe("Abwärtstrend, von 12 auf 8 Wdh.");
    expect(wrapper.find(".latest").text()).toBe("8 Wdh.");
  });

  it("labels an upward bodyweight-rep trend as 'Aufwärtstrend' with the Wdh. unit", () => {
    const sets = [
      set({ reps: 8, loggedAt: "2026-02-01", weightKg: null }),
      set({ reps: 12, loggedAt: "2026-02-02", weightKg: null }),
    ];
    const wrapper = mountWithProviders(ProgressChart, { props: { sets, isBodyweight: true } });

    expect(wrapper.find("svg.spark").attributes("aria-label")).toBe("Aufwärtstrend, von 8 auf 12 Wdh.");
  });

  it("labels a flat (equal start/end) trend as 'Gleichbleibender Verlauf'", () => {
    const sets = [
      set({ weightKg: 100, reps: 10, loggedAt: "2026-03-01" }),
      set({ weightKg: 100, reps: 10, loggedAt: "2026-03-02" }),
    ];
    const wrapper = mountWithProviders(ProgressChart, { props: { sets, isBodyweight: false } });

    expect(wrapper.find("svg.spark").attributes("aria-label")).toBe("Gleichbleibender Verlauf, von 133 auf 133 kg e1RM");
    // A flat trend is not "up" (last >= first is technically true when equal, so it still
    // renders green) — assert the label is right regardless of stroke color choice.
  });

  it("sorts sets by calendar day ascending regardless of input order", () => {
    const outOfOrder = [
      set({ weightKg: 120, reps: 10, loggedAt: "2026-01-03" }), // e1rm = 160
      set({ weightKg: 100, reps: 10, loggedAt: "2026-01-01" }), // e1rm = 133.33
    ];
    const sorted = [outOfOrder[1]!, outOfOrder[0]!];

    const a = mountWithProviders(ProgressChart, { props: { sets: outOfOrder, isBodyweight: false } });
    const b = mountWithProviders(ProgressChart, { props: { sets: sorted, isBodyweight: false } });

    expect(a.find("polyline").attributes("points")).toBe(b.find("polyline").attributes("points"));
    expect(a.find(".latest").text()).toBe(b.find(".latest").text());
  });
});
