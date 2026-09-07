import { describe, expect, it } from "vitest";
import type { ActiveExercise } from "~client/stores/activeWorkoutStore";
import { buildRoutineUpdate, findRoutineBeats } from "~client/composables/useRoutineBeat";
import type { Routine } from "~client/stores/routineStore";

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    name: "Push Day",
    orderIndex: 0,
    mesocycle: null,
    routineExercises: [
      {
        id: "re-1",
        exerciseId: "ex-bench",
        orderIndex: 0,
        targetSets: [
          { reps: 8, weightKg: 60 },
          { reps: 8, weightKg: 60 },
        ],
        supersetGroup: null,
        restBetweenSetsSeconds: 90,
        restAfterExerciseSeconds: 120,
        exercise: { id: "ex-bench", slug: "bench-press", name: null, isBodyweight: false },
      },
    ],
    ...overrides,
  };
}

function makeActiveExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    workoutExerciseId: "we-1",
    exerciseId: "ex-bench",
    name: "Bench Press",
    isBodyweight: false,
    supersetGroup: null,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 120,
    sets: [
      {
        index: 0,
        weightKg: 60,
        reps: 8,
        isWarmup: false,
        kind: "normal",
        logged: true,
        loggedAt: 1,
        clientId: "c1",
        prevWeightKg: null,
        prevReps: null,
        rpe: null,
        notes: null,
      },
      {
        index: 1,
        weightKg: 60,
        reps: 8,
        isWarmup: false,
        kind: "normal",
        logged: true,
        loggedAt: 2,
        clientId: "c2",
        prevWeightKg: null,
        prevReps: null,
        rpe: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

describe("findRoutineBeats", () => {
  it("returns no beats when every logged set matches its routine target exactly", () => {
    const routine = makeRoutine();
    const active = [makeActiveExercise()];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("flags a set logged at more weight than the routine target", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [
          { ...makeActiveExercise().sets[0]!, weightKg: 65 },
          makeActiveExercise().sets[1]!,
        ],
      }),
    ];

    const beats = findRoutineBeats(routine, active);

    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({
      exerciseId: "ex-bench",
      setIndex: 0,
      targetWeightKg: 60,
      loggedWeightKg: 65,
      targetReps: 8,
      loggedReps: 8,
    });
  });

  it("flags a set logged at more reps than target when weight is unchanged", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [{ ...makeActiveExercise().sets[0]!, reps: 10 }, makeActiveExercise().sets[1]!],
      }),
    ];

    const beats = findRoutineBeats(routine, active);

    expect(beats).toHaveLength(1);
    expect(beats[0]!.loggedReps).toBe(10);
  });

  it("does not flag more reps at a lower logged weight than the target (not a clean beat)", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [
          { ...makeActiveExercise().sets[0]!, weightKg: 50, reps: 12 },
          makeActiveExercise().sets[1]!,
        ],
      }),
    ];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("ignores warmup sets even if they exceed the target", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [
          { ...makeActiveExercise().sets[0]!, isWarmup: true, weightKg: 100, reps: 20 },
          makeActiveExercise().sets[1]!,
        ],
      }),
    ];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("ignores sets that were never logged", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [
          { ...makeActiveExercise().sets[0]!, logged: false, weightKg: 100, reps: 20 },
          makeActiveExercise().sets[1]!,
        ],
      }),
    ];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("skips an exercise added mid-session that has no routine target to compare against", () => {
    const routine = makeRoutine();
    const active = [makeActiveExercise({ exerciseId: "ex-new", workoutExerciseId: "we-2" })];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("skips an extra set beyond the routine's planned set count", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [
          ...makeActiveExercise().sets,
          {
            index: 2,
            weightKg: 999,
            reps: 999,
            isWarmup: false,
            kind: "normal",
            logged: true,
            loggedAt: 3,
            clientId: "c3",
            prevWeightKg: null,
            prevReps: null,
            rpe: null,
            notes: null,
          },
        ],
      }),
    ];

    expect(findRoutineBeats(routine, active)).toEqual([]);
  });

  it("handles a bodyweight exercise with no weight target using reps alone", () => {
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-2",
          exerciseId: "ex-pushup",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: null }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-pushup", slug: "pushup", name: null, isBodyweight: true },
        },
      ],
    });
    const active = [
      makeActiveExercise({
        exerciseId: "ex-pushup",
        sets: [
          {
            index: 0,
            weightKg: null,
            reps: 15,
            isWarmup: false,
            kind: "normal",
            logged: true,
            loggedAt: 1,
            clientId: "c1",
            prevWeightKg: null,
            prevReps: null,
            rpe: null,
            notes: null,
          },
        ],
      }),
    ];

    const beats = findRoutineBeats(routine, active);

    expect(beats).toHaveLength(1);
    expect(beats[0]!.loggedReps).toBe(15);
    expect(beats[0]!.targetWeightKg).toBeNull();
  });
});

describe("buildRoutineUpdate", () => {
  it("carries over targets unchanged when nothing beat the routine", () => {
    const routine = makeRoutine();
    const active = [makeActiveExercise()];

    const update = buildRoutineUpdate(routine, active);

    expect(update).toEqual([
      {
        exerciseId: "ex-bench",
        orderIndex: 0,
        targetSets: [
          { reps: 8, weightKg: 60 },
          { reps: 8, weightKg: 60 },
        ],
        supersetGroup: null,
        restBetweenSetsSeconds: 90,
        restAfterExerciseSeconds: 120,
      },
    ]);
  });

  it("raises a beaten set's target reps to what was actually performed", () => {
    const routine = makeRoutine();
    const active = [
      makeActiveExercise({
        sets: [{ ...makeActiveExercise().sets[0]!, reps: 12 }, makeActiveExercise().sets[1]!],
      }),
    ];

    const update = buildRoutineUpdate(routine, active);

    expect(update[0]!.targetSets[0]).toEqual({ reps: 12, weightKg: 60 });
    expect(update[0]!.targetSets[1]).toEqual({ reps: 8, weightKg: 60 });
  });

  it("raises weight only, keeping reps from the original target, for a bodyweight-style null target", () => {
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-2",
          exerciseId: "ex-pushup",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: null }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-pushup", slug: "pushup", name: null, isBodyweight: true },
        },
      ],
    });
    const active = [
      makeActiveExercise({
        exerciseId: "ex-pushup",
        sets: [
          {
            index: 0,
            weightKg: 5, // extra weight added on top of bodyweight — but target has no weight tracked
            reps: 20,
            isWarmup: false,
            kind: "normal",
            logged: true,
            loggedAt: 1,
            clientId: "c1",
            prevWeightKg: null,
            prevReps: null,
            rpe: null,
            notes: null,
          },
        ],
      }),
    ];

    const update = buildRoutineUpdate(routine, active);

    // target.weightKg was null, so the beaten target keeps weightKg null even though the logged
    // set itself tracked weight — only the reps side of the beat "counts" here per useRoutineBeat.ts
    expect(update[0]!.targetSets[0]).toEqual({ reps: 20, weightKg: null });
  });

  it("orders the rebuilt list by the routine's existing orderIndex, not array order", () => {
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-2",
          exerciseId: "ex-second",
          orderIndex: 1,
          targetSets: [{ reps: 5, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-second", slug: "row", name: null, isBodyweight: false },
        },
        {
          id: "re-1",
          exerciseId: "ex-first",
          orderIndex: 0,
          targetSets: [{ reps: 5, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-first", slug: "squat", name: null, isBodyweight: false },
        },
      ],
    });

    const update = buildRoutineUpdate(routine, []);

    expect(update.map((u) => u.exerciseId)).toEqual(["ex-first", "ex-second"]);
    // orderIndex is also renumbered sequentially from the sorted position
    expect(update.map((u) => u.orderIndex)).toEqual([0, 1]);
  });

  it("preserves superset grouping and rest overrides untouched", () => {
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-bench",
          orderIndex: 0,
          targetSets: [{ reps: 8, weightKg: 60 }],
          supersetGroup: 2,
          restBetweenSetsSeconds: 45,
          restAfterExerciseSeconds: 60,
          exercise: { id: "ex-bench", slug: "bench-press", name: null, isBodyweight: false },
        },
      ],
    });

    const update = buildRoutineUpdate(routine, []);

    expect(update[0]).toMatchObject({
      supersetGroup: 2,
      restBetweenSetsSeconds: 45,
      restAfterExerciseSeconds: 60,
    });
  });
});
