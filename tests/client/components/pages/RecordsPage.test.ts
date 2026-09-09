import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RecordsPage from "~client/pages/RecordsPage.vue";
import RunDetail from "~client/components/run/RunDetail.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file const (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside an uninvoked closure below, so vi.mock's own
// hoisting above this declaration never dereferences it before it exists.
const prState = reactive({ prs: [] as unknown[], loaded: false, error: false, load: vi.fn() });
const runRankState = reactive({ prs: [] as unknown[], prsLoaded: false, prsError: false, loadPrs: vi.fn() });

vi.mock("~client/stores/prStore", () => ({
  usePrStore: () => prState,
}));
vi.mock("~client/stores/runRankStore", () => ({
  useRunRankStore: () => runRankState,
}));

// RunDetail does its own store-backed fetching (already covered at its own layer, same
// convention as OverviewPage.test.ts's STUBS) — stubbed so this page's tests only assert
// *whether* it opens, wired to the right runId.
const STUBS = { RunDetail: true };

function makePr(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pr1",
    exerciseSlug: "bench-press",
    exerciseName: null,
    kind: "weight",
    value: 100,
    achievedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRunPr(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "runpr1",
    category: "5k",
    kind: "time" as const,
    value: 1500, // 25:00
    runId: "run1",
    achievedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("RecordsPage", () => {
  // Every pre-existing test below predates the running-records section and asserts only on the
  // strength ledger, so the running section defaults to an already-loaded, empty state here —
  // dedicated tests further down override this per case.
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(runRankState, { prs: [], prsLoaded: true, prsError: false });
  });

  it("loads the PR list on mount", () => {
    mountWithProviders(RecordsPage, { global: { stubs: STUBS } });
    expect(prState.load).toHaveBeenCalledOnce();
  });

  it("shows loading skeletons while prStore hasn't loaded yet", () => {
    Object.assign(prState, { prs: [], loaded: false, error: false });
    const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

    expect(wrapper.findAll(".pr-skel-row")).toHaveLength(4);
    expect(wrapper.find(".pr-list").exists()).toBe(false);
  });

  it("shows a retry banner when the load failed", async () => {
    Object.assign(prState, { prs: [], loaded: false, error: true });
    const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Rekorde konnten nicht geladen werden.");
    prState.load.mockClear();
    await wrapper.find(".load-error button").trigger("click");
    expect(prState.load).toHaveBeenCalledOnce();
  });

  it("shows the honest empty state once loaded with zero records", () => {
    Object.assign(prState, { prs: [], loaded: true, error: false });
    const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

    expect(wrapper.text()).toContain("Noch keine Rekorde");
    expect(wrapper.find(".pr-list").exists()).toBe(false);
  });

  it("renders every PR sorted newest-first, formatted per kind, with a reward highlight for recent ones", () => {
    Object.assign(prState, {
      loaded: true,
      error: false,
      prs: [
        makePr({ id: "old", kind: "reps", value: 12.4, achievedAt: "2020-01-01T00:00:00.000Z" }),
        makePr({ id: "recent", kind: "e1rm", value: 126.6666, achievedAt: new Date().toISOString() }),
      ],
    });
    const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

    const rows = wrapper.findAll(".pr-row");
    expect(rows).toHaveLength(2);
    // Newest (recent, e1rm) sorts first.
    expect(rows[0]!.text()).toContain("127 kg");
    expect(rows[0]!.classes()).toContain("panel-reward");
    expect(rows[1]!.text()).toContain("12 Wdh.");
    expect(rows[1]!.classes()).not.toContain("panel-reward");
  });

  describe("running records section", () => {
    it("loads the running PR list on mount", () => {
      mountWithProviders(RecordsPage, { global: { stubs: STUBS } });
      expect(runRankState.loadPrs).toHaveBeenCalledOnce();
    });

    it("shows loading skeletons while runRankStore hasn't loaded yet", () => {
      Object.assign(runRankState, { prs: [], prsLoaded: false, prsError: false });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      expect(wrapper.findAll(".run-pr-skel-row")).toHaveLength(5);
      expect(wrapper.find(".run-pr-list").exists()).toBe(false);
    });

    it("shows a retry banner when the running PR load failed", async () => {
      Object.assign(runRankState, { prs: [], prsLoaded: false, prsError: true });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      expect(wrapper.text()).toContain("Lauf-Rekorde konnten nicht geladen werden.");
      runRankState.loadPrs.mockClear();
      await wrapper.find(".run-pr-load-error button").trigger("click");
      expect(runRankState.loadPrs).toHaveBeenCalledOnce();
    });

    it("always renders all five categories, with an empty placeholder for categories with no time PR yet", () => {
      Object.assign(runRankState, { prs: [], prsLoaded: true, prsError: false });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      const rows = wrapper.findAll(".run-pr-row");
      expect(rows).toHaveLength(5);
      expect(wrapper.text()).toContain("Meile");
      expect(wrapper.text()).toContain("5 km");
      expect(wrapper.text()).toContain("10 km");
      expect(wrapper.text()).toContain("Halbmarathon");
      expect(wrapper.text()).toContain("Marathon");
      expect(wrapper.findAll(".run-pr-empty")).toHaveLength(5);
    });

    it("shows the fastest TIME per category (not speed), formatted as mm:ss, ignoring speed-kind PRs", () => {
      Object.assign(runRankState, {
        prsLoaded: true,
        prsError: false,
        prs: [
          makeRunPr({ id: "a", category: "5k", kind: "time", value: 1500, achievedAt: "2024-01-01T00:00:00.000Z" }), // 25:00, slower
          makeRunPr({ id: "b", category: "5k", kind: "time", value: 1380, achievedAt: "2024-06-01T00:00:00.000Z" }), // 23:00, fastest -> shown
          makeRunPr({ id: "c", category: "5k", kind: "speed", value: 3.6, achievedAt: "2024-12-01T00:00:00.000Z" }), // faster PR by date but wrong kind
          makeRunPr({ id: "d", category: "marathon", kind: "time", value: 12345, runId: "run-marathon", achievedAt: "2024-03-01T00:00:00.000Z" }),
        ],
      });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      expect(wrapper.text()).toContain("23:00");
      expect(wrapper.text()).not.toContain("25:00");
      // marathon: 12345s = 3h 25m 45s
      expect(wrapper.text()).toContain("3:25:45");
    });

    it("opens RunDetail with the achieving run's id when a category row with a PR is clicked", async () => {
      Object.assign(runRankState, {
        prsLoaded: true,
        prsError: false,
        prs: [makeRunPr({ category: "10k", runId: "run-10k" })],
      });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      expect(wrapper.findComponent(RunDetail).exists()).toBe(false);
      const rows = wrapper.findAll(".run-pr-row");
      const tenKRow = rows.find((r) => r.text().includes("10 km"));
      await tenKRow!.trigger("click");
      expect(wrapper.findComponent(RunDetail).props("runId")).toBe("run-10k");
    });

    it("does not open RunDetail when a category row with no PR is clicked", async () => {
      Object.assign(runRankState, { prs: [], prsLoaded: true, prsError: false });
      const wrapper = mountWithProviders(RecordsPage, { global: { stubs: STUBS } });

      const rows = wrapper.findAll(".run-pr-row");
      await rows[0]!.trigger("click");
      expect(wrapper.findComponent(RunDetail).exists()).toBe(false);
    });
  });
});
