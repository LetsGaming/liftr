/**
 * IndexedDB layer for offline (plan 1.3). Two stores:
 *  - `outbox`: queued mutations, flushed to POST /api/sync on reconnect.
 *  - `activeWorkout`: the in-progress workout, written on every mutation so a crash or a
 *    locked phone mid-set loses nothing (plan 1.5).
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
  return db.getAll("outbox");
}

export async function removeOutboxItem(clientId: string) {
  const db = await getDb();
  await db.delete("outbox", clientId);
}

export async function saveActiveWorkout(state: unknown) {
  const db = await getDb();
  await db.put("activeWorkout", state, "current");
}

export async function loadActiveWorkout<T>(): Promise<T | undefined> {
  const db = await getDb();
  return db.get("activeWorkout", "current") as Promise<T | undefined>;
}

export async function clearActiveWorkout() {
  const db = await getDb();
  await db.delete("activeWorkout", "current");
}
