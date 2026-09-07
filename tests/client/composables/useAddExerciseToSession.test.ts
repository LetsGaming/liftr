import { describe, expect, it, vi } from "vitest";
import { useAddExerciseToSession } from "~client/composables/useAddExerciseToSession";
import type { useActiveWorkoutStore } from "~client/stores/activeWorkoutStore";
import type { CatalogExercise } from "~client/stores/catalogStore";

type ActiveWorkoutStore = ReturnType<typeof useActiveWorkoutStore>;

function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
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

function makeStore(addExercise = vi.fn().mockResolvedValue(undefined)): ActiveWorkoutStore {
  return { addExercise } as unknown as ActiveWorkoutStore;
}

describe("useAddExerciseToSession", () => {
  it("starts closed with an empty search", () => {
    const { showAddExercise, addExerciseSearch } = useAddExerciseToSession(makeStore(), () => [], () => "");

    expect(showAddExercise.value).toBe(false);
    expect(addExerciseSearch.value).toBe("");
  });

  it("addExerciseCandidates lists exercises whose resolved name matches the search, case-insensitively", () => {
    const exercises = [makeExercise({ slug: "bench-press" }), makeExercise({ id: "ex-2", slug: "back-squat" })];
    const names: Record<string, string> = { "bench-press": "Bench Press", "back-squat": "Back Squat" };
    const { addExerciseSearch, addExerciseCandidates } = useAddExerciseToSession(
      makeStore(),
      () => exercises,
      (slug) => names[slug]!,
    );

    addExerciseSearch.value = "bench";

    expect(addExerciseCandidates.value.map((e) => e.slug)).toEqual(["bench-press"]);
  });

  it("addExerciseCandidates returns everything (up to the cap) when the search is empty", () => {
    const exercises = [makeExercise({ slug: "bench-press" }), makeExercise({ id: "ex-2", slug: "back-squat" })];
    const { addExerciseCandidates } = useAddExerciseToSession(makeStore(), () => exercises, (slug) => slug);

    expect(addExerciseCandidates.value).toHaveLength(2);
  });

  it("addExerciseCandidates caps results at 30", () => {
    const exercises = Array.from({ length: 50 }, (_, i) => makeExercise({ id: `ex-${i}`, slug: `slug-${i}` }));
    const { addExerciseCandidates } = useAddExerciseToSession(makeStore(), () => exercises, (slug) => slug);

    expect(addExerciseCandidates.value).toHaveLength(30);
  });

  it("addExerciseCandidates recomputes when the search changes", () => {
    const exercises = [makeExercise({ slug: "bench-press" }), makeExercise({ id: "ex-2", slug: "back-squat" })];
    const { addExerciseSearch, addExerciseCandidates } = useAddExerciseToSession(
      makeStore(),
      () => exercises,
      (slug) => slug,
    );

    addExerciseSearch.value = "squat";
    expect(addExerciseCandidates.value.map((e) => e.slug)).toEqual(["back-squat"]);

    addExerciseSearch.value = "";
    expect(addExerciseCandidates.value).toHaveLength(2);
  });

  it("addExerciseToSession adds three default 8-rep, no-weight target sets and passes through exercise info", async () => {
    const addExercise = vi.fn().mockResolvedValue(undefined);
    const store = makeStore(addExercise);
    const ex = makeExercise({ id: "ex-9", slug: "overhead-press", isBodyweight: false });
    const { addExerciseToSession } = useAddExerciseToSession(store, () => [], (slug) => `Name(${slug})`);

    await addExerciseToSession(ex);

    expect(addExercise).toHaveBeenCalledWith({
      exerciseId: "ex-9",
      name: "Name(overhead-press)",
      isBodyweight: false,
      targetSets: [
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
      ],
    });
  });

  it("addExerciseToSession closes the picker and clears the search afterward", async () => {
    const store = makeStore();
    const { showAddExercise, addExerciseSearch, addExerciseToSession } = useAddExerciseToSession(
      store,
      () => [],
      (slug) => slug,
    );
    showAddExercise.value = true;
    addExerciseSearch.value = "bench";

    await addExerciseToSession(makeExercise());

    expect(showAddExercise.value).toBe(false);
    expect(addExerciseSearch.value).toBe("");
  });
});
