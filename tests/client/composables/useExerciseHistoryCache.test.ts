import { beforeEach, describe, expect, it, vi } from "vitest";

const { getExerciseHistoryMock } = vi.hoisted(() => ({ getExerciseHistoryMock: vi.fn() }));

vi.mock("~client/services/exerciseService", () => ({
  getExerciseHistory: getExerciseHistoryMock,
}));

import { useExerciseHistoryCache } from "~client/composables/useExerciseHistoryCache";
import type { ExerciseHistorySet } from "~client/services/exerciseService";

function makeSet(overrides: Partial<ExerciseHistorySet> = {}): ExerciseHistorySet {
  return { setIndex: 0, weightKg: 60, reps: 8, loggedAt: "2026-01-01T00:00:00.000Z", isWarmup: false, ...overrides };
}

beforeEach(() => {
  getExerciseHistoryMock.mockReset();
});

describe("useExerciseHistoryCache", () => {
  it("starts with nothing expanded and an empty cache", () => {
    const { expanded, historyCache } = useExerciseHistoryCache();

    expect(expanded.size).toBe(0);
    expect(historyCache.size).toBe(0);
  });

  it("toggleExpand marks an exercise expanded and fetches its history on first expand", async () => {
    const sets = [makeSet()];
    getExerciseHistoryMock.mockResolvedValue(sets);
    const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

    await toggleExpand("ex-1");

    expect(expanded.has("ex-1")).toBe(true);
    expect(historyCache.get("ex-1")).toEqual(sets);
    expect(getExerciseHistoryMock).toHaveBeenCalledWith("ex-1");
  });

  it("toggleExpand collapses an already-expanded exercise without refetching", async () => {
    getExerciseHistoryMock.mockResolvedValue([makeSet()]);
    const { expanded, toggleExpand } = useExerciseHistoryCache();

    await toggleExpand("ex-1");
    await toggleExpand("ex-1");

    expect(expanded.has("ex-1")).toBe(false);
    expect(getExerciseHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("re-expanding after a collapse reuses the cached history instead of refetching", async () => {
    getExerciseHistoryMock.mockResolvedValue([makeSet()]);
    const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

    await toggleExpand("ex-1"); // expand, fetch
    await toggleExpand("ex-1"); // collapse
    await toggleExpand("ex-1"); // expand again

    expect(expanded.has("ex-1")).toBe(true);
    expect(historyCache.get("ex-1")).toEqual([makeSet()]);
    expect(getExerciseHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("caches an empty array (not a rejection) when the fetch fails, so the chart can show 'not enough data'", async () => {
    getExerciseHistoryMock.mockRejectedValue(new Error("offline"));
    const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

    await expect(toggleExpand("ex-1")).resolves.toBeUndefined();

    expect(expanded.has("ex-1")).toBe(true);
    expect(historyCache.get("ex-1")).toEqual([]);
  });

  it("tracks multiple exercises independently", async () => {
    getExerciseHistoryMock.mockImplementation((id: string) => Promise.resolve([makeSet({ setIndex: id === "ex-1" ? 0 : 1 })]));
    const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

    await toggleExpand("ex-1");
    await toggleExpand("ex-2");

    expect([...expanded]).toEqual(["ex-1", "ex-2"]);
    expect(historyCache.get("ex-1")).toEqual([makeSet({ setIndex: 0 })]);
    expect(historyCache.get("ex-2")).toEqual([makeSet({ setIndex: 1 })]);
  });
});
