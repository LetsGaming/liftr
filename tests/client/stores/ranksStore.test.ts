import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/rankService", () => ({
  getRanks: vi.fn(),
}));

import { useRanksStore, type RankRow } from "~client/stores/ranksStore";
import { getRanks } from "~client/services/rankService";

const getRanksMock = vi.mocked(getRanks);

function makeRow(overrides: Partial<RankRow> = {}): RankRow {
  return {
    exerciseId: "ex-1",
    slug: "bench-press",
    name: null,
    isBodyweight: false,
    tier: "Silver",
    division: 2,
    lp: 900,
    e1rm: 100,
    trust: "real",
    nextTargetWeightKg: 102.5,
    nextTargetReps: 5,
    peakTier: "Silver",
    peakDivision: 2,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getRanksMock.mockReset();
});

describe("ranksStore", () => {
  it("starts with an empty rank list, not loaded, no error", () => {
    const store = useRanksStore();

    expect(store.ranks).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  describe("load()", () => {
    it("populates ranks on success", async () => {
      const rows = [makeRow()];
      getRanksMock.mockResolvedValue(rows);
      const store = useRanksStore();

      await store.load();

      expect(store.ranks).toEqual(rows);
      expect(store.loaded).toBe(true);
      expect(store.error).toBe(false);
    });

    it("sets error and leaves ranks alone on failure", async () => {
      getRanksMock.mockRejectedValue(new Error("network down"));
      const store = useRanksStore();

      await store.load();

      expect(store.error).toBe(true);
      expect(store.ranks).toEqual([]);
      expect(store.loaded).toBe(false);
    });

    it("clears a previous error on a subsequent successful call", async () => {
      getRanksMock.mockRejectedValueOnce(new Error("network down"));
      const store = useRanksStore();
      await store.load();
      expect(store.error).toBe(true);

      const rows = [makeRow()];
      getRanksMock.mockResolvedValueOnce(rows);
      await store.load();

      expect(store.error).toBe(false);
      expect(store.ranks).toEqual(rows);
    });
  });

  describe("applyVerdict()", () => {
    it("updates tier/division/lp in place for an exercise that already has a row, without refetching", () => {
      const row = makeRow({ exerciseId: "ex-1", tier: "Silver", division: 2, lp: 900 });
      getRanksMock.mockResolvedValue([row]);
      const store = useRanksStore();
      store.$patch({ ranks: [row], loaded: true });

      store.applyVerdict("ex-1", { tier: "Gold", division: 1, lp: 1010 });

      expect(store.ranks[0]).toMatchObject({ tier: "Gold", division: 1, lp: 1010 });
      expect(getRanksMock).not.toHaveBeenCalled();
    });

    it("leaves other rows untouched", () => {
      const row1 = makeRow({ exerciseId: "ex-1", tier: "Silver", division: 2, lp: 900 });
      const row2 = makeRow({ exerciseId: "ex-2", tier: "Bronze", division: 3, lp: 400 });
      const store = useRanksStore();
      store.$patch({ ranks: [row1, row2], loaded: true });

      store.applyVerdict("ex-1", { tier: "Gold", division: 1, lp: 1010 });

      expect(store.ranks[1]).toMatchObject({ tier: "Bronze", division: 3, lp: 400 });
    });

    it("falls back to a full load() when no row exists yet for that exercise (its first-ever ranked set this session)", async () => {
      const freshRow = makeRow({ exerciseId: "ex-new", tier: "Bronze", division: 4, lp: 50 });
      getRanksMock.mockResolvedValue([freshRow]);
      const store = useRanksStore();
      store.$patch({ ranks: [], loaded: true });

      store.applyVerdict("ex-new", { tier: "Bronze", division: 4, lp: 50 });

      await vi.waitFor(() => {
        expect(getRanksMock).toHaveBeenCalledTimes(1);
      });
      await vi.waitFor(() => {
        expect(store.ranks).toEqual([freshRow]);
      });
    });
  });
});
