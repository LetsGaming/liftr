import { describe, expect, it, vi, beforeEach } from "vitest";
import { reactive } from "vue";
import RunReplay from "~client/components/run/RunReplay.vue";
import RunsPage from "~client/pages/RunsPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

interface RunSummary {
  id: string;
  name: string | null;
  startedAt: string;
  distanceM: number;
  avgPaceSPerKm: number | null;
}

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

// `reactive` isn't available inside vi.hoisted()'s factory (it runs before "vue" itself has been
// linked, per this project's vi.mock hoisting) — declared as a plain top-of-file const instead,
// and referenced only inside an uninvoked closure below (`() => runsStore`) so vi.mock's own
// hoisting-above-this-const never actually dereferences it before it exists (tests/README's
// documented alternative to vi.hoisted for exactly this TDZ hazard).
const runsStore = reactive({
  runs: [] as RunSummary[],
  loaded: false,
  load: vi.fn(),
  loadDetail: vi.fn(),
  deleteRun: vi.fn(),
  importFile: vi.fn(),
  logManual: vi.fn(),
});

vi.mock("~client/stores/runsStore", () => ({
  useRunsStore: () => runsStore,
}));

// Task 11: rank/PR chip data — mocked the same way runsStore is above so the chip/badge logic
// can be driven directly instead of depending on real network calls (which fail silently in
// jsdom the way the un-mocked plannedRouteStore already does elsewhere in this file).
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

// RunReplay renders a real Leaflet map (RunMap.vue) that throws on incomplete/fake point data
// in jsdom — already covered at its own layer, so it's stubbed here; RunsPage's own job is just
// to decide *whether* to render it.
const STUBS = { RunReplay: true };

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return { id: "run1", name: "Morgenlauf", startedAt: "2026-01-05T08:00:00.000Z", distanceM: 5000, avgPaceSPerKm: 300, ...overrides };
}
function makeDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run1",
    source: "gpx",
    name: "Morgenlauf",
    startedAt: "2026-01-05T08:00:00.000Z",
    distanceM: 5000,
    durationS: 1500,
    avgPaceSPerKm: 300,
    avgHr: 145,
    points: [],
    ...overrides,
  };
}

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
    runId: "run1",
    achievedAt: "2026-01-05T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runsStore.runs = [];
  runsStore.loaded = false;
  runsStore.load.mockImplementation(async () => {
    runsStore.loaded = true;
  });
  runRankStore.ranks = [];
  runRankStore.prs = [];
  runRankStore.ranksLoaded = false;
  runRankStore.prsLoaded = false;
});

describe("RunsPage", () => {
  it("loads runs on mount and auto-selects the first run's detail", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail());

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(runsStore.load).toHaveBeenCalledOnce();
    expect(runsStore.loadDetail).toHaveBeenCalledWith("run1");
    expect(wrapper.text()).toContain("5.00 km");
  });

  it("shows the empty state once loaded with zero runs, with no run selected", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(runsStore.loadDetail).not.toHaveBeenCalled();
    expect(wrapper.find(".runs-empty").exists()).toBe(true);
    expect(wrapper.text()).toContain("Noch keine Läufe erfasst.");
    expect(wrapper.find(".layout").exists()).toBe(false);
  });

  it("shows RunReplay only once the selected run has track points", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ points: [{ lat: 1, lng: 2 }] }));

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    const replay = wrapper.findComponent(RunReplay);
    expect(replay.exists()).toBe(true);
    expect(replay.props("points")).toStrictEqual([{ lat: 1, lng: 2 }]);
  });

  it("shows a manual-entry message instead of RunReplay when the run has no track points", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ points: [] }));

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(wrapper.findComponent(RunReplay).exists()).toBe(false);
    expect(wrapper.text()).toContain("Manuell erfasster Lauf");
  });

  it("requires a second tap to actually delete the selected run", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail());
    runsStore.deleteRun.mockResolvedValue(undefined);

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    const btn = wrapper.find(".delete-run-btn");
    await btn.trigger("click");
    expect(runsStore.deleteRun).not.toHaveBeenCalled();
    expect(wrapper.find(".delete-run-btn").text()).toContain("Wirklich löschen?");

    await wrapper.find(".delete-run-btn").trigger("click");
    await flushAsync();
    expect(runsStore.deleteRun).toHaveBeenCalledWith("run1");
  });

  it("shows a rank/category chip for the selected run's nearest category when it's rank-eligible", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k", tier: "advanced", division: 3 })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    const chip = wrapper.find(".rank-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("5 km");
    expect(chip.text()).toContain("FORTGESCHRITTEN");
    expect(chip.text()).toContain("III");
  });

  it("shows no rank chip when the run's category has no runRanks entry", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "marathon" })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(wrapper.find(".rank-chip").exists()).toBe(false);
  });

  it('shows "Neuer Rekord" when the selected run set a PR', async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ id: "run1", distanceM: 5000 }));
    runRankStore.prs = [makePr({ runId: "run1" })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    const prBadge = wrapper.find(".pr-chip");
    expect(prBadge.exists()).toBe(true);
    expect(prBadge.text()).toBe("Neuer Rekord");
  });

  it("does not show 'Neuer Rekord' when a different run holds the PR", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ id: "run1", distanceM: 5000 }));
    runRankStore.prs = [makePr({ runId: "some-other-run" })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(wrapper.find(".pr-chip").exists()).toBe(false);
  });

  it("never shows a rank chip or PR badge for a manual run, even if the data would otherwise match", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ id: "run1", source: "manual", distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k" })];
    runRankStore.prs = [makePr({ runId: "run1" })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(wrapper.find(".rank-chip").exists()).toBe(false);
    expect(wrapper.find(".pr-chip").exists()).toBe(false);
  });

  it("gives the rank chip and PR badge the earned-moment spring animation, not the plain row entrance", async () => {
    runsStore.runs = [makeRun()];
    runsStore.loadDetail.mockResolvedValue(makeDetail({ id: "run1", distanceM: 5000 }));
    runRankStore.ranks = [makeRankRow({ category: "5k" })];
    runRankStore.prs = [makePr({ runId: "run1" })];

    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    expect(wrapper.find(".rank-chip").classes()).toContain("pop-in");
    expect(wrapper.find(".pr-chip").classes()).toContain("pop-in");
  });

  it("surfaces a client-side validation error instead of submitting an invalid manual entry", async () => {
    const wrapper = mountWithProviders(RunsPage, { global: { stubs: STUBS } });
    await flushAsync();

    await wrapper.find(".pagehead .btn-secondary").trigger("click"); // "Manuell"
    await wrapper.find(".manual-form .btn-primary").trigger("click"); // submit with empty fields

    expect(runsStore.logManual).not.toHaveBeenCalled();
    expect(wrapper.find(".manual-form .error").text()).toContain("Bitte eine Distanz in km angeben.");
  });
});

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}
