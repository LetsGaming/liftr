import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The factory below must construct its own vi.fn()s inline rather than referencing outer
// `const` bindings — vi.mock() is hoisted above them, so a direct property reference (e.g.
// `getBodyweightLogs: getBodyweightLogsMock`) would hit the TDZ. Grab typed handles to the
// mocks afterwards via vi.mocked() on the (mocked) module's own exports instead.
vi.mock("~client/services/bodyweightService", () => ({
  getBodyweightLogs: vi.fn(),
  logBodyweight: vi.fn(),
}));

import { useBodyweightStore, type BodyweightEntry } from "~client/stores/bodyweightStore";
import { getBodyweightLogs, logBodyweight } from "~client/services/bodyweightService";

const getBodyweightLogsMock = vi.mocked(getBodyweightLogs);
const logBodyweightMock = vi.mocked(logBodyweight);

const entries: BodyweightEntry[] = [
  { id: "bw-2", date: "2026-09-07", weightKg: 82.4 },
  { id: "bw-1", date: "2026-09-01", weightKg: 83.1 },
];

beforeEach(() => {
  setActivePinia(createPinia());
  getBodyweightLogsMock.mockReset();
  logBodyweightMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bodyweightStore", () => {
  it("starts with empty entries, not loaded, no error, and a null latest getter", () => {
    const store = useBodyweightStore();

    expect(store.entries).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.error).toBe(false);
    expect(store.latest).toBeNull();
  });

  it("load() populates entries and flips loaded on success", async () => {
    getBodyweightLogsMock.mockResolvedValue(entries);
    const store = useBodyweightStore();

    await store.load();

    expect(store.entries).toEqual(entries);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("latest getter returns the first entry (server orders newest-first)", async () => {
    getBodyweightLogsMock.mockResolvedValue(entries);
    const store = useBodyweightStore();

    await store.load();

    expect(store.latest).toEqual(entries[0]);
  });

  it("load() sets error and leaves entries alone when the request fails", async () => {
    getBodyweightLogsMock.mockRejectedValue(new Error("network down"));
    const store = useBodyweightStore();

    await store.load();

    expect(store.error).toBe(true);
    expect(store.entries).toEqual([]);
    expect(store.loaded).toBe(false);
  });

  it("load() clears a previous error on a subsequent successful call", async () => {
    getBodyweightLogsMock.mockRejectedValueOnce(new Error("network down"));
    const store = useBodyweightStore();
    await store.load();
    expect(store.error).toBe(true);

    getBodyweightLogsMock.mockResolvedValueOnce(entries);
    await store.load();

    expect(store.error).toBe(false);
    expect(store.entries).toEqual(entries);
  });

  it("log() posts today's date (YYYY-MM-DD) and the given weight, then reloads entries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T15:30:00Z"));
    logBodyweightMock.mockResolvedValue({ id: "bw-3", date: "2026-09-07", weightKg: 81.9 });
    getBodyweightLogsMock.mockResolvedValue([{ id: "bw-3", date: "2026-09-07", weightKg: 81.9 }, ...entries]);
    const store = useBodyweightStore();

    await store.log(81.9);

    expect(logBodyweightMock).toHaveBeenCalledWith("2026-09-07", 81.9);
    expect(getBodyweightLogsMock).toHaveBeenCalledTimes(1);
    expect(store.entries[0]).toEqual({ id: "bw-3", date: "2026-09-07", weightKg: 81.9 });
    expect(store.loaded).toBe(true);
  });
});
