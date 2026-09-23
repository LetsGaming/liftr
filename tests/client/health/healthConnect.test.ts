// healthConnect.ts's requestHealthConnectPermissions() used to crash with "permissions.every is
// not a function": capacitor-health@8.2.0's TS types claim `permissions` is an array of
// per-permission objects, but the real native Kotlin (HealthPlugin.kt grantedPermissionResult)
// returns one flat object keyed by permission name. This regression-tests the real runtime shape,
// not the (wrong) declared type.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHealthPermissionsMock = vi.fn();
const checkHealthPermissionsMock = vi.fn();
const isHealthAvailableMock = vi.fn();
const queryWorkoutsMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("capacitor-health", () => ({
  Health: {
    requestHealthPermissions: requestHealthPermissionsMock,
    checkHealthPermissions: checkHealthPermissionsMock,
    isHealthAvailable: isHealthAvailableMock,
    queryWorkouts: queryWorkoutsMock,
  },
}));

vi.mock("~client/lib/platform", () => ({
  isAndroid: () => true,
}));

vi.mock("~client/lib/api", () => ({
  api: { post: apiPostMock },
  ApiError: class ApiError extends Error {
    detail?: string;
  },
}));

const GRANTED = { READ_WORKOUTS: true, READ_ROUTE: true, READ_HEART_RATE: true, READ_DISTANCE: true };

function workout(
  overrides: Partial<{
    id: string;
    sourceName: string | null;
    title: string;
    workoutType: string;
    startDate: string;
    endDate: string;
    duration: number;
    distance: number;
    route: unknown[];
    routeStatus: "data" | "consent_required" | "no_data";
  }> = {},
) {
  return {
    id: "hc-1",
    sourceName: "Morning Run",
    title: "Morning Run",
    workoutType: "RUNNING",
    startDate: "2026-09-20T08:00:00.000Z",
    endDate: "2026-09-20T08:30:00.000Z",
    duration: 1800,
    distance: 5000,
    route: [{ timestamp: "2026-09-20T08:00:00.000Z", lat: 52.5, lng: 13.4, alt: 34 }],
    routeStatus: "data" as const,
    heartRate: [],
    ...overrides,
  };
}

beforeEach(() => {
  requestHealthPermissionsMock.mockReset();
  checkHealthPermissionsMock.mockReset();
  isHealthAvailableMock.mockReset();
  queryWorkoutsMock.mockReset();
  apiPostMock.mockReset();
  isHealthAvailableMock.mockResolvedValue({ available: true });
  localStorage.clear();
});

describe("requestHealthConnectPermissions", () => {
  it("grants when every permission in the flat object response is true", async () => {
    requestHealthPermissionsMock.mockResolvedValue({ permissions: GRANTED });
    const { requestHealthConnectPermissions } = await import("~client/health/healthConnect");
    await expect(requestHealthConnectPermissions()).resolves.toEqual({
      granted: true,
      missing: [],
    });
  });

  it("denies when any permission in the flat object response is false", async () => {
    requestHealthPermissionsMock.mockResolvedValue({
      permissions: { ...GRANTED, READ_ROUTE: false },
    });

    const { requestHealthConnectPermissions } = await import("~client/health/healthConnect");

    await expect(requestHealthConnectPermissions()).resolves.toEqual({
      granted: false,
      missing: ["Strecken"],
    });
  });
});

describe("checkHealthConnectPermissions", () => {
  it("reports the current grant without prompting (calls checkHealthPermissions, not requestHealthPermissions)", async () => {
    checkHealthPermissionsMock.mockResolvedValue({ permissions: GRANTED });
    const { checkHealthConnectPermissions } = await import("~client/health/healthConnect");

    await expect(checkHealthConnectPermissions()).resolves.toEqual({ granted: true, missing: [] });
    expect(checkHealthPermissionsMock).toHaveBeenCalledTimes(1);
    expect(requestHealthPermissionsMock).not.toHaveBeenCalled();
  });
});

describe("importNewHealthConnectWorkouts", () => {
  it("imports a workout with a valid route (routeStatus: 'data') and advances lastCheck", async () => {
    queryWorkoutsMock.mockResolvedValue({ workouts: [workout()] });
    apiPostMock.mockResolvedValue({ id: "run-1" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]!.outcome).toEqual({ kind: "imported", runId: "run-1" });
    expect(result.workouts[0]!.routeStatus).toBe("data");
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/runs/healthconnect",
      expect.objectContaining({
        platformId: "hc-1",
        workoutType: "RUNNING",
        points: [expect.objectContaining({ lat: 52.5, lon: 13.4 })],
      }),
    );
    expect(localStorage.getItem("liftr.healthconnect.lastCheck")).toBeTruthy();
  });

  it("coerces a stringified altitude from the native bridge to a number", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [
        workout({
          route: [{ timestamp: "2026-09-20T08:00:00.000Z", lat: 52.5, lng: 13.4, alt: "34" as unknown as number }],
        }),
      ],
    });
    apiPostMock.mockResolvedValue({ id: "run-1" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await importNewHealthConnectWorkouts();
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/runs/healthconnect",
      expect.objectContaining({ points: [expect.objectContaining({ ele: 34 })] }),
    );
  });

  it("routeStatus 'consent_required' with no fallback aggregate: skipped with reason route_consent_required", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [], distance: undefined, duration: undefined, routeStatus: "consent_required" })],
    });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.skipped).toBe(1);
    expect(result.workouts[0]!.outcome).toEqual({ kind: "skipped", reason: "route_consent_required" });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("routeStatus 'consent_required' WITH a fallback aggregate: imports route-less (distance/duration only)", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [], routeStatus: "consent_required", distance: 5000, duration: 3000 })],
    });
    apiPostMock.mockResolvedValue({ id: "run-2" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.imported).toBe(1);
    expect(result.workouts[0]!.outcome).toEqual({ kind: "imported", runId: "run-2" });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/runs/healthconnect",
      expect.objectContaining({ platformId: "hc-1", distanceM: 5000, durationS: 3000, startedAt: "2026-09-20T08:00:00.000Z" }),
    );
    const [, body] = apiPostMock.mock.calls[0]!;
    expect(body.points).toBeUndefined();
  });

  it("routeStatus 'no_data' with no fallback aggregate: skipped with reason route_missing", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [], distance: undefined, duration: undefined, routeStatus: "no_data" })],
    });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.skipped).toBe(1);
    expect(result.workouts[0]!.outcome).toEqual({ kind: "skipped", reason: "route_missing" });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("routeStatus 'no_data' WITH a fallback aggregate: imports route-less", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [], routeStatus: "no_data", distance: 5000, duration: 3000 })],
    });
    apiPostMock.mockResolvedValue({ id: "run-3" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.imported).toBe(1);
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/runs/healthconnect",
      expect.objectContaining({ distanceM: 5000, durationS: 3000 }),
    );
  });

  it("drops individually invalid points (missing coordinates) instead of failing the whole workout", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [
        workout({
          route: [
            { timestamp: "2026-09-20T08:00:00.000Z", lat: 52.5, lng: 13.4 },
            { timestamp: "2026-09-20T08:00:05.000Z", lat: Number.NaN, lng: 13.4 },
            { timestamp: "not-a-date", lat: 52.6, lng: 13.5 },
          ],
        }),
      ],
    });
    apiPostMock.mockResolvedValue({ id: "run-4" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.imported).toBe(1);
    const points = apiPostMock.mock.calls[0]![1].points;
    expect(points).toHaveLength(1);
  });

  it("every point invalid, no fallback aggregate: skipped with reason invalid_points", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [
        workout({
          route: [{ timestamp: "bad", lat: Number.NaN, lng: Number.NaN }],
          distance: undefined,
          duration: undefined,
        }),
      ],
    });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.skipped).toBe(1);
    expect(result.workouts[0]!.outcome).toEqual({ kind: "skipped", reason: "invalid_points" });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("isolates a per-workout API failure: other workouts still import, and lastCheck still advances", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ id: "hc-bad" }), workout({ id: "hc-good" })],
    });
    apiPostMock.mockRejectedValueOnce(new Error("400")).mockResolvedValueOnce({ id: "run-good" });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const result = await importNewHealthConnectWorkouts();
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.workouts.find((w) => w.workoutId === "hc-bad")?.outcome).toMatchObject({ kind: "failed" });
    expect(result.workouts.find((w) => w.workoutId === "hc-good")?.outcome).toEqual({ kind: "imported", runId: "run-good" });
    expect(localStorage.getItem("liftr.healthconnect.lastCheck")).toBeTruthy();
  });

  it("records every check in the sync log, even a run with only skips", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [], distance: undefined, duration: undefined, routeStatus: "no_data" })],
    });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");
    const { readSyncLog } = await import("~client/lib/syncLog");

    await importNewHealthConnectWorkouts("manual");
    const log = readSyncLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.trigger).toBe("manual");
    expect(log[0]!.result.skipped).toBe(1);
  });
});

describe("importNewHealthConnectWorkouts — in-flight guard", () => {
  it("a second concurrent call awaits the first call's result instead of starting its own run", async () => {
    let resolveQuery!: (v: { workouts: unknown[] }) => void;
    queryWorkoutsMock.mockReturnValue(new Promise((resolve) => (resolveQuery = resolve)));
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    const first = importNewHealthConnectWorkouts("manual");
    const second = importNewHealthConnectWorkouts("resume");
    resolveQuery({ workouts: [] });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(queryWorkoutsMock).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
  });

  it("allows a fresh run once the in-flight one has completed", async () => {
    queryWorkoutsMock.mockResolvedValue({ workouts: [] });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await importNewHealthConnectWorkouts();
    await importNewHealthConnectWorkouts();

    expect(queryWorkoutsMock).toHaveBeenCalledTimes(2);
  });
});

describe("resetHealthConnectScanWindow", () => {
  it("winds lastCheck back by the given number of days", async () => {
    const { resetHealthConnectScanWindow } = await import("~client/health/healthConnect");
    const before = Date.now();
    resetHealthConnectScanWindow(90);
    const stored = new Date(localStorage.getItem("liftr.healthconnect.lastCheck")!).getTime();
    const expectedMs = before - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(stored - expectedMs)).toBeLessThan(5000);
  });
});
