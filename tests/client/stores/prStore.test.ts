import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/prService", () => ({
  getPrs: vi.fn(),
}));

import { usePrStore } from "~client/stores/prStore";
import { getPrs, type PrListItem } from "~client/services/prService";

const getPrsMock = vi.mocked(getPrs);

const prs: PrListItem[] = [
  {
    id: "pr-1",
    exerciseId: "ex-1",
    exerciseSlug: "bench-press",
    exerciseName: null,
    kind: "e1rm",
    value: 120,
    achievedAt: "2026-09-05T10:00:00Z",
    workoutId: "w-1",
  },
];

beforeEach(() => {
  setActivePinia(createPinia());
  getPrsMock.mockReset();
});

describe("prStore", () => {
  it("starts with an empty ledger, not loaded, no error", () => {
    const store = usePrStore();

    expect(store.prs).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
  });

  it("load() populates prs on success", async () => {
    getPrsMock.mockResolvedValue(prs);
    const store = usePrStore();

    await store.load();

    expect(store.prs).toEqual(prs);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error and leaves prs alone on failure", async () => {
    getPrsMock.mockRejectedValue(new Error("network down"));
    const store = usePrStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.prs).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getPrsMock.mockRejectedValueOnce(new Error("network down"));
    const store = usePrStore();
    await store.load();
    expect(store.error).toBe(true);

    getPrsMock.mockResolvedValueOnce(prs);
    await store.load();

    expect(store.error).toBe(false);
    expect(store.prs).toEqual(prs);
  });
});
