// healthConnect.ts's requestHealthConnectPermissions() used to crash with "permissions.every is
// not a function": capacitor-health@8.2.0's TS types claim `permissions` is an array of
// per-permission objects, but the real native Kotlin (HealthPlugin.kt grantedPermissionResult)
// returns one flat object keyed by permission name. This regression-tests the real runtime shape,
// not the (wrong) declared type.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHealthPermissionsMock = vi.fn();
const isHealthAvailableMock = vi.fn();

vi.mock("capacitor-health", () => ({
  Health: {
    requestHealthPermissions: requestHealthPermissionsMock,
    isHealthAvailable: isHealthAvailableMock,
    queryWorkouts: vi.fn(),
  },
}));

vi.mock("~client/lib/platform", () => ({
  isAndroid: () => true,
}));

vi.mock("~client/lib/api", () => ({
  api: { post: vi.fn() },
}));

describe("requestHealthConnectPermissions", () => {
  beforeEach(() => {
    requestHealthPermissionsMock.mockReset();
    isHealthAvailableMock.mockReset();
    isHealthAvailableMock.mockResolvedValue({ available: true });
  });

  it("grants when every permission in the flat object response is true", async () => {
    requestHealthPermissionsMock.mockResolvedValue({
      permissions: {
        READ_WORKOUTS: true,
        READ_ROUTE: true,
        READ_HEART_RATE: true,
      },
    });
    const { requestHealthConnectPermissions } =
      await import("~client/health/healthConnect");
    await expect(requestHealthConnectPermissions()).resolves.toEqual({
      granted: true,
      missing: [],
    });
  });

  it("denies when any permission in the flat object response is false", async () => {
    requestHealthPermissionsMock.mockResolvedValue({
      permissions: {
        READ_WORKOUTS: true,
        READ_ROUTE: false,
        READ_HEART_RATE: true,
      },
    });

    const { requestHealthConnectPermissions } =
      await import("~client/health/healthConnect");

    await expect(requestHealthConnectPermissions()).resolves.toEqual({
      granted: false,
      missing: ["Strecken"],
    });
  });
});
