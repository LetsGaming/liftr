// useWorkoutFinish.ts only uses ref/computed/watch (no onMounted/onUnmounted/inject), so it runs
// fine called bare outside a component's setup() — see tests/README.md's guidance on when a
// component host is actually required. Its `stores` parameter is a plain object of already-
// resolved Pinia store instances (not something it calls useXStore() on itself), so these tests
// just hand it plain fakes shaped like the bits of each store it actually reads/calls — no
// vi.mock() of the store modules needed, and no Pinia required either. `activeWorkoutStore` is
// wrapped in Vue's `reactive()` so the composable's internal `watch(() => store.workoutId, ...)`
// can actually observe mutations the same way it would against a real Pinia store.
import { describe, expect, it, vi } from "vitest";
import { computed, nextTick, reactive } from "vue";
import { useWorkoutFinish } from "~client/composables/useWorkoutFinish";
import type { ActiveExercise } from "~client/stores/activeWorkoutStore";
import type { Routine } from "~client/stores/routineStore";

interface RankVerdictFixture {
  exerciseId: string;
  rankedUp: boolean;
  newPr: { kind: string; value: number } | null;
  tier: string;
  division: number;
  lp: number;
  prevLp: number;
  plausibilityReason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
}

function makeSet(overrides: Partial<ActiveExercise["sets"][number]> = {}): ActiveExercise["sets"][number] {
  return {
    index: 0,
    weightKg: 0,
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
    ...overrides,
  };
}

function makeActiveExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    workoutExerciseId: "we-1",
    exerciseId: "ex-a",
    name: "Bench Press",
    isBodyweight: false,
    sets: [],
    supersetGroup: null,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 90,
    ...overrides,
  };
}

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

interface ActiveWorkoutFixture {
  workoutId: string | null;
  routineId: string | null;
  routineName: string;
  startedAt: number;
  pausedAt: number;
  totalPausedMs: number;
  exercises: ActiveExercise[];
}

function makeStores(activeWorkoutOverrides: Partial<ActiveWorkoutFixture> = {}) {
  const finishMock = vi.fn().mockResolvedValue({ ranks: [], consistencyBonusXp: 0, varietyBonusXp: 0, newMuscleSlugs: [] });
  const activeWorkoutFixture: ActiveWorkoutFixture = {
    workoutId: "workout-1",
    routineId: "routine-1",
    routineName: "Push Day",
    startedAt: 0,
    pausedAt: 125_000,
    totalPausedMs: 0,
    exercises: [],
    ...activeWorkoutOverrides,
  };
  const activeWorkoutStore = reactive({ ...activeWorkoutFixture, finish: finishMock });
  const routineStore = {
    routines: [] as Routine[],
    update: vi.fn().mockResolvedValue(undefined),
    advanceMesocycle: vi.fn().mockResolvedValue(undefined),
  };
  const streakStore = { load: vi.fn().mockResolvedValue(undefined) };
  const ranksStore = { applyVerdict: vi.fn() };
  const xpStore = { level: 3, progressPercent: 40, load: vi.fn().mockResolvedValue(undefined) };
  const historyStore = { items: [] as { kind: string; at: string }[] };
  const catalogStore = {
    byId: vi.fn((id: string): { id: string; slug: string } | undefined => ({ id, slug: `${id}-slug` })),
  };
  const overallRankStore = { load: vi.fn().mockResolvedValue(undefined) };

  return {
    stores: {
      activeWorkoutStore,
      routineStore,
      streakStore,
      ranksStore,
      xpStore,
      historyStore,
      catalogStore,
      overallRankStore,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    activeWorkoutStore,
    routineStore,
    streakStore,
    ranksStore,
    xpStore,
    historyStore,
    catalogStore,
    overallRankStore,
    finishMock,
  };
}

const noMuscles = computed(() => ({ primary: [] as string[], secondary: [] as string[] }));
const nameFn = (slug: string) => `Name:${slug}`;

describe("useWorkoutFinish — initial state", () => {
  it("starts empty before any finish", () => {
    const { stores } = makeStores();
    const result = useWorkoutFinish(stores, noMuscles, nameFn);

    expect(result.finishedSummary.value).toBeNull();
    expect(result.finishSequenceDone.value).toBe(false);
    expect(result.sessionXp.value).toBe(0);
    expect(result.sessionRankUps.value).toEqual([]);
    expect(result.sessionCaptions.value).toEqual([]);
    expect(result.consistencyBonusXp.value).toBe(0);
    expect(result.varietyBonusXp.value).toBe(0);
    expect(result.newMuscleSlugs.value).toEqual([]);
    expect(result.finishXpSnapshot.value).toBeNull();
    expect(result.routineBeats.value).toEqual([]);
    expect(result.updatingRoutine.value).toBe(false);
    expect(result.routineUpdated.value).toBe(false);
  });
});

describe("useWorkoutFinish — streakDays", () => {
  it("marks the last 7 calendar days active based on historyStore's workout items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7)); // Mon 2026-09-07
    try {
      const { stores, historyStore } = makeStores();
      historyStore.items = [
        { kind: "workout", at: new Date(2026, 8, 7).toISOString() }, // today
        { kind: "workout", at: new Date(2026, 8, 5).toISOString() }, // 2 days ago
        { kind: "run", at: new Date(2026, 8, 6).toISOString() }, // not a workout -> ignored
      ];

      const result = useWorkoutFinish(stores, noMuscles, nameFn);
      const days = result.streakDays.value;

      expect(days).toHaveLength(7);
      expect(days[6]!.active).toBe(true); // today
      expect(days[4]!.active).toBe(true); // 2 days ago (Sat)
      expect(days[5]!.active).toBe(false); // yesterday: only a run happened, not a workout
      expect(days.map((d) => d.label)).toEqual(["Di", "Mi", "Do", "Fr", "Sa", "So", "Mo"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useWorkoutFinish — finishWorkout", () => {
  it("aggregates volume/set-count/duration and snapshots the exercises actually logged", async () => {
    const { stores, activeWorkoutStore } = makeStores({
      exercises: [
        makeActiveExercise({
          exerciseId: "ex-a",
          name: "Bench Press",
          sets: [
            makeSet({ index: 0, weightKg: 100, reps: 5, logged: true, isWarmup: false }),
            makeSet({ index: 1, weightKg: 20, reps: 10, logged: true, isWarmup: true }), // warmup: counts toward volume, not setCount
            makeSet({ index: 2, weightKg: 80, reps: 8, logged: false, isWarmup: false }), // never logged: excluded entirely
          ],
        }),
        makeActiveExercise({
          exerciseId: "ex-b",
          name: "Row",
          sets: [makeSet({ index: 0, weightKg: 50, reps: 10, logged: true, isWarmup: false })],
        }),
      ],
    });
    const muscles = computed(() => ({ primary: ["chest"], secondary: ["triceps"] }));

    const result = useWorkoutFinish(stores, muscles, nameFn);
    await result.finishWorkout();

    expect(result.finishedSummary.value).toEqual({
      routineName: "Push Day",
      durationLabel: "2 min", // 125s elapsed -> round(125/60) = 2
      volumeKg: 100 * 5 + 20 * 10 + 50 * 10, // 1200 — logged warmups count toward volume
      setCount: 2, // only non-warmup logged sets
      muscles: { primary: ["chest"], secondary: ["triceps"] },
      exercises: [
        { name: "Bench Press", sets: [{ weightKg: 100, reps: 5, isWarmup: false }, { weightKg: 20, reps: 10, isWarmup: true }] },
        { name: "Row", sets: [{ weightKg: 50, reps: 10, isWarmup: false }] },
      ],
    });
    expect(activeWorkoutStore.finish).toHaveBeenCalledTimes(1);
  });

  it("filters sessionRankUps to ranked-up/new-PR verdicts, mapping isPr and plausibility copy", async () => {
    const ranks: RankVerdictFixture[] = [
      { exerciseId: "ex-a", rankedUp: true, newPr: null, tier: "gold", division: 2, lp: 120, prevLp: 100, plausibilityReason: null },
      { exerciseId: "ex-b", rankedUp: false, newPr: { kind: "1rm", value: 80 }, tier: "silver", division: 1, lp: 60, prevLp: 55, plausibilityReason: "pace" },
      { exerciseId: "ex-c", rankedUp: false, newPr: null, tier: "bronze", division: 3, lp: 45, prevLp: 40, plausibilityReason: null },
    ];
    const { stores, finishMock, catalogStore } = makeStores();
    finishMock.mockResolvedValue({ ranks, consistencyBonusXp: 0, varietyBonusXp: 0, newMuscleSlugs: [] });
    catalogStore.byId.mockImplementation((id: string) => (id === "ex-b" ? undefined : { id, slug: `${id}-slug` }));

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(result.sessionRankUps.value).toEqual([
      { exerciseName: "Name:ex-a-slug", tier: "gold", division: 2, isPr: false, lp: 120, prevLp: 100, plausibilityNote: null },
      {
        exerciseName: "", // catalogStore.byId returned undefined for ex-b -> falls back to ""
        tier: "silver",
        division: 1,
        isPr: true,
        lp: 60,
        prevLp: 55,
        plausibilityNote: "Diese Session war ungewöhnlich schnell — dein Rang- und XP-Gewinn fällt deshalb vorsichtiger aus.",
      },
    ]);
  });

  it("applies every touched exercise's verdict to ranksStore, not just the ranked-up ones", async () => {
    const ranks: RankVerdictFixture[] = [
      { exerciseId: "ex-a", rankedUp: true, newPr: null, tier: "gold", division: 2, lp: 120, prevLp: 100, plausibilityReason: null },
      { exerciseId: "ex-c", rankedUp: false, newPr: null, tier: "bronze", division: 3, lp: 45, prevLp: 40, plausibilityReason: null },
    ];
    const { stores, finishMock, ranksStore } = makeStores();
    finishMock.mockResolvedValue({ ranks, consistencyBonusXp: 0, varietyBonusXp: 0, newMuscleSlugs: [] });

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(ranksStore.applyVerdict).toHaveBeenCalledTimes(2);
    expect(ranksStore.applyVerdict).toHaveBeenCalledWith("ex-a", { tier: "gold", division: 2, lp: 120 });
    expect(ranksStore.applyVerdict).toHaveBeenCalledWith("ex-c", { tier: "bronze", division: 3, lp: 45 });
  });

  it("builds sessionCaptions for a same-band recovery gain and for a plausibility-flagged verdict, and only those", async () => {
    const ranks: RankVerdictFixture[] = [
      { exerciseId: "ex-recovery", rankedUp: false, newPr: null, tier: "bronze", division: 3, lp: 45, prevLp: 40, plausibilityReason: null },
      { exerciseId: "ex-flagged", rankedUp: false, newPr: null, tier: "bronze", division: 1, lp: 30, prevLp: 30, plausibilityReason: "exceeds_ceiling" },
      { exerciseId: "ex-boring", rankedUp: false, newPr: null, tier: "bronze", division: 1, lp: 20, prevLp: 20, plausibilityReason: null },
    ];
    const { stores, finishMock } = makeStores();
    finishMock.mockResolvedValue({ ranks, consistencyBonusXp: 0, varietyBonusXp: 0, newMuscleSlugs: [] });

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(result.sessionCaptions.value).toEqual([
      { exerciseId: "ex-recovery", exerciseName: "Name:ex-recovery-slug", recoveryGainLabel: "+5 LP (Rückkehr-Bonus)", plausibilityNote: null },
      {
        exerciseId: "ex-flagged",
        exerciseName: "Name:ex-flagged-slug",
        recoveryGainLabel: null,
        plausibilityNote: "Dieser Wert liegt ungewöhnlich hoch — dein Rang- und XP-Gewinn fällt deshalb vorsichtiger aus.",
      },
    ]);
  });

  it("copies consistency/variety XP bonuses and new muscle slugs straight from the finish result", async () => {
    const { stores, finishMock } = makeStores();
    finishMock.mockResolvedValue({ ranks: [], consistencyBonusXp: 15, varietyBonusXp: 8, newMuscleSlugs: ["hamstrings", "calves"] });

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(result.consistencyBonusXp.value).toBe(15);
    expect(result.varietyBonusXp.value).toBe(8);
    expect(result.newMuscleSlugs.value).toEqual(["hamstrings", "calves"]);
  });

  it("snapshots xpStore's level/progress from *before* finish resolves, unaffected by a later xpStore.load()", async () => {
    const { stores, xpStore } = makeStores();
    // Simulate xpStore.load() (called fire-and-forget by finishWorkout) actually landing new data.
    xpStore.load.mockImplementation(async () => {
      xpStore.level = 4;
      xpStore.progressPercent = 5;
    });

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();
    await Promise.resolve(); // let the fire-and-forget xpStore.load() microtask land

    expect(result.finishXpSnapshot.value).toEqual({ levelBefore: 3, progressBefore: 40 });
    expect(xpStore.level).toBe(4); // store itself did move on...
    expect(result.finishXpSnapshot.value?.levelBefore).toBe(3); // ...but the snapshot didn't
  });

  it("reloads streak/xp/overall-rank after a finish", async () => {
    const { stores, streakStore, xpStore, overallRankStore } = makeStores();
    const result = useWorkoutFinish(stores, noMuscles, nameFn);

    await result.finishWorkout();

    expect(streakStore.load).toHaveBeenCalledTimes(1);
    expect(xpStore.load).toHaveBeenCalledTimes(1);
    expect(overallRankStore.load).toHaveBeenCalledTimes(1);
  });

  it("computes routineBeats for sets that beat the source routine's targets", async () => {
    const routine = makeRoutine({
      id: "routine-1",
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 8, weightKg: 60 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "ex-a-slug", name: null, isBodyweight: false },
        },
      ],
    });
    const { stores, routineStore } = makeStores({
      exercises: [
        makeActiveExercise({
          exerciseId: "ex-a",
          sets: [makeSet({ index: 0, weightKg: 70, reps: 8, logged: true, isWarmup: false })], // 70 > 60kg target -> beats it
        }),
      ],
    });
    routineStore.routines = [routine];

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(result.routineBeats.value).toHaveLength(1);
    expect(result.routineBeats.value[0]).toMatchObject({ exerciseId: "ex-a", setIndex: 0, targetWeightKg: 60, loggedWeightKg: 70 });
  });

  it("leaves routineBeats empty for a routine-less (Quick Start) session", async () => {
    const { stores } = makeStores({ routineId: null });

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(result.routineBeats.value).toEqual([]);
  });

  it("advances the mesocycle only when the finished routine has one attached", async () => {
    const routineWithMeso = makeRoutine({
      id: "routine-1",
      mesocycle: { id: "meso-1", routineId: "routine-1", totalWeeks: 3, currentWeek: 1, weekPercents: [100, 105, 60] },
    });
    const { stores, routineStore } = makeStores();
    routineStore.routines = [routineWithMeso];

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(routineStore.advanceMesocycle).toHaveBeenCalledWith("routine-1");
  });

  it("does not advance the mesocycle for a routine with none attached", async () => {
    const routineNoMeso = makeRoutine({ id: "routine-1", mesocycle: null });
    const { stores, routineStore } = makeStores();
    routineStore.routines = [routineNoMeso];

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    expect(routineStore.advanceMesocycle).not.toHaveBeenCalled();
  });
});

describe("useWorkoutFinish — session accumulators reset on a genuine workoutId change", () => {
  it("does NOT reset when workoutId goes from a real id to null (finish's own $reset)", async () => {
    const { stores, activeWorkoutStore } = makeStores();
    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    result.sessionXp.value = 50;

    activeWorkoutStore.workoutId = null;
    await nextTick();

    expect(result.sessionXp.value).toBe(50);
  });

  it("resets sessionXp/sessionRankUps/etc. when workoutId changes to a new real id", async () => {
    const { stores, activeWorkoutStore } = makeStores();
    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    result.sessionXp.value = 50;
    result.sessionRankUps.value = [{ exerciseName: "X", tier: "gold", division: 1, isPr: false, lp: 1, prevLp: 0, plausibilityNote: null }];
    result.consistencyBonusXp.value = 10;
    result.varietyBonusXp.value = 5;
    result.newMuscleSlugs.value = ["chest"];

    activeWorkoutStore.workoutId = "workout-2";
    await nextTick();

    expect(result.sessionXp.value).toBe(0);
    expect(result.sessionRankUps.value).toEqual([]);
    expect(result.sessionCaptions.value).toEqual([]);
    expect(result.consistencyBonusXp.value).toBe(0);
    expect(result.varietyBonusXp.value).toBe(0);
    expect(result.newMuscleSlugs.value).toEqual([]);
  });
});

describe("useWorkoutFinish — updateRoutineWithBeats", () => {
  it("does nothing when there's no beatRoutine (e.g. before finishWorkout(), or a Quick Start session)", async () => {
    const { stores, routineStore } = makeStores();
    const result = useWorkoutFinish(stores, noMuscles, nameFn);

    await result.updateRoutineWithBeats();

    expect(routineStore.update).not.toHaveBeenCalled();
    expect(result.routineUpdated.value).toBe(false);
  });

  it("raises beaten sets to what was actually logged and marks routineUpdated", async () => {
    const routine = makeRoutine({
      id: "routine-1",
      routineExercises: [
        {
          id: "re-1",
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 8, weightKg: 60 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
          exercise: { id: "ex-a", slug: "ex-a-slug", name: null, isBodyweight: false },
        },
      ],
    });
    const { stores, routineStore } = makeStores({
      exercises: [
        makeActiveExercise({
          exerciseId: "ex-a",
          sets: [makeSet({ index: 0, weightKg: 70, reps: 8, logged: true, isWarmup: false })],
        }),
      ],
    });
    routineStore.routines = [routine];

    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();
    expect(result.updatingRoutine.value).toBe(false);

    await result.updateRoutineWithBeats();

    expect(routineStore.update).toHaveBeenCalledWith("routine-1", {
      exercises: [
        {
          exerciseId: "ex-a",
          orderIndex: 0,
          targetSets: [{ reps: 8, weightKg: 70 }],
          supersetGroup: null,
          restBetweenSetsSeconds: null,
          restAfterExerciseSeconds: null,
        },
      ],
    });
    expect(result.routineUpdated.value).toBe(true);
    expect(result.updatingRoutine.value).toBe(false);
  });

  it("is a no-op re-entrancy guard while an update is already in flight", async () => {
    const { stores, routineStore } = makeStores();
    routineStore.routines = [makeRoutine({ id: "routine-1" })];
    const result = useWorkoutFinish(stores, noMuscles, nameFn);
    await result.finishWorkout();

    result.updatingRoutine.value = true; // simulate "already updating"
    await result.updateRoutineWithBeats();

    expect(routineStore.update).not.toHaveBeenCalled();
  });
});
