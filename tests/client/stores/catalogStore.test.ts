// @vitest-environment jsdom
//
// catalogStore reads/writes `localStorage` directly (its offline-cold-start fallback), which
// doesn't exist under vitest's default `node` environment — see tests/README.md's Environment
// section.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/exerciseService", () => ({
  getExercises: vi.fn(),
}));

import { useCatalogStore, type CatalogExercise } from "~client/stores/catalogStore";
import { getExercises } from "~client/services/exerciseService";

const getExercisesMock = vi.mocked(getExercises);

const CACHE_KEY = "liftr.catalog.v2";

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
    muscles: [],
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getExercisesMock.mockReset();
  localStorage.clear();
});

describe("catalogStore", () => {
  it("starts with an empty catalog and loaded: false", () => {
    const store = useCatalogStore();

    expect(store.exercises).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() with no cache fetches fresh and populates exercises/loaded/cache", async () => {
    const fresh = [makeExercise()];
    getExercisesMock.mockResolvedValue(fresh);
    const store = useCatalogStore();

    await store.load();

    expect(store.exercises).toEqual(fresh);
    expect(store.loaded).toBe(true);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual(fresh);
  });

  it("load() serves the localStorage cache synchronously before the fetch resolves, then overwrites it with fresh data", async () => {
    const cached = [makeExercise({ id: "ex-cached", slug: "cached-exercise" })];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    let resolveFetch!: (value: CatalogExercise[]) => void;
    getExercisesMock.mockReturnValue(
      new Promise<CatalogExercise[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const store = useCatalogStore();

    const loadPromise = store.load();
    // Cache is applied synchronously, before the network call resolves.
    expect(store.exercises).toEqual(cached);
    expect(store.loaded).toBe(true);

    const fresh = [makeExercise({ id: "ex-fresh", slug: "fresh-exercise" })];
    resolveFetch(fresh);
    await loadPromise;

    expect(store.exercises).toEqual(fresh);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual(fresh);
  });

  it("load() offline with no prior cache leaves exercises empty and loaded false (no crash)", async () => {
    getExercisesMock.mockRejectedValue(new Error("offline"));
    const store = useCatalogStore();

    await store.load();

    expect(store.exercises).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() offline with a prior cache keeps serving the cached catalog", async () => {
    const cached = [makeExercise({ id: "ex-cached", slug: "cached-exercise" })];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    getExercisesMock.mockRejectedValue(new Error("offline"));
    const store = useCatalogStore();

    await store.load();

    expect(store.exercises).toEqual(cached);
    expect(store.loaded).toBe(true);
  });

  describe("getters", () => {
    it("byId finds an exercise by id", async () => {
      const a = makeExercise({ id: "ex-a", slug: "a" });
      const b = makeExercise({ id: "ex-b", slug: "b" });
      getExercisesMock.mockResolvedValue([a, b]);
      const store = useCatalogStore();
      await store.load();

      expect(store.byId("ex-b")).toEqual(b);
      expect(store.byId("missing")).toBeUndefined();
    });

    it("bySlug finds an exercise by slug", async () => {
      const a = makeExercise({ id: "ex-a", slug: "a" });
      const b = makeExercise({ id: "ex-b", slug: "b" });
      getExercisesMock.mockResolvedValue([a, b]);
      const store = useCatalogStore();
      await store.load();

      expect(store.bySlug("b")).toEqual(b);
      expect(store.bySlug("missing")).toBeUndefined();
    });
  });
});
