// PickStepManual.vue renders the real ExerciseList in select mode — no composable/store needs
// mocking (catalogStore is a real Pinia store with no network boundary crossed just by rendering),
// so this seeds a real Pinia with a couple of catalog exercises rather than mocking anything.
// mountWithProviders always builds its own fresh Pinia internally, so to seed one *before* mount we
// build our own and pass it through `global.plugins`, overriding the default (see
// tests/README.md's mountWithProviders section).
//
// Split out of a single PickStep.test.ts alongside PickStepManual.vue/PickStepMuscles.vue's own
// split from PickStep.vue — see PickStepManual.vue's doc comment.
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import PickStepManual from "~client/components/routine/PickStepManual.vue";
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

function seededGlobal(exercises: CatalogExercise[]) {
  const pinia = createPinia();
  useCatalogStore(pinia).$patch({ exercises, loaded: true });
  return { plugins: [pinia, i18n, createTestRouter()] };
}

describe("PickStepManual", () => {
  it("renders the exercise list", () => {
    const wrapper = mountWithProviders(PickStepManual, {
      props: { selectedIds: new Set<string>() },
      global: seededGlobal([makeExercise()]),
    });

    expect(wrapper.text()).toContain("Bankdrücken"); // real catalog slug "bench-press" -> its German translation
  });

  it("disables the continue button and shows a prompt when nothing is selected yet", () => {
    const wrapper = mountWithProviders(PickStepManual, {
      props: { selectedIds: new Set<string>() },
      global: seededGlobal([makeExercise()]),
    });

    const continueBtn = wrapper.find(".continue-bar button");
    expect(continueBtn.attributes("disabled")).toBeDefined();
    expect(continueBtn.text()).toBe("Übungen auswählen");
  });

  it("enables continue and shows the count once exercises are selected", () => {
    const wrapper = mountWithProviders(PickStepManual, {
      props: { selectedIds: new Set(["ex-1"]) },
      global: seededGlobal([makeExercise()]),
    });

    const continueBtn = wrapper.find(".continue-bar button");
    expect(continueBtn.attributes("disabled")).toBeUndefined();
    expect(continueBtn.text()).toBe("1 ausgewählt · Weiter →");
  });

  it("emits continue when the continue button is tapped", async () => {
    const wrapper = mountWithProviders(PickStepManual, {
      props: { selectedIds: new Set(["ex-1"]) },
      global: seededGlobal([makeExercise()]),
    });

    await wrapper.find(".continue-bar button").trigger("click");

    expect(wrapper.emitted("continue")).toHaveLength(1);
  });

  it("emits toggle with the exercise id when a card is tapped", async () => {
    const wrapper = mountWithProviders(PickStepManual, {
      props: { selectedIds: new Set<string>() },
      global: seededGlobal([makeExercise({ id: "ex-1" })]),
    });

    await wrapper.find(".ex-card").trigger("click");

    expect(wrapper.emitted("toggle")).toEqual([["ex-1"]]);
  });
});
