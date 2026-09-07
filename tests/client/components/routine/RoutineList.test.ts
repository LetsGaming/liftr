// vi.mock() is hoisted above imports, but same-file consts a mock factory reads are not — wrap
// them in vi.hoisted() (tests/README.md) so these mocks exist by the time the mock runs.
const {
  getRoutinesMock,
  createRoutineMock,
  deleteRoutineMock,
  updateRoutineMock,
  startMesocycleMock,
  endMesocycleMock,
  advanceMesocycleMock,
  suggestExercisesMock,
  recommendExercisesMock,
} = vi.hoisted(() => ({
  getRoutinesMock: vi.fn(),
  createRoutineMock: vi.fn(),
  deleteRoutineMock: vi.fn(),
  updateRoutineMock: vi.fn(),
  startMesocycleMock: vi.fn(),
  endMesocycleMock: vi.fn(),
  advanceMesocycleMock: vi.fn(),
  suggestExercisesMock: vi.fn(),
  recommendExercisesMock: vi.fn(),
}));

vi.mock("~client/services/routineService", () => ({
  getRoutines: getRoutinesMock,
  createRoutine: createRoutineMock,
  deleteRoutine: deleteRoutineMock,
  updateRoutine: updateRoutineMock,
  startMesocycle: startMesocycleMock,
  endMesocycle: endMesocycleMock,
  advanceMesocycle: advanceMesocycleMock,
  suggestExercises: suggestExercisesMock,
  recommendExercises: recommendExercisesMock,
}));

import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoutineList from "~client/components/routine/RoutineList.vue";
import { i18n } from "~client/i18n";
import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { useRoutineStore, type Routine, type RoutineExercise } from "~client/stores/routineStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

function stubMatchMedia(matchesDesktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: "ex-1",
    slug: "bench-press",
    name: "Bankdrücken",
    equipment: "barbell",
    requiredEquipment: [],
    movementPattern: "push",
    isBodyweight: false,
    isCustom: false,
    demoStartImage: null,
    demoEndImage: null,
    howToKey: null,
    hasImage: false,
    muscles: [{ slug: "chest", role: "primary" }],
    ...overrides,
  };
}

function makeRoutineExercise(overrides: Partial<RoutineExercise> = {}): RoutineExercise {
  return {
    id: "re-1",
    exerciseId: "ex-1",
    orderIndex: 0,
    targetSets: [{ reps: 8, weightKg: 60 }],
    supersetGroup: null,
    restBetweenSetsSeconds: null,
    restAfterExerciseSeconds: null,
    exercise: { id: "ex-1", slug: "bench-press", name: "Bankdrücken", isBodyweight: false },
    ...overrides,
  };
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r-1",
    name: "Push Day",
    orderIndex: 0,
    routineExercises: [makeRoutineExercise()],
    mesocycle: null,
    ...overrides,
  };
}

// A minimal stand-in for the real (heavier, separately-tested) RoutineWizard.vue — RoutineList's
// own responsibility ends at showing/hiding it and passing the right `routine` prop; the
// wizard's own internals are out of scope here. Renders its `routine` prop's id into a data
// attribute so tests can assert which routine (if any) was passed for editing.
const wizardStub = {
  name: "RoutineWizard",
  props: ["routine"],
  template: "<div class=\"routine-wizard-stub\" :data-routine-id=\"routine ? routine.id : 'new'\"></div>",
};

function mountRoutineList(routines: Routine[], exercises: CatalogExercise[] = [makeExercise()]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useRoutineStore().$patch({ routines, loaded: true });
  useCatalogStore().$patch({ exercises, loaded: true });
  const router = createTestRouter();
  const wrapper = mountWithProviders(RoutineList, {
    global: {
      plugins: [pinia, i18n, router],
      stubs: { RoutineWizard: wizardStub },
    },
  });
  return { wrapper, router };
}

beforeEach(() => {
  stubMatchMedia(false); // mobile-width default: drag-to-reorder handle enabled
  getRoutinesMock.mockReset().mockResolvedValue([]);
  createRoutineMock.mockReset();
  deleteRoutineMock.mockReset().mockResolvedValue(undefined);
  updateRoutineMock.mockReset().mockResolvedValue(undefined);
  startMesocycleMock.mockReset();
  endMesocycleMock.mockReset();
  advanceMesocycleMock.mockReset();
  suggestExercisesMock.mockReset();
  recommendExercisesMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoutineList", () => {
  it("renders the first-timer empty state when there are no saved routines", () => {
    const { wrapper } = mountRoutineList([]);

    expect(wrapper.find(".routine-empty").exists()).toBe(true);
    expect(wrapper.find(".routine-grid").exists()).toBe(false);
    expect(wrapper.text()).toContain("Noch keine Routine");
  });

  it("renders one card per routine with its name and singular exercise count", () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1", name: "Push Day" })]);

    const cards = wrapper.findAll(".routine-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.find(".rc-head b").text()).toBe("Push Day");
    expect(cards[0]!.find(".rc-count").text()).toBe("1 Übung");
  });

  it("uses the plural exercise-count label for 0 or 2+ exercises", () => {
    const zero = makeRoutine({ id: "r0", name: "Empty Routine", routineExercises: [] });
    const two = makeRoutine({
      id: "r2",
      name: "Two Exercises",
      routineExercises: [makeRoutineExercise({ id: "a" }), makeRoutineExercise({ id: "b", orderIndex: 1 })],
    });
    const { wrapper } = mountRoutineList([zero, two]);

    const cards = wrapper.findAll(".routine-card");
    expect(cards[0]!.find(".rc-count").text()).toBe("0 Übungen");
    expect(cards[1]!.find(".rc-count").text()).toBe("2 Übungen");
  });

  it("previews up to 4 exercise names and a '+N weitere' overflow line beyond that", () => {
    const routineExercises = Array.from({ length: 6 }, (_, i) => makeRoutineExercise({ id: `re-${i}`, orderIndex: i }));
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1", routineExercises })]);

    const items = wrapper.findAll(".rc-ex-list li");
    expect(items).toHaveLength(5); // 4 names + 1 overflow line
    expect(items.slice(0, 4).every((li) => li.text() === "Bankdrücken")).toBe(true);
    expect(items[4]!.text()).toBe("+2 weitere");
  });

  it("shows no overflow line for 4 or fewer exercises", () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1" })]);
    expect(wrapper.find(".rc-ex-more").exists()).toBe(false);
  });

  it("shows the mesocycle week/percent badge when a routine has an active mesocycle", () => {
    const routine = makeRoutine({
      id: "r1",
      mesocycle: { id: "m1", routineId: "r1", totalWeeks: 4, currentWeek: 2, weekPercents: [100, 90, 80, 70] },
    });
    const { wrapper } = mountRoutineList([routine]);

    expect(wrapper.find(".meso-badge").text()).toBe("Woche 2/4 · 90%");
  });

  it("shows no mesocycle badge for a routine without one", () => {
    const { wrapper } = mountRoutineList([makeRoutine()]);
    expect(wrapper.find(".meso-badge").exists()).toBe(false);
  });

  it("navigates to the routine overview route when the card itself is tapped", async () => {
    const { wrapper, router } = mountRoutineList([makeRoutine({ id: "r1" })]);
    const pushSpy = vi.spyOn(router, "push");

    await wrapper.find(".routine-card").trigger("click");

    expect(pushSpy).toHaveBeenCalledWith("/routines/r1");
  });

  it("disables the Quick Start button when the exercise catalog is empty", () => {
    const { wrapper } = mountRoutineList([makeRoutine()], []);
    const quickStart = wrapper.find("button.btn-primary.btn-lg.btn-block");

    expect(quickStart.attributes("disabled")).toBeDefined();
  });

  it("enables the Quick Start button once the catalog has at least one exercise", () => {
    const { wrapper } = mountRoutineList([makeRoutine()], [makeExercise()]);
    const quickStart = wrapper.find("button.btn-primary.btn-lg.btn-block");

    expect(quickStart.attributes("disabled")).toBeUndefined();
    expect(quickStart.text()).toBe("Ohne Routine loslegen · die ersten 4 Übungen");
  });

  it("renders the drag-to-reorder handle on a single-column (mobile) layout", () => {
    stubMatchMedia(false);
    const { wrapper } = mountRoutineList([makeRoutine()]);

    expect(wrapper.find(".rc-drag-handle").exists()).toBe(true);
  });

  it("hides the drag-to-reorder handle once the grid becomes multi-column (desktop, >=900px)", () => {
    stubMatchMedia(true);
    const { wrapper } = mountRoutineList([makeRoutine()]);

    expect(wrapper.find(".rc-drag-handle").exists()).toBe(false);
  });

  it("toggles the ⋮ action menu open and closed on repeated taps", async () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1" })]);
    expect(wrapper.find(".rc-menu").exists()).toBe(false);

    await wrapper.find(".rc-menu-btn").trigger("click");
    expect(wrapper.find(".rc-menu").exists()).toBe(true);

    await wrapper.find(".rc-menu-btn").trigger("click");
    expect(wrapper.find(".rc-menu").exists()).toBe(false);
  });

  it("offers '+ Mesozyklus' for a routine without one, and 'Mesozyklus beenden' for one that has one", async () => {
    const withMeso = makeRoutine({
      id: "r1",
      mesocycle: { id: "m1", routineId: "r1", totalWeeks: 4, currentWeek: 1, weekPercents: [100, 90, 80, 70] },
    });
    const { wrapper } = mountRoutineList([withMeso]);

    await wrapper.find(".rc-menu-btn").trigger("click");

    const menuText = wrapper.find(".rc-menu").text();
    expect(menuText).toContain("Mesozyklus beenden");
    expect(menuText).not.toContain("+ Mesozyklus");
  });

  it("closes the open menu on Escape", async () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1" })]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    expect(wrapper.find(".rc-menu").exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".rc-menu").exists()).toBe(false);
  });

  it("closes the open menu on an outside click", async () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1" })]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    expect(wrapper.find(".rc-menu").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".rc-menu").exists()).toBe(false);
  });

  it("opens the routine builder pre-filled with the routine when 'Bearbeiten' is chosen, and closes the menu", async () => {
    const routine = makeRoutine({ id: "r1", name: "Push Day" });
    const { wrapper } = mountRoutineList([routine]);
    expect(wrapper.find(".routine-wizard-stub").exists()).toBe(false);

    await wrapper.find(".rc-menu-btn").trigger("click");
    const editBtn = wrapper.findAll(".rc-menu button").find((b) => b.text().includes("Bearbeiten"))!;
    await editBtn.trigger("click");

    const stub = wrapper.find(".routine-wizard-stub");
    expect(stub.exists()).toBe(true);
    expect(stub.attributes("data-routine-id")).toBe("r1");
    expect(wrapper.find(".rc-menu").exists()).toBe(false);
  });

  it("opens an empty routine builder from the '+ Neue Routine' buttons", async () => {
    const { wrapper } = mountRoutineList([]);
    const cta = wrapper.findAll("button").find((b) => b.text() === "+ Neue Routine")!;

    await cta.trigger("click");

    const stub = wrapper.find(".routine-wizard-stub");
    expect(stub.exists()).toBe(true);
    expect(stub.attributes("data-routine-id")).toBe("new");
  });

  it("duplicates a routine: creates a '(Kopie)' with the same exercise fields, then reloads the list", async () => {
    const routine = makeRoutine({
      id: "r1",
      name: "Push Day",
      routineExercises: [
        makeRoutineExercise({
          id: "re1",
          orderIndex: 0,
          targetSets: [{ reps: 8, weightKg: 60 }],
          supersetGroup: 1,
          restBetweenSetsSeconds: 90,
          restAfterExerciseSeconds: 120,
        }),
      ],
    });
    const duplicated = makeRoutine({ id: "r1-copy", name: "Push Day (Kopie)" });
    createRoutineMock.mockResolvedValue(duplicated);
    getRoutinesMock.mockResolvedValue([routine, duplicated]);

    const { wrapper } = mountRoutineList([routine]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    const dupBtn = wrapper.findAll(".rc-menu button").find((b) => b.text() === "Duplizieren")!;
    await dupBtn.trigger("click");
    await flushPromises();

    expect(createRoutineMock).toHaveBeenCalledWith("Push Day (Kopie)", [
      {
        exerciseId: "ex-1",
        orderIndex: 0,
        targetSets: [{ reps: 8, weightKg: 60 }],
        supersetGroup: 1,
        restBetweenSetsSeconds: 90,
        restAfterExerciseSeconds: 120,
      },
    ]);
    expect(getRoutinesMock).toHaveBeenCalled();
    expect(wrapper.findAll(".routine-card")).toHaveLength(2);
  });

  it("requires a second tap to confirm delete, then removes the routine from the list", async () => {
    const routine = makeRoutine({ id: "r1" });
    const { wrapper } = mountRoutineList([routine]);
    await wrapper.find(".rc-menu-btn").trigger("click");

    const deleteBtn = () => wrapper.findAll(".rc-menu button.danger")[0]!;
    expect(deleteBtn().text()).toBe("Löschen");

    await deleteBtn().trigger("click");
    expect(deleteBtn().text()).toBe("Wirklich löschen?");
    expect(deleteRoutineMock).not.toHaveBeenCalled();

    await deleteBtn().trigger("click");
    await flushPromises();

    expect(deleteRoutineMock).toHaveBeenCalledWith("r1");
    expect(wrapper.findAll(".routine-card")).toHaveLength(0);
  });

  it("reveals the mesocycle form defaulted to 4 weeks, adjusts it, and starts the mesocycle", async () => {
    const routine = makeRoutine({ id: "r1" });
    const started = makeRoutine({
      id: "r1",
      mesocycle: { id: "m1", routineId: "r1", totalWeeks: 5, currentWeek: 1, weekPercents: [100, 95, 90, 85, 80] },
    });
    startMesocycleMock.mockResolvedValue(started.mesocycle);
    getRoutinesMock.mockResolvedValue([started]);

    const { wrapper } = mountRoutineList([routine]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    const addMesoBtn = wrapper.findAll(".rc-menu button").find((b) => b.text() === "+ Mesozyklus")!;
    await addMesoBtn.trigger("click");

    expect(wrapper.find(".meso-form").exists()).toBe(true);
    expect(wrapper.find(".meso-form .stepper span").text()).toBe("4");

    await wrapper.find(".meso-form button[aria-label='Mehr']").trigger("click");
    expect(wrapper.find(".meso-form .stepper span").text()).toBe("5");

    await wrapper.find(".meso-form button.btn-secondary").trigger("click"); // "Starten"
    await flushPromises();

    expect(startMesocycleMock).toHaveBeenCalledWith("r1", 5);
    expect(wrapper.find(".meso-form").exists()).toBe(false);
    expect(wrapper.find(".meso-badge").text()).toBe("Woche 1/5 · 100%");
  });

  it("clamps mesocycle-weeks adjustment to the 2-16 range", async () => {
    const { wrapper } = mountRoutineList([makeRoutine({ id: "r1" })]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    const addMesoBtn = wrapper.findAll(".rc-menu button").find((b) => b.text() === "+ Mesozyklus")!;
    await addMesoBtn.trigger("click");

    const minus = () => wrapper.find(".meso-form button[aria-label='Weniger']");
    for (let i = 0; i < 5; i++) await minus().trigger("click"); // starts at 4, floors at 2

    expect(wrapper.find(".meso-form .stepper span").text()).toBe("2");
  });

  it("ends an active mesocycle from the menu and reloads without the badge", async () => {
    const withMeso = makeRoutine({
      id: "r1",
      mesocycle: { id: "m1", routineId: "r1", totalWeeks: 4, currentWeek: 2, weekPercents: [100, 90, 80, 70] },
    });
    const ended = makeRoutine({ id: "r1", mesocycle: null });
    endMesocycleMock.mockResolvedValue(undefined);
    getRoutinesMock.mockResolvedValue([ended]);

    const { wrapper } = mountRoutineList([withMeso]);
    await wrapper.find(".rc-menu-btn").trigger("click");
    const endBtn = wrapper.findAll(".rc-menu button").find((b) => b.text() === "Mesozyklus beenden")!;
    await endBtn.trigger("click");
    await flushPromises();

    expect(endMesocycleMock).toHaveBeenCalledWith("r1");
    expect(wrapper.find(".meso-badge").exists()).toBe(false);
  });
});
