# Sync and offline

Liftr is a single-user PWA meant to work at the gym, including in a basement with no signal. The
entire core logging loop — start a workout, log a set, finish — has to survive being offline
without the user noticing, and reconcile cleanly once connectivity returns. This document covers
how that actually works: the client-side write queue, the server-side reconciliation, and a real
bug (now fixed) that's worth understanding if you touch either side.

## The shape of the problem

The client never blocks on the network for a logging action. Every mutation is written to
IndexedDB first (optimistic, instant), then queued for a background flush to the server. This is
what makes "log a set in 1–2 taps" (the app's core promise, `audit/finished/liftr-audit.md` §1)
true even with a dead connection.

## IndexedDB: the two local stores

`packages/client/src/lib/idb.ts` is the **only** place raw IndexedDB access happens — everything
else goes through the Pinia stores that wrap it. Two object stores, one database (`liftr`):

- **`outbox`** — queued mutations, keyed by client-generated `clientId`. Each `OutboxItem` is
  `{ clientId, type, payload, queuedAt }`, where `type` is one of `"start_workout" | "log_set" |
  "finish_workout" | "add_exercise"`.
- **`activeWorkout`** — a single-row snapshot of the in-progress workout, overwritten on every
  mutation. This is crash recovery: a reload mid-workout (dead battery, app killed, browser
  crash) resumes at the exact same exercise/set/elapsed time rather than losing the session.

## Client-generated IDs: why sync doesn't need a round trip to start

Every `start_workout` and `add_exercise` item carries an `id` minted **on-device**
(`crypto.randomUUID()`), not assigned by the server. This is deliberate: it's what makes even
*starting* a workout offline-capable. The client never needs a round trip just to get an ID back
before it can start logging sets against `workout_exercise` rows that reference it — see
`packages/server/src/routes/sync.ts`'s comment on `startWorkoutPayload.id`.

The server upserts on this client-generated ID (and on `clientId` for individual items), which is
what makes replaying the same batch twice — e.g. after a flaky connection retries a request that
actually succeeded — a safe no-op the second time. `syncService.ts`'s module comment states this
plainly: "never a duplicate set, workout, or run."

## The outbox store: `syncStore.ts`

`packages/client/src/stores/syncStore.ts` owns the flush lifecycle:

- **`enqueue(item)`** — writes to IndexedDB, updates the pending count, then fires `flush()`
  without awaiting it. A set-log tap never waits on the network.
- **`enqueueAndAwaitFlush(item)`** — used only by `finish_workout`, whose sync response now
  carries the workout's rank verdicts (see [rank-engine.md](./rank-engine.md)). The finish screen
  needs those verdicts *before* deciding what reward beat to show, so this variant awaits the
  flush and hands back that specific item's result. It returns `null` if offline, or if a
  concurrent flush already in progress didn't happen to include this item — the caller falls back
  to showing no rank-ups for that session rather than blocking; a later background flush still
  lands the workout regardless.
- **`flush()`** — POSTs the whole outbox to `/api/sync`, and removes only the items the server
  confirms (`"created"` or `"already_synced"`). Anything the server returns as `"error"` for stays
  queued and is retried on the next flush — a transient 500 doesn't lose data.

Flush is triggered from several places: right after every `enqueue`, on the browser's `online`/
`focus` events, on Capacitor's native `resume` event (a WebView's `window` doesn't reliably fire
`focus` on app-foreground the way a browser tab does), and on `Network.addListener`
(`networkStatusChange`) for native connectivity changes.

## The 200-item wedge, and why the queue chunks

`routes/sync.ts`'s request schema caps a single `/api/sync` request at 200 items
(`syncBody = z.object({ items: z.array(syncItem).min(1).max(200) })`). This existed to bound a
single request's size — reasonable in isolation, but it created a real, previously-shipped bug:
if the outbox ever grew past 200 items (an extended offline stretch — the "gym basement, no
signal" scenario this whole system exists for), the client tried to send the *entire* queue in
one request, which the server rejected outright. Every subsequent flush attempt hit the same
400, forever — the queue could **wedge permanently**, with no automatic recovery.

The fix, in `syncStore.ts`:

```ts
const SYNC_CHUNK_SIZE = 150;
```

`flush()` now chunks the outbox into batches of 150 (comfortably under the server's 200-item
cap — there's headroom because another item can enqueue mid-flush, and the chunking has to stay
safe against a batch built from a now-stale snapshot of `items`) and POSTs each chunk in
sequence, removing confirmed items and updating `pendingCount` after every chunk. If a chunk fails
outright (a network error, not a per-item `"error"` result), everything from that chunk onward
stays queued for the next flush attempt — nothing is lost, and the queue keeps draining instead of
wedging. See `syncStore.ts`'s comment directly above `SYNC_CHUNK_SIZE` for this history in the
source itself.

**If you touch either side of this boundary** (the outbox/chunking logic in `syncStore.ts`/
`idb.ts`, or the batch size / schema in `routes/sync.ts`), be aware this exact area has already
produced one real production-affecting bug — it's worth a second look before merging a change
here.

## Server-side: `routes/sync.ts` and `syncService.ts`

The route itself is thin by design — "validate the batch shape, call the service, return its
results" (the route's own comment). `syncItem` is a Zod discriminated union on `type`, so each of
the four item types gets its own strictly-typed payload schema
(`startWorkoutPayload`/`logSetPayload`/`finishWorkoutPayload`/`addExercisePayload`).

`applySyncBatch` (`packages/server/src/services/syncService.ts`) applies each item in order,
catching any unexpected exception **per item** so one bad entry in a batch doesn't fail its
siblings — an unexpected error becomes an `"error"` result for that single item, not an aborted
batch. Each `applyXItem` function follows the same idempotency pattern: look up by
`clientId`/client-generated `id` first, and if it already exists, return `"already_synced"`
instead of re-inserting.

A few things worth knowing about what happens inside `applyFinishWorkout` specifically, since
it's the heaviest handler:

- **Rank recompute moved from per-set to per-workout.** Older behavior recomputed rank after
  *every* logged set, so a session with many sets on one exercise paid the recompute repeatedly
  and rank-ups fired mid-set instead of reading as one end-of-workout moment. Now it runs exactly
  once per exercise that had at least one non-warmup set logged this session, when the workout
  finishes — see [rank-engine.md](./rank-engine.md) for what the recompute itself does.
- **The plausibility gate is computed once, up front**, from the whole session's sets, before the
  per-exercise recompute loop — see [rank-engine.md](./rank-engine.md#the-plausibility-gate).
- **Streak credit and the two XP session bonuses are computed here too** — see
  [xp-and-streaks.md](./xp-and-streaks.md#how-it-all-connects-at-finish-time) for that sequence.
- **`kind` (normal/warmup/failure/dropset) replaces a standalone `isWarmup` boolean on the wire**,
  but `isWarmup` is still the column every rank/XP/history query filters on directly — it's
  derived from `kind` inside `applyLogSet` (`isWarmup: item.payload.kind === "warmup"`) rather
  than sent independently, so client and server can never disagree about whether a given `kind`
  counts as a warmup.

### Defense-in-depth: the plausibility ceiling on individual sets

`applyLogSet` checks `weightKg`/`reps` against `MAX_PLAUSIBLE_WEIGHT_KG`/`MAX_PLAUSIBLE_REPS`
(exported from `@liftr/shared` so the client can clamp its steppers to the same ceiling — a normal
UI flow should never actually hit this server-side branch). This check runs inside the service,
not as a Zod schema constraint, deliberately: the batch schema validates the whole array
atomically, so a schema-level `.max()` on one field would fail every item in the batch — including
an unrelated `finish_workout` — over a single bad set. Checking it per-item inside the handler
means one implausible set becomes one `"error"` result, not a whole-batch rejection.

## Further reading

- `packages/client/src/lib/idb.ts`, `packages/client/src/stores/syncStore.ts` — client-side
  queue and flush logic.
- `packages/server/src/routes/sync.ts`, `packages/server/src/services/syncService.ts` — server-side
  validation and reconciliation.
- [rank-engine.md](./rank-engine.md), [xp-and-streaks.md](./xp-and-streaks.md) — what actually
  happens inside `applyFinishWorkout`'s rank/XP/streak computation.
