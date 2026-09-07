import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/rankEventsService", () => ({
  getRankEvents: vi.fn(),
}));

import { useRankEventsStore } from "~client/stores/rankEventsStore";
import { getRankEvents, type RankEventsByWeekday } from "~client/services/rankEventsService";

const getRankEventsMock = vi.mocked(getRankEvents);

const byWeekday: RankEventsByWeekday[] = [
  { weekday: 0, count: 0, flaggedCount: 0 },
  { weekday: 1, count: 3, flaggedCount: 1 },
];

beforeEach(() => {
  setActivePinia(createPinia());
  getRankEventsMock.mockReset();
});

describe("rankEventsStore", () => {
  it("starts with an empty weekday breakdown and not loaded", () => {
    const store = useRankEventsStore();

    expect(store.byWeekday).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() populates byWeekday and flips loaded on success", async () => {
    getRankEventsMock.mockResolvedValue(byWeekday);
    const store = useRankEventsStore();

    await store.load();

    expect(store.byWeekday).toEqual(byWeekday);
    expect(store.loaded).toBe(true);
  });

  it("load() silently no-ops on failure (no cached data, no crash, calendar strip just doesn't render)", async () => {
    getRankEventsMock.mockRejectedValue(new Error("offline"));
    const store = useRankEventsStore();

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.byWeekday).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() leaves previously loaded data in place if a later reload fails", async () => {
    getRankEventsMock.mockResolvedValueOnce(byWeekday);
    const store = useRankEventsStore();
    await store.load();

    getRankEventsMock.mockRejectedValueOnce(new Error("offline"));
    await store.load();

    expect(store.byWeekday).toEqual(byWeekday);
    expect(store.loaded).toBe(true);
  });
});
