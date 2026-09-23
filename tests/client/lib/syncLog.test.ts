// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSyncLog, readSyncLog, recordSyncReport } from "~client/lib/syncLog";
import type { HealthConnectImportResult, HealthConnectWorkoutReport } from "~client/health/healthConnect";

function workoutReport(id: string): HealthConnectWorkoutReport {
  return {
    workoutId: id,
    rawWorkoutType: "RUNNING",
    title: null,
    startDate: "2026-09-20T08:00:00.000Z",
    endDate: "2026-09-20T08:30:00.000Z",
    durationS: 1800,
    distanceM: 5000,
    routePointCount: 0,
    routeStatus: "no_data",
    hrSampleCount: 0,
    outcome: { kind: "imported", runId: id },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("recordSyncReport", () => {
  it("appends an entry readable via readSyncLog", () => {
    const result: HealthConnectImportResult = { imported: 1, skipped: 0, failed: 0, workouts: [workoutReport("w1")] };
    recordSyncReport("manual", "2026-09-19T00:00:00.000Z", "2026-09-20T00:00:00.000Z", result);

    const log = readSyncLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.trigger).toBe("manual");
    expect(log[0]!.result.imported).toBe(1);
  });

  it("truncates the per-workout array past 50 entries while keeping the summary counts intact", () => {
    const workouts = Array.from({ length: 80 }, (_, i) => workoutReport(`w${i}`));
    const result: HealthConnectImportResult = { imported: 80, skipped: 0, failed: 0, workouts };
    recordSyncReport("manual", "2026-09-19T00:00:00.000Z", "2026-09-20T00:00:00.000Z", result);

    const log = readSyncLog();
    expect(log[0]!.result.imported).toBe(80);
    expect(log[0]!.result.workouts).toHaveLength(50);
  });

  it("console-warns instead of silently swallowing a storage quota failure", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const result: HealthConnectImportResult = { imported: 0, skipped: 0, failed: 0, workouts: [] };
    expect(() => recordSyncReport("manual", "a", "b", result)).not.toThrow();
    expect(warn).toHaveBeenCalled();

    setItemSpy.mockRestore();
    warn.mockRestore();
  });
});

describe("clearSyncLog", () => {
  it("removes every entry", () => {
    const result: HealthConnectImportResult = { imported: 0, skipped: 0, failed: 0, workouts: [] };
    recordSyncReport("manual", "a", "b", result);
    expect(readSyncLog()).toHaveLength(1);

    clearSyncLog();
    expect(readSyncLog()).toHaveLength(0);
  });
});
