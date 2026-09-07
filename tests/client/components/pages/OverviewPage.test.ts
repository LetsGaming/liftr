import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import ErholungszoneCard from "~client/components/ui/ErholungszoneCard.vue";
import TierLadder from "~client/components/rank/TierLadder.vue";
import WorkoutDetail from "~client/components/workout/WorkoutDetail.vue";
import RunDetail from "~client/components/run/RunDetail.vue";
import OverviewPage from "~client/pages/OverviewPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file consts (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so vi.mock's own
// hoisting above these declarations never dereferences them before they exist.
const historyState = reactive({
  items: [] as { id: string; kind: "workout" | "run"; title: string | null; at: string; meta: Record<string, unknown> }[],
  loaded: false,
  error: false,
  nextCursor: null as string | null,
  loadingMore: false,
  load: vi.fn(),
  loadMore: vi.fn(),
});
const xpState = reactive({ level: 5, loaded: false, error: false, showXp: true, load: vi.fn() });
const streakState = reactive({ streak: 0, loaded: false, error: false, load: vi.fn() });
const routineState = reactive({
  routines: [] as { id: string; name: string; routineExercises: { exerciseId: string }[] }[],
  loaded: false,
  error: false,
  load: vi.fn(),
});
const activeWorkoutState = reactive({
  isActive: false,
  routineName: null as string | null,
  progressLabel: "",
  startedAt: null as number | null,
  pausedAt: null as number | null,
  totalPausedMs: 0,
  isPaused: false,
  restore: vi.fn(),
  togglePause: vi.fn(),
});
const ranksState = reactive({ ranks: [] as { exerciseId: string; slug: string; lp: number }[], loaded: false, error: false, load: vi.fn() });
const overallRankState = reactive({
  current: null as { tier: string; division: number } | null,
  loaded: false,
  error: false,
  load: vi.fn(),
});
const bodyweightState = reactive({ entries: [] as { weightKg: number; date: string }[], loaded: false, error: false, load: vi.fn() });
const catalogState = reactive({ exercises: [] as { id: string; slug: string; muscles: unknown[] }[], loaded: false, load: vi.fn(), byId: (id: string) => catalogState.exercises.find((e) => e.id === id) });
const readinessState = reactive({ heat: {} as Record<string, number>, recoveredSlugs: [] as string[], loaded: false, error: false, load: vi.fn() });

vi.mock("~client/stores/historyStore", () => ({ useHistoryStore: () => historyState }));
vi.mock("~client/stores/xpStore", () => ({ useXpStore: () => xpState }));
vi.mock("~client/stores/streakStore", () => ({ useStreakStore: () => streakState }));
vi.mock("~client/stores/routineStore", () => ({ useRoutineStore: () => routineState }));
vi.mock("~client/stores/activeWorkoutStore", () => ({ useActiveWorkoutStore: () => activeWorkoutState }));
vi.mock("~client/stores/ranksStore", () => ({ useRanksStore: () => ranksState }));
vi.mock("~client/stores/overallRankStore", () => ({ useOverallRankStore: () => overallRankState }));
vi.mock("~client/stores/bodyweightStore", () => ({ useBodyweightStore: () => bodyweightState }));
vi.mock("~client/stores/catalogStore", () => ({ useCatalogStore: () => catalogState }));
vi.mock("~client/stores/readinessStore", () => ({ useReadinessStore: () => readinessState }));

// WorkoutDetail/RunDetail do their own store-backed fetching (already covered at their own
// layer) — stubbed so this page's test only asserts *whether* they open, wired to the right id.
const STUBS = { WorkoutDetail: true, RunDetail: true };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(historyState, { items: [], loaded: false, error: false, nextCursor: null, loadingMore: false });
  Object.assign(xpState, { level: 5, loaded: false, error: false });
  Object.assign(streakState, { streak: 0, loaded: false, error: false });
  Object.assign(routineState, { routines: [], loaded: false, error: false });
  Object.assign(activeWorkoutState, { isActive: false, routineName: null });
  Object.assign(ranksState, { ranks: [], loaded: false, error: false });
  Object.assign(overallRankState, { current: null, loaded: false, error: false });
  Object.assign(bodyweightState, { entries: [], loaded: false, error: false });
  Object.assign(catalogState, { exercises: [], loaded: false });
  Object.assign(readinessState, { heat: {}, recoveredSlugs: [], loaded: false, error: false });
});

function historyItem(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "h1", kind: "workout" as const, title: "Push Day", at: new Date().toISOString(), meta: { volumeKg: 1200, xp: 40 }, ...overrides };
}

describe("OverviewPage", () => {
  it("loads every dashboard store on mount", () => {
    mountWithProviders(OverviewPage, { global: { stubs: STUBS } });
    for (const store of [historyState, routineState, ranksState, bodyweightState, catalogState, readinessState, overallRankState]) {
      expect(store.load).toHaveBeenCalledOnce();
    }
    expect(activeWorkoutState.restore).toHaveBeenCalledOnce();
  });

  it("shows the first-run tier ladder instead of the loaded dashboard when history has genuinely loaded empty", () => {
    Object.assign(historyState, { loaded: true, items: [] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.find(".first-run-ladder").exists()).toBe(true);
    expect(wrapper.findComponent(TierLadder).props("currentTier")).toBeNull();
    expect(wrapper.find(".status-strip").exists()).toBe(false);
    expect(wrapper.find(".activity").exists()).toBe(false);
  });

  it("shows a load-error banner when any dashboard store failed, and retries only the failed ones", async () => {
    Object.assign(streakState, { error: true });
    Object.assign(xpState, { error: true });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.find(".load-error-banner").exists()).toBe(true);
    streakState.load.mockClear();
    xpState.load.mockClear();
    routineState.load.mockClear();

    await wrapper.find(".load-error-banner button").trigger("click");

    expect(streakState.load).toHaveBeenCalledOnce();
    expect(xpState.load).toHaveBeenCalledOnce();
    expect(routineState.load).not.toHaveBeenCalled(); // routineStore.error is false — left alone
  });

  it("launchpad: resumes an in-progress workout when one is active", () => {
    Object.assign(activeWorkoutState, { isActive: true, routineName: "Push Day", progressLabel: "2/5 Sätze" });
    Object.assign(historyState, { loaded: true, items: [historyItem()] }); // clears first-run
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Weiter machen");
    expect(wrapper.text()).toContain("Push Day");
    expect(wrapper.text()).toContain("2/5 Sätze");
    expect(wrapper.find('a[href="/workout"]').exists()).toBe(true);
  });

  it("launchpad: suggests the first saved routine to start when none is active", () => {
    Object.assign(routineState, { routines: [{ id: "r1", name: "Leg Day", routineExercises: [{ exerciseId: "ex1" }] }] });
    Object.assign(historyState, { loaded: true, items: [historyItem()] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Bereit für heute?");
    expect(wrapper.text()).toContain("Leg Day");
    expect(wrapper.text()).toContain("1 Übung");
  });

  it("launchpad: prompts to create a routine when none exist and nothing is active", () => {
    Object.assign(historyState, { loaded: true, items: [historyItem()] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Noch keine Routine");
  });

  it("status strip reads from streak/xp/overall-rank once each store has loaded", () => {
    Object.assign(streakState, { loaded: true, streak: 7 });
    Object.assign(xpState, { loaded: true, level: 12 });
    Object.assign(overallRankState, { loaded: true, current: { tier: "silver", division: 2 } });
    Object.assign(historyState, { loaded: true, items: [historyItem()] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Lv. 12");
    const tiles = wrapper.findAll(".status-strip .stat-tile b");
    expect(tiles.some((t) => t.text() === "7")).toBe(true);
  });

  it("activity feed: shows an offline message when history failed to load", () => {
    // historyStore.load() only sets `error`, not `loaded`, on a failed fetch — a genuinely empty
    // *successful* load (loaded && items.length === 0) is what triggers the first-run ladder
    // instead (see the test above); this is the "still has whatever was cached, fetch failed"
    // case, which keeps the normal dashboard shell and shows the activity section's own error line.
    Object.assign(historyState, { loaded: false, error: true, items: [] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Keine Verbindung zum Server");
  });

  it("activity feed: opens WorkoutDetail for a workout row and RunDetail for a run row", async () => {
    Object.assign(historyState, {
      loaded: true,
      items: [historyItem({ id: "w1", kind: "workout", title: "Push Day" }), historyItem({ id: "r1", kind: "run", title: "Morgenlauf", meta: { distanceM: 5000 } })],
    });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(WorkoutDetail).exists()).toBe(false);
    const rows = wrapper.findAll(".feed-btn");
    await rows[0]!.trigger("click");
    expect(wrapper.findComponent(WorkoutDetail).props("workoutId")).toBe("w1");

    await rows[1]!.trigger("click");
    expect(wrapper.findComponent(RunDetail).props("runId")).toBe("r1");
  });

  it("shows a 'load more' button only while history has another page, and calls loadMore on tap", async () => {
    Object.assign(historyState, { loaded: true, items: [historyItem()], nextCursor: "cursor-2" });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    const btn = wrapper.find(".activity .btn-secondary");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(historyState.loadMore).toHaveBeenCalledOnce();
  });

  it("erholungszone: routes to the routine-overview screen for the suggested routine when started", async () => {
    Object.assign(routineState, { routines: [{ id: "r7", name: "Leg Day", routineExercises: [] }] });
    Object.assign(readinessState, { loaded: true, recoveredSlugs: ["quads"] });
    Object.assign(historyState, { loaded: true, items: [historyItem()] });
    const wrapper = mountWithProviders(OverviewPage, { global: { stubs: STUBS } });

    const card = wrapper.findComponent(ErholungszoneCard);
    expect(card.props("canStart")).toBe(true);
    await card.vm.$emit("start");
    await vi.waitFor(() => expect(wrapper.vm.$router.currentRoute.value.fullPath).toContain("/routines/r7"));
  });
});
