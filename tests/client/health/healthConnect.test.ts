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
}));

const GRANTED = { READ_WORKOUTS: true, READ_ROUTE: true, READ_HEART_RATE: true };

function workout(overrides: Partial<{ id: string; sourceName: string | null; route: unknown[] }> = {}) {
  return {
    id: "hc-1",
    sourceName: "Morning Run",
    route: [{ timestamp: "2026-09-20T08:00:00.000Z", lat: 52.5, lng: 13.4, alt: 34 }],
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
  it("imports a workout with a valid route and advances lastCheck", async () => {
    queryWorkoutsMock.mockResolvedValue({ workouts: [workout()] });
    apiPostMock.mockResolvedValue({});
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await expect(importNewHealthConnectWorkouts()).resolves.toEqual({ imported: 1, failed: 0 });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/runs/healthconnect",
      expect.objectContaining({ platformId: "hc-1", points: [expect.objectContaining({ lat: 52.5, lon: 13.4 })] }),
    );
    expect(localStorage.getItem("liftr.healthconnect.lastCheck")).toBeTruthy();
  });

  it("skips a workout with no route entirely, without calling the API", async () => {
    queryWorkoutsMock.mockResolvedValue({ workouts: [workout({ route: [] })] });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await expect(importNewHealthConnectWorkouts()).resolves.toEqual({ imported: 0, failed: 0 });
    expect(apiPostMock).not.toHaveBeenCalled();
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
    apiPostMock.mockResolvedValue({});
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await expect(importNewHealthConnectWorkouts()).resolves.toEqual({ imported: 1, failed: 0 });
    const points = apiPostMock.mock.calls[0]![1].points;
    expect(points).toHaveLength(1);
  });

  it("skips a workout whose every point is invalid, without calling the API", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ route: [{ timestamp: "bad", lat: Number.NaN, lng: Number.NaN }] })],
    });
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await expect(importNewHealthConnectWorkouts()).resolves.toEqual({ imported: 0, failed: 0 });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("isolates a per-workout API failure: other workouts still import, and lastCheck still advances", async () => {
    queryWorkoutsMock.mockResolvedValue({
      workouts: [workout({ id: "hc-bad" }), workout({ id: "hc-good" })],
    });
    apiPostMock.mockRejectedValueOnce(new Error("400")).mockResolvedValueOnce({});
    const { importNewHealthConnectWorkouts } = await import("~client/health/healthConnect");

    await expect(importNewHealthConnectWorkouts()).resolves.toEqual({ imported: 1, failed: 1 });
    expect(localStorage.getItem("liftr.healthconnect.lastCheck")).toBeTruthy();
  });
});
