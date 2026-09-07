import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import ExerciseThumb from "~client/components/exercise/ExerciseThumb.vue";
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

/** ExerciseThumb reads catalogStore.bySlug() directly (not via props), so the catalog has to be
 *  seeded on the exact Pinia instance the component ends up using — built explicitly here and
 *  handed to mountWithProviders via `global.plugins` (which fully replaces the helper's own
 *  default plugin list, so i18n/router are re-supplied alongside it) rather than seeded after
 *  mount, so every assertion below sees the catalog state from the very first render. */
function mountThumb(props: { slug: string; equipment: string; size?: number }, catalogExercises: CatalogExercise[] = []) {
  const pinia = createPinia();
  const catalog = useCatalogStore(pinia);
  catalog.exercises = catalogExercises;
  catalog.loaded = true;
  return mountWithProviders(ExerciseThumb, {
    props,
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

describe("ExerciseThumb", () => {
  it("attempts the demo photo when the catalog has no entry for the slug yet", () => {
    const wrapper = mountThumb({ slug: "bench-press", equipment: "barbell" });

    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/images/bench-press/start.jpg");
  });

  it("attempts the demo photo when the catalog entry says hasImage: true", () => {
    const wrapper = mountThumb({ slug: "bench-press", equipment: "barbell" }, [makeExercise({ hasImage: true })]);

    expect(wrapper.find("img").exists()).toBe(true);
  });

  it("skips the request and shows the equipment icon when the catalog says hasImage: false", () => {
    const wrapper = mountThumb({ slug: "bench-press", equipment: "barbell" }, [makeExercise({ hasImage: false })]);

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("svg.equipment-icon").exists()).toBe(true);
  });

  it("falls back to the equipment icon once the image fails to load", async () => {
    const wrapper = mountThumb({ slug: "bench-press", equipment: "dumbbell" }, [makeExercise({ hasImage: true })]);
    expect(wrapper.find("img").exists()).toBe(true);

    await wrapper.find("img").trigger("error");

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("svg.equipment-icon").exists()).toBe(true);
  });

  it("sizes the outer frame from the size prop, defaulting to 40px", () => {
    const withDefault = mountThumb({ slug: "bench-press", equipment: "barbell" });
    expect(withDefault.find(".exercise-thumb").attributes("style")).toContain("width: 40px");

    const sized = mountThumb({ slug: "bench-press", equipment: "barbell", size: 60 });
    expect(sized.find(".exercise-thumb").attributes("style")).toContain("width: 60px");
    expect(sized.find(".exercise-thumb").attributes("style")).toContain("height: 60px");
  });

  it("sizes the equipment-icon fallback at 55% of the requested size", () => {
    const wrapper = mountThumb({ slug: "bench-press", equipment: "barbell", size: 60 }, [makeExercise({ hasImage: false })]);

    const svg = wrapper.find("svg.equipment-icon");
    expect(svg.attributes("width")).toBe("33"); // Math.round(60 * 0.55)
  });
});
