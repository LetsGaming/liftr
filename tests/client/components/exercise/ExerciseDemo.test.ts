import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExerciseDemo from "~client/components/exercise/ExerciseDemo.vue";
import { i18n } from "~client/i18n";
import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: "1",
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
    hasImage: true,
    muscles: [],
    ...overrides,
  };
}

/** jsdom has no matchMedia implementation at all — the component reads
 *  `prefers-reduced-motion` once, synchronously, at setup() time, so it has to be stubbed
 *  *before* mounting for a "reduced motion" test to have any effect. */
function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches } as MediaQueryList),
  );
}

function mountDemo(slug: string, catalogExercises: CatalogExercise[] = []) {
  const pinia = createPinia();
  const catalog = useCatalogStore(pinia);
  catalog.exercises = catalogExercises;
  catalog.loaded = true;
  return mountWithProviders(ExerciseDemo, {
    props: { slug },
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExerciseDemo", () => {
  it("shows the cross-fading pair when both photos are expected to exist and motion isn't reduced", () => {
    stubReducedMotion(false);
    const wrapper = mountDemo("bench-press", [makeExercise({ hasImage: true })]);

    expect(wrapper.find(".demo-stage").exists()).toBe(true);
    expect(wrapper.find(".exercise-demo").exists()).toBe(false);
    expect(wrapper.find(".frame-a").attributes("src")).toBe("/images/bench-press/start.jpg");
    expect(wrapper.find(".frame-b").attributes("src")).toBe("/images/bench-press/end.jpg");
  });

  it("falls back to the static side-by-side frames under prefers-reduced-motion", () => {
    stubReducedMotion(true);
    const wrapper = mountDemo("bench-press", [makeExercise({ hasImage: true })]);

    expect(wrapper.find(".demo-stage").exists()).toBe(false);
    const frames = wrapper.findAll(".frame");
    expect(frames).toHaveLength(2);
    expect(frames[0]!.find("img").attributes("src")).toBe("/images/bench-press/start.jpg");
    expect(frames[0]!.find(".label").text()).toBe("Start");
    expect(frames[1]!.find("img").attributes("src")).toBe("/images/bench-press/end.jpg");
    expect(frames[1]!.find(".label").text()).toBe("Ende");
  });

  it("goes straight to the static placeholder pair when the catalog says hasImage: false", () => {
    stubReducedMotion(false);
    const wrapper = mountDemo("no-photo-exercise", [makeExercise({ slug: "no-photo-exercise", hasImage: false })]);

    expect(wrapper.find(".demo-stage").exists()).toBe(false);
    const placeholders = wrapper.findAll(".placeholder");
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]!.text()).toBe("Kein Bild");
    expect(placeholders[1]!.text()).toBe("Kein Bild");
  });

  it("drops out of the cross-fade stage into the static fallback once one frame fails to load", async () => {
    stubReducedMotion(false);
    const wrapper = mountDemo("bench-press", [makeExercise({ hasImage: true })]);
    expect(wrapper.find(".demo-stage").exists()).toBe(true);

    await wrapper.find(".frame-a").trigger("error");

    expect(wrapper.find(".demo-stage").exists()).toBe(false);
    const frames = wrapper.findAll(".frame");
    // Start frame failed -> placeholder; end frame never failed -> still a real img.
    expect(frames[0]!.find(".placeholder").text()).toBe("Kein Bild");
    expect(frames[1]!.find("img").attributes("src")).toBe("/images/bench-press/end.jpg");
  });
});
