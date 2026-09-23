// @vitest-environment jsdom
//
// jsdom (not the default node environment) because xpStore.ts's getShowXp() reads localStorage.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/xpService", () => ({ getXp: vi.fn() }));
vi.mock("~client/services/streakService", () => ({ getStreak: vi.fn() }));
vi.mock("~client/services/runRankService", () => ({
  getRunRanks: vi.fn(),
  getRunPrs: vi.fn(),
  getRunOverallRank: vi.fn(),
}));

import { refreshCardioDerivedStores } from "~client/composables/useCardioDerivedStores";
import { useRunRankStore } from "~client/stores/runRankStore";
import { useStreakStore } from "~client/stores/streakStore";
import { useXpStore } from "~client/stores/xpStore";
import { getXp } from "~client/services/xpService";
import { getStreak } from "~client/services/streakService";
import { getRunRanks, getRunPrs, getRunOverallRank } from "~client/services/runRankService";

const getXpMock = vi.mocked(getXp);
const getStreakMock = vi.mocked(getStreak);
const getRunRanksMock = vi.mocked(getRunRanks);
const getRunPrsMock = vi.mocked(getRunPrs);
const getRunOverallRankMock = vi.mocked(getRunOverallRank);

beforeEach(() => {
  setActivePinia(createPinia());
  getXpMock.mockReset().mockResolvedValue({ totalXp: 10, level: 1, xpIntoLevel: 10, xpForNextLevel: 100, progressPercent: 10 });
  getStreakMock.mockReset().mockResolvedValue({ streak: 3, tokensRemaining: 2 });
  getRunRanksMock.mockReset().mockResolvedValue([]);
  getRunPrsMock.mockReset().mockResolvedValue([]);
  getRunOverallRankMock.mockReset().mockResolvedValue({ current: null, peak: null });
});

describe("refreshCardioDerivedStores", () => {
  it("loads xp, streak, and all three runRankStore sections", async () => {
    const xpStore = useXpStore();
    const streakStore = useStreakStore();
    const runRankStore = useRunRankStore();
    expect(xpStore.loaded).toBe(false);
    expect(streakStore.loaded).toBe(false);
    expect(runRankStore.ranksLoaded).toBe(false);

    refreshCardioDerivedStores();
    await vi.waitFor(() => {
      expect(xpStore.loaded).toBe(true);
      expect(streakStore.loaded).toBe(true);
      expect(runRankStore.ranksLoaded).toBe(true);
      expect(runRankStore.prsLoaded).toBe(true);
      expect(runRankStore.overallLoaded).toBe(true);
    });

    expect(getXpMock).toHaveBeenCalledTimes(1);
    expect(getStreakMock).toHaveBeenCalledTimes(1);
    expect(getRunPrsMock).toHaveBeenCalledTimes(1);
    expect(getRunOverallRankMock).toHaveBeenCalledTimes(1);
    // Called once per ranked cardio activity (run/walk/hike) — see runRankStore.ts's loadAllRanks().
    expect(getRunRanksMock).toHaveBeenCalledTimes(3);
  });
});
