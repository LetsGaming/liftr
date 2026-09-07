import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/overallRankService", () => ({
  getOverallRank: vi.fn(),
}));

import { useOverallRankStore } from "~client/stores/overallRankStore";
import { getOverallRank } from "~client/services/overallRankService";

const getOverallRankMock = vi.mocked(getOverallRank);

beforeEach(() => {
  setActivePinia(createPinia());
  getOverallRankMock.mockReset();
});

describe("overallRankStore", () => {
  it("starts with no current/peak band, not loaded, no error", () => {
    const store = useOverallRankStore();

    expect(store.current).toBeNull();
    expect(store.peak).toBeNull();
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  it("load() populates current and peak on success", async () => {
    getOverallRankMock.mockResolvedValue({
      current: { tier: "Gold", division: 2, lp: 1450 },
      peak: { tier: "Gold", division: 1, lp: 1620 },
    });
    const store = useOverallRankStore();

    await store.load();

    expect(store.current).toEqual({ tier: "Gold", division: 2, lp: 1450 });
    expect(store.peak).toEqual({ tier: "Gold", division: 1, lp: 1620 });
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() tolerates a null current/peak (no ranked lifts yet)", async () => {
    getOverallRankMock.mockResolvedValue({ current: null, peak: null });
    const store = useOverallRankStore();

    await store.load();

    expect(store.current).toBeNull();
    expect(store.peak).toBeNull();
    expect(store.loaded).toBe(true);
  });

  it("load() sets error and leaves state alone on failure", async () => {
    getOverallRankMock.mockRejectedValue(new Error("network down"));
    const store = useOverallRankStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.loaded).toBe(false);
    expect(store.current).toBeNull();
    expect(store.peak).toBeNull();
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getOverallRankMock.mockRejectedValueOnce(new Error("network down"));
    const store = useOverallRankStore();
    await store.load();
    expect(store.error).toBe(true);

    getOverallRankMock.mockResolvedValueOnce({
      current: { tier: "Silver", division: 3, lp: 900 },
      peak: { tier: "Silver", division: 3, lp: 900 },
    });
    await store.load();

    expect(store.error).toBe(false);
    expect(store.current).toEqual({ tier: "Silver", division: 3, lp: 900 });
  });
});
