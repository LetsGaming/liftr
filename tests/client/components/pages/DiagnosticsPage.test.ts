import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const {
  importNewHealthConnectWorkoutsMock,
  resetHealthConnectScanWindowMock,
  readSyncLogMock,
  clearSyncLogMock,
  getMeMock,
} = vi.hoisted(() => ({
  importNewHealthConnectWorkoutsMock: vi.fn(),
  resetHealthConnectScanWindowMock: vi.fn(),
  readSyncLogMock: vi.fn(),
  clearSyncLogMock: vi.fn(),
  getMeMock: vi.fn(),
}));

vi.mock("~client/health/healthConnect", () => ({
  importNewHealthConnectWorkouts: importNewHealthConnectWorkoutsMock,
  resetHealthConnectScanWindow: resetHealthConnectScanWindowMock,
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
