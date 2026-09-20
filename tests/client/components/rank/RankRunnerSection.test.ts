import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RankProgress from "~client/components/rank/RankProgress.vue";
import RankRunnerSection from "~client/components/rank/RankRunnerSection.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Task 13: running rank section — sourced from Task 10's runRankStore, same store also used by
// RecordsPage's running records section. Only the `ranks`/`overallCurrent`/`overallPeak` slice is
// exercised here; `prs`/prsLoaded etc. aren't read by this component so they're omitted from this
// mock.
const runRankState = reactive({
  ranks: [] as unknown[],
  ranksLoaded: false,
  ranksError: false,
  overallCurrent: null as { tier: string; division: number } | null,
  overallPeak: null as { tier: string; division: number } | null,
  loadRanks: vi.fn(),
  loadOverallRank: vi.fn(),
});

vi.mock("~client/stores/runRankStore", () => ({ useRunRankStore: () => runRankState }));

function makeRunRank(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    category: "5k",
    tier: "bronze",
    division: 3,
    lp: 40,
    bestSpeedMps: 3.5,
    trust: "real",
    nextTargetSpeedMps: 4,
    peakTier: "bronze",
    peakDivision: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(runRankState, { ranks: [], ranksLoaded: false, ranksError: false, overallCurrent: null, overallPeak: null });
});

describe("RankRunnerSection", () => {
  it("loads running ranks and the overall runner rank on mount", () => {
    mountWithProviders(RankRunnerSection);
    expect(runRankState.loadRanks).toHaveBeenCalledOnce();
    expect(runRankState.loadOverallRank).toHaveBeenCalledOnce();
  });

  it("renders the tier ladder for the overall runner rank", () => {
    Object.assign(runRankState, { overallCurrent: { tier: "silver", division: 2 }, overallPeak: { tier: "gold", division: 1 } });
    const wrapper = mountWithProviders(RankRunnerSection);

    const ladder = wrapper.findComponent({ name: "TierLadder" });
    expect(ladder.props("currentTier")).toBe("silver");
    expect(ladder.props("currentDivision")).toBe(2);
    expect(ladder.props("peakTier")).toBe("gold");
    expect(ladder.props("peakDivision")).toBe(1);
  });

  it("shows skeleton placeholders while running ranks are still loading", () => {
    Object.assign(runRankState, { ranks: [], ranksLoaded: false, ranksError: false });
    const wrapper = mountWithProviders(RankRunnerSection);

    expect(wrapper.findAll(".rank-skel-card")).toHaveLength(5);
    expect(wrapper.find(".card-grid .card").exists()).toBe(false);
  });

  it("shows a retry banner when the running ranks load failed", async () => {
    Object.assign(runRankState, { ranks: [], ranksLoaded: false, ranksError: true });
    const wrapper = mountWithProviders(RankRunnerSection);

    expect(wrapper.text()).toContain("Lauf-Ränge konnten nicht geladen werden.");
    runRankState.loadRanks.mockClear();
    await wrapper.find(".run-rank-load-error button").trigger("click");
    expect(runRankState.loadRanks).toHaveBeenCalledOnce();
  });

  it("always renders all five categories, each showing its own tier/division/LP, with a placeholder for categories with no rank yet", () => {
    Object.assign(runRankState, {
      ranksLoaded: true,
      ranksError: false,
      ranks: [
        makeRunRank({ category: "5k", tier: "silver", division: 2, lp: 70 }),
        makeRunRank({ category: "marathon", tier: "bronze", division: 1, lp: 10 }),
      ],
    });
    const wrapper = mountWithProviders(RankRunnerSection);

    const cards = wrapper.findAll(".card-grid .card");
    expect(cards).toHaveLength(5);
    expect(wrapper.findAll(".run-rank-empty-note")).toHaveLength(3);

    const runProgressCards = wrapper.findAllComponents(RankProgress).filter((c) => c.props("variant") === "card");
    expect(runProgressCards).toHaveLength(2);
    expect(wrapper.text()).toContain("5 km");
    expect(wrapper.text()).toContain("Marathon");
  });

  it("shows the next speed target as a formatted pace, and '???' when no next target exists", () => {
    Object.assign(runRankState, {
      ranksLoaded: true,
      ranksError: false,
      ranks: [
        makeRunRank({ category: "5k", nextTargetSpeedMps: 1000 / 300 }), // 5:00/km
        makeRunRank({ category: "10k", nextTargetSpeedMps: null }),
      ],
    });
    const wrapper = mountWithProviders(RankRunnerSection);

    expect(wrapper.text()).toContain("5:00/km");
    expect(wrapper.text()).toContain("Nächstes Ziel");
    expect(wrapper.text()).toContain("???");
  });
});
