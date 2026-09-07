import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/historyService", () => ({
  getHistoryPage: vi.fn(),
}));

vi.mock("~client/services/workoutService", () => ({
  deleteWorkout: vi.fn(),
  getWorkout: vi.fn(),
}));

import { useHistoryStore } from "~client/stores/historyStore";
import { getHistoryPage, type HistoryItem } from "~client/services/historyService";
import { deleteWorkout, getWorkout, type WorkoutDetail } from "~client/services/workoutService";

const getHistoryPageMock = vi.mocked(getHistoryPage);
const deleteWorkoutMock = vi.mocked(deleteWorkout);
const getWorkoutMock = vi.mocked(getWorkout);

// Factories, not shared constants: the store's load()/loadMore() assign `this.items` straight
// to the resolved array (no defensive clone) and loadMore() then `push`es into it — a shared
// array literal reused across `it()`s would get mutated in place by one test and leak into the
// next. Each call below returns a fresh array/objects.
function page1Items(): HistoryItem[] {
  return [
    { kind: "workout", id: "w-1", at: "2026-09-05T10:00:00Z", title: "Push Day", meta: {} },
    { kind: "run", id: "r-1", at: "2026-09-04T08:00:00Z", title: null, meta: { km: 5 } },
  ];
}

function page2Items(): HistoryItem[] {
  return [{ kind: "workout", id: "w-2", at: "2026-09-01T10:00:00Z", title: "Leg Day", meta: {} }];
}

const workoutDetail: WorkoutDetail = {
  id: "w-1",
  routineId: null,
  startedAt: "2026-09-05T10:00:00Z",
  endedAt: "2026-09-05T11:00:00Z",
  pausedSeconds: 0,
  notes: null,
  workoutExercises: [],
};

beforeEach(() => {
  setActivePinia(createPinia());
  getHistoryPageMock.mockReset();
  deleteWorkoutMock.mockReset();
  getWorkoutMock.mockReset();
});

describe("historyStore", () => {
  it("starts with empty state", () => {
    const store = useHistoryStore();

    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
    expect(store.nextCursor).toBeNull();
    expect(store.loadingMore).toBe(false);
    expect(store.detailCache.size).toBe(0);
  });

  describe("load()", () => {
    it("populates items and nextCursor on success", async () => {
      getHistoryPageMock.mockResolvedValue({ items: page1Items(), nextCursor: "cursor-1" });
      const store = useHistoryStore();

      await store.load();

      expect(store.items).toEqual(page1Items());
      expect(store.nextCursor).toBe("cursor-1");
      expect(store.loaded).toBe(true);
      expect(store.error).toBe(false);
      expect(getHistoryPageMock).toHaveBeenCalledWith();
    });

    it("sets error on failure and leaves items alone", async () => {
      getHistoryPageMock.mockRejectedValue(new Error("offline"));
      const store = useHistoryStore();

      await store.load();

      expect(store.error).toBe(true);
      expect(store.items).toEqual([]);
      expect(store.loaded).toBe(false);
    });
  });

  describe("loadMore()", () => {
    it("is a no-op when there is no nextCursor", async () => {
      const store = useHistoryStore();

      await store.loadMore();

      expect(getHistoryPageMock).not.toHaveBeenCalled();
    });

    it("appends items and advances the cursor, toggling loadingMore around the call", async () => {
      getHistoryPageMock.mockResolvedValueOnce({ items: page1Items(), nextCursor: "cursor-1" });
      const store = useHistoryStore();
      await store.load();

      let resolveSecondPage!: (v: { items: HistoryItem[]; nextCursor: string | null }) => void;
      getHistoryPageMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondPage = resolve;
        }),
      );

      const loadMorePromise = store.loadMore();
      expect(store.loadingMore).toBe(true);

      resolveSecondPage({ items: page2Items(), nextCursor: null });
      await loadMorePromise;

      expect(store.loadingMore).toBe(false);
      expect(store.items).toEqual([...page1Items(), ...page2Items()]);
      expect(store.nextCursor).toBeNull();
      expect(getHistoryPageMock).toHaveBeenLastCalledWith("cursor-1");
    });

    it("is a no-op when a loadMore is already in flight (dedup)", async () => {
      getHistoryPageMock.mockResolvedValueOnce({ items: page1Items(), nextCursor: "cursor-1" });
      const store = useHistoryStore();
      await store.load();

      let resolveSecondPage!: (v: { items: HistoryItem[]; nextCursor: string | null }) => void;
      getHistoryPageMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondPage = resolve;
        }),
      );

      const firstCall = store.loadMore();
      const secondCall = store.loadMore(); // should short-circuit, no extra fetch

      resolveSecondPage({ items: page2Items(), nextCursor: null });
      await Promise.all([firstCall, secondCall]);

      expect(getHistoryPageMock).toHaveBeenCalledTimes(2); // 1 for load() + 1 for loadMore()
      expect(store.items).toEqual([...page1Items(), ...page2Items()]);
    });

    it("resets loadingMore even when the fetch fails", async () => {
      getHistoryPageMock.mockResolvedValueOnce({ items: page1Items(), nextCursor: "cursor-1" });
      const store = useHistoryStore();
      await store.load();

      getHistoryPageMock.mockRejectedValueOnce(new Error("offline"));

      await expect(store.loadMore()).rejects.toThrow("offline");
      expect(store.loadingMore).toBe(false);
    });
  });

  describe("loadWorkout()", () => {
    it("fetches and caches a workout detail on a cache miss", async () => {
      getWorkoutMock.mockResolvedValue(workoutDetail);
      const store = useHistoryStore();

      const result = await store.loadWorkout("w-1");

      expect(result).toEqual(workoutDetail);
      expect(store.detailCache.get("w-1")).toEqual(workoutDetail);
      expect(getWorkoutMock).toHaveBeenCalledWith("w-1");
    });

    it("serves subsequent lookups from the cache without refetching", async () => {
      getWorkoutMock.mockResolvedValue(workoutDetail);
      const store = useHistoryStore();

      await store.loadWorkout("w-1");
      const second = await store.loadWorkout("w-1");

      expect(second).toEqual(workoutDetail);
      expect(getWorkoutMock).toHaveBeenCalledTimes(1);
    });

    it("returns null and does not cache on fetch failure", async () => {
      getWorkoutMock.mockRejectedValue(new Error("not found"));
      const store = useHistoryStore();

      const result = await store.loadWorkout("missing");

      expect(result).toBeNull();
      expect(store.detailCache.has("missing")).toBe(false);
    });
  });

  describe("deleteWorkout()", () => {
    it("removes only the matching workout item from state and its cache entry", async () => {
      deleteWorkoutMock.mockResolvedValue(undefined);
      getHistoryPageMock.mockResolvedValue({ items: page1Items(), nextCursor: null });
      getWorkoutMock.mockResolvedValue(workoutDetail);
      const store = useHistoryStore();
      await store.load();
      await store.loadWorkout("w-1");
      expect(store.detailCache.has("w-1")).toBe(true);

      await store.deleteWorkout("w-1");

      expect(deleteWorkoutMock).toHaveBeenCalledWith("w-1");
      expect(store.items).toEqual([page1Items()[1]]); // the run item survives
      expect(store.detailCache.has("w-1")).toBe(false);
    });

    it("does not remove a run item even if its id collides with a workout id being deleted", async () => {
      const items: HistoryItem[] = [
        { kind: "workout", id: "shared-id", at: "2026-09-05T10:00:00Z", title: "Workout", meta: {} },
        { kind: "run", id: "shared-id", at: "2026-09-04T08:00:00Z", title: null, meta: {} },
      ];
      deleteWorkoutMock.mockResolvedValue(undefined);
      getHistoryPageMock.mockResolvedValue({ items, nextCursor: null });
      const store = useHistoryStore();
      await store.load();

      await store.deleteWorkout("shared-id");

      expect(store.items).toEqual([items[1]]);
    });
  });
});
