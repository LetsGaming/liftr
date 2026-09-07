// useRoutineReviewChecks.ts reads exercise muscle tags off catalogStore (a Pinia store), so
// every test needs an active pinia — no jsdom needed, nothing here touches the DOM or
// localStorage (unlike catalogStore's own load() action, which these tests never call; they
// just seed `catalog.exercises` directly).
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { useRoutineReviewChecks } from "~client/composables/useRoutineReviewChecks";
import type { DraftExercise } from "~client/components/routine-wizard/RoutineWizard.vue";

function makeExercise(id: string, muscles: CatalogExercise["muscles"]): CatalogExercise {
  return {
    id,
    slug: id,
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
    muscles,
  };
}

function makeDraft(setCount: number): DraftExercise {
  return {
    sets: Array.from({ length: setCount }, () => ({ reps: 8, weightKg: 40 })),
    linkNext: false,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 90,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("coverage", () => {
  it("is null when nothing was requested (fully manual routine)", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [{ slug: "chest", role: "primary" }])];
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)]]);
    const requested = ref<string[]>([]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toBeNull();
  });

  it("marks a requested muscle 'covered' when it's a primary target of a picked exercise", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [{ slug: "chest", role: "primary" }])];
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)]]);
    const requested = ref<string[]>(["chest"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "chest", label: "Brust", state: "covered" }]);
  });

  it("marks a requested muscle 'partial' when it's only secondary across picked exercises", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [{ slug: "triceps", role: "secondary" }])];
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)]]);
    const requested = ref<string[]>(["triceps"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "triceps", label: "Trizeps", state: "partial" }]);
  });

  it("marks a requested muscle 'missing' when no picked exercise touches it at all", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [{ slug: "chest", role: "primary" }])];
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)]]);
    const requested = ref<string[]>(["hamstrings"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "hamstrings", label: "Hamstrings", state: "missing" }]);
  });

  it("primary involvement on one exercise wins over secondary on another for the same muscle", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [
      makeExercise("ex-1", [{ slug: "chest", role: "secondary" }]),
      makeExercise("ex-2", [{ slug: "chest", role: "primary" }]),
    ];
    const entries = ref<[string, DraftExercise][]>([
      ["ex-1", makeDraft(3)],
      ["ex-2", makeDraft(3)],
    ]);
    const requested = ref<string[]>(["chest"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "chest", label: "Brust", state: "covered" }]);
  });

  it("falls back to the raw slug as the label for an unknown muscle slug", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [];
    const entries = ref<[string, DraftExercise][]>([]);
    const requested = ref<string[]>(["not-a-real-muscle"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "not-a-real-muscle", label: "not-a-real-muscle", state: "missing" }]);
  });

  it("never crashes on an exercise with no muscle tags (e.g. wrist-curl)", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [])];
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)]]);
    const requested = ref<string[]>(["chest"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});

    expect(coverage.value).toEqual([{ slug: "chest", label: "Brust", state: "missing" }]);
  });

  it("recomputes when entries or requestedMuscleSlugs change", () => {
    const catalog = useCatalogStore();
    catalog.exercises = [makeExercise("ex-1", [{ slug: "chest", role: "primary" }])];
    const entries = ref<[string, DraftExercise][]>([]);
    const requested = ref<string[]>(["chest"]);

    const { coverage } = useRoutineReviewChecks(entries, requested, {});
    expect(coverage.value).toEqual([{ slug: "chest", label: "Brust", state: "missing" }]);

    entries.value = [["ex-1", makeDraft(3)]];
    expect(coverage.value).toEqual([{ slug: "chest", label: "Brust", state: "covered" }]);
  });
});

describe("isLopsided", () => {
  it("is false with fewer than 3 exercises, no matter how skewed", () => {
    const entries = ref<[string, DraftExercise][]>([
      ["ex-1", makeDraft(2)],
      ["ex-2", makeDraft(10)],
    ]);
    const { isLopsided } = useRoutineReviewChecks(entries, ref([]), {});

    expect(isLopsided(10)).toBe(false);
  });

  it("flags a set count at least double the median with a real (>=2 set) gap", () => {
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)], ["ex-2", makeDraft(3)], ["ex-3", makeDraft(8)]]);
    const { isLopsided } = useRoutineReviewChecks(entries, ref([]), {});

    // median of [3,3,8] = 3; 8 >= 3*2 and 8-3=5 >= 2
    expect(isLopsided(8)).toBe(true);
  });

  it("does not flag a merely slightly-higher set count (no real gap)", () => {
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(3)], ["ex-2", makeDraft(3)], ["ex-3", makeDraft(4)]]);
    const { isLopsided } = useRoutineReviewChecks(entries, ref([]), {});

    // median = 3; 4 is not >= 3*2, so not lopsided even though it's "more than typical"
    expect(isLopsided(4)).toBe(false);
  });

  it("does not flag when the median is 0", () => {
    const entries = ref<[string, DraftExercise][]>([["ex-1", makeDraft(0)], ["ex-2", makeDraft(0)], ["ex-3", makeDraft(5)]]);
    const { isLopsided } = useRoutineReviewChecks(entries, ref([]), {});

    expect(isLopsided(5)).toBe(false);
  });
});

describe("isSubstitute", () => {
  it("is true only for exercise ids flagged isSubstitute in suggestionMeta", () => {
    const entries = ref<[string, DraftExercise][]>([]);
    const { isSubstitute } = useRoutineReviewChecks(entries, ref([]), {
      "ex-1": { isSubstitute: true },
      "ex-2": { isSubstitute: false },
    });

    expect(isSubstitute("ex-1")).toBe(true);
    expect(isSubstitute("ex-2")).toBe(false);
    expect(isSubstitute("ex-unknown")).toBe(false);
  });
});
