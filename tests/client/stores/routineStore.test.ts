import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRoutinesMock,
  createRoutineMock,
  deleteRoutineMock,
  updateRoutineMock,
  startMesocycleMock,
  endMesocycleMock,
  advanceMesocycleMock,
  suggestExercisesMock,
} = vi.hoisted(() => ({
  getRoutinesMock: vi.fn(),
  createRoutineMock: vi.fn(),
  deleteRoutineMock: vi.fn(),
  updateRoutineMock: vi.fn(),
  startMesocycleMock: vi.fn(),
  endMesocycleMock: vi.fn(),
  advanceMesocycleMock: vi.fn(),
  suggestExercisesMock: vi.fn(),
}));

vi.mock("~client/services/routineService", () => ({
  getRoutines: getRoutinesMock,
  createRoutine: createRoutineMock,
  deleteRoutine: deleteRoutineMock,
  updateRoutine: updateRoutineMock,
  startMesocycle: startMesocycleMock,
  endMesocycle: endMesocycleMock,
  advanceMesocycle: advanceMesocycleMock,
  suggestExercises: suggestExercisesMock,
}));

import { useRoutineStore } from "~client/stores/routineStore";
import type { Routine } from "~client/services/routineService";

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r-1",
    name: "Push Day",
    orderIndex: 0,
    routineExercises: [],
    mesocycle: null,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getRoutinesMock.mockReset();
  createRoutineMock.mockReset();
  deleteRoutineMock.mockReset();
  updateRoutineMock.mockReset();
  startMesocycleMock.mockReset();
  endMesocycleMock.mockReset();
  advanceMesocycleMock.mockReset();
  suggestExercisesMock.mockReset();
});

describe("routineStore", () => {
  it("starts with an empty routine list, not loaded, no error", () => {
    const store = useRoutineStore();

    expect(store.routines).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  it("load() populates routines and flips loaded on success", async () => {
    const routines = [makeRoutine()];
    getRoutinesMock.mockResolvedValue(routines);
    const store = useRoutineStore();

    await store.load();

    expect(store.routines).toEqual(routines);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error and leaves routines alone when the request fails", async () => {
    getRoutinesMock.mockRejectedValue(new Error("offline"));
    const store = useRoutineStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.routines).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getRoutinesMock.mockRejectedValueOnce(new Error("offline"));
    const store = useRoutineStore();
    await store.load();
    expect(store.error).toBe(true);

    getRoutinesMock.mockResolvedValueOnce([makeRoutine()]);
    await store.load();

    expect(store.error).toBe(false);
    expect(store.loaded).toBe(true);
  });

  describe("byId getter", () => {
    it("finds a routine by id, or returns undefined for an unknown id", async () => {
      const a = makeRoutine({ id: "r-a" });
      const b = makeRoutine({ id: "r-b" });
      getRoutinesMock.mockResolvedValue([a, b]);
      const store = useRoutineStore();
      await store.load();

      expect(store.byId("r-b")).toEqual(b);
      expect(store.byId("missing")).toBeUndefined();
    });
  });

  describe("create()", () => {
    it("creates the routine, then reloads the full list from the server", async () => {
      const created = makeRoutine({ id: "r-new" });
      createRoutineMock.mockResolvedValue(created);
      getRoutinesMock.mockResolvedValue([created]);
      const store = useRoutineStore();

      const result = await store.create("Push Day", []);

      expect(createRoutineMock).toHaveBeenCalledWith("Push Day", []);
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
      expect(store.routines).toEqual([created]);
      expect(result).toEqual(created);
    });
  });

  describe("remove()", () => {
    it("deletes on the server and removes it from local state without a full reload", async () => {
      const a = makeRoutine({ id: "r-a" });
      const b = makeRoutine({ id: "r-b" });
      getRoutinesMock.mockResolvedValue([a, b]);
      const store = useRoutineStore();
      await store.load();
      deleteRoutineMock.mockResolvedValue(undefined);

      await store.remove("r-a");

      expect(deleteRoutineMock).toHaveBeenCalledWith("r-a");
      expect(store.routines).toEqual([b]);
      // No reload triggered by remove() — local filtering is the only source of the update.
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("update()", () => {
    it("patches the routine, then reloads the full list", async () => {
      updateRoutineMock.mockResolvedValue(undefined);
      getRoutinesMock.mockResolvedValue([makeRoutine({ name: "Renamed" })]);
      const store = useRoutineStore();

      await store.update("r-1", { name: "Renamed" });

      expect(updateRoutineMock).toHaveBeenCalledWith("r-1", { name: "Renamed" });
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
      expect(store.routines[0]!.name).toBe("Renamed");
    });
  });

  describe("duplicate()", () => {
    it("copies exercises sorted by orderIndex and creates a new routine named '(Kopie)'", async () => {
      const routine = makeRoutine({
        name: "Push Day",
        routineExercises: [
          {
            id: "re-2",
            exerciseId: "ex-2",
            orderIndex: 1,
            targetSets: [{ reps: 8, weightKg: 60 }],
            supersetGroup: null,
            restBetweenSetsSeconds: 90,
            restAfterExerciseSeconds: 120,
            exercise: { id: "ex-2", slug: "ohp", name: "OHP", isBodyweight: false },
          },
          {
            id: "re-1",
            exerciseId: "ex-1",
            orderIndex: 0,
            targetSets: [{ reps: 5, weightKg: 100 }],
            supersetGroup: null,
            restBetweenSetsSeconds: 90,
            restAfterExerciseSeconds: 120,
            exercise: { id: "ex-1", slug: "bench", name: "Bench", isBodyweight: false },
          },
        ],
      });
      createRoutineMock.mockResolvedValue(makeRoutine({ id: "r-copy" }));
      getRoutinesMock.mockResolvedValue([]);
      const store = useRoutineStore();

      await store.duplicate(routine);

      expect(createRoutineMock).toHaveBeenCalledWith("Push Day (Kopie)", [
        {
          exerciseId: "ex-1",
          orderIndex: 0,
          targetSets: [{ reps: 5, weightKg: 100 }],
          supersetGroup: null,
          restBetweenSetsSeconds: 90,
          restAfterExerciseSeconds: 120,
        },
        {
          exerciseId: "ex-2",
          orderIndex: 1,
          targetSets: [{ reps: 8, weightKg: 60 }],
          supersetGroup: null,
          restBetweenSetsSeconds: 90,
          restAfterExerciseSeconds: 120,
        },
      ]);
    });
  });

  describe("mesocycle actions", () => {
    it("startMesocycle() starts the cycle on the server, then reloads", async () => {
      startMesocycleMock.mockResolvedValue({ id: "m-1" });
      getRoutinesMock.mockResolvedValue([]);
      const store = useRoutineStore();

      await store.startMesocycle("r-1", 6);

      expect(startMesocycleMock).toHaveBeenCalledWith("r-1", 6);
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
    });

    it("endMesocycle() ends the cycle on the server, then reloads", async () => {
      endMesocycleMock.mockResolvedValue(undefined);
      getRoutinesMock.mockResolvedValue([]);
      const store = useRoutineStore();

      await store.endMesocycle("r-1");

      expect(endMesocycleMock).toHaveBeenCalledWith("r-1");
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
    });

    it("advanceMesocycle() advances the cycle on the server, then reloads", async () => {
      advanceMesocycleMock.mockResolvedValue({ id: "m-1" });
      getRoutinesMock.mockResolvedValue([]);
      const store = useRoutineStore();

      await store.advanceMesocycle("r-1");

      expect(advanceMesocycleMock).toHaveBeenCalledWith("r-1");
      expect(getRoutinesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("reorder()", () => {
    it("only persists routines whose position actually changed, then reloads", async () => {
      const a = makeRoutine({ id: "r-a", orderIndex: 0 });
      const b = makeRoutine({ id: "r-b", orderIndex: 1 });
      const c = makeRoutine({ id: "r-c", orderIndex: 2 });
      getRoutinesMock.mockResolvedValue([a, b, c]);
      const store = useRoutineStore();
      await store.load();
      updateRoutineMock.mockResolvedValue(undefined);
      getRoutinesMock.mockResolvedValueOnce([b, a, c]);

      // New order: b, a, c -> only b (0->0? no) let's check indices: b moves to index 0 (was 1),
      // a moves to index 1 (was 0), c stays at index 2 (was 2, unchanged).
      await store.reorder(["r-b", "r-a", "r-c"]);

      expect(updateRoutineMock).toHaveBeenCalledWith("r-b", { orderIndex: 0 });
      expect(updateRoutineMock).toHaveBeenCalledWith("r-a", { orderIndex: 1 });
      expect(updateRoutineMock).not.toHaveBeenCalledWith("r-c", { orderIndex: 2 });
      expect(updateRoutineMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("suggest()", () => {
    it("passes through to suggestExercises without touching local state", async () => {
      const suggestions = [{ exerciseId: "ex-1", slug: "bench", targetSets: [] }];
      suggestExercisesMock.mockResolvedValue(suggestions);
      const store = useRoutineStore();

      const result = await store.suggest(["chest"], 3);

      expect(suggestExercisesMock).toHaveBeenCalledWith(["chest"], 3);
      expect(result).toEqual(suggestions);
      expect(store.routines).toEqual([]);
    });
  });
});
