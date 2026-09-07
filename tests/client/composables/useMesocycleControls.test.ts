import { describe, expect, it, vi } from "vitest";
import { useMesocycleControls } from "~client/composables/useMesocycleControls";
import type { useActiveWorkoutStore } from "~client/stores/activeWorkoutStore";
import type { Mesocycle, Routine, useRoutineStore } from "~client/stores/routineStore";

type ActiveWorkoutStore = ReturnType<typeof useActiveWorkoutStore>;
type RoutineStore = ReturnType<typeof useRoutineStore>;

function makeMesocycle(overrides: Partial<Mesocycle> = {}): Mesocycle {
  return { id: "meso-1", routineId: "routine-1", totalWeeks: 4, currentWeek: 1, weekPercents: [100, 100, 100, 60], ...overrides };
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return { id: "routine-1", name: "Push Day", orderIndex: 0, routineExercises: [], mesocycle: null, ...overrides };
}

function makeActiveWorkoutStore(routineId: string | null): ActiveWorkoutStore {
  return { routineId } as unknown as ActiveWorkoutStore;
}

function makeRoutineStore(routines: Routine[], startMesocycle = vi.fn()): RoutineStore {
  return { routines, startMesocycle } as unknown as RoutineStore;
}

describe("useMesocycleControls", () => {
  it("starts with the form closed and no weeks entered for any routine", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    expect(controls.mesoFormRoutineId.value).toBeNull();
    expect(controls.mesoWeeksInput.size).toBe(0);
    expect(controls.activeMesocycle.value).toBeNull();
  });

  it("toggleMesoForm opens the form for a routine and seeds the default week count", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.toggleMesoForm("routine-1");

    expect(controls.mesoFormRoutineId.value).toBe("routine-1");
    expect(controls.mesoWeeksInput.get("routine-1")).toBe(4);
  });

  it("toggleMesoForm on the already-open routine closes it again", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.toggleMesoForm("routine-1");
    controls.toggleMesoForm("routine-1");

    expect(controls.mesoFormRoutineId.value).toBeNull();
  });

  it("toggleMesoForm switches to another routine without clobbering the first routine's weeks", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.toggleMesoForm("routine-1");
    controls.adjustMesoWeeks("routine-1", 1);
    controls.toggleMesoForm("routine-2");

    expect(controls.mesoFormRoutineId.value).toBe("routine-2");
    expect(controls.mesoWeeksInput.get("routine-1")).toBe(5);
    expect(controls.mesoWeeksInput.get("routine-2")).toBe(4);
  });

  it("toggleMesoForm does not reset an already-adjusted week count when reopened", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.toggleMesoForm("routine-1");
    controls.adjustMesoWeeks("routine-1", 1);
    controls.toggleMesoForm("routine-1"); // close
    controls.toggleMesoForm("routine-1"); // reopen

    expect(controls.mesoWeeksInput.get("routine-1")).toBe(5);
  });

  it("adjustMesoWeeks increments/decrements from the default when never opened via toggleMesoForm", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.adjustMesoWeeks("routine-1", -1);

    expect(controls.mesoWeeksInput.get("routine-1")).toBe(3);
  });

  it("adjustMesoWeeks clamps at the minimum of 2 weeks", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    controls.adjustMesoWeeks("routine-1", -1);
    controls.adjustMesoWeeks("routine-1", -1);
    controls.adjustMesoWeeks("routine-1", -1);

    expect(controls.mesoWeeksInput.get("routine-1")).toBe(2);
  });

  it("adjustMesoWeeks clamps at the maximum of 16 weeks", () => {
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([]));

    for (let i = 0; i < 20; i++) controls.adjustMesoWeeks("routine-1", 1);

    expect(controls.mesoWeeksInput.get("routine-1")).toBe(16);
  });

  it("startMesocycle calls the routine store with the entered week count and closes the form", async () => {
    const startMesocycle = vi.fn().mockResolvedValue(undefined);
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([], startMesocycle));

    controls.toggleMesoForm("routine-1");
    controls.adjustMesoWeeks("routine-1", 1);
    controls.adjustMesoWeeks("routine-1", 1);
    await controls.startMesocycle("routine-1");

    expect(startMesocycle).toHaveBeenCalledWith("routine-1", 6);
    expect(controls.mesoFormRoutineId.value).toBeNull();
  });

  it("startMesocycle falls back to the default week count when none was entered", async () => {
    const startMesocycle = vi.fn().mockResolvedValue(undefined);
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([], startMesocycle));

    await controls.startMesocycle("routine-never-opened");

    expect(startMesocycle).toHaveBeenCalledWith("routine-never-opened", 4);
  });

  it("activeMesocycle is null when no workout is active", () => {
    const routine = makeRoutine({ mesocycle: makeMesocycle() });
    const controls = useMesocycleControls(makeActiveWorkoutStore(null), makeRoutineStore([routine]));

    expect(controls.activeMesocycle.value).toBeNull();
  });

  it("activeMesocycle resolves the mesocycle of the routine the active workout was started from", () => {
    const routine = makeRoutine({ mesocycle: makeMesocycle({ currentWeek: 3 }) });
    const controls = useMesocycleControls(makeActiveWorkoutStore("routine-1"), makeRoutineStore([routine]));

    expect(controls.activeMesocycle.value).toEqual(makeMesocycle({ currentWeek: 3 }));
  });

  it("activeMesocycle is null when the active routine itself has no mesocycle running", () => {
    const routine = makeRoutine({ mesocycle: null });
    const controls = useMesocycleControls(makeActiveWorkoutStore("routine-1"), makeRoutineStore([routine]));

    expect(controls.activeMesocycle.value).toBeNull();
  });
});
