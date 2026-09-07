// @vitest-environment jsdom
//
// SetEntry.vue is the core two-stepper logging card (weight/reps) plus the optional plate
// calculator reveal. It reads/writes activeWorkoutStore directly (real Pinia store — mutating
// actions fire-and-forget persist() into IndexedDB, stubbed the same way
// tests/client/stores/activeWorkoutStore.spec.ts does) and, for the plate calculator, reads
// settingsStore.gymSetup + catalogStore.byId() for the current exercise's equipment.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogExercise } from "~client/services/exerciseService";
import type { GymSetup } from "~client/services/settingsService";
import SetEntry from "~client/components/workout/SetEntry.vue";
import { useActiveWorkoutStore, type ActiveExercise } from "~client/stores/activeWorkoutStore";
import { useCatalogStore } from "~client/stores/catalogStore";
import { useSettingsStore } from "~client/stores/settingsStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

vi.mock("~client/lib/idb", () => ({
  saveActiveWorkout: vi.fn(),
  loadActiveWorkout: vi.fn(),
  clearActiveWorkout: vi.fn(),
}));

vi.mock("~client/stores/syncStore", () => ({
  useSyncStore: () => ({ enqueue: vi.fn(), enqueueAndAwaitFlush: vi.fn() }),
}));

function catalogExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: "ex-1",
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
    ...overrides,
  };
}

/** Mounts SetEntry, seeds a single active exercise/set into the (real) activeWorkoutStore, and
 *  optionally the catalog/settings stores too — then awaits a tick so the mount's initial render
 *  and the $patch-driven re-render both land before assertions run (a bare $patch after mount()
 *  mutates reactive state synchronously, but Vue's own DOM update is batched onto the next
 *  microtask, so every test needs to await one before reading the rendered DOM). */
async function mountAndSeed(overrides: {
  weightKg?: number | null;
  reps?: number;
  exerciseId?: string;
  isBodyweight?: boolean;
  catalogEntry?: Partial<CatalogExercise>;
  gymSetup?: GymSetup;
}) {
  const { weightKg = 60, reps = 0, exerciseId = "ex-1", isBodyweight = false, catalogEntry, gymSetup } = overrides;
  const wrapper = mountWithProviders(SetEntry);
  const store = useActiveWorkoutStore();

  const exercise: ActiveExercise = {
    workoutExerciseId: "we-1",
    exerciseId,
    name: "Bench Press",
    isBodyweight,
    supersetGroup: null,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 120,
    sets: [
      {
        index: 0,
        weightKg,
        reps,
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

  if (catalogEntry) {
    useCatalogStore().$patch({ exercises: [catalogExercise({ id: exerciseId, ...catalogEntry })] });
  }
  if (gymSetup) {
    useSettingsStore().$patch({ gymSetup });
  }

  await wrapper.vm.$nextTick();
  return { wrapper, store };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("SetEntry", () => {
  it("renders nothing when there is no current set", () => {
    const wrapper = mountWithProviders(SetEntry);

    expect(wrapper.find(".entry-grid").exists()).toBe(false);
  });

  it("renders a weight and a reps stepper, seeded from the current set's values", async () => {
    const { wrapper } = await mountAndSeed({ weightKg: 60, reps: 8 });

    const steppers = wrapper.findAll(".stepper.lg");
    expect(steppers).toHaveLength(2);
    expect(steppers[0]!.find(".eyebrow").text()).toBe("Gewicht");
    // NumberStepper's <small> unit text compiles down without its template's leading space
    // (Vue's whitespace condensing), so the rendered textContent is "60kg", not "60 kg".
    expect(steppers[0]!.find(".num-edit").text()).toBe("60kg");
    expect(steppers[1]!.find(".eyebrow").text()).toBe("Wiederholungen");
    expect(steppers[1]!.find(".num-edit").text()).toBe("8");
  });

  it("omits the weight stepper entirely for a pure bodyweight set (weightKg: null)", async () => {
    const { wrapper } = await mountAndSeed({ weightKg: null, reps: 12, isBodyweight: true });

    const steppers = wrapper.findAll(".stepper.lg");
    expect(steppers).toHaveLength(1);
    expect(steppers[0]!.find(".eyebrow").text()).toBe("Wiederholungen");
    expect(wrapper.find(".plates-toggle").exists()).toBe(false);
  });

  it("emphasizes the reps number while reps is still at its unset starting value (0)", async () => {
    const { wrapper } = await mountAndSeed({ weightKg: 60, reps: 0 });

    const repsNum = wrapper.findAll(".stepper.lg")[1]!.find(".num-edit");
    expect(repsNum.classes()).toContain("emphasize");
  });

  it("does not emphasize the reps number once reps has been actively entered", async () => {
    const { wrapper } = await mountAndSeed({ weightKg: 60, reps: 5 });

    const repsNum = wrapper.findAll(".stepper.lg")[1]!.find(".num-edit");
    expect(repsNum.classes()).not.toContain("emphasize");
  });

  it("tapping the weight stepper's +/- buttons adjusts the store's current set by the 1.25kg step", async () => {
    const { wrapper, store } = await mountAndSeed({ weightKg: 60, reps: 5 });

    const weightCtrls = wrapper.findAll(".stepper.lg")[0]!.findAll(".ctrls button");
    await weightCtrls[1]!.trigger("click"); // "+"
    expect(store.currentSet?.weightKg).toBe(61.25);

    await weightCtrls[0]!.trigger("click"); // "-"
    await weightCtrls[0]!.trigger("click");
    expect(store.currentSet?.weightKg).toBe(58.75);
  });

  it("tapping the reps stepper's +/- buttons adjusts reps by 1", async () => {
    const { wrapper, store } = await mountAndSeed({ weightKg: 60, reps: 5 });

    const repsCtrls = wrapper.findAll(".stepper.lg")[1]!.findAll(".ctrls button");
    await repsCtrls[1]!.trigger("click"); // "+"
    expect(store.currentSet?.reps).toBe(6);

    await repsCtrls[0]!.trigger("click"); // "-"
    expect(store.currentSet?.reps).toBe(5);
  });

  it("reps never drops below 0 (store's own clamp)", async () => {
    const { wrapper, store } = await mountAndSeed({ weightKg: 60, reps: 0 });

    const repsCtrls = wrapper.findAll(".stepper.lg")[1]!.findAll(".ctrls button");
    await repsCtrls[0]!.trigger("click"); // "-"
    expect(store.currentSet?.reps).toBe(0);
  });

  it("direct numeric entry on the weight number rounds to the nearest step and writes via setCurrentSetValue", async () => {
    const { wrapper, store } = await mountAndSeed({ weightKg: 60, reps: 5 });

    const weightStepper = wrapper.findAll(".stepper.lg")[0]!;
    await weightStepper.find(".num-edit").trigger("click"); // opens the input
    const input = weightStepper.find("input");
    await input.setValue("83");
    await input.trigger("keydown.enter");

    // store rounds to the nearest 1.25kg step: 83 -> 82.5
    expect(store.currentSet?.weightKg).toBe(82.5);
  });

  describe("plate calculator", () => {
    it("is collapsed by default and reveals a default-inventory breakdown on tap", async () => {
      const { wrapper } = await mountAndSeed({ weightKg: 100, reps: 5 });

      expect(wrapper.find(".plates-out").exists()).toBe(false);
      expect(wrapper.find(".plates-toggle").text()).toContain("Scheiben anzeigen");

      await wrapper.find(".plates-toggle").trigger("click");

      expect(wrapper.find(".plates-toggle").text()).toBe("Scheiben ausblenden");
      // 100kg, unlimited default 20kg-bar inventory: (100-20)/2 = 40kg/side -> 25 + 15.
      expect(wrapper.find(".plates-out").text()).toBe("20 kg Stange + je Seite 25 + 15 kg");
      expect(wrapper.find(".plates-warning").exists()).toBe(false);
    });

    it("shows the bare-bar phrasing when no plates are needed", async () => {
      const { wrapper } = await mountAndSeed({ weightKg: 20, reps: 5 });

      await wrapper.find(".plates-toggle").trigger("click");

      expect(wrapper.find(".plates-out").text()).toBe("nur die 20 kg Stange");
    });

    it("uses the configured gym's per-equipment bar weight and plate inventory, and warns when the target isn't exactly reachable", async () => {
      const { wrapper } = await mountAndSeed({
        weightKg: 17,
        reps: 5,
        exerciseId: "ex-dumbbell",
        catalogEntry: { equipment: "dumbbell" },
        gymSetup: { barWeights: { dumbbell: 5 }, plates: [{ weightKg: 2.5, count: 4 }] },
      });

      await wrapper.find(".plates-toggle").trigger("click");

      // (17-5)/2 = 6kg/side needed, but only 2 pairs of 2.5kg exist (5kg/side max) -> 15kg total, not exact.
      expect(wrapper.find(".plates-out").text()).toBe("5 kg Stange + je Seite 2.5 + 2.5 kg");
      expect(wrapper.find(".plates-warning").exists()).toBe(true);
      expect(wrapper.find(".plates-warning").text()).toContain("15 kg stattdessen");
    });

    it("falls back to the default 20kg bar for an equipment type with no configured weight", async () => {
      const { wrapper } = await mountAndSeed({
        // (70-20)/2 = 25kg/side, exactly one owned 25kg pair.
        weightKg: 70,
        reps: 5,
        exerciseId: "ex-barbell",
        catalogEntry: { equipment: "barbell" },
        // gymSetup exists but has no entry for "barbell" specifically.
        gymSetup: { barWeights: { dumbbell: 5 }, plates: [{ weightKg: 25, count: 20 }] },
      });

      await wrapper.find(".plates-toggle").trigger("click");

      expect(wrapper.find(".plates-out").text()).toBe("20 kg Stange + je Seite 25 kg");
      expect(wrapper.find(".plates-warning").exists()).toBe(false);
    });
  });
});
