import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStreakMock } = vi.hoisted(() => ({ getStreakMock: vi.fn() }));

vi.mock("~client/services/streakService", () => ({
  getStreak: getStreakMock,
}));

import { useStreakStore } from "~client/stores/streakStore";

beforeEach(() => {
  setActivePinia(createPinia());
  getStreakMock.mockReset();
});

describe("streakStore", () => {
  it("starts with a zero streak, 2 tokens remaining, not loaded, no error", () => {
    const store = useStreakStore();

    expect(store.streak).toBe(0);
    expect(store.tokensRemaining).toBe(2);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  it("load() populates streak/tokensRemaining and flips loaded on success", async () => {
    getStreakMock.mockResolvedValue({ streak: 12, tokensRemaining: 1 });
    const store = useStreakStore();

    await store.load();

    expect(store.streak).toBe(12);
    expect(store.tokensRemaining).toBe(1);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error and leaves prior values in place when the request fails", async () => {
    getStreakMock.mockRejectedValue(new Error("offline"));
    const store = useStreakStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.streak).toBe(0);
    expect(store.tokensRemaining).toBe(2);
    expect(store.loaded).toBe(false);
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getStreakMock.mockRejectedValueOnce(new Error("offline"));
    const store = useStreakStore();
    await store.load();
    expect(store.error).toBe(true);

    getStreakMock.mockResolvedValueOnce({ streak: 3, tokensRemaining: 2 });
    await store.load();

    expect(store.error).toBe(false);
    expect(store.streak).toBe(3);
    expect(store.loaded).toBe(true);
  });
});
