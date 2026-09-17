/**
 * IndexedDB layer for offline support. Two stores:
 *  - `outbox`: queued mutations, flushed to POST /api/sync on reconnect.
 *  - `activeWorkout`: the in-progress workout, written on every mutation so a crash or a
 *    locked phone mid-set loses nothing.
 * This is the only place raw IndexedDB access happens — everything else goes through the
 * Pinia stores in ./stores/.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface OutboxItem {
  clientId: string;
  type: "start_workout" | "log_set" | "finish_workout" | "add_exercise";
  payload: unknown;
  queuedAt: number;
}

interface LiftrIDB extends DBSchema {
  outbox: {
    key: string; // clientId
    value: OutboxItem;
  };
  activeWorkout: {
    key: "current";
    value: unknown; // ActiveWorkoutState, typed in the store — kept loose here to avoid a cycle
  };
}

let dbPromise: Promise<IDBPDatabase<LiftrIDB>> | null = null;

function getDb() {
  dbPromise ??= openDB<LiftrIDB>("liftr", 1, {
    upgrade(db) {
      db.createObjectStore("outbox", { keyPath: "clientId" });
      db.createObjectStore("activeWorkout");
    },
  });
  return dbPromise;
}

export async function enqueueOutboxItem(item: OutboxItem) {
  const db = await getDb();
  await db.put("outbox", item);
}

export async function listOutboxItems(): Promise<OutboxItem[]> {
  const db = await getDb();
  const items = await db.getAll("outbox");
  // ponytail: in-memory sort, fine up to a few hundred items; add an IDB index if the outbox
  // ever grows large. getAll() returns rows in clientId (UUID) key order, not queue order.
  return items.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeOutboxItem(clientId: string) {
  const db = await getDb();
  await db.delete("outbox", clientId);
}

export async function saveActiveWorkout(state: unknown) {
  const db = await getDb();
  await db.put("activeWorkout", state, "current");
}

/**
 * `isValid` is a caller-supplied runtime shape guard, not just a type param — a stale/mid-migration
 * persisted value (an older app version's shape) must not be trusted straight into typed state.
 * The store type (ActiveWorkoutState) can't be imported here without a cycle, so the check lives
 * with the caller; a value that fails it is treated the same as "not cached" rather than crashing.
 */
export async function loadActiveWorkout<T>(isValid: (value: unknown) => value is T): Promise<T | undefined> {
  const db = await getDb();
  const value = await db.get("activeWorkout", "current");
  return isValid(value) ? value : undefined;
}

export async function clearActiveWorkout() {
  const db = await getDb();
  await db.delete("activeWorkout", "current");
}
