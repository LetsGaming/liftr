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
  advanceMesocycle,
  createRoutine,
  deleteRoutine,
  endMesocycle,
  getRoutines,
  recommendExercises,
  startMesocycle,
  suggestExercises,
  updateRoutine,
  type RoutineExerciseInput,
} from "~client/services/routineService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);
const mockDel = vi.mocked(api.del);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRoutines", () => {
  it("GETs /api/routines and returns the parsed list", async () => {
    const body = [{ id: "r1", name: "Push", orderIndex: 0, routineExercises: [], mesocycle: null }];
    mockGet.mockResolvedValue(body);

    const result = await getRoutines();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/routines");
    expect(result).toBe(body);
  });
});

describe("createRoutine", () => {
  it("POSTs { name, exercises } to /api/routines", async () => {
    const exercises: RoutineExerciseInput[] = [{ exerciseId: "ex1", orderIndex: 0, targetSets: [{ reps: 10, weightKg: 20 }] }];
    const created = { id: "r1", name: "Push", orderIndex: 0, routineExercises: [], mesocycle: null };
    mockPost.mockResolvedValue(created);

    const result = await createRoutine("Push", exercises);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/routines", { name: "Push", exercises });
    expect(result).toBe(created);
  });
});

describe("deleteRoutine", () => {
  it("DELETEs /api/routines/:id", async () => {
    mockDel.mockResolvedValue(undefined);

    await deleteRoutine("r1");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("/api/routines/r1");
  });
});

describe("updateRoutine", () => {
  it("PATCHes the given payload verbatim (rename-only omits exercises)", async () => {
    mockPatch.mockResolvedValue(undefined);

    await updateRoutine("r1", { name: "New name" });

    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith("/api/routines/r1", { name: "New name" });
  });

  it("PATCHes a full replace payload including exercises and orderIndex", async () => {
    const exercises: RoutineExerciseInput[] = [{ exerciseId: "ex1", orderIndex: 0, targetSets: [] }];
    mockPatch.mockResolvedValue(undefined);

    await updateRoutine("r1", { exercises, orderIndex: 2 });

    expect(mockPatch).toHaveBeenCalledWith("/api/routines/r1", { exercises, orderIndex: 2 });
  });
});

describe("startMesocycle", () => {
  it("POSTs { totalWeeks } to /api/routines/:id/mesocycle", async () => {
    const meso = { id: "m1", routineId: "r1", totalWeeks: 4, currentWeek: 1, weekPercents: [100, 100, 100, 60] };
    mockPost.mockResolvedValue(meso);

    const result = await startMesocycle("r1", 4);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/routines/r1/mesocycle", { totalWeeks: 4 });
    expect(result).toBe(meso);
  });
});

describe("endMesocycle", () => {
  it("DELETEs /api/routines/:id/mesocycle", async () => {
    mockDel.mockResolvedValue(undefined);

    await endMesocycle("r1");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("/api/routines/r1/mesocycle");
  });
});

describe("advanceMesocycle", () => {
  it("POSTs an empty body to /api/routines/:id/mesocycle/advance", async () => {
    const meso = { id: "m1", routineId: "r1", totalWeeks: 4, currentWeek: 2, weekPercents: [100, 100, 100, 60] };
    mockPost.mockResolvedValue(meso);

    const result = await advanceMesocycle("r1");

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/routines/r1/mesocycle/advance", {});
    expect(result).toBe(meso);
  });
});

describe("suggestExercises", () => {
  it("POSTs { muscleSlugs } without exercisesPerMuscle when omitted, and unwraps { exercises }", async () => {
    const exercises = [{ exerciseId: "ex1", slug: "bench-press", targetSets: [{ reps: 10, weightKg: 20 }] }];
    mockPost.mockResolvedValue({ exercises });

    const result = await suggestExercises(["chest", "back"]);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/routines/suggest", { muscleSlugs: ["chest", "back"] });
    expect(result).toBe(exercises);
  });

  it("includes exercisesPerMuscle in the payload when given", async () => {
    mockPost.mockResolvedValue({ exercises: [] });

    await suggestExercises(["chest"], 3);

    expect(mockPost).toHaveBeenCalledWith("/api/routines/suggest", { muscleSlugs: ["chest"], exercisesPerMuscle: 3 });
  });

  it("omits exercisesPerMuscle from the payload when it is 0 (falsy, not just omitted)", async () => {
    mockPost.mockResolvedValue({ exercises: [] });

    await suggestExercises(["chest"], 0);

    expect(mockPost).toHaveBeenCalledWith("/api/routines/suggest", { muscleSlugs: ["chest"] });
  });
});

describe("recommendExercises", () => {
  it("POSTs { exerciseIds } without experienceLevel when omitted, and unwraps { exercises }", async () => {
    const exercises = [{ exerciseId: "ex1", slug: "bench-press", targetSets: [] }];
    mockPost.mockResolvedValue({ exercises });

    const result = await recommendExercises(["ex1", "ex2"]);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/routines/recommend", { exerciseIds: ["ex1", "ex2"] });
    expect(result).toBe(exercises);
  });

  it("includes experienceLevel in the payload when given", async () => {
    mockPost.mockResolvedValue({ exercises: [] });

    await recommendExercises(["ex1"], "advanced");

    expect(mockPost).toHaveBeenCalledWith("/api/routines/recommend", { exerciseIds: ["ex1"], experienceLevel: "advanced" });
  });
});
