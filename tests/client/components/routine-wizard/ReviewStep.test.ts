// ReviewStep.vue — same real-child/real-store setup as FastPathStep.test.ts (its close sibling:
// both consume useRoutineReviewChecks and render an identical exercise-summary shape), just with
// its own totalSets/back-button markup instead of reorder controls.
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import ReviewStep from "~client/components/routine-wizard/ReviewStep.vue";
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
  totalSets: number;
  saving: boolean;
  canSave: boolean;
  isEditing: boolean;
  requestedMuscleSlugs: string[];
  suggestionMeta: Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean; missingEquipment?: string[] }>;
}

function mountReview(props: Partial<Props>, exercises: CatalogExercise[]) {
  const pinia = createPinia();
  useCatalogStore(pinia).$patch({ exercises, loaded: true });
  return mountWithProviders(ReviewStep, {
    props: {
      name: "Push Day",
      entries: [],
      totalSets: 0,
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

describe("ReviewStep", () => {
  it("shows the routine name, exercise count and total sets", () => {
    const wrapper = mountReview(
      { name: "Push Day", entries: [["ex-1", makeDraft()]], totalSets: 3 },
      [makeExercise()],
    );

    expect(wrapper.find(".summary b").text()).toBe("Push Day");
    expect(wrapper.find(".summary span").text()).toBe("1 Übung · 3 Sätze");
  });

  it("falls back to a placeholder name and pluralizes exercise count", () => {
    const wrapper = mountReview(
      { name: "", entries: [["ex-1", makeDraft()], ["ex-2", makeDraft()]], totalSets: 6 },
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" })],
    );

    expect(wrapper.find(".summary b").text()).toBe("Unbenannte Routine");
    expect(wrapper.find(".summary span").text()).toBe("2 Übungen · 6 Sätze");
  });

  it("shows a reps/weight summary per exercise", () => {
    const wrapper = mountReview(
      { entries: [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 6, weightKg: null }] })]] },
      [makeExercise()],
    );

    expect(wrapper.find(".ex-reps").text()).toBe("40×8 / 6");
  });

  it("shows a substitute note naming the missing equipment", () => {
    const wrapper = mountReview(
      {
        entries: [["ex-1", makeDraft()]],
        suggestionMeta: { "ex-1": { isSubstitute: true, missingEquipment: ["dumbbell"] } },
      },
      [makeExercise()],
    );

    expect(wrapper.find(".ex-note").text()).toContain("Kurzhanteln");
  });

  it("flags a lopsided exercise", () => {
    const wrapper = mountReview(
      {
        entries: [
          ["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }] })],
          ["ex-2", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }] })],
          ["ex-3", makeDraft({ sets: Array.from({ length: 8 }, () => ({ reps: 8, weightKg: 40 })) })],
        ],
      },
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" }), makeExercise({ id: "ex-3", slug: "row" })],
    );

    const notes = wrapper.findAll(".ex-note");
    expect(notes.some((n) => n.text().includes("Deutlich mehr Sätze"))).toBe(true);
  });

  it("shows muscle-coverage chips only when something was requested", () => {
    const withRequest = mountReview(
      { entries: [["ex-1", makeDraft()]], requestedMuscleSlugs: ["chest"] },
      [makeExercise({ muscles: [{ slug: "chest", role: "primary" }] })],
    );
    expect(withRequest.find(".coverage-chip").text()).toBe("Brust · abgedeckt");

    const withoutRequest = mountReview({ entries: [["ex-1", makeDraft()]] }, [makeExercise()]);
    expect(withoutRequest.find(".coverage").exists()).toBe(false);
  });

  it("emits back when the back button is tapped", async () => {
    const wrapper = mountReview({}, []);

    await wrapper.find(".review-back").trigger("click");

    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  it("disables save while saving or not saveable, and shows the busy label", () => {
    const savingWrapper = mountReview({ saving: true }, []);
    expect(savingWrapper.find(".review-save").attributes("disabled")).toBeDefined();
    expect(savingWrapper.find(".review-save").text()).toBe("Wird gespeichert…");

    const notSaveable = mountReview({ canSave: false }, []);
    expect(notSaveable.find(".review-save").attributes("disabled")).toBeDefined();
  });

  it("shows 'edit' vs 'create' save copy based on isEditing, and emits save when tapped", async () => {
    const editing = mountReview({ isEditing: true }, []);
    expect(editing.find(".review-save").text()).toBe("Änderungen speichern");

    const creating = mountReview({ isEditing: false }, []);
    expect(creating.find(".review-save").text()).toBe("Routine speichern");

    await creating.find(".review-save").trigger("click");
    expect(creating.emitted("save")).toHaveLength(1);
  });
});
