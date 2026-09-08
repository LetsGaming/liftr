import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRunsMock, getRunDetailMock, importRunFileMock, logManualRunMock, deleteRunMock } = vi.hoisted(() => ({
  getRunsMock: vi.fn(),
  getRunDetailMock: vi.fn(),
  importRunFileMock: vi.fn(),
  logManualRunMock: vi.fn(),
  deleteRunMock: vi.fn(),
}));

vi.mock("~client/services/runService", () => ({
  getRuns: getRunsMock,
  getRunDetail: getRunDetailMock,
  importRunFile: importRunFileMock,
  logManualRun: logManualRunMock,
  deleteRun: deleteRunMock,
}));

import { useRunsStore } from "~client/stores/runsStore";
import type { RunDetail, RunSummary } from "~client/services/runService";

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    source: "gpx",
    name: "Morning Run",
    startedAt: "2026-09-07T06:00:00Z",
    distanceM: 5000,
    durationS: 1500,
    avgPaceSPerKm: 300,
    avgHr: 150,
    elevationGainM: 40,
    plannedRouteId: null,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getRunsMock.mockReset();
  getRunDetailMock.mockReset();
  importRunFileMock.mockReset();
  logManualRunMock.mockReset();
  deleteRunMock.mockReset();
});

describe("runsStore", () => {
  it("starts with an empty run list and not loaded", () => {
    const store = useRunsStore();

    expect(store.runs).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() populates runs and flips loaded on success", async () => {
    const runs = [makeRun()];
    getRunsMock.mockResolvedValue(runs);
    const store = useRunsStore();

    await store.load();

    expect(store.runs).toEqual(runs);
    expect(store.loaded).toBe(true);
  });

  it("load() silently no-ops on failure — list stays whatever it was, no crash", async () => {
    getRunsMock.mockRejectedValue(new Error("offline"));
    const store = useRunsStore();

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.runs).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() leaves previously loaded runs in place if a later reload fails", async () => {
    const runs = [makeRun()];
    getRunsMock.mockResolvedValueOnce(runs);
    const store = useRunsStore();
    await store.load();

    getRunsMock.mockRejectedValueOnce(new Error("offline"));
    await store.load();

    expect(store.runs).toEqual(runs);
    expect(store.loaded).toBe(true);
  });

  describe("loadDetail()", () => {
    it("returns the run detail without touching the runs list", async () => {
      const detail: RunDetail = { ...makeRun(), points: [{ idx: 0, t: "2026-09-07T06:00:00Z", lat: 1, lon: 2, ele: null, hr: null, cadence: null }] };
      getRunDetailMock.mockResolvedValue(detail);
      const store = useRunsStore();

      const result = await store.loadDetail("run-1");

      expect(getRunDetailMock).toHaveBeenCalledWith("run-1");
      expect(result).toEqual(detail);
      expect(store.runs).toEqual([]);
    });
  });

  describe("importFile()", () => {
    it("uploads the file, then reloads the run list, and returns the new run", async () => {
      const file = new File(["gpx-data"], "run.gpx");
      const imported = makeRun({ id: "run-imported" });
      importRunFileMock.mockResolvedValue(imported);
      getRunsMock.mockResolvedValue([imported]);
      const store = useRunsStore();

      const result = await store.importFile(file);

      expect(importRunFileMock).toHaveBeenCalledWith(file);
      expect(getRunsMock).toHaveBeenCalledTimes(1);
      expect(store.runs).toEqual([imported]);
      expect(result).toEqual(imported);
    });
  });

  describe("logManual()", () => {
    it("logs the manual run, then reloads the run list", async () => {
      const input = { name: "Evening jog", startedAt: "2026-09-07T18:00:00Z", distanceM: 3000, durationS: 900 };
      logManualRunMock.mockResolvedValue(makeRun());
      getRunsMock.mockResolvedValue([makeRun()]);
      const store = useRunsStore();

      await store.logManual(input);

      expect(logManualRunMock).toHaveBeenCalledWith(input);
      expect(getRunsMock).toHaveBeenCalledTimes(1);
      expect(store.runs).toEqual([makeRun()]);
    });
  });

  describe("deleteRun()", () => {
    it("deletes on the server and removes it from local state without a full reload", async () => {
      const a = makeRun({ id: "run-a" });
      const b = makeRun({ id: "run-b" });
      getRunsMock.mockResolvedValue([a, b]);
      const store = useRunsStore();
      await store.load();
      deleteRunMock.mockResolvedValue(undefined);

      await store.deleteRun("run-a");

      expect(deleteRunMock).toHaveBeenCalledWith("run-a");
      expect(store.runs).toEqual([b]);
      expect(getRunsMock).toHaveBeenCalledTimes(1);
    });
  });
});
