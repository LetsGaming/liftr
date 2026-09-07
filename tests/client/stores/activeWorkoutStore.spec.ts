import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// persist() (idb.ts) hits real IndexedDB, which doesn't exist under Vitest's default node
// environment — stub it the same way every mutation in this store already treats it: a
// fire-and-forget write whose success/failure isn't observed by the caller.
vi.mock("~client/lib/idb", () => ({
  saveActiveWorkout: vi.fn(),
  loadActiveWorkout: vi.fn(),
  clearActiveWorkout: vi.fn(),
}));

const enqueueMock = vi.fn();
const enqueueAndAwaitFlushMock = vi.fn();

vi.mock("~client/stores/syncStore", () => ({
  useSyncStore: () => ({
    enqueue: enqueueMock,
    enqueueAndAwaitFlush: enqueueAndAwaitFlushMock,
  }),
}));

import { useActiveWorkoutStore, type ActiveExercise } from "~client/stores/activeWorkoutStore";

/** Builds a minimal one-exercise, one-set active session directly via $patch — avoids
 *  exercising start()'s own sync.enqueue call (already covered by its own concerns), since
 *  these tests only care about logCurrentSet()'s rpe/notes plumbing. */
function seedOneSetExercise(store: ReturnType<typeof useActiveWorkoutStore>) {
  const exercise: ActiveExercise = {
    workoutExerciseId: "we-1",
    exerciseId: "ex-1",
    name: "Bench Press",
    isBodyweight: false,
    supersetGroup: null,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 120,
    sets: [
      {
        index: 0,
        weightKg: 60,
        reps: 0,
        isWarmup: false,
        kind: "normal",
        logged: false,
        loggedAt: null,
        clientId: null,
        prevWeightKg: null,
        prevReps: null,
        rpe: null,
        notes: null,
      },
    ],
  };
  store.$patch({
    workoutId: "workout-1",
    routineId: null,
    routineName: "Test",
    startedAt: Date.now(),
    pausedAt: null,
    totalPausedMs: 0,
    currentExerciseIndex: 0,
    exercises: [exercise],
    workoutNotes: null,
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  enqueueMock.mockClear();
  enqueueAndAwaitFlushMock.mockClear();
});

describe("activeWorkoutStore — rpe/notes plumbing (Task 1)", () => {
  it("setCurrentSetRpe/setCurrentSetNotes write to currentSet without enqueueing sync", () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);

    store.setCurrentSetRpe(8);
    store.setCurrentSetNotes("felt heavy");

    expect(store.currentSet?.rpe).toBe(8);
    expect(store.currentSet?.notes).toBe("felt heavy");
    // Global Constraint 1: RPE/notes capture never enqueues on its own — only logCurrentSet()
    // (via the log_set payload) or finish() sends anything over the wire.
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("logCurrentSet() includes rpe/notes in the log_set sync payload when both are set", async () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);
    store.setCurrentSetValue("reps", 5);
    store.setCurrentSetRpe(8);
    store.setCurrentSetNotes("felt heavy");

    await store.logCurrentSet();

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const call = enqueueMock.mock.calls[0]![0];
    expect(call.type).toBe("log_set");
    expect(call.payload).toMatchObject({ rpe: 8, notes: "felt heavy" });
  });

  it("logCurrentSet() sends explicit null for rpe/notes when neither was set", async () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);
    store.setCurrentSetValue("reps", 5);

    await store.logCurrentSet();

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const call = enqueueMock.mock.calls[0]![0];
    expect(call.payload).toMatchObject({ rpe: null, notes: null });
  });
});

describe("activeWorkoutStore — workout-level notes (Task 2)", () => {
  it("setWorkoutNotes writes workoutNotes", () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);

    store.setWorkoutNotes("leg day, felt strong");

    expect(store.workoutNotes).toBe("leg day, felt strong");
  });

  it("finish() includes notes in the enqueueAndAwaitFlush payload when workoutNotes is set", async () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);
    store.setWorkoutNotes("leg day, felt strong");
    enqueueAndAwaitFlushMock.mockResolvedValue({ ranks: [] });

    await store.finish();

    expect(enqueueAndAwaitFlushMock).toHaveBeenCalledTimes(1);
    const call = enqueueAndAwaitFlushMock.mock.calls[0]![0];
    expect(call.type).toBe("finish_workout");
    expect(call.payload).toMatchObject({ notes: "leg day, felt strong" });
  });

  it("finish() sends null notes when workoutNotes was never set", async () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);
    enqueueAndAwaitFlushMock.mockResolvedValue({ ranks: [] });

    await store.finish();

    const call = enqueueAndAwaitFlushMock.mock.calls[0]![0];
    expect(call.payload).toMatchObject({ notes: null });
  });
});

// Bug fix (product owner report): starting a workout always seeded reps at 0, forcing manual
// re-entry on every single set even when a sensible default (last time's reps, or the routine's
// target reps) was available — unlike weightKg, which already defaulted this way. No prior test
// covered start()'s/addExercise()'s seeding of a set's initial reps value at all.
describe("activeWorkoutStore — reps defaulting on start (bug fix)", () => {
  it("start() defaults reps to last time's reps when history exists for that set index", async () => {
    const store = useActiveWorkoutStore();
    await store.start(null, "Test", [
      {
        exerciseId: "ex-1",
        name: "Bench Press",
        isBodyweight: false,
        targetSets: [{ reps: 8, weightKg: null }],
        lastTime: [{ weightKg: 60, reps: 10 }],
      },
    ]);

    expect(store.exercises[0]!.sets[0]!.reps).toBe(10);
  });

  it("start() falls back to the routine's target reps when there's no history for that set index", async () => {
    const store = useActiveWorkoutStore();
    await store.start(null, "Test", [
      {
        exerciseId: "ex-1",
        name: "Bench Press",
        isBodyweight: false,
        targetSets: [{ reps: 8, weightKg: null }],
        lastTime: [{ weightKg: null, reps: null }],
      },
    ]);

    expect(store.exercises[0]!.sets[0]!.reps).toBe(8);
  });

  it("start() falls back to the routine's target reps when lastTime is undefined entirely (e.g. offline)", async () => {
    const store = useActiveWorkoutStore();
    await store.start(null, "Test", [
      {
        exerciseId: "ex-1",
        name: "Bench Press",
        isBodyweight: false,
        targetSets: [{ reps: 12, weightKg: null }],
      },
    ]);

    expect(store.exercises[0]!.sets[0]!.reps).toBe(12);
  });

  it("addExercise() applies the same reps-defaulting as start()", async () => {
    const store = useActiveWorkoutStore();
    seedOneSetExercise(store);

    await store.addExercise({
      exerciseId: "ex-2",
      name: "Squat",
      isBodyweight: false,
      targetSets: [{ reps: 5, weightKg: null }],
      lastTime: [{ weightKg: 100, reps: 7 }],
    });

    expect(store.exercises[1]!.sets[0]!.reps).toBe(7);
  });
});
