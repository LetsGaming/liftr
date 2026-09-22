import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/runRankService", () => ({
  getRunRanks: vi.fn(),
  getRunPrs: vi.fn(),
  getRunOverallRank: vi.fn(),
}));

import { useRunRankStore } from "~client/stores/runRankStore";
import {
  getRunOverallRank,
  getRunPrs,
  getRunRanks,
  type RunPrListItem,
  type RunRankRow,
} from "~client/services/runRankService";

const getRunRanksMock = vi.mocked(getRunRanks);
const getRunPrsMock = vi.mocked(getRunPrs);
const getRunOverallRankMock = vi.mocked(getRunOverallRank);

function makeRankRow(overrides: Partial<RunRankRow> = {}): RunRankRow {
  return {
    activityType: "run",
    category: "5k",
    tier: "Silver",
    division: 2,
    lp: 900,
    bestSpeedMps: 3.5,
    trust: "real",
    nextTargetSpeedMps: 3.7,
    peakTier: "Silver",
    peakDivision: 2,
    ...overrides,
  };
}

const prs: RunPrListItem[] = [
  {
    id: "run-pr-1",
    activityType: "run",
    category: "10k",
    kind: "time",
    value: 2400,
    runId: "run-1",
    achievedAt: "2026-09-05T10:00:00Z",
  },
];

beforeEach(() => {
  setActivePinia(createPinia());
  getRunRanksMock.mockReset();
  getRunPrsMock.mockReset();
  getRunOverallRankMock.mockReset();
});

describe("runRankStore", () => {
  it("starts with empty ranks/prs, no overall band, nothing loaded, no errors", () => {
    const store = useRunRankStore();

    expect(store.ranks).toEqual([]);
    expect(store.prs).toEqual([]);
    expect(store.overallCurrent).toBeNull();
    expect(store.overallPeak).toBeNull();
    expect(store.ranksLoaded).toBe(false);
    expect(store.prsLoaded).toBe(false);
    expect(store.overallLoaded).toBe(false);
    expect(store.ranksError).toBe(false);
    expect(store.prsError).toBe(false);
    expect(store.overallError).toBe(false);
  });

  describe("loadRanks()", () => {
    // loadRanks() now fetches every ranked activity type (run/walk/hike) and flattens the
    // results — mockImplementation keyed on the activityType argument mirrors that fan-out
    // realistically, rather than a single queued return value per test.
    it("populates ranks on success, combining every ranked activity type", async () => {
      const rows = [makeRankRow()];
      getRunRanksMock.mockImplementation(async (activityType) => (activityType === "run" ? rows : []));
      const store = useRunRankStore();

      await store.loadRanks();

      expect(store.ranks).toEqual(rows);
      expect(store.ranksLoaded).toBe(true);
      expect(store.ranksError).toBe(false);
    });

    it("sets ranksError and leaves ranks alone if any activity type's fetch fails", async () => {
      getRunRanksMock.mockRejectedValue(new Error("network down"));
      const store = useRunRankStore();

      await store.loadRanks();

      expect(store.ranksError).toBe(true);
      expect(store.ranks).toEqual([]);
      expect(store.ranksLoaded).toBe(false);
    });

    it("clears a previous ranksError on a subsequent successful call", async () => {
      getRunRanksMock.mockRejectedValue(new Error("network down"));
      const store = useRunRankStore();
      await store.loadRanks();
      expect(store.ranksError).toBe(true);

      const rows = [makeRankRow()];
      getRunRanksMock.mockReset();
      getRunRanksMock.mockImplementation(async (activityType) => (activityType === "run" ? rows : []));
      await store.loadRanks();

      expect(store.ranksError).toBe(false);
      expect(store.ranks).toEqual(rows);
    });
  });

  describe("loadPrs()", () => {
    it("populates prs on success", async () => {
      getRunPrsMock.mockResolvedValue(prs);
      const store = useRunRankStore();

      await store.loadPrs();

      expect(store.prs).toEqual(prs);
      expect(store.prsLoaded).toBe(true);
      expect(store.prsError).toBe(false);
    });

    it("sets prsError and leaves prs alone on failure", async () => {
      getRunPrsMock.mockRejectedValue(new Error("network down"));
      const store = useRunRankStore();

      await store.loadPrs();

      expect(store.prsError).toBe(true);
      expect(store.prs).toEqual([]);
      expect(store.prsLoaded).toBe(false);
    });
  });

  describe("loadOverallRank()", () => {
    it("populates overallCurrent/overallPeak on success", async () => {
      getRunOverallRankMock.mockResolvedValue({
        current: { tier: "Gold", division: 2, lp: 1450 },
        peak: { tier: "Gold", division: 1, lp: 1620 },
      });
      const store = useRunRankStore();

      await store.loadOverallRank();

      expect(store.overallCurrent).toEqual({ tier: "Gold", division: 2, lp: 1450 });
      expect(store.overallPeak).toEqual({ tier: "Gold", division: 1, lp: 1620 });
      expect(store.overallLoaded).toBe(true);
      expect(store.overallError).toBe(false);
    });

    it("tolerates a null current/peak (no ranked runs yet)", async () => {
      getRunOverallRankMock.mockResolvedValue({ current: null, peak: null });
      const store = useRunRankStore();

      await store.loadOverallRank();

      expect(store.overallCurrent).toBeNull();
      expect(store.overallPeak).toBeNull();
      expect(store.overallLoaded).toBe(true);
    });

    it("sets overallError and leaves state alone on failure", async () => {
      getRunOverallRankMock.mockRejectedValue(new Error("network down"));
      const store = useRunRankStore();

      await store.loadOverallRank();

      expect(store.overallError).toBe(true);
      expect(store.overallLoaded).toBe(false);
      expect(store.overallCurrent).toBeNull();
      expect(store.overallPeak).toBeNull();
    });
  });

  describe("loadAll()", () => {
    it("loads ranks, prs, and overall rank together", async () => {
      const rows = [makeRankRow()];
      getRunRanksMock.mockImplementation(async (activityType) => (activityType === "run" ? rows : []));
      getRunPrsMock.mockResolvedValue(prs);
      getRunOverallRankMock.mockResolvedValue({
        current: { tier: "Gold", division: 2, lp: 1450 },
        peak: { tier: "Gold", division: 1, lp: 1620 },
      });
      const store = useRunRankStore();

      await store.loadAll();

      expect(store.ranks).toEqual(rows);
      expect(store.prs).toEqual(prs);
      expect(store.overallCurrent).toEqual({ tier: "Gold", division: 2, lp: 1450 });
      expect(store.ranksLoaded).toBe(true);
      expect(store.prsLoaded).toBe(true);
      expect(store.overallLoaded).toBe(true);
    });

    it("keeps sections independent: one failing doesn't block the others from loading", async () => {
      getRunRanksMock.mockRejectedValue(new Error("network down"));
      getRunPrsMock.mockResolvedValue(prs);
      getRunOverallRankMock.mockResolvedValue({ current: null, peak: null });
      const store = useRunRankStore();

      await store.loadAll();

      expect(store.ranksError).toBe(true);
      expect(store.prsError).toBe(false);
      expect(store.prsLoaded).toBe(true);
      expect(store.overallLoaded).toBe(true);
    });
  });
});
