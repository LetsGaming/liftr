import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import ExerciseDetailPage from "~client/pages/ExerciseDetailPage.vue";
import { i18n } from "~client/i18n";
import { useRanksStore, type RankRow } from "~client/stores/ranksStore";
import { useSettingsStore } from "~client/stores/settingsStore";
import type { CatalogExercise } from "~client/stores/catalogStore";
import type { ExerciseHistorySet } from "~client/services/exerciseService";

const { getExerciseHistoryMock, getRanksMock, getExercisesMock } = vi.hoisted(() => ({
  getExerciseHistoryMock: vi.fn(),
  getRanksMock: vi.fn(),
  getExercisesMock: vi.fn(),
}));
vi.mock("~client/services/exerciseService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~client/services/exerciseService")>();
  return { ...actual, getExerciseHistory: getExerciseHistoryMock, getExercises: getExercisesMock };
});
vi.mock("~client/services/rankService", () => ({ getRanks: getRanksMock }));

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
    hasImage: true,
    muscles: [{ slug: "chest", role: "primary" }, { slug: "triceps", role: "secondary" }],
    ...overrides,
  };
}

function makeHistorySet(overrides: Partial<ExerciseHistorySet> = {}): ExerciseHistorySet {
  return { setIndex: 0, weightKg: 60, reps: 5, loggedAt: "2026-01-01T10:00:00.000Z", isWarmup: false, ...overrides };
}

function makeRank(overrides: Partial<RankRow> = {}): RankRow {
  return {
    exerciseId: "ex-1",
    slug: "bench-press",
    name: null,
    isBodyweight: false,
    tier: "trainee",
    division: 2,
    lp: 40,
    e1rm: 70,
    trust: "real",
    nextTargetWeightKg: 75,
    nextTargetReps: 5,
    peakTier: null,
    peakDivision: null,
    ...overrides,
  };
}

async function mountAtSlug(
  slug: string,
  opts: { exercises?: CatalogExercise[]; ownedEquipment?: string[] | null; ranks?: RankRow[]; ranksLoaded?: boolean } = {},
) {
  getExercisesMock.mockResolvedValue(opts.exercises ?? []);

  const pinia = createPinia();
  useSettingsStore(pinia).ownedEquipment = opts.ownedEquipment ?? null;
  const ranksStore = useRanksStore(pinia);
  ranksStore.ranks = opts.ranks ?? [];
  ranksStore.loaded = opts.ranksLoaded ?? false;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/exercises/:slug", name: "exercise-detail", component: ExerciseDetailPage },
      { path: "/exercises", name: "exercises", component: { template: "<div />" } },
    ],
  });
  await router.push(`/exercises/${slug}`);
  await router.isReady();

  const wrapper = mount(ExerciseDetailPage, { global: { plugins: [pinia, i18n, router] } });
  // Flushes onMounted()'s catalog.load() (async fetch via the mocked getExercises) so the
  // exercise/not-found lookup has resolved before assertions run.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return { wrapper, ranksStore, router: router as Router };
}

beforeEach(() => {
  localStorage.clear();
  // Mounts here bypass mountWithProviders.ts (its own reset doesn't apply) — jsdom's
  // navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would otherwise
  // default the shared i18n singleton to "en" for the rest of the test process.
  i18n.global.locale.value = "de";
  getExerciseHistoryMock.mockReset();
  getRanksMock.mockReset();
  getExercisesMock.mockReset();
  getExerciseHistoryMock.mockResolvedValue([]);
  getRanksMock.mockResolvedValue([]);
});

describe("ExerciseDetailPage", () => {
  it("shows the exercise's i18n display name as the page title, defaulting to the Über tab", async () => {
    const { wrapper } = await mountAtSlug("bench-press", { exercises: [makeExercise()] });

    expect(wrapper.find("ion-title").text()).toBe("Bankdrücken");
    const tabs = wrapper.findAll(".tab-pill");
    expect(tabs.map((t) => t.text())).toEqual(["Über", "Rang", "Statistiken", "Verlauf"]);
    expect(tabs[0]!.classes()).toContain("active");
  });

  it("shows a back button", async () => {
    const { wrapper } = await mountAtSlug("bench-press", { exercises: [makeExercise()] });

    expect(wrapper.find(".base-page-back-btn").exists()).toBe(true);
  });

  it("shows a not-found message for a slug that doesn't match any catalog exercise, once the catalog has loaded", async () => {
    const { wrapper } = await mountAtSlug("does-not-exist", { exercises: [makeExercise()] });

    expect(wrapper.find(".not-found").exists()).toBe(true);
    expect(wrapper.findAll(".tab-pill")).toHaveLength(0);
  });

  it("Über tab lists required equipment and flags what's missing against owned equipment", async () => {
    const exercise = makeExercise({
      requiredEquipment: [
        { item: "barbell", tier: "required" },
        { item: "bench", tier: "recommended" },
      ],
    });
    const { wrapper } = await mountAtSlug("bench-press", { exercises: [exercise], ownedEquipment: ["dumbbell"] });

    const chips = wrapper.findAll(".equipment-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.classes()).toContain("missing");
    expect(chips[1]!.classes()).toContain("soft");
  });

  it("switching to a non-Über tab lazily fetches this exercise's history exactly once", async () => {
    const { wrapper } = await mountAtSlug("bench-press", { exercises: [makeExercise()] });
    expect(getExerciseHistoryMock).not.toHaveBeenCalled();

    await wrapper.findAll(".tab-pill")[3]!.trigger("click"); // Verlauf
    await Promise.resolve();
    await Promise.resolve();

    expect(getExerciseHistoryMock).toHaveBeenCalledWith("ex-1");
    expect(getExerciseHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("Verlauf tab renders the fetched sets via ExerciseHistoryList", async () => {
    getExerciseHistoryMock.mockResolvedValue([makeHistorySet({ weightKg: 80, reps: 3 })]);
    const { wrapper } = await mountAtSlug("bench-press", { exercises: [makeExercise()] });

    await wrapper.findAll(".tab-pill")[3]!.trigger("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.find(".set-value").text()).toBe("80 kg × 3");
  });

  it("Rang tab shows the matching rank once ranks are loaded", async () => {
    const { wrapper } = await mountAtSlug("bench-press", {
      exercises: [makeExercise()],
      ranksLoaded: true,
      ranks: [makeRank({ tier: "trainee", division: 2, lp: 40 })],
    });

    await wrapper.findAll(".tab-pill")[1]!.trigger("click"); // Rang

    expect(wrapper.find(".panel-reward").exists()).toBe(true);
    expect(wrapper.text()).toContain("40 LP");
  });
});
