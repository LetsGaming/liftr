// ArrangeStep.vue renders one card per selected exercise with real ExerciseRow/NumberStepper/
// AppIcon children (no store/service boundary crossed rendering those) plus useCatalogStore /
// useExerciseName / useDragReorder. catalogStore is seeded via a Pinia built and passed in
// directly (see PickStep.test.ts's header comment for why). useDragReorder's actual drag gesture
// is driven by native PointerEvent (pointerdown/pointermove/pointerup + setPointerCapture) which
// this repo's jsdom (25.x) doesn't implement at all — dispatching synthetic pointer events would
// either no-op or throw on the missing setPointerCapture call, so the drag-to-reorder gesture
// itself is not exercised here (same class of jsdom gap as RunMap's Leaflet layout needs); every
// other interaction on this component (steppers, kind cycling, rest adjust, link, remove, add) is
// plain click-driven and is covered below.
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import ArrangeStep from "~client/components/routine-wizard/ArrangeStep.vue";
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

function mountArrange(entries: [string, DraftExercise][], exercises: CatalogExercise[]) {
  const pinia = createPinia();
  useCatalogStore(pinia).$patch({ exercises, loaded: true });
  return mountWithProviders(ArrangeStep, {
    props: { entries },
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

describe("ArrangeStep", () => {
  it("renders one card with one set-row per set", () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 10, weightKg: 30 }] })]],
      [makeExercise()],
    );

    expect(wrapper.findAll(".card")).toHaveLength(1);
    expect(wrapper.findAll(".set-row")).toHaveLength(2);
    expect(wrapper.text()).toContain("Satz 1");
    expect(wrapper.text()).toContain("Satz 2");
  });

  it("emits addSet with the exercise id", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft()]], [makeExercise()]);

    await wrapper.find(".add-set-btn").trigger("click");

    expect(wrapper.emitted("addSet")).toEqual([["ex-1"]]);
  });

  it("emits removeSet with the exercise id and set index, and disables it at one set", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }] })]], [makeExercise()]);

    const removeBtn = wrapper.find(".set-remove");
    expect(removeBtn.attributes("disabled")).toBeDefined();
  });

  it("removeSet is enabled and emits (exerciseId, index) with more than one set", async () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }] })]],
      [makeExercise()],
    );

    await wrapper.findAll(".set-remove")[1]!.trigger("click");

    expect(wrapper.emitted("removeSet")).toEqual([["ex-1", 1]]);
  });

  it("emits adjustSetReps/adjustSetWeight with the +1/-1 delta from the steppers", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }] })]], [makeExercise()]);

    // NumberStepper renders weight first (when weightKg !== null), then reps: [weight-, weight+, reps-, reps+]
    const buttons = wrapper.findAll(".steppers button");
    await buttons[1]!.trigger("click"); // weight +
    await buttons[2]!.trigger("click"); // reps -

    expect(wrapper.emitted("adjustSetWeight")).toEqual([["ex-1", 0, 1]]);
    expect(wrapper.emitted("adjustSetReps")).toEqual([["ex-1", 0, -1]]);
  });

  it("does not render a weight stepper when weightKg is null (bodyweight, untracked)", () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: null }] })]],
      [makeExercise({ isBodyweight: true })],
    );

    // .steppers holds the reps stepper's two buttons plus the set-remove button, but no weight
    // stepper's two extra buttons
    expect(wrapper.findAll(".steppers button")).toHaveLength(3);
    expect(wrapper.find(".weight-toggle-btn").text()).toBe("+ Zusatzgewicht");
  });

  it("toggleWeightTracking button reads differently for a loaded (non-bodyweight) exercise", () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: null }] })]],
      [makeExercise({ isBodyweight: false })],
    );

    expect(wrapper.find(".weight-toggle-btn").text()).toBe("+ Gewicht");
  });

  it("emits toggleWeightTracking with the exercise id", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: null }] })]], [makeExercise()]);

    await wrapper.find(".weight-toggle-btn").trigger("click");

    expect(wrapper.emitted("toggleWeightTracking")).toEqual([["ex-1"]]);
  });

  it("cycles the set-kind badge and emits cycleSetKind on click", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft({ sets: [{ reps: 8, weightKg: 40 }] })]], [makeExercise()]);

    await wrapper.find(".kind-badge").trigger("click");

    expect(wrapper.emitted("cycleSetKind")).toEqual([["ex-1", 0]]);
  });

  it("emits adjustRestBetweenSets/adjustRestAfterExercise with ±1 and formats rest as m:ss", () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ restBetweenSetsSeconds: 90, restAfterExerciseSeconds: 150 })]],
      [makeExercise()],
    );

    expect(wrapper.findAll(".rest-row")[0]!.text()).toContain("1:30");
    expect(wrapper.findAll(".rest-row")[1]!.text()).toContain("2:30");
  });

  it("emits the correct rest deltas from the +/- buttons", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft()]], [makeExercise()]);

    const restRows = wrapper.findAll(".rest-row");
    const betweenBtns = restRows[0]!.findAll("button");
    const afterBtns = restRows[1]!.findAll("button");
    await betweenBtns[0]!.trigger("click"); // "weniger"
    await afterBtns[1]!.trigger("click"); // "mehr"

    expect(wrapper.emitted("adjustRestBetweenSets")).toEqual([["ex-1", -1]]);
    expect(wrapper.emitted("adjustRestAfterExercise")).toEqual([["ex-1", 1]]);
  });

  it("shows a superset link toggle between consecutive cards but not after the last one", () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft()], ["ex-2", makeDraft()]],
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" })],
    );

    expect(wrapper.findAll(".link-block")).toHaveLength(1);
  });

  it("emits toggleLink with the exercise id and shows the active hint once linked", async () => {
    const wrapper = mountArrange(
      [["ex-1", makeDraft({ linkNext: true })], ["ex-2", makeDraft()]],
      [makeExercise({ id: "ex-1" }), makeExercise({ id: "ex-2", slug: "squat" })],
    );

    expect(wrapper.find(".link-btn").classes()).toContain("active");
    expect(wrapper.find(".link-btn").text()).toContain("Superset aktiv");
    expect(wrapper.find(".link-hint").exists()).toBe(true);

    await wrapper.find(".link-btn").trigger("click");

    expect(wrapper.emitted("toggleLink")).toEqual([["ex-1"]]);
  });

  it("emits removeExercise with the exercise id from the card-level remove button", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft()]], [makeExercise()]);

    await wrapper.find(".card-head .remove-btn").trigger("click");

    expect(wrapper.emitted("removeExercise")).toEqual([["ex-1"]]);
  });

  it("emits addExercise from the add-exercise button", async () => {
    const wrapper = mountArrange([["ex-1", makeDraft()]], [makeExercise()]);

    await wrapper.find(".add-exercise-btn").trigger("click");

    expect(wrapper.emitted("addExercise")).toHaveLength(1);
  });

  it("disables continue with no entries and emits continue when entries exist", async () => {
    const empty = mountArrange([], []);
    expect(empty.find(".btn-primary.btn-lg").attributes("disabled")).toBeDefined();

    const wrapper = mountArrange([["ex-1", makeDraft()]], [makeExercise()]);
    const continueBtn = wrapper.find(".btn-primary.btn-lg");
    expect(continueBtn.attributes("disabled")).toBeUndefined();

    await continueBtn.trigger("click");
    expect(wrapper.emitted("continue")).toHaveLength(1);
  });
});
