import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RankProgress from "~client/components/rank/RankProgress.vue";
import RankRunnerSection from "~client/components/rank/RankRunnerSection.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Task 13: running rank section — sourced from Task 10's runRankStore, same store also used by
// RecordsPage's running records section. `prs` is now also read here (RankCategoryCard.vue's back
// face shows a per-category personal best, same PR data RecordsPage's cardio-records section
// reduces) so it's part of this mock too, left empty by default (no PR-related assertions here —
// RankRunBack.vue has its own test coverage for the formatting).
const runRankState = reactive({
  ranks: [] as unknown[],
  ranksLoaded: false,
  ranksError: false,
  prs: [] as unknown[],
  overallCurrent: null as { tier: string; division: number } | null,
  overallPeak: null as { tier: string; division: number } | null,
  loadRanks: vi.fn(),
  loadOverallRank: vi.fn(),
  loadPrs: vi.fn(),
});

vi.mock("~client/stores/runRankStore", () => ({ useRunRankStore: () => runRankState }));

// Real 9-tier ids (@liftr/shared's TIERS) — TierBadge's emblem geometry indexes TIER_PALETTE by
// this string and throws on an unknown key, where the old CSS-only badge silently no-op'd on a
// class like `t-bronze` that matched nothing.
function makeRunRank(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activityType: "run",
    category: "5k",
    tier: "trainee",
    division: 3,
    lp: 40,
    bestSpeedMps: 3.5,
    trust: "real",
    nextTargetSpeedMps: 4,
    peakTier: "trainee",
    peakDivision: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(runRankState, { ranks: [], ranksLoaded: false, ranksError: false, prs: [], overallCurrent: null, overallPeak: null });
});

describe("RankRunnerSection", () => {
  it("loads running ranks, the overall runner rank, and PRs on mount", () => {
    mountWithProviders(RankRunnerSection);
    expect(runRankState.loadRanks).toHaveBeenCalledOnce();
    expect(runRankState.loadOverallRank).toHaveBeenCalledOnce();
    expect(runRankState.loadPrs).toHaveBeenCalledOnce();
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
        makeRunRank({ category: "5k", tier: "athlete", division: 2, lp: 70 }),
        makeRunRank({ category: "marathon", tier: "trainee", division: 1, lp: 10 }),
      ],
    });
    const wrapper = mountWithProviders(RankRunnerSection);

    // 5 running categories + walk + hike, each always rendering a card (ranked or placeholder).
    const cards = wrapper.findAll(".card-grid .card");
    expect(cards).toHaveLength(7);
    expect(wrapper.findAll(".run-rank-empty-note")).toHaveLength(5);

    const runProgressCards = wrapper.findAllComponents(RankProgress).filter((c) => c.props("variant") === "hero");
    expect(runProgressCards).toHaveLength(2);
    expect(wrapper.text()).toContain("5 km");
    expect(wrapper.text()).toContain("Marathon");
  });

  it("always renders a card for walking and hiking, with an empty-state placeholder and the overall-exclusion note when neither has ranked yet", () => {
    Object.assign(runRankState, { ranksLoaded: true, ranksError: false, ranks: [] });
    const wrapper = mountWithProviders(RankRunnerSection);

    expect(wrapper.text()).toContain("Gehen");
    expect(wrapper.text()).toContain("Wandern");
    expect(wrapper.text()).toContain("Noch kein Rang — sammle genug Distanz, um zu starten.");
    expect(wrapper.text()).toContain("Gehen und Wandern zählen nicht in den Overall Runner Rank");
  });

  it("renders walking's real rank card once it has a row, alongside hiking's still-empty placeholder", () => {
    Object.assign(runRankState, {
      ranksLoaded: true,
      ranksError: false,
      ranks: [makeRunRank({ activityType: "walk", category: "all", tier: "trainee", division: 3, lp: 40 })],
    });
    const wrapper = mountWithProviders(RankRunnerSection);

    const runProgressCards = wrapper.findAllComponents(RankProgress).filter((c) => c.props("variant") === "hero");
    expect(runProgressCards).toHaveLength(1); // just the real walk card
    // 5 running categories + hike, all still placeholders.
    expect(wrapper.findAll(".run-rank-empty-note")).toHaveLength(6);
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
    // "Ziel", not "Nächstes Ziel" — the hero variant's label (RankProgress.vue's heroFields),
    // since RankCategoryCard.vue's front face is now the same hero variant the Kraft grid uses.
    expect(wrapper.text()).toContain("Ziel");
    expect(wrapper.text()).toContain("???");
  });
});
