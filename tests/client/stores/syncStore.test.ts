// @vitest-environment jsdom
//
// syncStore is the offline write queue/outbox (plan 1.3): every mutation is written to
// IndexedDB first, then enqueued here, and flush() POSTs the queue to /api/sync on reconnect.
// A prior High-severity bug (BUG-01) had flush() post the *entire* outbox in one request; once
// the queue grew past ~200 items the server's per-request cap rejected the whole batch every
// time, permanently wedging sync with no user-visible recovery. The fix chunks flush() into
// <=150-item batches (SYNC_CHUNK_SIZE) — these tests exercise the real queueing/flush/retry
// logic (not a thin wrapper) and specifically regression-test that failure mode, per
// .claude/agents/sync-correctness-reviewer.md.
//
// Mocked at their true external boundaries only: `~client/lib/idb` (no real IndexedDB under
// vitest), `~client/lib/api` (no real network — this also lets syncService.ts's own thin
// postSyncBatch wrapper run for real, so the store's chunking is exercised end-to-end through
// it), `~client/health/healthConnect` and the `@capacitor/*` native plugins (no native runtime).
// jsdom (not the default node environment) because the store reads `navigator.onLine` and
// registers `window` event listeners in startAutoFlush().
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  outbox,
  enqueueOutboxItemMock,
  listOutboxItemsMock,
  removeOutboxItemMock,
  apiPostMock,
  importNewHealthConnectWorkoutsMock,
  capacitorAppAddListenerMock,
  networkAddListenerMock,
  isNativePlatformMock,
} = vi.hoisted(() => {
  const outbox = new Map<string, { clientId: string; type: string; payload: unknown; queuedAt: number }>();
  return {
    outbox,
    enqueueOutboxItemMock: vi.fn(async (item: { clientId: string; type: string; payload: unknown; queuedAt: number }) => {
      outbox.set(item.clientId, item);
    }),
    listOutboxItemsMock: vi.fn(async () => Array.from(outbox.values())),
    removeOutboxItemMock: vi.fn(async (clientId: string) => {
      outbox.delete(clientId);
    }),
    apiPostMock: vi.fn(),
    importNewHealthConnectWorkoutsMock: vi.fn(),
    capacitorAppAddListenerMock: vi.fn(),
    networkAddListenerMock: vi.fn(),
    isNativePlatformMock: vi.fn(),
  };
});

vi.mock("~client/lib/idb", () => ({
  enqueueOutboxItem: enqueueOutboxItemMock,
  listOutboxItems: listOutboxItemsMock,
  removeOutboxItem: removeOutboxItemMock,
}));

vi.mock("~client/lib/api", () => ({
  api: { post: apiPostMock, get: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  apiBase: () => "",
  getToken: () => "",
  setToken: vi.fn(),
}));

vi.mock("~client/health/healthConnect", () => ({
  importNewHealthConnectWorkouts: importNewHealthConnectWorkoutsMock,
  isHealthConnectAvailable: vi.fn(() => false),
  requestHealthConnectPermissions: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: capacitorAppAddListenerMock },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock, getPlatform: () => "web" },
}));

vi.mock("@capacitor/network", () => ({
  Network: { addListener: networkAddListenerMock },
}));

import { useSyncStore } from "~client/stores/syncStore";
import type { SyncResult } from "~client/services/syncService";

const SYNC_CHUNK_SIZE = 150;

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

function seedOutbox(n: number, prefix = "c"): void {
  for (let i = 0; i < n; i++) {
    const clientId = `${prefix}-${String(i).padStart(4, "0")}`;
    outbox.set(clientId, { clientId, type: "log_set", payload: { i }, queuedAt: i });
  }
}

/** Waits out a macrotask so any already-in-flight promise chain (e.g. the fire-and-forget flush
 *  that startAutoFlush()/enqueue() kick off) fully settles before the test's own assertions or
 *  its own flush() call — otherwise the store's single-flight `flushing` guard silently no-ops
 *  the test's own call, since it doesn't distinguish who triggered the still-running flush. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  setActivePinia(createPinia());
  outbox.clear();
  enqueueOutboxItemMock.mockClear();
  listOutboxItemsMock.mockClear();
  removeOutboxItemMock.mockClear();
  apiPostMock.mockReset();
  importNewHealthConnectWorkoutsMock.mockReset();
  capacitorAppAddListenerMock.mockReset().mockResolvedValue(undefined);
  networkAddListenerMock.mockReset().mockResolvedValue(undefined);
  isNativePlatformMock.mockReset().mockReturnValue(false);
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncStore — initial state", () => {
  it("starts with no pending items, not flushing, no error", () => {
    const store = useSyncStore();

    expect(store.pendingCount).toBe(0);
    expect(store.flushing).toBe(false);
    expect(store.lastError).toBeNull();
  });
});

describe("syncStore — enqueue()", () => {
  it("stamps the item with queuedAt, writes it to the outbox, and updates pendingCount", async () => {
    setOnline(false); // keep the fire-and-forget flush from racing this test's assertions
    const store = useSyncStore();

    await store.enqueue({ clientId: "c1", type: "log_set", payload: { reps: 5 } });

    expect(enqueueOutboxItemMock).toHaveBeenCalledWith({
      clientId: "c1",
      type: "log_set",
      payload: { reps: 5 },
      queuedAt: expect.any(Number),
    });
    expect(store.pendingCount).toBe(1);
  });

  it("kicks off a background flush without the caller having to await it", async () => {
    apiPostMock.mockResolvedValue({ results: [{ clientId: "c1", status: "created" }] });
    const store = useSyncStore();

    await store.enqueue({ clientId: "c1", type: "log_set", payload: {} });
    await tick();

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(outbox.size).toBe(0);
  });
});

describe("syncStore — enqueueAndAwaitFlush()", () => {
  it("awaits the flush and returns this specific item's own result", async () => {
    apiPostMock.mockResolvedValue({ results: [{ clientId: "c-finish", status: "created" }] });
    const store = useSyncStore();

    const result = await store.enqueueAndAwaitFlush({ clientId: "c-finish", type: "finish_workout", payload: {} });

    expect(result).toEqual({ clientId: "c-finish", status: "created" });
    expect(store.pendingCount).toBe(0);
  });

  it("returns null and never calls the server when offline (queues for later instead)", async () => {
    setOnline(false);
    const store = useSyncStore();

    const result = await store.enqueueAndAwaitFlush({ clientId: "c-off", type: "finish_workout", payload: {} });

    expect(result).toBeNull();
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(store.pendingCount).toBe(1);
  });

  it("returns null when this item's clientId isn't present in the flushed round's results", async () => {
    apiPostMock.mockResolvedValue({ results: [{ clientId: "some-other-item", status: "created" }] });
    const store = useSyncStore();

    const result = await store.enqueueAndAwaitFlush({ clientId: "c-missing", type: "finish_workout", payload: {} });

    expect(result).toBeNull();
  });

  it("waits for an already-running flush to finish, then runs its own round that picks up the new item", async () => {
    let resolveFirst!: (v: { results: SyncResult[] }) => void;
    apiPostMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const store = useSyncStore();

    // Kick off a background flush that stays pending until we resolve it below.
    await store.enqueue({ clientId: "c-first", type: "log_set", payload: {} });
    await tick();
    expect(store.flushing).toBe(true);

    apiPostMock.mockResolvedValueOnce({ results: [{ clientId: "c-second", status: "created" }] });
    const resultPromise = store.enqueueAndAwaitFlush({ clientId: "c-second", type: "finish_workout", payload: {} });

    resolveFirst({ results: [{ clientId: "c-first", status: "created" }] });
    const result = await resultPromise;

    expect(result).toEqual({ clientId: "c-second", status: "created" });
    expect(apiPostMock).toHaveBeenCalledTimes(2);
  });
});

describe("syncStore — refreshPendingCount()", () => {
  it("re-reads pendingCount from the outbox", async () => {
    const store = useSyncStore();
    expect(store.pendingCount).toBe(0);

    seedOutbox(3);
    await store.refreshPendingCount();

    expect(store.pendingCount).toBe(3);
  });
});

describe("syncStore — flush()", () => {
  it("no-ops while offline, leaving the queue untouched", async () => {
    setOnline(false);
    seedOutbox(1);
    const store = useSyncStore();

    const result = await store.flush();

    expect(result).toBeUndefined();
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(outbox.size).toBe(1);
  });

  it("no-ops if a flush is already in progress (single-flight)", async () => {
    seedOutbox(1);
    let resolveFirst!: (v: { results: SyncResult[] }) => void;
    apiPostMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const store = useSyncStore();

    const firstFlush = store.flush();
    await tick();
    expect(store.flushing).toBe(true);

    const secondResult = await store.flush();
    expect(secondResult).toBeUndefined();

    resolveFirst({ results: [{ clientId: "c-0000", status: "created" }] });
    await firstFlush;
  });

  it("returns [] and calls the server nothing for an empty queue", async () => {
    const store = useSyncStore();

    const result = await store.flush();

    expect(result).toEqual([]);
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("removes only server-confirmed items (created/already_synced) and leaves error items queued for retry", async () => {
    seedOutbox(3);
    apiPostMock.mockResolvedValue({
      results: [
        { clientId: "c-0000", status: "created" },
        { clientId: "c-0001", status: "already_synced" },
        { clientId: "c-0002", status: "error", error: "validation failed" },
      ],
    });
    const store = useSyncStore();

    const results = await store.flush();

    expect(results).toHaveLength(3);
    expect(removeOutboxItemMock).toHaveBeenCalledWith("c-0000");
    expect(removeOutboxItemMock).toHaveBeenCalledWith("c-0001");
    expect(removeOutboxItemMock).not.toHaveBeenCalledWith("c-0002");
    expect(outbox.has("c-0002")).toBe(true);
    expect(store.pendingCount).toBe(1);
  });

  it("BUG-01 regression: an outbox larger than the server's per-request cap is chunked into multiple <=150-item batches instead of one oversized request that would 400 forever", async () => {
    seedOutbox(320);
    apiPostMock.mockImplementation(async (_path: string, body: { items: { clientId: string }[] }) => ({
      results: body.items.map((item) => ({ clientId: item.clientId, status: "created" as const })),
    }));
    const store = useSyncStore();

    const results = await store.flush();

    // 320 items at a 150-item chunk size -> 150 + 150 + 20 = 3 requests, none oversized.
    expect(apiPostMock).toHaveBeenCalledTimes(3);
    for (const call of apiPostMock.mock.calls) {
      const body = call[1] as { items: unknown[] };
      expect(body.items.length).toBeLessThanOrEqual(SYNC_CHUNK_SIZE);
      expect(body.items.length).toBeGreaterThan(0);
    }
    expect(results).toHaveLength(320);
    // The queue actually drains — this is the exact "wedges forever past 200 items" scenario.
    expect(outbox.size).toBe(0);
    expect(store.pendingCount).toBe(0);
  });

  it("a network failure partway through a multi-chunk flush leaves not-yet-confirmed items queued for retry, without losing or duplicating already-confirmed ones", async () => {
    seedOutbox(200); // 150 + 50 -> two chunks
    let callCount = 0;
    apiPostMock.mockImplementation(async (_path: string, body: { items: { clientId: string }[] }) => {
      callCount++;
      if (callCount === 1) {
        return { results: body.items.map((item) => ({ clientId: item.clientId, status: "created" as const })) };
      }
      throw new Error("network down");
    });
    const store = useSyncStore();

    const result = await store.flush();

    expect(result).toBeUndefined();
    expect(store.lastError).toBe("network down");
    // First chunk (150 items) was confirmed and removed...
    expect(outbox.size).toBe(50);
    // ...second chunk's 50 items are still queued, ready for the next flush attempt (no wedge).
    expect(store.pendingCount).toBe(50);
  });

  it("a retried flush after a partial failure drains the remaining items with no duplicate submissions of the first chunk", async () => {
    seedOutbox(200);
    let callCount = 0;
    apiPostMock.mockImplementation(async (_path: string, body: { items: { clientId: string }[] }) => {
      callCount++;
      if (callCount === 2) throw new Error("network down"); // second chunk fails on the first attempt
      return { results: body.items.map((item) => ({ clientId: item.clientId, status: "created" as const })) };
    });
    const store = useSyncStore();

    await store.flush(); // first attempt: chunk 1 succeeds, chunk 2 fails and stays queued
    expect(outbox.size).toBe(50);

    const secondAttemptResults = await store.flush(); // retry: only the remaining 50 are sent

    expect(secondAttemptResults).toHaveLength(50);
    expect(apiPostMock).toHaveBeenCalledTimes(3); // 1 (ok) + 1 (failed) + 1 (retry, ok)
    const lastCallBody = apiPostMock.mock.calls[2]![1] as { items: { clientId: string }[] };
    expect(lastCallBody.items).toHaveLength(50);
    expect(outbox.size).toBe(0);
    expect(store.pendingCount).toBe(0);
  });
});

describe("syncStore — startAutoFlush()", () => {
  it("immediately triggers a flush and a pendingCount refresh", async () => {
    seedOutbox(1);
    apiPostMock.mockResolvedValue({ results: [{ clientId: "c-0000", status: "created" }] });
    const store = useSyncStore();

    store.startAutoFlush();
    await tick();

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(store.pendingCount).toBe(0);
  });

  it("registers window 'online' and 'focus' listeners that each trigger a flush", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const store = useSyncStore();
    store.startAutoFlush();
    await tick(); // let the initial flush() from startAutoFlush itself finish (single-flight guard)

    const onlineHandler = addEventListenerSpy.mock.calls.find(([event]) => event === "online")?.[1] as () => void;
    const focusHandler = addEventListenerSpy.mock.calls.find(([event]) => event === "focus")?.[1] as () => void;
    expect(onlineHandler).toBeTypeOf("function");
    expect(focusHandler).toBeTypeOf("function");

    seedOutbox(1);
    apiPostMock.mockResolvedValue({ results: [{ clientId: "c-0000", status: "created" }] });
    apiPostMock.mockClear();

    onlineHandler();
    await tick();
    expect(apiPostMock).toHaveBeenCalledTimes(1);

    seedOutbox(1, "d");
    apiPostMock.mockClear();
    apiPostMock.mockResolvedValue({ results: [{ clientId: "d-0000", status: "created" }] });

    focusHandler();
    await tick();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it("on a native platform, registers Capacitor App 'resume' and Network 'networkStatusChange' listeners", () => {
    isNativePlatformMock.mockReturnValue(true);
    const store = useSyncStore();

    store.startAutoFlush();

    expect(capacitorAppAddListenerMock).toHaveBeenCalledWith("resume", expect.any(Function));
    expect(networkAddListenerMock).toHaveBeenCalledWith("networkStatusChange", expect.any(Function));
  });

  it("does not register native-only listeners on a non-native platform", () => {
    isNativePlatformMock.mockReturnValue(false);
    const store = useSyncStore();

    store.startAutoFlush();

    expect(capacitorAppAddListenerMock).not.toHaveBeenCalled();
    expect(networkAddListenerMock).not.toHaveBeenCalled();
  });

  it("the 'resume' listener triggers both a flush and a Health Connect import check", async () => {
    isNativePlatformMock.mockReturnValue(true);
    apiPostMock.mockResolvedValue({ results: [] });
    const store = useSyncStore();
    store.startAutoFlush();
    await tick();

    const resumeHandler = capacitorAppAddListenerMock.mock.calls.find(([event]) => event === "resume")?.[1] as () => void;
    expect(resumeHandler).toBeTypeOf("function");

    resumeHandler();
    await tick();

    expect(importNewHealthConnectWorkoutsMock).toHaveBeenCalledTimes(1);
  });

  it("the networkStatusChange listener only flushes once connectivity actually returns", async () => {
    isNativePlatformMock.mockReturnValue(true);
    apiPostMock.mockResolvedValue({ results: [] });
    const store = useSyncStore();
    store.startAutoFlush();
    await tick();

    const networkHandler = networkAddListenerMock.mock.calls.find(([event]) => event === "networkStatusChange")?.[1] as (status: {
      connected: boolean;
    }) => void;
    expect(networkHandler).toBeTypeOf("function");

    seedOutbox(1);
    apiPostMock.mockClear();

    networkHandler({ connected: false });
    await tick();
    expect(apiPostMock).not.toHaveBeenCalled();

    apiPostMock.mockResolvedValue({ results: [{ clientId: "c-0000", status: "created" }] });
    networkHandler({ connected: true });
    await tick();
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });
});
