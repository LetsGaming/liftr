import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkHealthConnectPermissionsMock,
  importNewHealthConnectWorkoutsMock,
  isHealthConnectAvailableMock,
  requestHealthConnectPermissionsMock,
} = vi.hoisted(() => ({
  checkHealthConnectPermissionsMock: vi.fn(),
  importNewHealthConnectWorkoutsMock: vi.fn(),
  isHealthConnectAvailableMock: vi.fn(),
  requestHealthConnectPermissionsMock: vi.fn(),
}));

vi.mock("~client/health/healthConnect", () => ({
  checkHealthConnectPermissions: checkHealthConnectPermissionsMock,
  importNewHealthConnectWorkouts: importNewHealthConnectWorkoutsMock,
  isHealthConnectAvailable: isHealthConnectAvailableMock,
  requestHealthConnectPermissions: requestHealthConnectPermissionsMock,
}));

const { refreshCardioDerivedStoresMock } = vi.hoisted(() => ({ refreshCardioDerivedStoresMock: vi.fn() }));
vi.mock("~client/composables/useCardioDerivedStores", () => ({
  refreshCardioDerivedStores: refreshCardioDerivedStoresMock,
}));

import { useHealthConnectImport } from "~client/composables/useHealthConnectImport";

beforeEach(() => {
  vi.clearAllMocks();
  isHealthConnectAvailableMock.mockResolvedValue(true);
  checkHealthConnectPermissionsMock.mockResolvedValue({ granted: false, missing: [] });
  requestHealthConnectPermissionsMock.mockResolvedValue({ granted: true, missing: [] });
});

describe("useHealthConnectImport — connectHealthConnect()", () => {
  it("refreshes XP/streak/rank once a manual sync actually imports a workout", async () => {
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, workouts: [] });
    const { connectHealthConnect } = useHealthConnectImport();

    await connectHealthConnect();

    expect(refreshCardioDerivedStoresMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh XP/streak/rank on a no-op manual sync (nothing new to import)", async () => {
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 0, skipped: 0, failed: 0, workouts: [] });
    const { connectHealthConnect } = useHealthConnectImport();

    await connectHealthConnect();

    expect(refreshCardioDerivedStoresMock).not.toHaveBeenCalled();
  });

  it("does not refresh XP/streak/rank when permission wasn't granted (no import attempted)", async () => {
    requestHealthConnectPermissionsMock.mockResolvedValue({ granted: false, missing: ["EXERCISE"] });
    const { connectHealthConnect } = useHealthConnectImport();

    await connectHealthConnect();

    expect(importNewHealthConnectWorkoutsMock).not.toHaveBeenCalled();
    expect(refreshCardioDerivedStoresMock).not.toHaveBeenCalled();
  });
});
