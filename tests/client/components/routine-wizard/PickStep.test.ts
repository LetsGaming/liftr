// PickStep.vue renders the real ExerciseList (manual mode) / MuscleFigure + muscle chips
// (muscles mode) — no composable/store needs mocking (catalogStore/settingsStore are real Pinia
// stores with no network boundary crossed just by rendering), so this seeds a real Pinia with a
// couple of catalog exercises rather than mocking anything. mountWithProviders always builds its
// own fresh Pinia internally, so to seed one *before* mount we build our own and pass it through
// `global.plugins`, overriding the default (see tests/README.md's mountWithProviders section).
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import PickStep from "~client/components/routine-wizard/PickStep.vue";
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

describe("PickStep — manual mode", () => {
  it("renders the exercise list", () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "manual" as const },
      global: seededGlobal([makeExercise()]),
    });

    expect(wrapper.text()).toContain("Bankdrücken"); // real catalog slug "bench-press" -> its German translation
  });

  it("disables the continue button and shows a prompt when nothing is selected yet", () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "manual" as const },
      global: seededGlobal([makeExercise()]),
    });

    const continueBtn = wrapper.find(".continue-bar button");
    expect(continueBtn.attributes("disabled")).toBeDefined();
    expect(continueBtn.text()).toBe("Übungen auswählen");
  });

  it("enables continue and shows the count once exercises are selected", () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set(["ex-1"]), mode: "manual" as const },
      global: seededGlobal([makeExercise()]),
    });

    const continueBtn = wrapper.find(".continue-bar button");
    expect(continueBtn.attributes("disabled")).toBeUndefined();
    expect(continueBtn.text()).toBe("1 ausgewählt · Weiter →");
  });

  it("emits continue when the continue button is tapped", async () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set(["ex-1"]), mode: "manual" as const },
      global: seededGlobal([makeExercise()]),
    });

    await wrapper.find(".continue-bar button").trigger("click");

    expect(wrapper.emitted("continue")).toHaveLength(1);
  });

  it("emits toggle with the exercise id when a card is tapped", async () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "manual" as const },
      global: seededGlobal([makeExercise({ id: "ex-1" })]),
    });

    await wrapper.find(".ex-card").trigger("click");

    expect(wrapper.emitted("toggle")).toEqual([["ex-1"]]);
  });
});

describe("PickStep — muscles mode", () => {
  it("renders a chip per muscle group and no continue bar", () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "muscles" as const },
      global: seededGlobal([]),
    });

    expect(wrapper.find(".muscle-chip").exists()).toBe(true);
    expect(wrapper.find(".continue-bar").exists()).toBe(false);
  });

  it("disables the suggest button until at least one muscle is picked", async () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "muscles" as const },
      global: seededGlobal([]),
    });

    const suggestBtn = wrapper.find(".muscle-suggest > button");
    expect(suggestBtn.attributes("disabled")).toBeDefined();

    await wrapper.find(".muscle-chip").trigger("click");

    expect(suggestBtn.attributes("disabled")).toBeUndefined();
    expect(suggestBtn.text()).toBe("Übungen vorschlagen (1 Muskelgruppen)");
  });

  it("toggling a chip twice deselects it again", async () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "muscles" as const },
      global: seededGlobal([]),
    });
    const chip = wrapper.find(".muscle-chip");

    await chip.trigger("click");
    expect(chip.classes()).toContain("active");

    await chip.trigger("click");
    expect(chip.classes()).not.toContain("active");
  });

  it("emits suggest with the picked muscle slugs", async () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "muscles" as const },
      global: seededGlobal([]),
    });

    const chips = wrapper.findAll(".muscle-chip");
    await chips[0]!.trigger("click");
    await chips[1]!.trigger("click");
    await wrapper.find(".muscle-suggest > button").trigger("click");

    const emitted = wrapper.emitted("suggest");
    expect(emitted).toHaveLength(1);
    expect(emitted![0]![0]).toHaveLength(2);
  });

  it("shows the busy label and disables suggest while suggesting", () => {
    const wrapper = mountWithProviders(PickStep, {
      props: { selectedIds: new Set<string>(), mode: "muscles" as const, suggesting: true },
      global: seededGlobal([]),
    });

    // suggesting=true alone still requires a picked muscle to matter for the click-guard, but the
    // label swap and disabled state are unconditional on `suggesting`.
    const suggestBtn = wrapper.find(".muscle-suggest > button");
    expect(suggestBtn.text()).toBe("Wird zusammengestellt…");
    expect(suggestBtn.attributes("disabled")).toBeDefined();
  });
});
