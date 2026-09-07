import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "~client/lib/api";
import { deleteWorkout, getWorkout } from "~client/services/workoutService";

const mockGet = vi.mocked(api.get);
const mockDel = vi.mocked(api.del);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWorkout", () => {
  it("GETs /api/workouts/:id and returns the parsed detail", async () => {
    const body = {
      id: "w1",
      routineId: null,
      startedAt: "2026-09-01T00:00:00.000Z",
      endedAt: null,
      pausedSeconds: 0,
      notes: null,
      workoutExercises: [],
    };
    mockGet.mockResolvedValue(body);

    const result = await getWorkout("w1");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/workouts/w1");
    expect(result).toBe(body);
  });
});

describe("deleteWorkout", () => {
  it("DELETEs /api/workouts/:id", async () => {
    mockDel.mockResolvedValue(undefined);

    await deleteWorkout("w1");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("/api/workouts/w1");
  });
});
