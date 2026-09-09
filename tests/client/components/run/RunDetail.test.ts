// RunDetail.vue loads its detail via runsStore.loadDetail() (a network boundary — mocked here)
// on mount, then renders SheetModal (real shell wraps @ionic/vue's IonModal — stubbed per
// tests/README.md's note, same as RoutineWizard.test.ts) and RunReplay (its own leaflet/map
// rendering is covered by RunReplay.test.ts/RunMap.test.ts; stubbed here so this file tests only
// RunDetail's own loading/formatting logic).
import { flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunDetail from "~client/components/run/RunDetail.vue";
import type { RunDetail as RunDetailModel } from "~client/stores/runsStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { loadDetailMock } = vi.hoisted(() => ({ loadDetailMock: vi.fn() }));
vi.mock("~client/stores/runsStore", () => ({
  useRunsStore: () => ({ loadDetail: loadDetailMock }),
}));

interface RunRankRow {
  category: string;
  tier: string;
  division: number;
  lp: number;
  bestSpeedMps: number | null;
  trust: "real" | "derived" | "synthetic" | null;
  nextTargetSpeedMps: number | null;
  peakTier: string | null;
  peakDivision: number | null;
}

interface RunPrListItem {
  id: string;
  category: string;
  kind: "time" | "speed";
  value: number;
  runId: string;
  achievedAt: string;
}

// Task 11: mocked the same way runsStore is above — the chip/badge logic is driven directly
// instead of depending on real network calls (which fail silently in jsdom the way the
// un-mocked plannedRouteStore already does elsewhere in this file).
const runRankStore = reactive({
  ranks: [] as RunRankRow[],
  prs: [] as RunPrListItem[],
  ranksLoaded: false,
  prsLoaded: false,
  loadRanks: vi.fn(),
  loadPrs: vi.fn(),
});
vi.mock("~client/stores/runRankStore", () => ({
  useRunRankStore: () => runRankStore,
}));

function makeRankRow(overrides: Partial<RunRankRow> = {}): RunRankRow {
  return {
    category: "5k",
    tier: "advanced",
    division: 3,
    lp: 50,
    bestSpeedMps: 4,
    trust: "real",
    nextTargetSpeedMps: null,
    peakTier: null,
    peakDivision: null,
    ...overrides,
  };
}

function makePr(overrides: Partial<RunPrListItem> = {}): RunPrListItem {
  return {
    id: "pr1",
    category: "5k",
    kind: "speed",
    value: 4,
    runId: "run-1",
    achievedAt: "2026-03-15T07:00:00.000Z",
    ...overrides,
  };
}

const SheetModalStub = {
  props: ["title"],
  emits: ["close"],
  template: `<div class="sheet-stub" :data-title="title"><slot /></div>`,
};
const RunReplayStub = {
  props: ["points"],
  template: `<div class="runreplay-stub" :data-count="points.length"></div>`,
};

function mountDetail(runId = "run-1") {
  return mountWithProviders(RunDetail, {
    props: { runId },
    global: { stubs: { SheetModal: SheetModalStub, RunReplay: RunReplayStub } },
  });
}

function makeDetail(overrides: Partial<RunDetailModel> = {}): RunDetailModel {
  return {
    id: "run-1",
    source: "gpx",
    name: "Morning Run",
    startedAt: "2026-03-15T07:00:00.000Z",
    distanceM: 5230,
    durationS: 1620,
    avgPaceSPerKm: 310,
    avgHr: 152.4,
    elevationGainM: 40,
    plannedRouteId: null,
    points: [{ idx: 0, t: "2026-03-15T07:00:00.000Z", lat: 52.5, lon: 13.4, ele: null, hr: 140, cadence: 80 }],
    ...overrides,
  };
}

beforeEach(() => {
  loadDetailMock.mockReset();
  runRankStore.ranks = [];
  runRankStore.prs = [];
  runRankStore.ranksLoaded = false;
  runRankStore.prsLoaded = false;
});

describe("RunDetail", () => {
  it("shows a loading hint while the detail request is in flight", async () => {
    loadDetailMock.mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.text()).toContain("Lädt…");
  });

  it("requests the detail for the given runId", () => {
    loadDetailMock.mockReturnValue(new Promise(() => {}));
    mountDetail("run-42");

    expect(loadDetailMock).toHaveBeenCalledWith("run-42");
  });

  it("shows a failure hint when the load rejects", async () => {
    loadDetailMock.mockRejectedValue(new Error("offline"));
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.text()).toContain("Dieser Lauf ließ sich nicht laden");
  });

  it("renders formatted stats and the replay once loaded", async () => {
    loadDetailMock.mockResolvedValue(makeDetail());
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.text()).toContain("5.23 km");
    expect(wrapper.text()).toContain("27 min"); // round(1620/60)
    expect(wrapper.text()).toContain("5:10/km"); // round(310) -> 5:10
    expect(wrapper.text()).toContain("152 bpm"); // Math.round(152.4)
    const replay = wrapper.find(".runreplay-stub");
    expect(replay.exists()).toBe(true);
    expect(replay.attributes("data-count")).toBe("1");
  });

  it("formats a null pace and a null avg HR as a dash", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ avgPaceSPerKm: null, avgHr: null }));
    const wrapper = mountDetail();
    await flushPromises();

    // formatPace(null) -> "–"; avgHr null renders the bare fallback "–", not "– bpm"
    expect(wrapper.text()).not.toContain("bpm");
    expect(wrapper.text()).toContain("–");
  });

  it("shows a manual-run hint instead of the replay when there are no points", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ points: [] }));
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find(".runreplay-stub").exists()).toBe(false);
    expect(wrapper.text()).toContain("Manuell erfasster Lauf — keine Route verfügbar.");
  });

  it("passes the run name (or a fallback) as the sheet title", async () => {
    loadDetailMock.mockReturnValue(new Promise(() => {}));
    const loading = mountDetail();
    await flushPromises();
    expect(loading.find(".sheet-stub").attributes("data-title")).toBe("Lauf-Details");

    loadDetailMock.mockResolvedValue(makeDetail({ name: "Sunday Long Run" }));
    const loaded = mountDetail();
    await flushPromises();
    expect(loaded.find(".sheet-stub").attributes("data-title")).toBe("Sunday Long Run");
  });

  it("shows a rank/category chip for the run's nearest category when it's rank-eligible", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k", tier: "advanced", division: 3 })];

    const wrapper = mountDetail();
    await flushPromises();

    const chip = wrapper.find(".rank-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("5 km");
    expect(chip.text()).toContain("FORTGESCHRITTEN");
    expect(chip.text()).toContain("III");
  });

  it("shows no rank chip when the run's category has no runRanks entry", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "marathon" })];

    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find(".rank-chip").exists()).toBe(false);
  });

  it('shows "Neuer Rekord" when this run set a PR', async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ id: "run-1", distanceM: 5000 }));
    runRankStore.prs = [makePr({ runId: "run-1" })];

    const wrapper = mountDetail();
    await flushPromises();

    const prBadge = wrapper.find(".pr-chip");
    expect(prBadge.exists()).toBe(true);
    expect(prBadge.text()).toBe("Neuer Rekord");
  });

  it("does not show 'Neuer Rekord' when a different run holds the PR", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ id: "run-1", distanceM: 5000 }));
    runRankStore.prs = [makePr({ runId: "some-other-run" })];

    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find(".pr-chip").exists()).toBe(false);
  });

  it("never shows a rank chip or PR badge for a manual run, even if the data would otherwise match", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ id: "run-1", source: "manual", distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k" })];
    runRankStore.prs = [makePr({ runId: "run-1" })];

    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find(".rank-chip").exists()).toBe(false);
    expect(wrapper.find(".pr-chip").exists()).toBe(false);
  });

  it("gives the rank chip and PR badge the earned-moment spring animation, not the plain row entrance", async () => {
    loadDetailMock.mockResolvedValue(makeDetail({ id: "run-1", distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k" })];
    runRankStore.prs = [makePr({ runId: "run-1" })];

    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find(".rank-chip").classes()).toContain("pop-in");
    expect(wrapper.find(".pr-chip").classes()).toContain("pop-in");
  });

  it("forwards the sheet's close event", async () => {
    loadDetailMock.mockResolvedValue(makeDetail());
    const wrapper = mountDetail();
    await flushPromises();

    await wrapper.findComponent(SheetModalStub).vm.$emit("close");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
