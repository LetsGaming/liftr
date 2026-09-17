/**
 * The offline write queue. Every mutation from activeWorkoutStore is written to
 * IndexedDB first (optimistic, instant), then enqueued here. `flush()` POSTs the whole queue
 * to /api/sync and removes only the items the server confirms; anything that errors stays
 * queued for the next flush. This is what makes the logging loop survive a dead connection —
 * flush is best-effort and never blocks the UI.
 */
import { App as CapacitorApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { defineStore } from "pinia";
import { importNewHealthConnectWorkouts } from "../health/healthConnect";
import { enqueueOutboxItem, listOutboxItems, removeOutboxItem, type OutboxItem } from "../lib/idb";
import { isNative } from "../lib/platform";
import { postSyncBatch, type SyncResult } from "../services/syncService";

export type { SyncResult };

/** One verdict from a finish_workout flush — WorkoutPage.vue reads these straight off
 *  enqueueAndAwaitFlush()'s return value to build the finish sequence's rank-up beat. No queue/
 *  pub-sub needed now that recompute happens once at finish rather than streaming in per set. */
export type RankVerdict = NonNullable<SyncResult["ranks"]>[number];

/** Server's `syncBody` schema (`routes/sync.ts`) caps a single request at 200 items — chunk
 *  comfortably under that so a batch built from a stale/slow-changing `items` snapshot (another
 *  item could enqueue mid-flush) never risks tipping over the server's own limit. An outbox this
 *  large only happens after an extended offline stretch ("gym basement, no signal"), but when
 *  it does, sending the whole thing in one request meant every flush attempt 400'd forever —
 *  chunking is what keeps the queue draining instead of wedging permanently. */
const SYNC_CHUNK_SIZE = 150;

/** An item that's still erroring after this long stops being sent on every flush. Deliberately
 *  generous — it has to comfortably outlive the self-resolving `unknown_workout`/
 *  `unknown_workout_exercise` case from 04895e8, where the item is *expected* to error until its
 *  sibling start_workout/add_exercise lands, which normally happens within the same or next
 *  flush (seconds to minutes), not days. A genuinely permanent error (`implausible_set`, a
 *  workout that will never exist) is rare, but when it happens this is what stops it from
 *  retrying — and cluttering every future flush — forever. The item is never deleted (no data
 *  loss); it just stops being attempted and is counted in `stuckCount` so the UI has somewhere
 *  to surface it later. */
const STUCK_AFTER_MS = 72 * 60 * 60 * 1000; // 72h

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export const useSyncStore = defineStore("sync", {
  state: () => ({
    pendingCount: 0,
    /** Items that have been erroring for longer than STUCK_AFTER_MS and are no longer being
     *  retried automatically. Not surfaced in the UI yet (SyncIndicator.vue could be extended to
     *  show it), but the data is available. */
    stuckCount: 0,
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
        if (items.length === 0) {
          this.stuckCount = 0;
          return [];
        }

        this.pendingCount = items.length;
        const now = Date.now();
        const sendable = items.filter((item) => now - item.queuedAt <= STUCK_AFTER_MS);
        this.stuckCount = items.length - sendable.length;
        if (this.stuckCount > 0) {
          this.lastError = `${this.stuckCount} Eintrag/Einträge werden seit über 72 Stunden nicht synchronisiert und dauerhaft nicht mehr automatisch erneut versucht.`;
        }
        if (sendable.length === 0) return [];

        const allResults: SyncResult[] = [];
        for (const batch of chunk(sendable, SYNC_CHUNK_SIZE)) {
          const results = await postSyncBatch(batch.map(({ clientId, type, payload }) => ({ clientId, type, payload })));

          for (const r of results) {
            if (r.status === "created" || r.status === "already_synced") {
              await removeOutboxItem(r.clientId);
            } else if (r.status === "error") {
              // Left queued — retried on the next flush (e.g. a transient 500, or an
              // unknown_workout/unknown_workout_exercise waiting on a sibling item to land, per
              // 04895e8) unless/until it crosses STUCK_AFTER_MS above. Surfaced here (rather
              // than staying silent) so SyncIndicator.vue's "error" state can actually trigger —
              // previously only a thrown/network-level failure set lastError.
              this.lastError = r.error ?? "unknown_error";
            }
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

      if (isNative()) {
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
