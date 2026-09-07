// @vitest-environment jsdom
//
// xpStore reads/writes `localStorage` directly for the showXp toggle (getShowXp/setShowXp),
// which doesn't exist under vitest's default `node` environment — see tests/README.md's
// Environment section.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getXpMock } = vi.hoisted(() => ({ getXpMock: vi.fn() }));

vi.mock("~client/services/xpService", () => ({
  getXp: getXpMock,
}));

import { getShowXp, setShowXp, useXpStore } from "~client/stores/xpStore";

const SHOW_XP_KEY = "liftr.showXp";

beforeEach(() => {
  setActivePinia(createPinia());
  getXpMock.mockReset();
  localStorage.clear();
});

describe("getShowXp/setShowXp", () => {
  it("defaults to true (on) when nothing has been stored yet", () => {
    expect(getShowXp()).toBe(true);
  });

  it("setShowXp(false) persists and getShowXp reflects it", () => {
    setShowXp(false);
    expect(localStorage.getItem(SHOW_XP_KEY)).toBe("false");
    expect(getShowXp()).toBe(false);
  });

  it("setShowXp(true) persists explicitly and getShowXp reflects it", () => {
    setShowXp(false);
    setShowXp(true);
    expect(localStorage.getItem(SHOW_XP_KEY)).toBe("true");
    expect(getShowXp()).toBe(true);
  });
});

describe("useXpStore", () => {
  it("starts with zeroed xp/level fields, not loaded, no error, and showXp seeded from localStorage", () => {
    const store = useXpStore();

    expect(store.totalXp).toBe(0);
    expect(store.level).toBe(0);
    expect(store.xpIntoLevel).toBe(0);
    expect(store.xpForNextLevel).toBe(100);
    expect(store.progressPercent).toBe(0);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
    expect(store.showXp).toBe(true);
  });

  it("seeds showXp as false when localStorage already has it turned off before the store is created", () => {
    localStorage.setItem(SHOW_XP_KEY, "false");
    const store = useXpStore();

    expect(store.showXp).toBe(false);
  });

  describe("load()", () => {
    it("patches all xp/level fields from the response and flips loaded on success", async () => {
      getXpMock.mockResolvedValue({
        totalXp: 1250,
        level: 7,
        xpIntoLevel: 50,
        xpForNextLevel: 200,
        progressPercent: 25,
      });
      const store = useXpStore();

      await store.load();

      expect(store.totalXp).toBe(1250);
      expect(store.level).toBe(7);
      expect(store.xpIntoLevel).toBe(50);
      expect(store.xpForNextLevel).toBe(200);
      expect(store.progressPercent).toBe(25);
      expect(store.loaded).toBe(true);
      expect(store.error).toBe(false);
    });

    it("sets error and leaves prior xp state in place when the request fails", async () => {
      getXpMock.mockRejectedValue(new Error("offline"));
      const store = useXpStore();

      await store.load();

      expect(store.error).toBe(true);
      expect(store.loaded).toBe(false);
      expect(store.totalXp).toBe(0);
    });

    it("clears a previous error on a subsequent successful call", async () => {
      getXpMock.mockRejectedValueOnce(new Error("offline"));
      const store = useXpStore();
      await store.load();
      expect(store.error).toBe(true);

      getXpMock.mockResolvedValueOnce({ totalXp: 10, level: 1, xpIntoLevel: 10, xpForNextLevel: 100, progressPercent: 10 });
      await store.load();

      expect(store.error).toBe(false);
      expect(store.loaded).toBe(true);
      expect(store.totalXp).toBe(10);
    });
  });

  describe("toggleShowXp()", () => {
    it("flips showXp and persists the new value to localStorage", () => {
      const store = useXpStore();
      expect(store.showXp).toBe(true);

      store.toggleShowXp();

      expect(store.showXp).toBe(false);
      expect(localStorage.getItem(SHOW_XP_KEY)).toBe("false");

      store.toggleShowXp();

      expect(store.showXp).toBe(true);
      expect(localStorage.getItem(SHOW_XP_KEY)).toBe("true");
    });
  });
});
