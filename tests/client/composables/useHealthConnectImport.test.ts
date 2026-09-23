import { flushPromises } from "@vue/test-utils";
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

  it("skips requestHealthConnectPermissions entirely when already granted (no permission activity, no pause/resume)", async () => {
    checkHealthConnectPermissionsMock.mockResolvedValue({ granted: true, missing: [] });
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 0, skipped: 0, failed: 0, workouts: [] });
    const { connectHealthConnect } = useHealthConnectImport();
    // The composable's own init effect (isHealthConnectAvailable().then(checkHealthConnectPermissions))
    // also calls checkHealthConnectPermissions once — flush and clear that call before exercising
    // connectHealthConnect()'s own permission check in isolation.
    await flushPromises();
    checkHealthConnectPermissionsMock.mockClear();

    await connectHealthConnect();

    expect(checkHealthConnectPermissionsMock).toHaveBeenCalledTimes(1);
    expect(requestHealthConnectPermissionsMock).not.toHaveBeenCalled();
    expect(importNewHealthConnectWorkoutsMock).toHaveBeenCalledWith("manual");
  });

  it("falls back to requestHealthConnectPermissions when the non-prompting check reports not granted", async () => {
    checkHealthConnectPermissionsMock.mockResolvedValue({ granted: false, missing: [] });
    requestHealthConnectPermissionsMock.mockResolvedValue({ granted: true, missing: [] });
    importNewHealthConnectWorkoutsMock.mockResolvedValue({ imported: 0, skipped: 0, failed: 0, workouts: [] });
    const { connectHealthConnect } = useHealthConnectImport();
    await flushPromises();
    checkHealthConnectPermissionsMock.mockClear();

    await connectHealthConnect();

    expect(checkHealthConnectPermissionsMock).toHaveBeenCalledTimes(1);
    expect(requestHealthConnectPermissionsMock).toHaveBeenCalledTimes(1);
    expect(importNewHealthConnectWorkoutsMock).toHaveBeenCalledWith("manual");
  });
});
