// RoutineWizard.vue is the orchestrator: it owns the whole draft (`selected`), decides which step
// renders, and wires each step's emits back into that state. Its five step children (PathChooser/
// PickStep/FastPathStep/ArrangeStep/ReviewStep) each have their own full rendering/emit-logic test
// file already — testing THIS component's own logic again through their real markup would just
// re-test them. So every step child (plus SheetModal, whose real shell wraps @ionic/vue's
// IonModal — see tests/README.md's note on stubbing an Ionic-backed element rather than loading
// the real Stencil runtime) is stubbed here with a minimal template exposing exactly the
// prop/emit surface this component's own logic reads and reacts to.
//
// External boundaries mocked: routineStore (real create/update/suggest hit the network) and
// routineService's recommendExercises (called directly by toggleSelect's fire-and-forget
// background upgrade). catalogStore is left real/empty — toggleSelect's only read from it
// (catalog.byId(id)?.isBodyweight) degrades to `false` on an empty catalog, which is fine since
// none of these tests care about the bodyweight-default-weight distinction.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import RoutineWizard from "~client/components/routine-wizard/RoutineWizard.vue";
import { useToast } from "~client/composables/useToast";
import type { Routine } from "~client/stores/routineStore";
import { mountWithProviders } from "../../helpers/mountWithProviders";

const { toasts } = useToast();

const { createMock, updateMock, suggestMock, recommendExercisesMock, sheetDismissSpy } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  suggestMock: vi.fn(),
  recommendExercisesMock: vi.fn(),
  sheetDismissSpy: vi.fn(),
}));

vi.mock("~client/stores/routineStore", () => ({
  useRoutineStore: () => ({ create: createMock, update: updateMock, suggest: suggestMock }),
}));
vi.mock("~client/services/routineService", () => ({
  recommendExercises: recommendExercisesMock,
}));

const SheetModalStub = defineComponent({
  emits: ["close"],
  methods: {
    dismiss() {
      sheetDismissSpy();
      this.$emit("close");
    },
  },
  template: "<div class='sheet-stub'><slot name=\"header\" /><div class='sheet-body'><slot /></div></div>",
});

const PathChooserStub = {
  emits: ["choose"],
  template: `<div class="pathchooser-stub">
    <button class="choose-manual" @click="$emit('choose', 'manual')">manual</button>
    <button class="choose-muscles" @click="$emit('choose', 'muscles')">muscles</button>
  </div>`,
};

const PickStepStub = {
  props: ["selectedIds", "suggesting", "mode"],
  emits: ["toggle", "continue", "suggest"],
  template: `<div class="pickstep-stub" :data-mode="mode" :data-count="selectedIds.size" :data-suggesting="suggesting">
    <button class="toggle-ex1" @click="$emit('toggle', 'ex-1')">toggle</button>
    <button class="continue-btn" @click="$emit('continue')">continue</button>
    <button class="suggest-btn" @click="$emit('suggest', ['chest'])">suggest</button>
  </div>`,
};

const FastPathStepStub = {
  props: ["name", "entries", "saving", "canSave", "isEditing", "requestedMuscleSlugs", "suggestionMeta"],
  emits: ["move", "removeExercise", "addExercise", "customize", "save"],
  template: `<div class="fastpath-stub" :data-count="entries.length" :data-name="name" :data-can-save="canSave" :data-is-editing="isEditing">
    <button class="remove-btn" @click="$emit('removeExercise', entries[0][0])">remove</button>
    <button class="add-ex-btn" @click="$emit('addExercise')">add</button>
    <button class="customize-btn" @click="$emit('customize')">customize</button>
    <button class="save-btn" @click="$emit('save')">save</button>
  </div>`,
};

const ArrangeStepStub = {
  props: ["entries"],
  emits: [
    "move",
    "addSet",
    "removeSet",
    "adjustSetReps",
    "adjustSetWeight",
    "cycleSetKind",
    "adjustRestBetweenSets",
    "adjustRestAfterExercise",
    "toggleWeightTracking",
    "toggleLink",
    "removeExercise",
    "addExercise",
    "continue",
  ],
  template: `<div class="arrangestep-stub" :data-count="entries.length">
    <button class="add-set-btn" @click="$emit('addSet', entries[0][0])">addSet</button>
    <button class="remove-btn" @click="$emit('removeExercise', entries[0][0])">remove</button>
    <button class="add-ex-btn" @click="$emit('addExercise')">add</button>
    <button class="continue-btn" @click="$emit('continue')">continue</button>
  </div>`,
};

const ReviewStepStub = {
  props: ["name", "entries", "totalSets", "saving", "canSave", "isEditing", "requestedMuscleSlugs", "suggestionMeta"],
  emits: ["back", "save"],
  template: `<div class="review-stub" :data-count="entries.length" :data-total-sets="totalSets" :data-name="name" :data-can-save="canSave" :data-is-editing="isEditing">
    <button class="back-btn" @click="$emit('back')">back</button>
    <button class="save-btn" @click="$emit('save')">save</button>
  </div>`,
};

function mountWizard(props: { routine?: Routine | null } = {}) {
  return mountWithProviders(RoutineWizard, {
    props,
    global: {
      stubs: {
        SheetModal: SheetModalStub,
        PathChooser: PathChooserStub,
        PickStep: PickStepStub,
        FastPathStep: FastPathStepStub,
        ArrangeStep: ArrangeStepStub,
        ReviewStep: ReviewStepStub,
      },
    },
  });
}

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "routine-1",
    name: "Push Day",
    orderIndex: 0,
    mesocycle: null,
    routineExercises: [
      {
        id: "re-1",
        exerciseId: "ex-1",
        orderIndex: 0,
        targetSets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }],
        supersetGroup: 1,
        restBetweenSetsSeconds: 60,
        restAfterExerciseSeconds: null,
        exercise: { id: "ex-1", slug: "bench-press", name: null, isBodyweight: false },
      },
      {
        id: "re-2",
        exerciseId: "ex-2",
        orderIndex: 1,
        targetSets: [{ reps: 10, weightKg: 20 }],
        supersetGroup: 1,
        restBetweenSetsSeconds: null,
        restAfterExerciseSeconds: 120,
        exercise: { id: "ex-2", slug: "row", name: null, isBodyweight: false },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({});
  updateMock.mockReset().mockResolvedValue({});
  suggestMock.mockReset().mockResolvedValue([]);
  recommendExercisesMock.mockReset().mockResolvedValue([]);
  sheetDismissSpy.mockReset();
  toasts.splice(0, toasts.length);
});

describe("RoutineWizard — create mode navigation", () => {
  it("starts on the path-choose step", () => {
    const wrapper = mountWizard();

    expect(wrapper.find(".pathchooser-stub").exists()).toBe(true);
    expect(wrapper.findAll(".steps span")[0]!.classes()).toContain("active");
  });

  it("choosing manual routes to PickStep in manual mode", async () => {
    const wrapper = mountWizard();

    await wrapper.find(".choose-manual").trigger("click");

    const pick = wrapper.find(".pickstep-stub");
    expect(pick.exists()).toBe(true);
    expect(pick.attributes("data-mode")).toBe("manual");
  });

  it("toggling an exercise then continuing reaches the fast path for a small, untouched selection", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");

    const fastPath = wrapper.find(".fastpath-stub");
    expect(fastPath.exists()).toBe(true);
    expect(fastPath.attributes("data-count")).toBe("1");
    // fast path collapses step 2/3 into one "Fertig" label and hides the 3rd indicator entirely
    expect(wrapper.findAll(".steps span")).toHaveLength(2);
    expect(wrapper.findAll(".steps span")[1]!.text()).toBe("2 Fertig");
  });

  it("FastPathStep's customize event drops into the full ArrangeStep", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");

    await wrapper.find(".customize-btn").trigger("click");

    expect(wrapper.find(".arrangestep-stub").exists()).toBe(true);
    expect(wrapper.find(".fastpath-stub").exists()).toBe(false);
    expect(wrapper.findAll(".steps span")).toHaveLength(3);
  });

  it("ArrangeStep's addExercise returns to PickStep forced back to manual mode", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");
    await wrapper.find(".customize-btn").trigger("click"); // -> full ArrangeStep

    await wrapper.find(".arrangestep-stub .add-ex-btn").trigger("click");

    const pick = wrapper.find(".pickstep-stub");
    expect(pick.exists()).toBe(true);
    expect(pick.attributes("data-mode")).toBe("manual");
  });

  it("ArrangeStep's continue reaches ReviewStep with the current name/entries/totalSets", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");
    await wrapper.find(".customize-btn").trigger("click");
    await wrapper.find(".name-input").setValue("Push Day");

    await wrapper.find(".arrangestep-stub .continue-btn").trigger("click");

    const review = wrapper.find(".review-stub");
    expect(review.exists()).toBe(true);
    expect(review.attributes("data-count")).toBe("1");
    expect(review.attributes("data-total-sets")).toBe("3"); // toggleSelect's default 3 sets
    expect(review.attributes("data-name")).toBe("Push Day");
    expect(review.attributes("data-can-save")).toBe("true");
  });

  it("ReviewStep's back returns to ArrangeStep", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");
    await wrapper.find(".customize-btn").trigger("click");
    await wrapper.find(".arrangestep-stub .continue-btn").trigger("click");

    await wrapper.find(".back-btn").trigger("click");

    expect(wrapper.find(".arrangestep-stub").exists()).toBe(true);
  });

  it("canSave is false until a name is entered, even with an exercise picked", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click"); // fast path, no name set yet

    expect(wrapper.find(".fastpath-stub").attributes("data-can-save")).toBe("false");

    await wrapper.find(".name-input").setValue("Legs");
    expect(wrapper.find(".fastpath-stub").attributes("data-can-save")).toBe("true");
  });
});

describe("RoutineWizard — muscle-guided suggestion flow", () => {
  it("emits suggest, applies the result to the draft, and advances past PickStep on a non-empty response", async () => {
    suggestMock.mockResolvedValue([
      { exerciseId: "ex-9", slug: "squat", targetSets: [{ reps: 5, weightKg: 60 }], matchedMuscleSlug: "chest" },
    ]);
    const wrapper = mountWizard();
    await wrapper.find(".choose-muscles").trigger("click");
    expect(wrapper.find(".pickstep-stub").attributes("data-mode")).toBe("muscles");

    await wrapper.find(".suggest-btn").trigger("click");
    await flush();
    await flush();

    expect(suggestMock).toHaveBeenCalledWith(["chest"]);
    expect(wrapper.find(".pickstep-stub").exists()).toBe(false);
    const stepStub = wrapper.find(".fastpath-stub").exists() ? wrapper.find(".fastpath-stub") : wrapper.find(".arrangestep-stub");
    expect(stepStub.attributes("data-count")).toBe("1");
  });

  it("stays on PickStep when the suggestion comes back empty", async () => {
    suggestMock.mockResolvedValue([]);
    const wrapper = mountWizard();
    await wrapper.find(".choose-muscles").trigger("click");

    await wrapper.find(".suggest-btn").trigger("click");
    await flush();

    expect(wrapper.find(".pickstep-stub").exists()).toBe(true);
  });

  it("passes suggesting=true down while the request is in flight, then clears it", async () => {
    let resolveSuggest!: (v: unknown[]) => void;
    suggestMock.mockReturnValue(new Promise((r) => (resolveSuggest = r)));
    const wrapper = mountWizard();
    await wrapper.find(".choose-muscles").trigger("click");

    await wrapper.find(".suggest-btn").trigger("click");
    expect(wrapper.find(".pickstep-stub").attributes("data-suggesting")).toBe("true");

    resolveSuggest([]);
    await flush();

    expect(wrapper.find(".pickstep-stub").attributes("data-suggesting")).toBe("false");
  });

  it("ignores a second suggest request while one is already in flight", async () => {
    let resolveSuggest!: (v: unknown[]) => void;
    suggestMock.mockReturnValue(new Promise((r) => (resolveSuggest = r)));
    const wrapper = mountWizard();
    await wrapper.find(".choose-muscles").trigger("click");

    await wrapper.find(".suggest-btn").trigger("click");
    await wrapper.find(".suggest-btn").trigger("click");

    expect(suggestMock).toHaveBeenCalledTimes(1);
    resolveSuggest([]);
    await flush();
  });
});

describe("RoutineWizard — edit mode", () => {
  it("hydrates directly into the full ArrangeStep (linked exercises are never fast-path eligible)", () => {
    const wrapper = mountWizard({ routine: makeRoutine() });

    expect(wrapper.find(".pathchooser-stub").exists()).toBe(false);
    expect(wrapper.find(".pickstep-stub").exists()).toBe(false);
    const arrange = wrapper.find(".arrangestep-stub");
    expect(arrange.exists()).toBe(true);
    expect(arrange.attributes("data-count")).toBe("2");
    expect((wrapper.find(".name-input").element as HTMLInputElement).value).toBe("Push Day");
  });

  it("passes isEditing=true down to FastPathStep/ReviewStep", async () => {
    const wrapper = mountWizard({ routine: makeRoutine() });
    await wrapper.find(".arrangestep-stub .continue-btn").trigger("click");

    expect(wrapper.find(".review-stub").attributes("data-is-editing")).toBe("true");
  });

  it("re-hydrates back to the choose step when the routine prop is cleared", async () => {
    const wrapper = mountWizard({ routine: makeRoutine() });
    expect(wrapper.find(".arrangestep-stub").exists()).toBe(true);

    await wrapper.setProps({ routine: null });

    expect(wrapper.find(".pathchooser-stub").exists()).toBe(true);
  });
});

describe("RoutineWizard — saving", () => {
  async function reachFastPathWithOneExercise(name = "Legs") {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");
    await wrapper.find(".continue-btn").trigger("click");
    await wrapper.find(".name-input").setValue(name);
    return wrapper;
  }

  it("create-saves the trimmed name and built exercise list, then dismisses and emits created", async () => {
    const wrapper = await reachFastPathWithOneExercise("  Legs  ");

    await wrapper.find(".save-btn").trigger("click");
    await flush();

    expect(createMock).toHaveBeenCalledWith("Legs", [
      {
        exerciseId: "ex-1",
        orderIndex: 0,
        targetSets: [{ reps: 8, weightKg: 0 }, { reps: 8, weightKg: 0 }, { reps: 8, weightKg: 0 }],
        supersetGroup: null,
        restBetweenSetsSeconds: 90,
        restAfterExerciseSeconds: 90,
      },
    ]);
    expect(sheetDismissSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("created")).toHaveLength(1);
  });

  it("update-saves against the existing routine id in edit mode", async () => {
    const routine = makeRoutine();
    const wrapper = mountWizard({ routine });

    await wrapper.find(".arrangestep-stub .continue-btn").trigger("click");
    await wrapper.find(".save-btn").trigger("click");
    await flush();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).toBe("routine-1");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("shows a toast and does not dismiss when saving fails", async () => {
    createMock.mockRejectedValueOnce(new Error("network down"));
    const wrapper = await reachFastPathWithOneExercise();

    await wrapper.find(".save-btn").trigger("click");
    await flush();

    expect(sheetDismissSpy).not.toHaveBeenCalled();
    expect(wrapper.emitted("created")).toBeUndefined();
    expect(toasts.at(-1)?.text).toBe("Speichern fehlgeschlagen — bitte erneut versuchen.");
  });
});

describe("RoutineWizard — closing", () => {
  it("dismisses immediately when nothing has been picked yet", async () => {
    const wrapper = mountWizard();

    await wrapper.find(".close-btn").trigger("click");

    expect(sheetDismissSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("created")).toHaveLength(1);
  });

  it("requires a tap-twice confirm once something is selected", async () => {
    const wrapper = mountWizard();
    await wrapper.find(".choose-manual").trigger("click");
    await wrapper.find(".toggle-ex1").trigger("click");

    await wrapper.find(".close-btn").trigger("click");
    expect(sheetDismissSpy).not.toHaveBeenCalled();
    const closeBtn = wrapper.find(".close-btn");
    expect(closeBtn.classes()).toContain("confirming");
    expect(closeBtn.text()).toBe("Verwerfen?");

    await closeBtn.trigger("click");
    expect(sheetDismissSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("created")).toHaveLength(1);
  });
});
