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
import {
  createExercise,
  getExerciseHistory,
  getExercises,
  type CatalogExercise,
  type ExerciseHistorySet,
} from "~client/services/exerciseService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getExercises", () => {
  it("GETs /api/exercises and returns the catalog verbatim", async () => {
    const catalog: CatalogExercise[] = [
      {
        id: "1",
        slug: "bench-press",
        name: null,
        equipment: "barbell",
        requiredEquipment: [],
        movementPattern: "push",
        isBodyweight: false,
        isCustom: false,
        demoStartImage: null,
        demoEndImage: null,
        howToKey: null,
        hasImage: true,
        muscles: [],
      },
    ];
    mockGet.mockResolvedValue(catalog);

    const result = await getExercises();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/exercises");
    expect(result).toBe(catalog);
  });
});

describe("getExerciseHistory", () => {
  it("GETs /api/exercises/:id/history and unwraps the { sets } envelope", async () => {
    const sets: ExerciseHistorySet[] = [
      { setIndex: 0, weightKg: 60, reps: 5, loggedAt: "2026-01-01T00:00:00.000Z", isWarmup: false },
    ];
    mockGet.mockResolvedValue({ sets });

    const result = await getExerciseHistory("ex-1");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/exercises/ex-1/history");
    expect(result).toBe(sets);
  });

  it("returns an empty array when the server reports no sets", async () => {
    mockGet.mockResolvedValue({ sets: [] });

    const result = await getExerciseHistory("ex-2");

    expect(result).toEqual([]);
  });

  it("interpolates the exercise id into the URL path", async () => {
    mockGet.mockResolvedValue({ sets: [] });

    await getExerciseHistory("some-uuid-123");

    expect(mockGet).toHaveBeenCalledWith("/api/exercises/some-uuid-123/history");
  });
});

describe("createExercise", () => {
  it("POSTs the input to /api/exercises and returns the created id/slug", async () => {
    const created = { id: "ex-9", slug: "custom-curl" };
    mockPost.mockResolvedValue(created);

    const input = {
      slug: "custom-curl",
      name: "Custom Curl",
      movementPattern: "pull",
      isBodyweight: false,
    };
    const result = await createExercise(input);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/exercises", input);
    expect(result).toBe(created);
  });

  it("passes optional equipment and muscleSlugs through unchanged", async () => {
    mockPost.mockResolvedValue({ id: "ex-10", slug: "custom-row" });

    const input = {
      slug: "custom-row",
      name: "Custom Row",
      equipment: "dumbbell",
      movementPattern: "pull",
      isBodyweight: false,
      muscleSlugs: [{ slug: "lats", role: "primary" as const }],
    };
    await createExercise(input);

    expect(mockPost).toHaveBeenCalledWith("/api/exercises", input);
  });
});
