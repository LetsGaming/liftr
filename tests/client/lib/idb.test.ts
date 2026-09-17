import { describe, expect, it, vi } from "vitest";

// idb.ts is the only place raw IndexedDB access happens; it wraps the `idb` package, which
// itself needs a real `indexedDB` global that doesn't exist under vitest's default node
// environment. Mock `idb`'s openDB so these tests exercise idb.ts's own logic — the store/key
// shaping and the getDb() memoization — without touching a real database.
//
// vi.mock factories are hoisted above the rest of the file, so any mock fn/state they reference
// must come from vi.hoisted() — plain top-level `const`s would still be in their temporal dead
// zone when the (hoisted) factory actually runs.
const { openDBMock, putMock, getAllMock, deleteMock, getMock, getCapturedUpgrade } = vi.hoisted(() => {
  let capturedUpgrade: ((db: { createObjectStore: (...args: unknown[]) => unknown }) => void) | undefined;
  const putMock = vi.fn();
  const getAllMock = vi.fn();
  const deleteMock = vi.fn();
  const getMock = vi.fn();
  const openDBMock = vi.fn((_name: string, _version: number, options?: { upgrade?: typeof capturedUpgrade }) => {
    capturedUpgrade = options?.upgrade;
    return Promise.resolve({ put: putMock, getAll: getAllMock, delete: deleteMock, get: getMock });
  });
  return { openDBMock, putMock, getAllMock, deleteMock, getMock, getCapturedUpgrade: () => capturedUpgrade };
});

vi.mock("idb", () => ({
  openDB: openDBMock,
}));

import {
  clearActiveWorkout,
  enqueueOutboxItem,
  listOutboxItems,
  loadActiveWorkout,
  removeOutboxItem,
  saveActiveWorkout,
} from "~client/lib/idb";

describe("idb", () => {
  // Runs first so it's the call that actually triggers getDb()'s openDB() — every function under
  // test shares one memoized connection, so this also anchors the "opened only once" assertion
  // at the bottom of this file.
  it("opens the 'liftr' database at version 1 and creates both object stores on upgrade", async () => {
    await enqueueOutboxItem({ clientId: "c1", type: "log_set", payload: { reps: 5 }, queuedAt: 1 });

    expect(openDBMock).toHaveBeenCalledWith("liftr", 1, expect.objectContaining({ upgrade: expect.any(Function) }));
    expect(getCapturedUpgrade()).toBeTypeOf("function");

    const createObjectStoreMock = vi.fn();
    getCapturedUpgrade()!({ createObjectStore: createObjectStoreMock });
    expect(createObjectStoreMock).toHaveBeenCalledWith("outbox", { keyPath: "clientId" });
    expect(createObjectStoreMock).toHaveBeenCalledWith("activeWorkout");
  });

  it("enqueueOutboxItem puts the item into the outbox store keyed by its own clientId field", async () => {
    const item = { clientId: "c2", type: "finish_workout" as const, payload: { notes: "leg day" }, queuedAt: 42 };
    await enqueueOutboxItem(item);
    expect(putMock).toHaveBeenCalledWith("outbox", item);
  });

  it("listOutboxItems returns whatever the outbox store's getAll resolves to", async () => {
    getAllMock.mockResolvedValueOnce([{ clientId: "a", type: "log_set", payload: {}, queuedAt: 1 }]);
    const result = await listOutboxItems();
    expect(getAllMock).toHaveBeenCalledWith("outbox");
    expect(result).toEqual([{ clientId: "a", type: "log_set", payload: {}, queuedAt: 1 }]);
  });

  it("listOutboxItems sorts by queuedAt ascending, not by getAll's (UUID key) order", async () => {
    // getAll on a clientId-keyed store returns rows in ascending UUID order, which has nothing
    // to do with when the items were actually queued — these clientIds are deliberately NOT in
    // queuedAt order, mirroring a real offline session's start_workout/log_set/finish_workout
    // sequence, each minted with a fresh random UUID.
    getAllMock.mockResolvedValueOnce([
      { clientId: "b-uuid", type: "finish_workout", payload: {}, queuedAt: 300 },
      { clientId: "a-uuid", type: "start_workout", payload: {}, queuedAt: 100 },
      { clientId: "c-uuid", type: "log_set", payload: {}, queuedAt: 200 },
    ]);
    const result = await listOutboxItems();
    expect(result.map((r) => r.clientId)).toEqual(["a-uuid", "c-uuid", "b-uuid"]);
  });

  it("removeOutboxItem deletes the outbox entry by clientId", async () => {
    await removeOutboxItem("c3");
    expect(deleteMock).toHaveBeenCalledWith("outbox", "c3");
  });

  it("saveActiveWorkout puts the state under the fixed 'current' key", async () => {
    const state = { workoutId: "w1" };
    await saveActiveWorkout(state);
    expect(putMock).toHaveBeenCalledWith("activeWorkout", state, "current");
  });

  const alwaysValid = (value: unknown): value is unknown => value !== undefined;

  it("loadActiveWorkout reads the fixed 'current' key", async () => {
    getMock.mockResolvedValueOnce({ workoutId: "w1" });
    const result = await loadActiveWorkout(alwaysValid);
    expect(getMock).toHaveBeenCalledWith("activeWorkout", "current");
    expect(result).toEqual({ workoutId: "w1" });
  });

  it("loadActiveWorkout resolves undefined when nothing was saved", async () => {
    getMock.mockResolvedValueOnce(undefined);
    const result = await loadActiveWorkout(alwaysValid);
    expect(result).toBeUndefined();
  });

  it("loadActiveWorkout resolves undefined when the saved value fails the shape guard", async () => {
    getMock.mockResolvedValueOnce({ notWhatWeExpect: true });
    const result = await loadActiveWorkout((value): value is unknown => typeof value === "string");
    expect(result).toBeUndefined();
  });

  it("clearActiveWorkout deletes the fixed 'current' key", async () => {
    await clearActiveWorkout();
    expect(deleteMock).toHaveBeenCalledWith("activeWorkout", "current");
  });

  it("memoizes the db connection: every operation above shares a single openDB() call", () => {
    expect(openDBMock).toHaveBeenCalledTimes(1);
  });
});
