// FastPathStep.vue renders real ExerciseRow/AppIcon children plus useCatalogStore /
// useExerciseName / useRoutineReviewChecks — all real, no network boundary crossed by rendering,
// so this seeds a real Pinia catalog rather than mocking anything (see PickStep.test.ts's header
// comment for why a Pinia has to be built and passed in directly here instead of relying on
// mountWithProviders' own fresh one).
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import FastPathStep from "~client/components/routine-wizard/FastPathStep.vue";
import type { DraftExercise } from "~client/components/routine-wizard/RoutineWizard.vue";
import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

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
    hasImage: false,
    muscles: [],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DraftExercise> = {}): DraftExercise {
  return {
    sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }],
    linkNext: false,
    restBetweenSetsSeconds: 90,
    restAfterExerciseSeconds: 90,
    ...overrides,
  };
}

interface Props {
  name: string;
  entries: [string, DraftExercise][];
  saving: boolean;
  canSave: boolean;
  isEditing: boolean;
  requestedMuscleSlugs: string[];
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>;
}

function mountFastPath(props: Partial<Props>, exercises: CatalogExercise[]) {
  const pinia = createPinia();
  useCatalogStore(pinia).$patch({ exercises, loaded: true });
  return mountWithProviders(FastPathStep, {
    props: {
      name: "Push Day",
      entries: [],
      saving: false,
      canSave: true,
      isEditing: false,
      requestedMuscleSlugs: [],
      suggestionMeta: {},
      ...props,
    },
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

describe("FastPathStep", () => {
  it("renders one row per entry with a reps/weight summary", () => {
    const wrapper = mountFastPath(
      { entries: [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 6, weightKg: null }] })]] },
      [makeExercise()],
    );

    expect(wrapper.findAll(".ex-list li")).toHaveLength(1);
    expect(wrapper.find(".ex-reps").text()).toBe("40×8 / 6");
  });

  it("emits move with (from, to) from the reorder buttons, disabled at the boundaries", async () => {
    const wrapper = mountFastPath(
      { entries: [["ex-1", makeDraft()], ["ex-2", makeDraft()]] },
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" })],
    );

    const rows = wrapper.findAll(".ex-list li");
    const firstRowButtons = rows[0]!.findAll(".reorder button");
    expect(firstRowButtons[0]!.attributes("disabled")).toBeDefined(); // can't move row 0 up
    await firstRowButtons[1]!.trigger("click"); // move row 0 down

    expect(wrapper.emitted("move")).toEqual([[0, 1]]);
  });

  it("emits removeExercise with the exercise id", async () => {
    const wrapper = mountFastPath({ entries: [["ex-1", makeDraft()]] }, [makeExercise()]);

    await wrapper.find(".remove-btn").trigger("click");

    expect(wrapper.emitted("removeExercise")).toEqual([["ex-1"]]);
  });

  it("shows a substitute note naming the missing equipment", () => {
    const wrapper = mountFastPath(
      {
        entries: [["ex-1", makeDraft()]],
        suggestionMeta: { "ex-1": { isSubstitute: true, missingEquipment: ["barbell"] } },
      },
      [makeExercise()],
    );

    expect(wrapper.find(".ex-note").text()).toContain("Langhantel");
  });

  it("falls back to the generic substitute copy when no missing-equipment list is present", () => {
    const wrapper = mountFastPath(
      { entries: [["ex-1", makeDraft()]], suggestionMeta: { "ex-1": { isSubstitute: true } } },
      [makeExercise()],
    );

    expect(wrapper.find(".ex-note").text()).toBe("Ersetzt: bevorzugte Variante braucht Ausrüstung, die du nicht hast.");
  });

  it("flags a lopsided exercise (>=3 entries, >=2x the median set count)", () => {
    const wrapper = mountFastPath(
      {
        entries: [
          ["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }] })],
          ["ex-2", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }] })],
          [
            "ex-3",
            makeDraft({
              sets: Array.from({ length: 8 }, () => ({ reps: 8, weightKg: 40 })),
            }),
          ],
        ],
      },
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" }), makeExercise({ id: "ex-3", slug: "row" })],
    );

    const notes = wrapper.findAll(".ex-note");
    expect(notes.some((n) => n.text().includes("Deutlich mehr Sätze"))).toBe(true);
  });

  it("shows muscle-coverage chips when requestedMuscleSlugs is non-empty", () => {
    const wrapper = mountFastPath(
      {
        entries: [["ex-1", makeDraft()]],
        requestedMuscleSlugs: ["chest"],
      },
      [makeExercise({ muscles: [{ slug: "chest", role: "primary" }] })],
    );

    expect(wrapper.find(".coverage").exists()).toBe(true);
    expect(wrapper.find(".coverage-chip").text()).toBe("Brust · abgedeckt");
  });

  it("hides the coverage section when nothing was requested", () => {
    const wrapper = mountFastPath({ entries: [["ex-1", makeDraft()]] }, [makeExercise()]);

    expect(wrapper.find(".coverage").exists()).toBe(false);
  });

  it("emits addExercise and customize from their buttons", async () => {
    const wrapper = mountFastPath({}, []);

    await wrapper.find(".add-exercise-btn").trigger("click");
    await wrapper.find(".customize-btn").trigger("click");

    expect(wrapper.emitted("addExercise")).toHaveLength(1);
    expect(wrapper.emitted("customize")).toHaveLength(1);
  });

  it("disables save while saving/not saveable and shows a busy label", () => {
    const wrapper = mountFastPath({ saving: true, canSave: true }, []);

    const saveBtn = wrapper.find(".btn-primary.btn-lg");
    expect(saveBtn.attributes("disabled")).toBeDefined();
    expect(saveBtn.text()).toBe("Wird gespeichert…");
  });

  it("shows 'edit' vs 'create' save copy based on isEditing, and emits save when tapped", async () => {
    const editing = mountFastPath({ isEditing: true }, []);
    expect(editing.find(".btn-primary.btn-lg").text()).toBe("Änderungen speichern");

    const creating = mountFastPath({ isEditing: false }, []);
    expect(creating.find(".btn-primary.btn-lg").text()).toBe("Routine speichern");

    await creating.find(".btn-primary.btn-lg").trigger("click");
    expect(creating.emitted("save")).toHaveLength(1);
  });
});
