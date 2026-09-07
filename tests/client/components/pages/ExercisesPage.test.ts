import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import ExerciseInfoPanel from "~client/components/exercise/ExerciseInfoPanel.vue";
import ExerciseList from "~client/components/exercise/ExerciseList.vue";
import SheetModal from "~client/components/ui/SheetModal.vue";
import ExercisesPage from "~client/pages/ExercisesPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file const (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside an uninvoked closure below, so vi.mock's own
// hoisting above this declaration never dereferences it before it exists.
const catalogState = reactive({ exercises: [] as unknown[], loaded: false, load: vi.fn() });

vi.mock("~client/stores/catalogStore", () => ({
  useCatalogStore: () => catalogState,
}));

const STUBS = { ExerciseList: true, ExerciseInfoPanel: true, SheetModal: true, AddCustomExerciseForm: true };

const exercise = { id: "ex1", slug: "bench-press", name: null, muscles: [] } as never;

describe("ExercisesPage", () => {
  it("loads the catalog on mount and renders the browse-mode exercise list", () => {
    const wrapper = mountWithProviders(ExercisesPage, { global: { stubs: STUBS } });

    expect(catalogState.load).toHaveBeenCalledOnce();
    const list = wrapper.findComponent(ExerciseList);
    expect(list.exists()).toBe(true);
    expect(list.props("mode")).toBe("browse");
    expect(wrapper.findComponent(ExerciseInfoPanel).exists()).toBe(false);
  });

  it("opens the exercise info panel for whatever exercise the list emits open for", async () => {
    const wrapper = mountWithProviders(ExercisesPage, { global: { stubs: STUBS } });

    await wrapper.findComponent(ExerciseList).vm.$emit("open", exercise);

    const panel = wrapper.findComponent(ExerciseInfoPanel);
    expect(panel.exists()).toBe(true);
    expect(panel.props("exercise")).toStrictEqual(exercise);

    await panel.vm.$emit("close");
    expect(wrapper.findComponent(ExerciseInfoPanel).exists()).toBe(false);
  });

  it("shows the add-custom-exercise sheet only after the button is tapped", async () => {
    const wrapper = mountWithProviders(ExercisesPage, { global: { stubs: STUBS } });

    expect(wrapper.findComponent(SheetModal).exists()).toBe(false);

    await wrapper.find(".add-custom-btn").trigger("click");

    expect(wrapper.findComponent(SheetModal).exists()).toBe(true);
  });
});
