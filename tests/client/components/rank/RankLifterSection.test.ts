import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RankProgress from "~client/components/rank/RankProgress.vue";
import RankLifterSection from "~client/components/rank/RankLifterSection.vue";
import { TIER_LABEL_DE } from "~client/lib/tierIcons";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file consts (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so vi.mock's own
// hoisting above these declarations never dereferences them before they exist.
const ranksState = reactive({ ranks: [] as unknown[], loaded: false, error: false, load: vi.fn() });
const overallRankState = reactive({
  current: null as { tier: string; division: number; lp?: number } | null,
  peak: null as { tier: string; division: number } | null,
  loaded: false,
  error: false,
  load: vi.fn(),
});
// Not `reactive` — `byId` is a plain function reference (a Pinia getter would be), and reactive()
// would wrap it in a way vi.fn() call-tracking doesn't expect.
const catalogState = { byId: vi.fn(), load: vi.fn() };

vi.mock("~client/stores/ranksStore", () => ({ useRanksStore: () => ranksState }));
vi.mock("~client/stores/overallRankStore", () => ({ useOverallRankStore: () => overallRankState }));
vi.mock("~client/stores/catalogStore", () => ({ useCatalogStore: () => catalogState }));

// RankDistributionDonut/RankUpCalendar/ExerciseInfoPanel are self-fetching feature components
// (own store/service reads) already covered at their own layer — stubbed so this test only
// asserts *whether* they render, not their internals.
const STUBS = { RankDistributionDonut: true, RankUpCalendar: true, ExerciseInfoPanel: true };

// Real 9-tier ids (@liftr/shared's TIERS), not the pre-migration "bronze/silver/gold" names —
// TierBadge's emblem geometry now indexes TIER_PALETTE by this string directly and throws on an
// unknown key, where the old CSS-only badge silently no-op'd on a class like `t-bronze` that
// matched nothing. A fake tier name here used to be harmless; it no longer is.
function makeRank(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    exerciseId: "ex1",
    slug: "bench-press",
    name: null,
    tier: "trainee",
    division: 3,
    lp: 40,
    nextTargetWeightKg: 80,
    nextTargetReps: 8,
    trust: "real",
    peakTier: "trainee",
    peakDivision: 3,
    isBodyweight: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(ranksState, { ranks: [], loaded: false, error: false });
  Object.assign(overallRankState, { current: null, peak: null, loaded: false, error: false });
  catalogState.byId.mockReturnValue(undefined);
});

describe("RankLifterSection", () => {
  it("loads ranks, the overall rank band, and the catalog on mount", () => {
    mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });
    expect(ranksState.load).toHaveBeenCalledOnce();
    expect(overallRankState.load).toHaveBeenCalledOnce();
    expect(catalogState.load).toHaveBeenCalledOnce();
  });

  it("shows skeleton placeholders while ranks are still loading", () => {
    Object.assign(ranksState, { ranks: [], loaded: false, error: false });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    expect(wrapper.findAll(".rank-skel-card")).toHaveLength(4);
    expect(wrapper.find(".card-grid .card").exists()).toBe(false);
  });

  it("shows a retry banner when the load failed", async () => {
    Object.assign(ranksState, { ranks: [], loaded: false, error: true });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Ränge konnten nicht geladen werden.");
    ranksState.load.mockClear();
    await wrapper.find(".load-error button").trigger("click");
    expect(ranksState.load).toHaveBeenCalledOnce();
  });

  it("shows the honest empty state once loaded with zero ranks", () => {
    Object.assign(ranksState, { ranks: [], loaded: true, error: false });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Dein erster Rang entsteht");
    expect(wrapper.findComponent({ name: "RankDistributionDonut" }).exists()).toBe(false);
  });

  it("sorts ranks by LP descending (closest to rank-up first) and wires each into a RankProgress card", () => {
    Object.assign(ranksState, {
      loaded: true,
      error: false,
      ranks: [makeRank({ exerciseId: "low", lp: 10 }), makeRank({ exerciseId: "high", lp: 90 })],
    });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    const cards = wrapper.findAllComponents(RankProgress);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.props("lp")).toBe(90);
    expect(cards[1]!.props("lp")).toBe(10);
  });

  it("renders the tier ladder with the current and peak overall-rank bands", () => {
    Object.assign(overallRankState, { loaded: true, current: { tier: "silver", division: 2 }, peak: { tier: "gold", division: 1 } });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    const ladder = wrapper.findComponent({ name: "TierLadder" });
    expect(ladder.props("currentTier")).toBe("silver");
    expect(ladder.props("currentDivision")).toBe(2);
    expect(ladder.props("peakTier")).toBe("gold");
    expect(ladder.props("peakDivision")).toBe(1);
  });

  it("flips a card to show THAT exercise's own rank on tap (not the account's overall rank), and back again on a second tap", async () => {
    // Regression test for the real bug this fixed: the back face used to bind overallRank's
    // account-wide tier/division/lp, identical on every card, instead of this row's own RankRow.
    Object.assign(ranksState, { loaded: true, error: false, ranks: [makeRank({ tier: "elite", division: 2, lp: 40, peakTier: "elite", peakDivision: 2 })] });
    Object.assign(overallRankState, { loaded: true, current: { tier: "silver", division: 2, lp: 40 }, peak: null });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(RankProgress).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "RankExerciseBack" }).exists()).toBe(false);
    expect(wrapper.find(".rank-flip-card").classes()).not.toContain("flipped");

    await wrapper.find(".flip-face-front").trigger("click");

    const back = wrapper.findComponent({ name: "RankExerciseBack" });
    expect(back.exists()).toBe(true);
    // THIS exercise's own tier/division ("elite"/2, from makeRank() above), not the account's
    // overall rank ("silver"/2, from overallRankState above) — the actual bug being fixed here.
    expect(back.props("tier")).toBe("elite");
    expect(back.props("division")).toBe(2);
    expect(wrapper.find(".rank-flip-card").classes()).toContain("flipped");
    // The front face stays mounted (rotated away via CSS, not removed) — this is what makes the
    // flip an actual transform instead of the old height-jumping content swap.
    expect(wrapper.findComponent(RankProgress).exists()).toBe(true);

    // No "Zurück" button anymore — the whole back face is tappable to flip back, same as the front.
    await wrapper.find(".flip-face-back").trigger("click");
    expect(wrapper.find(".rank-flip-card").classes()).not.toContain("flipped");
    // Stays mounted after unflipping (lazy-activated once, then kept via v-show-equivalent) so a
    // second flip of the same card never remounts/reflows.
    expect(wrapper.findComponent({ name: "RankExerciseBack" }).exists()).toBe(true);
  });

  it("passes this exercise's own primary/secondary trained muscles (from the catalog) to the back face, not an account-wide heat map", async () => {
    Object.assign(ranksState, { loaded: true, error: false, ranks: [makeRank()] });
    catalogState.byId.mockReturnValue({
      id: "ex1",
      slug: "bench-press",
      muscles: [
        { slug: "chest", role: "primary" },
        { slug: "triceps", role: "secondary" },
      ],
    });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    await wrapper.find(".flip-face-front").trigger("click");

    const back = wrapper.findComponent({ name: "RankExerciseBack" });
    expect(back.props("primaryMuscles")).toEqual(["chest"]);
    expect(back.props("secondaryMuscles")).toEqual(["triceps"]);
  });

  it("opens the exercise's info panel from the flipped card's 'Rang-Statistiken' button", async () => {
    Object.assign(ranksState, { loaded: true, error: false, ranks: [makeRank()] });
    catalogState.byId.mockReturnValue({ id: "ex1", slug: "bench-press", muscles: [] });
    const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

    await wrapper.find(".flip-face-front").trigger("click");
    expect(wrapper.findComponent({ name: "ExerciseInfoPanel" }).exists()).toBe(false);

    await wrapper.find(".card button").trigger("click"); // "Rang-Statistiken", the back's first button
    expect(wrapper.findComponent({ name: "ExerciseInfoPanel" }).exists()).toBe(true);
  });

  describe("tier filter", () => {
    it("hides the filter strip when only one tier is present", () => {
      Object.assign(ranksState, {
        loaded: true,
        error: false,
        ranks: [makeRank({ exerciseId: "a", tier: "athlete" }), makeRank({ exerciseId: "b", tier: "athlete" })],
      });
      const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

      expect(wrapper.find(".rank-tier-filter").exists()).toBe(false);
      expect(wrapper.findAll(".card-grid .card")).toHaveLength(2);
    });

    it("narrows the grid to the selected tier, and back to all on 'Alle'", async () => {
      Object.assign(ranksState, {
        loaded: true,
        error: false,
        ranks: [
          makeRank({ exerciseId: "a", tier: "athlete", lp: 90 }),
          makeRank({ exerciseId: "b", tier: "elite", lp: 10 }),
        ],
      });
      const wrapper = mountWithProviders(RankLifterSection, { global: { stubs: STUBS } });

      expect(wrapper.findAll(".card-grid .card")).toHaveLength(2);
      const tabs = wrapper.findAll(".rank-tier-filter .tab-pill");
      const eliteTab = tabs.find((t) => t.text() === TIER_LABEL_DE.elite)!;
      await eliteTab.trigger("click");
      expect(wrapper.findAll(".card-grid .card")).toHaveLength(1);

      const allTab = tabs.find((t) => t.text() === "Alle")!;
      await allTab.trigger("click");
      expect(wrapper.findAll(".card-grid .card")).toHaveLength(2);
    });
  });
});
