import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const {
  importNewHealthConnectWorkoutsMock,
  isHealthConnectAvailableMock,
  resetHealthConnectScanWindowMock,
  waitForInFlightHealthConnectImportMock,
  refreshCardioDerivedStoresMock,
  readSyncLogMock,
  clearSyncLogMock,
  getMeMock,
} = vi.hoisted(() => ({
  importNewHealthConnectWorkoutsMock: vi.fn(),
  isHealthConnectAvailableMock: vi.fn(),
  resetHealthConnectScanWindowMock: vi.fn(),
  waitForInFlightHealthConnectImportMock: vi.fn().mockResolvedValue(undefined),
  refreshCardioDerivedStoresMock: vi.fn(),
  readSyncLogMock: vi.fn(),
  clearSyncLogMock: vi.fn(),
  getMeMock: vi.fn(),
}));

vi.mock("~client/health/healthConnect", () => ({
  importNewHealthConnectWorkouts: importNewHealthConnectWorkoutsMock,
  isHealthConnectAvailable: isHealthConnectAvailableMock,
  resetHealthConnectScanWindow: resetHealthConnectScanWindowMock,
  waitForInFlightHealthConnectImport: waitForInFlightHealthConnectImportMock,
}));
vi.mock("~client/composables/useCardioDerivedStores", () => ({
  refreshCardioDerivedStores: refreshCardioDerivedStoresMock,
}));
vi.mock("~client/lib/syncLog", () => ({
  readSyncLog: readSyncLogMock,
  clearSyncLog: clearSyncLogMock,
}));
vi.mock("~client/services/authService", () => ({
  getMe: getMeMock,
  getRecentErrors: vi.fn(),
}));

import DiagnosticsPage from "~client/pages/DiagnosticsPage.vue";

const logEntry = (overrides: Partial<{ at: string; trigger: "manual" | "resume" }> = {}) => ({
  at: "2026-09-20T08:00:00.000Z",
  trigger: "manual" as const,
  windowStart: "2026-09-19T08:00:00.000Z",
  windowEnd: "2026-09-20T08:00:00.000Z",
  result: { imported: 1, skipped: 0, failed: 0, workouts: [] },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getMeMock.mockResolvedValue({ id: "u1", role: "member" });
  readSyncLogMock.mockReturnValue([]);
  isHealthConnectAvailableMock.mockResolvedValue(true);
});

describe("DiagnosticsPage — rescan", () => {
  it("resets the scan window and immediately runs an import, then re-reads the log", async () => {
    readSyncLogMock.mockReturnValueOnce([]).mockReturnValueOnce([logEntry()]);
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, workouts: [] });
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    await wrapper.find("button.btn-secondary").trigger("click");
    await flushPromises();

    expect(resetHealthConnectScanWindowMock).toHaveBeenCalledWith(30);
    expect(importNewHealthConnectWorkoutsMock).toHaveBeenCalledWith("manual");
    expect(readSyncLogMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("1 importiert");
  });

  it("refreshes XP/streak/rank stores when the rescan actually imports something", async () => {
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 2, skipped: 0, failed: 0, workouts: [] });
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    await wrapper.find("button.btn-secondary").trigger("click");
    await flushPromises();

    expect(refreshCardioDerivedStoresMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh those stores when nothing was imported", async () => {
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 0, skipped: 1, failed: 0, workouts: [] });
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    await wrapper.find("button.btn-secondary").trigger("click");
    await flushPromises();

    expect(refreshCardioDerivedStoresMock).not.toHaveBeenCalled();
  });

  it("waits out an already in-flight import before resetting the scan window, so it can't consume the widened window", async () => {
    const callOrder: string[] = [];
    waitForInFlightHealthConnectImportMock.mockImplementation(async () => {
      callOrder.push("wait");
    });
    resetHealthConnectScanWindowMock.mockImplementation(() => {
      callOrder.push("reset");
    });
    importNewHealthConnectWorkoutsMock.mockImplementation(async () => {
      callOrder.push("import");
      return { imported: 0, skipped: 0, failed: 0, workouts: [] };
    });
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    await wrapper.find("button.btn-secondary").trigger("click");
    await flushPromises();

    expect(callOrder).toEqual(["wait", "reset", "import"]);
  });
});

describe("DiagnosticsPage — clear log", () => {
  it("shows a clear-log action only once there is a log, and wires it behind a confirm tap", async () => {
    readSyncLogMock.mockReturnValue([logEntry()]);
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 0, skipped: 0, failed: 0, workouts: [] });
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    const clearBtn = wrapper.findAll("button").find((b) => b.text().includes("Protokoll leeren"));
    expect(clearBtn).toBeTruthy();

    await clearBtn!.trigger("click");
    expect(clearSyncLogMock).not.toHaveBeenCalled();
    expect(clearBtn!.text()).toContain("Wirklich leeren?");

    await clearBtn!.trigger("click");
    expect(clearSyncLogMock).toHaveBeenCalledTimes(1);
  });
});

describe("DiagnosticsPage — Health Connect gating", () => {
  it("hides the whole Synchronisierung section on a platform without Health Connect", async () => {
    isHealthConnectAvailableMock.mockResolvedValue(false);
    const wrapper = mountWithProviders(DiagnosticsPage);
    await flushPromises();

    expect(wrapper.text()).not.toContain("Synchronisierung");
    expect(wrapper.findAll("button").find((b) => b.text().includes("30 Tage"))).toBeFalsy();
  });
});
