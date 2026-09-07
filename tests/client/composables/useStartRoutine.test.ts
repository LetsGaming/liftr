// @vitest-environment jsdom
//
// useStartRoutine.ts calls useExerciseName() internally, which calls vue-i18n's useI18n() —
// that only works injected inside a real component's setup() (withSetup + the real i18n plugin,
// same pattern tests/client/helpers/withSetup.ts documents), so this needs a real DOM (jsdom)
// for @vue/test-utils' mount(). The stores and services it talks to are true external
// boundaries (network via services, Pinia stores with their own tests) — mocked here so these
// tests exercise only useStartRoutine's own orchestration (ordering, mesocycle scaling,
// last-time fallback, quick-start recommendation lookup).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withSetup } from "../helpers/withSetup";
import { i18n } from "~client/i18n";
import type { Routine } from "~client/stores/routineStore";
import type { CatalogExercise } from "~client/stores/catalogStore";
import type { SuggestedExercise } from "~client/services/routineService";

// vi.mock() factories are only hoisted themselves (the bare `vi.mock(...)` call) — a plain
// `const xMock = vi.fn()` declared nearby is NOT hoisted with it, so a factory that reads such a
// variable as a direct property value (not behind its own nested closure) can run before that
// const initializes. vi.hoisted() hoists the declaration itself right alongside the vi.mock()
// calls, in source order, so it's guaranteed to be initialized first — the documented fix for
// exactly this ordering hazard.
const { getExerciseHistoryMock, recommendExercisesMock, startMock, catalogExercisesMock } = vi.hoisted(() => {
  const catalogExercisesMock: CatalogExercise[] = Array.from({ length: 6 }, (_, i) => ({
    id: `ex-${i}`,
    slug: `exercise-${i}`,
    name: null,
    equipment: null,
    requiredEquipment: [],
    movementPattern: "push",
    isBodyweight: false,
    isCustom: false,
    demoStartImage: null,
    demoEndImage: null,
    howToKey: null,
    hasImage: false,
    muscles: [],
  }));
  return {
    getExerciseHistoryMock: vi.fn(),
    recommendExercisesMock: vi.fn(),
    startMock: vi.fn(),
    catalogExercisesMock,
  };
});

vi.mock("~client/services/exerciseService", () => ({
  getExerciseHistory: getExerciseHistoryMock,
}));
vi.mock("~client/services/routineService", () => ({
  recommendExercises: recommendExercisesMock,
}));
vi.mock("~client/stores/activeWorkoutStore", () => ({
  useActiveWorkoutStore: () => ({ start: startMock }),
}));
vi.mock("~client/stores/catalogStore", () => ({
  useCatalogStore: () => ({ exercises: catalogExercisesMock }),
}));

import { useStartRoutine } from "~client/composables/useStartRoutine";

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    name: "Push Day",
    orderIndex: 0,
    routineExercises: [],
    mesocycle: null,
    ...overrides,
  };
}

function mount() {
  return withSetup(() => useStartRoutine(), { global: { plugins: [i18n] } });
}

beforeEach(() => {
  getExerciseHistoryMock.mockReset().mockResolvedValue([]);
  recommendExercisesMock.mockReset().mockResolvedValue([]);
  startMock.mockReset().mockResolvedValue(undefined);
});

describe("startRoutine", () => {
  it("starts not-starting, flips to starting while store.start() is pending, and back after", async () => {
    let resolveStart!: () => void;
    startMock.mockReturnValue(new Promise<void>((resolve) => (resolveStart = () => resolve())));
    const { result, unmount } = mount();
    expect(result.starting.value).toBe(false);

    const p = result.startRoutine(makeRoutine());
    await Promise.resolve(); // let fetchLastTime's microtasks settle
    await Promise.resolve();
    expect(result.starting.value).toBe(true);

    resolveStart();
    await p;
    expect(result.starting.value).toBe(false);

    unmount();
  });

  it("sorts exercises by orderIndex before building inputs and calls store.start with them", async () => {
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-2",
          exerciseId: "ex-b",
          orderIndex: 1,
          targetSets: [{ reps: 8, weightKg: 50 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-b", slug: "exercise-b", name: null, isBodyweight: false },
        },
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: 60,
          restAfterExerciseSeconds: 90,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    expect(startMock).toHaveBeenCalledTimes(1);
    const [routineId, routineName, inputs] = startMock.mock.calls[0]!;
    expect(routineId).toBe("routine-1");
    expect(routineName).toBe("Push Day");
    expect(inputs.map((i: { exerciseId: string }) => i.exerciseId)).toEqual(["ex-a", "ex-b"]);

    unmount();
  });

  it("fetchLastTime backfills missing set indices with null weight and null reps (not 0)", async () => {
    getExerciseHistoryMock.mockResolvedValue([
      { setIndex: 0, weightKg: 100, reps: 5 },
      { setIndex: 2, weightKg: 80, reps: 8 },
    ]);
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    const [, , inputs] = startMock.mock.calls[0]!;
    // fetchLastTime keeps the whole history-set object it found for a present index (hence
    // setIndex tags along), and only synthesizes the bare {weightKg: null, reps: null} shape
    // for an index with no history at all.
    expect(inputs[0].lastTime).toEqual([
      { setIndex: 0, weightKg: 100, reps: 5 },
      { weightKg: null, reps: null },
      { setIndex: 2, weightKg: 80, reps: 8 },
      { weightKg: null, reps: null },
      { weightKg: null, reps: null },
    ]);

    unmount();
  });

  it("falls back to no last-time reference when the history fetch fails (offline)", async () => {
    getExerciseHistoryMock.mockRejectedValue(new Error("offline"));
    const routine = makeRoutine({
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    const [, , inputs] = startMock.mock.calls[0]!;
    expect(inputs[0].lastTime).toBeUndefined();

    unmount();
  });

  it("defaults the mesocycle week percent to 100 (no scaling) when the routine has no mesocycle", async () => {
    getExerciseHistoryMock.mockResolvedValue([{ setIndex: 0, weightKg: 100, reps: 5 }]);
    const routine = makeRoutine({
      mesocycle: null,
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    const [, , inputs] = startMock.mock.calls[0]!;
    // unscaled: the exact history-set object fetchLastTime found, untouched
    expect(inputs[0].lastTime[0]).toEqual({ setIndex: 0, weightKg: 100, reps: 5 });

    unmount();
  });

  it("scales last-time weights by the current mesocycle week's percent (applyMesocycleWeek)", async () => {
    getExerciseHistoryMock.mockResolvedValue([{ setIndex: 0, weightKg: 100, reps: 5 }]);
    const routine = makeRoutine({
      mesocycle: { id: "meso-1", routineId: "routine-1", totalWeeks: 3, currentWeek: 2, weekPercents: [100, 105, 60] },
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    const [, , inputs] = startMock.mock.calls[0]!;
    // 100kg * 105% = 105, rounded to the nearest 1.25kg (already exact) -> 105; setIndex carries
    // over from the spread in `{ ...s, weightKg: applyMesocycleWeek(...) }`.
    expect(inputs[0].lastTime[0]).toEqual({ setIndex: 0, weightKg: 105, reps: 5 });

    unmount();
  });

  it("does not scale a null last-time weight (no history for that set index)", async () => {
    getExerciseHistoryMock.mockResolvedValue([]); // no history at all -> every set index is null
    const routine = makeRoutine({
      mesocycle: { id: "meso-1", routineId: "routine-1", totalWeeks: 3, currentWeek: 2, weekPercents: [100, 105, 60] },
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 10, weightKg: 40 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "exercise-a", name: null, isBodyweight: false },
        },
      ],
    });
    const { result, unmount } = mount();

    await result.startRoutine(routine);

    const [, , inputs] = startMock.mock.calls[0]!;
    expect(inputs[0].lastTime[0]).toEqual({ weightKg: null, reps: null });

    unmount();
  });

  it("resets starting to false even when store.start() rejects", async () => {
    startMock.mockRejectedValue(new Error("network down"));
    const { result, unmount } = mount();

    await expect(result.startRoutine(makeRoutine())).rejects.toThrow("network down");
    expect(result.starting.value).toBe(false);

    unmount();
  });
});

describe("quickStart", () => {
  it("uses the first 4 catalog exercises and calls store.start(null, 'Quick Start', ...)", async () => {
    const { result, unmount } = mount();

    await result.quickStart();

    expect(startMock).toHaveBeenCalledTimes(1);
    const [routineId, routineName, inputs] = startMock.mock.calls[0]!;
    expect(routineId).toBeNull();
    expect(routineName).toBe("Quick Start");
    expect(inputs).toHaveLength(4);
    expect(inputs.map((i: { exerciseId: string }) => i.exerciseId)).toEqual(["ex-0", "ex-1", "ex-2", "ex-3"]);

    unmount();
  });

  it("uses the recommendation engine's targetSets for exercises it covers", async () => {
    const recommended: SuggestedExercise[] = [
      { exerciseId: "ex-0", slug: "exercise-0", targetSets: [{ reps: 6, weightKg: 100 }] },
    ];
    recommendExercisesMock.mockResolvedValue(recommended);
    const { result, unmount } = mount();

    await result.quickStart();

    const [, , inputs] = startMock.mock.calls[0]!;
    expect(inputs[0].targetSets).toEqual([{ reps: 6, weightKg: 100 }]);
    // untouched by the recommendation -> flat 3x8 fallback
    expect(inputs[1].targetSets).toEqual([
      { reps: 8, weightKg: null },
      { reps: 8, weightKg: null },
      { reps: 8, weightKg: null },
    ]);

    unmount();
  });

  it("falls back to the flat default for every exercise when the recommendation request fails", async () => {
    recommendExercisesMock.mockRejectedValue(new Error("offline"));
    const { result, unmount } = mount();

    await result.quickStart();

    const [, , inputs] = startMock.mock.calls[0]!;
    for (const input of inputs as { targetSets: unknown }[]) {
      expect(input.targetSets).toEqual([
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
      ]);
    }

    unmount();
  });

  it("resets starting to false after finishing", async () => {
    const { result, unmount } = mount();
    await result.quickStart();
    expect(result.starting.value).toBe(false);
    unmount();
  });
});

describe("exerciseName", () => {
  it("is re-exported from useExerciseName and falls back to the raw slug for an unknown key", () => {
    const { result, unmount } = mount();
    expect(result.exerciseName("totally-unknown-slug")).toBe("totally-unknown-slug");
    unmount();
  });
});
