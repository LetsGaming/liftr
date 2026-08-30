/**
 * The offline write queue (plan 1.3). Every mutation from activeWorkoutStore is written to
 * IndexedDB first (optimistic, instant), then enqueued here. `flush()` POSTs the whole queue
 * to /api/sync and removes only the items the server confirms; anything that errors stays
 * queued for the next flush. This is what makes the logging loop survive a dead connection —
 * flush is best-effort and never blocks the UI.
 */
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { defineStore } from "pinia";
import { importNewHealthConnectWorkouts } from "../health/healthConnect";
import { enqueueOutboxItem, listOutboxItems, removeOutboxItem, type OutboxItem } from "../lib/idb";
import { postSyncBatch, type SyncResult } from "../services/syncService";

export type { SyncResult };

/** One verdict from a finish_workout flush — WorkoutPage.vue reads these straight off
 *  enqueueAndAwaitFlush()'s return value to build the finish sequence's rank-up beat. No queue/
 *  pub-sub needed now that recompute happens once at finish rather than streaming in per set. */
export type RankVerdict = NonNullable<SyncResult["ranks"]>[number];

/** Server's `syncBody` schema (`routes/sync.ts`) caps a single request at 200 items — chunk
 *  comfortably under that so a batch built from a stale/slow-changing `items` snapshot (another
 *  item could enqueue mid-flush) never risks tipping over the server's own limit. An outbox this
 *  large only happens after an extended offline stretch (plan §2's "gym basement, no signal"),
 *  but when it does, sending the whole thing in one request meant every flush attempt 400'd
 *  forever — chunking is what keeps the queue draining instead of wedging permanently. */
const SYNC_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export const useSyncStore = defineStore("sync", {
  state: () => ({
    pendingCount: 0,
    flushing: false,
    lastError: null as string | null,
  }),
  actions: {
    async enqueue(item: Omit<OutboxItem, "queuedAt">) {
      await enqueueOutboxItem({ ...item, queuedAt: Date.now() });
      this.pendingCount = (await listOutboxItems()).length;
      // fire-and-forget: don't make the caller (a set-log tap) wait on the network
      void this.flush();
    },

    /**
     * Same as enqueue(), but awaits the flush and hands back this specific item's own result —
     * used for finish_workout, whose response now carries the workout's rank verdicts (moved
     * from per-set to per-workout). The finish screen needs those verdicts *before* it decides
     * what to show, unlike every other mutation which is fire-and-forget. Returns null if
     * offline (flush() no-ops until connectivity returns) or if this item didn't make it into
     * the round that ran — the caller falls back to showing no rank-ups for that session rather
     * than blocking; a later background flush still lands the workout itself either way.
     */
    async enqueueAndAwaitFlush(item: Omit<OutboxItem, "queuedAt">): Promise<SyncResult | null> {
      await enqueueOutboxItem({ ...item, queuedAt: Date.now() });
      this.pendingCount = (await listOutboxItems()).length;
      if (!navigator.onLine) return null;
      // Don't race an already-running flush (e.g. an auto-flush triggered by a "focus" event) —
      // wait for it to clear, then run our own, which will pick up the item we just queued.
      while (this.flushing) await new Promise((r) => setTimeout(r, 50));
      const results = await this.flush();
      return results?.find((r) => r.clientId === item.clientId) ?? null;
    },

    async refreshPendingCount() {
      this.pendingCount = (await listOutboxItems()).length;
    },

    async flush(): Promise<SyncResult[] | undefined> {
      if (this.flushing || !navigator.onLine) return undefined;
      this.flushing = true;
      this.lastError = null;
      try {
        const items = await listOutboxItems();
        if (items.length === 0) return [];

        const allResults: SyncResult[] = [];
        for (const batch of chunk(items, SYNC_CHUNK_SIZE)) {
          const results = await postSyncBatch(batch.map(({ clientId, type, payload }) => ({ clientId, type, payload })));

          for (const r of results) {
            if (r.status === "created" || r.status === "already_synced") {
              await removeOutboxItem(r.clientId);
            }
            // status "error" is left queued — retried on the next flush (e.g. a transient 500)
          }
          allResults.push(...results);
          this.pendingCount = (await listOutboxItems()).length;
        }
        return allResults;
      } catch (err) {
        // network failure mid-flush: everything stays queued, retried next time we're online —
        // including any later batch this chunk loop hadn't reached yet.
        this.lastError = (err as Error).message;
        return undefined;
      } finally {
        this.flushing = false;
      }
    },

    startAutoFlush() {
      // Web listeners: fine as a browser fallback, but a WebView's window doesn't reliably
      // get "focus" on app-foreground the way a browser tab does — that's what the Capacitor
      // listeners below are for on native.
      window.addEventListener("online", () => void this.flush());
      window.addEventListener("focus", () => void this.flush());

      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.addListener("resume", () => {
          void this.flush();
          void importNewHealthConnectWorkouts();
        });
        void Network.addListener("networkStatusChange", (status) => {
          if (status.connected) void this.flush();
        });
      }

      void this.flush();
      void this.refreshPendingCount();
    },
  },
});
