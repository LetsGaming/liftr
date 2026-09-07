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

beforeEach(() => {
  vi.clearAllMocks();
  runsStore.runs = [];
  runsStore.loaded = false;
  runsStore.load.mockImplementation(async () => {
    runsStore.loaded = true;
  });
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
