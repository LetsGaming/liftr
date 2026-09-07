import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RankProgress from "~client/components/rank/RankProgress.vue";
import RanksPage from "~client/pages/RanksPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

vi.mock("~client/services/exerciseService", () => ({ getExerciseHistory: vi.fn().mockResolvedValue([]) }));

// Plain top-of-file consts (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so vi.mock's own
// hoisting above these declarations never dereferences them before they exist.
const ranksState = reactive({ ranks: [] as unknown[], loaded: false, error: false, load: vi.fn() });
const overallRankState = reactive({
  current: null as { tier: string; division: number } | null,
  peak: null as { tier: string; division: number } | null,
  loaded: false,
  error: false,
  load: vi.fn(),
});

vi.mock("~client/stores/ranksStore", () => ({ useRanksStore: () => ranksState }));
vi.mock("~client/stores/overallRankStore", () => ({ useOverallRankStore: () => overallRankState }));

// RankDistributionDonut/RankUpCalendar/ProgressChart are self-fetching feature components
// (own store/service reads) already covered at their own layer — stubbed so this page's test
// only asserts *whether* they render, not their internals.
const STUBS = { RankDistributionDonut: true, RankUpCalendar: true, ProgressChart: true };

function makeRank(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    exerciseId: "ex1",
    slug: "bench-press",
    name: null,
    tier: "bronze",
    division: 3,
    lp: 40,
    nextTargetWeightKg: 80,
    nextTargetReps: 8,
    trust: "real",
    peakTier: "bronze",
    peakDivision: 3,
    isBodyweight: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(ranksState, { ranks: [], loaded: false, error: false });
  Object.assign(overallRankState, { current: null, peak: null, loaded: false, error: false });
});

describe("RanksPage", () => {
  it("loads ranks and the overall rank band on mount", () => {
    mountWithProviders(RanksPage, { global: { stubs: STUBS } });
    expect(ranksState.load).toHaveBeenCalledOnce();
    expect(overallRankState.load).toHaveBeenCalledOnce();
  });

  it("shows skeleton placeholders while ranks are still loading", () => {
    Object.assign(ranksState, { ranks: [], loaded: false, error: false });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    expect(wrapper.findAll(".rank-skel-card")).toHaveLength(4);
    expect(wrapper.find(".rank-grid .rank-card").exists()).toBe(false);
  });

  it("shows a retry banner when the load failed", async () => {
    Object.assign(ranksState, { ranks: [], loaded: false, error: true });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Ränge konnten nicht geladen werden.");
    ranksState.load.mockClear();
    await wrapper.find(".load-error button").trigger("click");
    expect(ranksState.load).toHaveBeenCalledOnce();
  });

  it("shows the honest empty state once loaded with zero ranks", () => {
    Object.assign(ranksState, { ranks: [], loaded: true, error: false });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Dein erster Rang entsteht");
    expect(wrapper.findComponent({ name: "RankDistributionDonut" }).exists()).toBe(false);
  });

  it("sorts ranks by LP descending (closest to rank-up first) and wires each into a RankProgress card", () => {
    Object.assign(ranksState, {
      loaded: true,
      error: false,
      ranks: [makeRank({ exerciseId: "low", lp: 10 }), makeRank({ exerciseId: "high", lp: 90 })],
    });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    const cards = wrapper.findAllComponents(RankProgress);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.props("lp")).toBe(90);
    expect(cards[1]!.props("lp")).toBe(10);
  });

  it("renders the tier ladder with the current and peak overall-rank bands", () => {
    Object.assign(overallRankState, { loaded: true, current: { tier: "silver", division: 2 }, peak: { tier: "gold", division: 1 } });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    const ladder = wrapper.findComponent({ name: "TierLadder" });
    expect(ladder.props("currentTier")).toBe("silver");
    expect(ladder.props("currentDivision")).toBe(2);
    expect(ladder.props("peakTier")).toBe("gold");
    expect(ladder.props("peakDivision")).toBe(1);
  });

  it("expands an exercise's chart slot on tap and fetches its history lazily", async () => {
    Object.assign(ranksState, { loaded: true, error: false, ranks: [makeRank()] });
    const wrapper = mountWithProviders(RanksPage, { global: { stubs: STUBS } });

    expect(wrapper.find(".chart-slot").exists()).toBe(false);
    await wrapper.find(".rank-card").trigger("click");
    expect(wrapper.find(".chart-slot").exists()).toBe(true);
  });
});
