# 0003. Offline-first sync via an IndexedDB outbox queue

**Date:** initial build
**Status:** Accepted

## Context

Liftr's core loop is logging a set mid-workout, and the app explicitly needs to survive "a dead
connection" — the README's own framing is logging a set "with zero signal in a basement gym" and
having it sync once back online. A gym is a plausible dead zone; blocking the logging UI on a
network round-trip, or losing data typed while offline, would violate the app's own "logging sets
fast enough that using it doesn't feel like a chore" design rule.

## Decision

Every mutation from the active workout store is written to IndexedDB first — optimistic, instant,
no network wait — then enqueued in an outbox (`packages/client/src/stores/syncStore.ts`).
`flush()` POSTs the queued items to `/api/sync` and removes only the items the server confirms;
anything that errors stays queued for the next flush. Flush is triggered opportunistically (on
`online`/`focus` browser events, on Capacitor `resume`/network-change on native, and
fire-and-forget after every enqueue) and is always best-effort — it never blocks the UI.

The service worker layer (`packages/client/vite.config.ts`) complements this at the HTTP-caching
level: the app shell is precached, the exercise catalog and images use `CacheFirst`, and other API
GETs use `StaleWhileRevalidate`, so reads keep working offline too, not just writes.

The outbox batches requests in chunks of 150 (`SYNC_CHUNK_SIZE`), comfortably under the server's
200-item-per-request cap (`routes/sync.ts`) — added after a real bug where an extended offline
stretch could build a queue large enough that every flush attempt 400'd forever, permanently
wedging the sync queue.

## Consequences

- The client and server both need to be able to recompute rank purely from synced data,
  identically — `tiers.ts`'s pure-function design exists specifically so the client can compute
  optimistically offline and the server can recompute authoritatively after sync with guaranteed-
  identical results.
- Every mutation needs a stable `clientId` so the server can dedupe (`already_synced`) rather than
  double-apply a retried item.
- The queue-size ceiling is a real constraint that already caused one production-shaped bug
  (permanent wedge past 200 items) — the sync-correctness review agent for this codebase
  specifically calls this class of regression out as high-severity and worth re-checking on any
  change to either side of the sync boundary.
- `finish_workout` is the one exception to "fire and forget": the finish screen needs rank
  verdicts back before it can render the finish sequence, so that specific call awaits its own
  flush result rather than firing and moving on.
