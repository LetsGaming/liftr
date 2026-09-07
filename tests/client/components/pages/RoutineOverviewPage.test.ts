import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { i18n } from "~client/i18n";
import RoutineWizard from "~client/components/routine-wizard/RoutineWizard.vue";
import RoutineOverviewPage from "~client/pages/RoutineOverviewPage.vue";

// Plain top-of-file consts (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside uninvoked closures below, so vi.mock's own
// hoisting above these declarations never dereferences them before they exist.
const catalogState = reactive({ exercises: [] as { id: string; slug: string; name: string | null; muscles: unknown[] }[], loaded: false, load: vi.fn(), byId: (id: string) => catalogState.exercises.find((e) => e.id === id) });
interface Routine {
  id: string;
  name: string;
  routineExercises: {
    id: string;
    orderIndex: number;
    exerciseId: string;
    exercise: { slug: string; name: string | null };
    targetSets: { reps: number; weightKg: number | null }[];
  }[];
}
const routineState = reactive({ routines: [] as Routine[], loaded: false, error: false, load: vi.fn(), byId: (id: string) => routineState.routines.find((r) => r.id === id) });

const startRoutineMock = vi.fn();

vi.mock("~client/stores/catalogStore", () => ({ useCatalogStore: () => catalogState }));
vi.mock("~client/stores/routineStore", () => ({ useRoutineStore: () => routineState }));
vi.mock("~client/composables/useStartRoutine", () => ({
  useStartRoutine: () => ({ starting: ref(false), startRoutine: startRoutineMock, exerciseName: (slug: string) => slug }),
}));

const STUBS = { RoutineWizard: true };

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    name: "Push Day",
    routineExercises: [
      {
        id: "re1",
        orderIndex: 0,
        exerciseId: "ex1",
        exercise: { slug: "bench-press", name: null },
        targetSets: [
          { reps: 8, weightKg: 80 },
          { reps: 8, weightKg: 80 },
        ],
      },
    ],
    ...overrides,
  };
}

async function mountAtRoute(id: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/routines/:id", name: "routine-overview", component: RoutineOverviewPage },
      { path: "/workout", name: "workout", component: { template: "<div />" } },
    ],
  });
  await router.push(`/routines/${id}`);
  await router.isReady();
  const wrapper = mount(RoutineOverviewPage, { global: { plugins: [createPinia(), i18n, router], stubs: STUBS } });
  return { wrapper, router: router as Router };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(catalogState, { exercises: [], loaded: false });
  Object.assign(routineState, { routines: [], loaded: false, error: false });
});

describe("RoutineOverviewPage", () => {
  it("reads the routine id from the route param and loads catalog/routines on mount", async () => {
    await mountAtRoute("r1");
    expect(catalogState.load).toHaveBeenCalledOnce();
    expect(routineState.load).toHaveBeenCalledOnce();
  });

  it("doesn't re-fetch routines once already loaded", async () => {
    routineState.loaded = true;
    await mountAtRoute("r1");
    expect(routineState.load).not.toHaveBeenCalled();
  });

  it("shows loading skeletons while routines haven't loaded yet", async () => {
    routineState.loaded = false;
    const { wrapper } = await mountAtRoute("r1");
    expect(wrapper.findAll(".ro-skel")).toHaveLength(3);
    expect(wrapper.find(".ro-not-found").exists()).toBe(false);
    expect(wrapper.find(".ro-header").exists()).toBe(false);
  });

  it("shows a not-found state once loaded when no routine matches the route's id", async () => {
    routineState.loaded = true;
    routineState.routines = [makeRoutine({ id: "other" })];
    const { wrapper } = await mountAtRoute("missing");

    expect(wrapper.find(".ro-not-found").exists()).toBe(true);
    expect(wrapper.text()).toContain("Routine nicht gefunden");
  });

  it("renders the matched routine's exercises, ordered, with a set summary each", async () => {
    routineState.loaded = true;
    routineState.routines = [makeRoutine()];
    const { wrapper } = await mountAtRoute("r1");

    expect(wrapper.find(".ro-not-found").exists()).toBe(false);
    expect(wrapper.text()).toContain("Push Day");
    expect(wrapper.text()).toContain("1 Übung");
    const rows = wrapper.findAll(".ro-ex-item");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain("2 × 80 kg · 8 Wdh.");
  });

  it("expands a row's per-set detail on tap", async () => {
    routineState.loaded = true;
    routineState.routines = [makeRoutine()];
    const { wrapper } = await mountAtRoute("r1");

    expect(wrapper.find(".ro-ex-sets").exists()).toBe(false);
    await wrapper.find(".ro-ex-row").trigger("click");
    expect(wrapper.find(".ro-ex-sets").exists()).toBe(true);
    expect(wrapper.findAll(".ro-ex-sets li")).toHaveLength(2);
  });

  it("starts the routine and navigates to /workout when 'Jetzt starten' is tapped", async () => {
    routineState.loaded = true;
    routineState.routines = [makeRoutine()];
    startRoutineMock.mockResolvedValue(undefined);
    const { wrapper, router } = await mountAtRoute("r1");

    await wrapper.find(".ro-start-bar button").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/workout"));

    expect(startRoutineMock).toHaveBeenCalledWith(routineState.routines[0]);
  });

  it("opens the routine wizard, pre-filled with the current routine, on edit tap", async () => {
    routineState.loaded = true;
    routineState.routines = [makeRoutine()];
    const { wrapper } = await mountAtRoute("r1");

    expect(wrapper.findComponent(RoutineWizard).exists()).toBe(false);
    await wrapper.find(".ro-edit-btn").trigger("click");
    const wizard = wrapper.findComponent(RoutineWizard);
    expect(wizard.exists()).toBe(true);
    expect(wizard.props("routine")).toStrictEqual(routineState.routines[0]);
  });
});
