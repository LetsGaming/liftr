import { createPinia } from "pinia";
import { describe, expect, it, vi } from "vitest";

// activeWorkoutStore's mutations persist() to IndexedDB (lib/idb.ts) and read syncStore — neither
// exists/is relevant under jsdom, same stub as tests/client/stores/activeWorkoutStore.spec.ts.
vi.mock("~client/lib/idb", () => ({
  saveActiveWorkout: vi.fn(),
  loadActiveWorkout: vi.fn(),
  clearActiveWorkout: vi.fn(),
}));
vi.mock("~client/stores/syncStore", () => ({
  useSyncStore: () => ({ enqueue: vi.fn(), enqueueAndAwaitFlush: vi.fn() }),
}));

import ExerciseRail from "~client/components/exercise/ExerciseRail.vue";
import { i18n } from "~client/i18n";
import { useActiveWorkoutStore, type ActiveExercise, type ActiveSet } from "~client/stores/activeWorkoutStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

function makeSet(overrides: Partial<ActiveSet> = {}): ActiveSet {
  return {
    index: 0,
    weightKg: 60,
    reps: 5,
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

function makeExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    workoutExerciseId: `we-${Math.random()}`,
    exerciseId: "ex-1",
    name: "Bankdrücken",
    isBodyweight: false,
    sets: [makeSet()],
    supersetGroup: null,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 120,
    ...overrides,
  };
}

function mountRail(exercises: ActiveExercise[], currentExerciseIndex = 0, props: { variant?: "vertical" | "horizontal" } = {}) {
  const pinia = createPinia();
  const store = useActiveWorkoutStore(pinia);
  store.exercises = exercises;
  store.currentExerciseIndex = currentExerciseIndex;
  const wrapper = mountWithProviders(ExerciseRail, {
    props,
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
  return { wrapper, store };
}

describe("ExerciseRail", () => {
  it("renders one row per exercise, numbered from 1", () => {
    const { wrapper } = mountRail([makeExercise({ name: "Kniebeuge" }), makeExercise({ name: "Bankdrücken" })]);

    const items = wrapper.findAll(".rail-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.find(".n").text()).toBe("1");
    expect(items[1]!.find(".n").text()).toBe("2");
    expect(items[0]!.find("b").text()).toContain("Kniebeuge");
    expect(items[1]!.find("b").text()).toContain("Bankdrücken");
  });

  it("shows a check icon instead of a number once every set in a row is logged", () => {
    const { wrapper } = mountRail([makeExercise({ sets: [makeSet({ logged: true })] })]);

    const item = wrapper.find(".rail-item");
    expect(item.classes()).toContain("done");
    expect(item.find(".n").text()).toBe("");
    expect(item.find(".n svg").exists()).toBe(true);
  });

  it("shows the logged/total set count and the first working set's rep target", () => {
    const { wrapper } = mountRail([
      makeExercise({
        sets: [
          makeSet({ isWarmup: true, reps: 12, logged: true }),
          makeSet({ isWarmup: false, reps: 8, logged: true }),
          makeSet({ isWarmup: false, reps: 8, logged: false }),
        ],
      }),
    ]);

    // Two spaces before "·" is the real rendered output (a text-node newline collapses to one
    // space, plus the <template> branch's own leading space) — not condensed further by Vue.
    expect(wrapper.find(".rail-item .meta span").text()).toBe("2 / 3 Sätze  · 8 Wdh.");
  });

  it("omits the rep target when every set is a warmup (no working set to report)", () => {
    const { wrapper } = mountRail([makeExercise({ sets: [makeSet({ isWarmup: true, reps: 12 })] })]);

    expect(wrapper.find(".rail-item .meta span").text()).toBe("0 / 1 Sätze");
  });

  it("marks the current exercise active", () => {
    const { wrapper } = mountRail([makeExercise(), makeExercise()], 1);

    const items = wrapper.findAll(".rail-item");
    expect(items[0]!.classes()).not.toContain("active");
    expect(items[1]!.classes()).toContain("active");
  });

  it("shows the superset dot only for grouped exercises", () => {
    const { wrapper } = mountRail([makeExercise({ supersetGroup: null }), makeExercise({ supersetGroup: 1 })]);

    const items = wrapper.findAll(".rail-item");
    expect(items[0]!.classes()).not.toContain("grouped");
    expect(items[0]!.find(".superset-dot").exists()).toBe(false);
    expect(items[1]!.classes()).toContain("grouped");
    expect(items[1]!.find(".superset-dot").exists()).toBe(true);
  });

  it("applies the horizontal class only when variant is horizontal", () => {
    const vertical = mountRail([makeExercise()], 0, {}).wrapper;
    const horizontal = mountRail([makeExercise()], 0, { variant: "horizontal" }).wrapper;

    expect(vertical.find(".exercise-rail").classes()).not.toContain("horizontal");
    expect(horizontal.find(".exercise-rail").classes()).toContain("horizontal");
  });

  it("jumps to the clicked exercise on the store and emits jump with its index", async () => {
    const { wrapper, store } = mountRail([makeExercise(), makeExercise(), makeExercise()], 0);

    await wrapper.findAll(".rail-item")[2]!.trigger("click");

    expect(store.currentExerciseIndex).toBe(2);
    expect(wrapper.emitted("jump")).toEqual([[2]]);
  });
});
