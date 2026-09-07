import { describe, expect, it } from "vitest";
import ExerciseHistoryList from "~client/components/exercise/ExerciseHistoryList.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface HistorySet {
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

function makeSet(overrides: Partial<HistorySet> = {}): HistorySet {
  return { weightKg: 60, reps: 5, loggedAt: "2026-01-01T10:00:00.000Z", isWarmup: false, ...overrides };
}

describe("ExerciseHistoryList", () => {
  it("shows the empty-history message when there are no sets", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, { props: { sets: [] } });

    expect(wrapper.text()).toContain("Diese Übung hast du noch nie geloggt.");
    expect(wrapper.find(".day-group").exists()).toBe(false);
  });

  it("formats a loaded set as weight × reps", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, {
      props: { sets: [makeSet({ weightKg: 82.5, reps: 5 })] },
    });

    expect(wrapper.find(".set-value").text()).toBe("82.5 kg × 5");
  });

  it("formats a bodyweight set (weightKg null) as reps only", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, {
      props: { sets: [makeSet({ weightKg: null, reps: 12 })] },
    });

    expect(wrapper.find(".set-value").text()).toBe("12 Wdh.");
  });

  it("rounds weightKg to 2 decimal places", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, {
      props: { sets: [makeSet({ weightKg: 60.126, reps: 5 })] },
    });

    expect(wrapper.find(".set-value").text()).toBe("60.13 kg × 5");
  });

  it("marks a warmup set with the warmup class and an 'Aufwärmen' marker", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, {
      props: { sets: [makeSet({ isWarmup: true })] },
    });

    const row = wrapper.find(".set-row");
    expect(row.classes()).toContain("warmup");
    expect(row.find(".warmup-marker").text()).toBe("Aufwärmen");
  });

  it("does not render a warmup marker for a working set", () => {
    const wrapper = mountWithProviders(ExerciseHistoryList, {
      props: { sets: [makeSet({ isWarmup: false })] },
    });

    const row = wrapper.find(".set-row");
    expect(row.classes()).not.toContain("warmup");
    expect(row.find(".warmup-marker").exists()).toBe(false);
  });

  it("groups sets by calendar day, newest day first", () => {
    const sets = [
      makeSet({ loggedAt: "2026-01-01T10:00:00.000Z", reps: 1 }),
      makeSet({ loggedAt: "2026-01-03T10:00:00.000Z", reps: 3 }),
      makeSet({ loggedAt: "2026-01-02T10:00:00.000Z", reps: 2 }),
    ];
    const wrapper = mountWithProviders(ExerciseHistoryList, { props: { sets } });

    const dayLabels = wrapper.findAll(".day-label").map((d) => d.text());
    const expected = ["2026-01-03", "2026-01-02", "2026-01-01"].map((day) =>
      new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
    );
    expect(dayLabels).toEqual(expected);
  });

  it("orders sets within a day newest first", () => {
    const sets = [
      makeSet({ loggedAt: "2026-01-01T08:00:00.000Z", reps: 1 }),
      makeSet({ loggedAt: "2026-01-01T18:00:00.000Z", reps: 2 }),
      makeSet({ loggedAt: "2026-01-01T12:00:00.000Z", reps: 3 }),
    ];
    const wrapper = mountWithProviders(ExerciseHistoryList, { props: { sets } });

    const values = wrapper.findAll(".set-value").map((v) => v.text());
    expect(values).toEqual(["60 kg × 2", "60 kg × 3", "60 kg × 1"]);
  });
});
