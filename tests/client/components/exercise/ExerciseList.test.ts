import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";
import ExerciseList from "~client/components/exercise/ExerciseList.vue";
import { i18n } from "~client/i18n";
import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { useSettingsStore } from "~client/stores/settingsStore";
import { createTestRouter, mountWithProviders } from "../../helpers/mountWithProviders";

function makeExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: overrides.slug ?? "ex",
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

function mountList(
  exercises: CatalogExercise[],
  props: { mode?: "browse" | "select"; selectedIds?: Set<string> } = {},
  ownedEquipment: string[] | null = null,
) {
  const pinia = createPinia();
  const catalog = useCatalogStore(pinia);
  catalog.exercises = exercises;
  catalog.loaded = true;
  const settings = useSettingsStore(pinia);
  settings.ownedEquipment = ownedEquipment;
  return mountWithProviders(ExerciseList, {
    props,
    global: { plugins: [pinia, i18n, createTestRouter()] },
  });
}

const BENCH = makeExercise({ id: "1", slug: "bench-press", equipment: "barbell" });
const CURL = makeExercise({
  id: "2",
  slug: "custom-curl",
  name: "Kabelzug Curl",
  equipment: "cable",
  movementPattern: "isolation-arms",
  muscles: [{ slug: "biceps", role: "primary" }],
});

describe("ExerciseList", () => {
  it("renders a card per exercise, using i18n names for catalog exercises and the literal name for custom ones", () => {
    const wrapper = mountList([BENCH, CURL]);

    const names = wrapper.findAll(".ex-name").map((n) => n.text());
    expect(names).toEqual(["Bankdrücken", "Kabelzug Curl"]);
  });

  it("shows the empty-state message once the catalog is loaded and no card matches the filters", async () => {
    const wrapper = mountList([BENCH]);

    await wrapper.find(".search-input").setValue("does-not-exist");

    expect(wrapper.find(".empty").text()).toBe("Keine Übung passt zu diesen Filtern.");
    expect(wrapper.findAll(".ex-card")).toHaveLength(0);
  });

  it("filters by search text against both slug and display name", async () => {
    const wrapper = mountList([BENCH, CURL]);

    await wrapper.find(".search-input").setValue("curl");

    const names = wrapper.findAll(".ex-name").map((n) => n.text());
    expect(names).toEqual(["Kabelzug Curl"]);
  });

  it("filters by the equipment dropdown", async () => {
    const wrapper = mountList([BENCH, CURL]);

    await wrapper.find('select[aria-label="Nach Gerät filtern"]').setValue("cable");

    const names = wrapper.findAll(".ex-name").map((n) => n.text());
    expect(names).toEqual(["Kabelzug Curl"]);
  });

  it("filters by the muscle dropdown", async () => {
    const wrapper = mountList([BENCH, CURL]);

    await wrapper.find('select[aria-label="Nach Muskelgruppe filtern"]').setValue("biceps");

    const names = wrapper.findAll(".ex-name").map((n) => n.text());
    expect(names).toEqual(["Kabelzug Curl"]);
  });

  it("does not show the equipment-doable toggle when no owned-equipment list is configured", () => {
    const wrapper = mountList([BENCH], {}, null);
    expect(wrapper.find(".equipment-toggle").exists()).toBe(false);
  });

  it("in browse mode, hides exercises the user can't do by default once equipment is configured", () => {
    const notDoable = makeExercise({ id: "3", slug: "cable-row", equipment: "cable", requiredEquipment: [{ item: "cable", tier: "required" }] });
    const doable = makeExercise({ id: "4", slug: "bw-pushup", equipment: null, isBodyweight: true, requiredEquipment: [] });
    const wrapper = mountList([notDoable, doable], { mode: "browse" }, ["barbell"]);

    expect(wrapper.find(".equipment-toggle").exists()).toBe(true);
    expect(wrapper.find(".equipment-toggle").classes()).toContain("active");
    const names = wrapper.findAll(".ex-name").map((n) => n.text());
    expect(names).toHaveLength(1);
  });

  it("toggling the equipment filter off reveals the not-doable card again, annotated with what's missing", async () => {
    const notDoable = makeExercise({ id: "3", slug: "cable-row", equipment: "cable", requiredEquipment: [{ item: "cable", tier: "required" }] });
    const wrapper = mountList([notDoable], { mode: "browse" }, ["barbell"]);
    expect(wrapper.findAll(".ex-card")).toHaveLength(0);

    await wrapper.find(".equipment-toggle").trigger("click");

    expect(wrapper.find(".equipment-toggle").classes()).not.toContain("active");
    expect(wrapper.findAll(".ex-card")).toHaveLength(1);
    expect(wrapper.find(".missing-note").text()).toContain("fehlt: Kabelzug");
  });

  it("select mode defaults the doable-only toggle to off, showing every exercise", () => {
    const notDoable = makeExercise({ id: "3", slug: "cable-row", equipment: "cable", requiredEquipment: [{ item: "cable", tier: "required" }] });
    const wrapper = mountList([notDoable], { mode: "select" }, ["barbell"]);

    expect(wrapper.find(".equipment-toggle").classes()).not.toContain("active");
    expect(wrapper.findAll(".ex-card")).toHaveLength(1);
  });

  it("browse mode: clicking a card emits open with the full exercise object", async () => {
    const wrapper = mountList([BENCH]);

    await wrapper.find(".ex-card").trigger("click");

    expect(wrapper.emitted("open")).toEqual([[BENCH]]);
    expect(wrapper.emitted("toggle")).toBeUndefined();
  });

  it("select mode: clicking a card emits toggle instead of open", async () => {
    const wrapper = mountList([BENCH], { mode: "select" });

    await wrapper.find(".ex-card").trigger("click");

    expect(wrapper.emitted("toggle")).toEqual([[BENCH]]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("select mode: marks a card in selectedIds as selected with a check badge", () => {
    const wrapper = mountList([BENCH], { mode: "select", selectedIds: new Set(["1"]) });

    const card = wrapper.find(".ex-card");
    expect(card.classes()).toContain("selected");
    expect(card.find(".check").exists()).toBe(true);
  });

  it("browse mode never shows the select-mode check badge, even if selectedIds is set", () => {
    const wrapper = mountList([BENCH], { mode: "browse", selectedIds: new Set(["1"]) });

    const card = wrapper.find(".ex-card");
    expect(card.classes()).not.toContain("selected");
    expect(card.find(".check").exists()).toBe(false);
  });
});
