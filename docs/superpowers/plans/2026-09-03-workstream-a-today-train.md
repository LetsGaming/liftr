# Workstream A: Today/Train — Implementation Plan

## Goal

Rebuild Liftr's highest-frequency surface — the Today (home) screen and the Active Workout
("Train") screen, the ~30×/session logging loop — on top of Foundation's primitives and the
already-implemented Nebula visual layer, closing the RPE/notes/PR-adjacent gaps Plan C and
`workplan-v1.md` §4 both flagged, without regressing the offline-first, no-blocking-network
posture that makes this loop trustworthy mid-workout.

This is **functional/structural work on an existing visual skin**, not a redesign. Nebula's
color/gradient/glow rules for this screen are already shipped (`audit/nebula-design-layout.md`
§0-§2) — the set-kind picker, rest-timer ring, and log-set button already carry their Nebula
treatment. Nothing in this plan touches `--nebula-*` tokens, adds glow to the log-set button, or
otherwise revisits the visual layer; every task below is either new UI (RPE, notes, jump rail,
mid-session controls) built to match the existing Nebula/`.panel`/`.btn-*` conventions already in
these files, or a behavioral fix to something already on screen.

## Architecture

Vue 3 + `<script setup>` + Ionic components (`IonPage`/`IonContent`/`IonModal` via `SheetModal.vue`)
+ Pinia stores, offline-first via an IndexedDB-backed outbox (`syncStore.ts`). State machine for
an active session lives entirely client-side in `activeWorkoutStore.ts`, persisted to IndexedDB on
every mutation (`persist()`), and is the single source of truth `WorkoutPage.vue` renders off of.
Server sync is fire-and-forget (`sync.enqueue`) except `finish`, which is the one awaited network
call in the whole loop (`sync.enqueueAndAwaitFlush`).

## Tech Stack

Vue 3 (`<script setup>`, Composition API), TypeScript, Pinia, Ionic Vue, Capacitor
(`@capacitor/local-notifications`, `@capacitor/network`), IndexedDB via `../lib/idb`, Vitest for
unit/component tests (existing convention — check `packages/client` for `*.spec.ts` alongside
components/stores before writing new tests, match existing patterns).

## Spec

- `docs/superpowers/plans/2026-09-03-full-rebuild-orchestration.md` §3.1 (this workstream's scope
  and dependency: Foundation, plan file `docs/superpowers/plans/2026-09-03-foundation-primitives.md`
  — **that plan may not exist yet**; this plan treats Foundation's primitives (`ThumbZoneAction`,
  density-mode prop, `TruncatingLabel`, rebuilt `useCountUp`/`useCelebrate`, the `tap`/`bump`/
  `success` haptic vocabulary, the 44×44px touch-target token, `prefers-reduced-motion` gating) as
  a named, expected-interface dependency, not something this plan re-derives or blocks on.
- `audit/plan-c-new-ui-rebuild.md` §3 Phase 1 (full original spec: readiness hero, streak/tokens
  chip framing, routine-start cards, active-workout screen inventory, RPE/notes, sync indicator).
- `audit/workplan-v1.md` §4 (RPE/notes folded in here since scoped to this exact screen) — **its
  own caution stands and is repeated here**: RPE/notes surfacing rests on an inference (data
  exists → worth surfacing), not a demonstrated engagement gap. It is Plan A's own "most
  speculative phase." Ship it as a dismissible, low-cost, easily-reversible experiment; zero
  adoption is a valid outcome, not a phase failure.
- `audit/nebula-design-layout.md` §0-§2 (Nebula's already-implemented visual layer for nav/Today/
  Train — build functional changes on top of it, do not redo or revisit it).

## Global Constraints

1. **No blocking network calls in Train.** Every mutation during an active session
   (`logCurrentSet`, `setSetKind`, `removeSet`, `addExercise`, `togglePause`, `skipCurrentExercise`,
   `insertWarmupSets`, `jumpToExercise`) writes to IndexedDB synchronously and enqueues its sync
   item fire-and-forget (`sync.enqueue`, not awaited by the caller). The **only** exception,
   already correct in the codebase, is `finish()`, which awaits `sync.enqueueAndAwaitFlush` because
   the finish sequence needs real rank verdicts before it can render. Every new task in this plan
   that touches the active-session path must follow the same fire-and-forget pattern — RPE/notes
   capture included.
2. **Three distinct rest-timer states**, produced by `activeWorkoutStore.logCurrentSet()`'s return
   value: `restBetweenSetsSeconds` (same exercise, another set to go), `restAfterExerciseSeconds`
   (exercise/superset-group finished, moving to the next), and `null` (mid-superset round-robin,
   round not yet complete — no rest). `RestTimer.vue` must render all three as visibly distinct,
   not just "timer running vs not."
3. **Bodyweight-null-vs-zero must render visibly different affordances.** `ActiveSet.weightKg`
   is `null` for a plain bodyweight exercise with no tracked weight at all, and `0`+ for a tracked
   value (including "extra kg" on a weighted bodyweight movement). `SetEntry.vue` already gates the
   weight `NumberStepper` on `v-if="store.currentSet.weightKg !== null"` — correct behavior, must
   not regress. This constraint is about not accidentally coercing `null` to `0` anywhere new code
   touches (RPE capture, notes, jump rail set counts, etc.).
4. **RPE/notes must never add a required tap to the ~30×/session logging loop.** Both must be
   reachable without blocking or slowing `logSet()`. The existing `Satz speichern` button's enabled
   condition (`store.currentSet.reps <= 0` → disabled) must not gain any new precondition.

---

## Task 1 — Extend the sync/store contract for `rpe` and set-level `notes`

**Files:**
- `packages/client/src/stores/activeWorkoutStore.ts`
- `packages/client/src/stores/activeWorkoutStore.spec.ts` (create if no existing spec file — check
  first: `Glob packages/client/src/stores/*.spec.ts`)

**Context:** `packages/server/src/routes/sync.ts`'s `logSetPayload` already accepts optional
`rpe: z.number().nullable().optional()` and `notes: z.string().nullable().optional()` (confirmed
by reading the file directly — lines 31-40) — no server/schema work needed for set-level RPE/notes.
`ActiveSet` (`activeWorkoutStore.ts`) has no `rpe`/`notes` fields yet, and `logCurrentSet()`'s
`sync.enqueue` payload does not send them. This task only adds the client-side plumbing; Task 4
adds the UI that writes into it.

- [ ] Add `rpe: number | null` and `notes: string | null` to the `ActiveSet` interface, both
      defaulting to `null` everywhere a set is constructed (`start()`, `addExercise()`,
      `insertWarmupSets()`'s warm-up sets — warm-ups get `notes: null, rpe: null` too, no special
      case).
- [ ] Add a `setCurrentSetRpe(rpe: number | null)` action: writes `this.currentSet.rpe`,
      `persist(this.$state)`. No sync enqueue here — RPE is only sent as part of the `log_set`
      payload when the set is actually logged (matches how `weightKg`/`reps` already work; there is
      no partial-set sync path today and this plan does not add one).
- [ ] Add a `setCurrentSetNotes(notes: string | null)` action: same shape, writes
      `this.currentSet.notes`, `persist(this.$state)`.
- [ ] In `logCurrentSet()`, include `rpe: set.rpe` and `notes: set.notes` in the `sync.enqueue`
      payload alongside the existing `weightKg`/`reps`/`kind`/`loggedAt` fields.
- [ ] `restore()`'s backfill block (the one that already backfills `kind` and
      `rest*Seconds` for pre-existing persisted sessions) gets a matching backfill: `if (s.rpe ===
      undefined) s.rpe = null;` / `if (s.notes === undefined) s.notes = null;` — same reasoning as
      the existing backfills, a workout persisted before this field existed must not crash the RPE
      chip's render.
- [ ] Test: a set with `rpe: 8, notes: "felt heavy"` logged via `logCurrentSet()` produces a
      `sync.enqueue` call whose payload includes both fields; a set with neither set produces
      `rpe: null, notes: null` (not `undefined` — the zod schema is `.nullable().optional()` but
      sending explicit `null` is simpler to reason about than omitting keys).

## Task 2 — Workout-level notes: pick and implement the sync path

**Files:**
- `packages/client/src/stores/activeWorkoutStore.ts`
- `packages/server/src/routes/sync.ts` (only if the "extend `finish_workout`" option below is
  chosen — flagged explicitly since this touches a shared file per the orchestration plan's file-
  boundary rule)
- `packages/client/src/composables/useWorkoutFinish.ts`

**Context — a real fork this plan resolves, not inherited from Plan C:** Plan C's spec says notes
are "persisted server-side with no client read/write path today" and treats set-notes and
workout-notes as the same shape of gap. They are not, on inspection:
- **Set-level `notes`** already round-trips through the offline `log_set` sync payload (confirmed
  in Task 1) — no gap beyond missing client code.
- **Workout-level `notes`** has *two* server paths, and they disagree: `PATCH /api/workouts/:id`
  (`packages/server/src/routes/workouts.ts`, `patchWorkoutInput` schema) accepts `notes` but is a
  separate, **online-only** REST call, not part of the offline outbox. The offline
  `finish_workout` sync payload (`sync.ts`'s `finishWorkoutPayload`) has **no `notes` field at
  all** — `activeWorkoutStore.finish()` cannot send workout notes through its existing
  `enqueueAndAwaitFlush` call today.

**Decision made here:** extend `finishWorkoutPayload` (`sync.ts`) and the corresponding
`syncService.ts` handling to accept an optional `notes` field, so workout notes ride the same
offline-safe path as everything else in this loop — a workout finished offline must not lose its
notes, and must not require a second online-only PATCH call bolted onto the finish flow (that
would reintroduce exactly the kind of split-path fragility Global Constraint 1 rules out). This is
a small, additive server schema change (one optional field on an existing zod schema + one
repository patch call already present in `patchWorkout`), not new infrastructure — call this out
explicitly since it's the one place this workstream's plan touches a file
(`packages/server/src/routes/sync.ts`) shared conceptually with the server, though not listed as
another workstream's file per the orchestration plan's §2 table (server routes aren't claimed by
any other workstream).

- [ ] `packages/server/src/routes/sync.ts`: add `notes: z.string().nullable().optional()` to
      `finishWorkoutPayload`.
- [ ] `packages/server/src/services/syncService.ts`: in the `finish_workout` case handler, pass
      `notes` through to the same `patchWorkout(db, workoutId, { endedAt, pausedSeconds, notes })`
      call `workouts.ts`'s PATCH route already uses (check the existing `finish_workout` handler's
      current call shape before editing — reuse `workoutRepository.ts`'s `patchWorkout`, do not add
      a second write path).
- [ ] `activeWorkoutStore.ts`: add a `workoutNotes: string | null` field to `ActiveWorkoutState`
      (persisted like everything else), a `setWorkoutNotes(notes: string | null)` action, and
      include `notes: this.workoutNotes` in `finish()`'s `enqueueAndAwaitFlush` payload.
- [ ] `useWorkoutFinish.ts`: no changes needed to the finish *flow* itself — workout notes are
      captured during the session (Task 5's UI), sent automatically as part of the existing
      `finish()` call. Confirm `finishWorkout()`'s snapshot logic doesn't need to read
      `workoutNotes` separately (it doesn't — it's sent server-side by `store.finish()` before the
      snapshot is even built).
- [ ] Test (server): a `finish_workout` sync item with `notes: "leg day, felt strong"` results in
      the workout row's `notes` column being set (repository-level test, matching existing
      `syncService`/`workoutRepository` test conventions if present — check
      `packages/server/src/**/*.spec.ts` for the pattern first).
- [ ] Test (client): `store.finish()` includes `notes` in its `enqueueAndAwaitFlush` payload when
      `workoutNotes` is non-null, and omits/nulls it otherwise.

## Task 3 — RestTimer: render the three distinct rest states explicitly

**Files:**
- `packages/client/src/components/workout/RestTimer.vue`
- `packages/client/src/pages/WorkoutPage.vue` (caller — only the prop-passing site, `restSeconds`/
  `restTrigger` logic in `logSet()` already correctly derives all three cases from
  `store.logCurrentSet()`'s return value: a number for between-set/after-exercise, `null` for
  mid-superset)

**Context:** `logCurrentSet()` already returns the correct discriminant (`number | null`) —
confirmed reading the store: `restSeconds` variable inside the function is `ex.restBetweenSetsSeconds`
by default, reassigned to `null` when the round-robin hasn't wrapped, or to
`ex.restAfterExerciseSeconds` when the exercise/group is done. The gap is purely presentational:
`WorkoutPage.vue`'s `logSet()` only acts on a non-null `restDuration` (sets `restSeconds.value` and
bumps `restTrigger`) — when `null` comes back, **nothing tells `RestTimer.vue` a mid-superset
advance just happened with no rest**, so the timer component has no way to distinguish "no rest
because superset round in progress" from "no trigger fired yet, timer idle from before." Today,
`RestTimer.vue` only has two visual states: running (`.ring` filling) and idle (`meta span` reads
"startet nach dem Satz"). There is no third state for "you just logged a set, mid-superset, no rest
is coming."

- [ ] Add a `restKind` state discriminant to `RestTimer.vue`'s props:
      `restKind?: 'between-sets' | 'after-exercise' | 'superset-continue'`. Keep `trigger`/`seconds`
      as-is (backward compatible with the between-sets/after-exercise cases, which already work
      correctly — this task must not regress those).
- [ ] `WorkoutPage.vue`'s `logSet()`: when `restDuration` is `null` (mid-superset, no rest), instead
      of doing nothing, bump a new `restTrigger` with `restKind.value = 'superset-continue'` so
      `RestTimer.vue` can render its third state; when `restDuration` is a number, set
      `restKind.value` to `'after-exercise'` if this was the exercise/group's last set
      (`wasLastUnloggedSet`, already computed in `logSet()`) else `'between-sets'`.
- [ ] `RestTimer.vue` template: when `restKind === 'superset-continue'`, render a distinct compact
      state — no ring countdown (there's nothing to count down), `meta` reads "Weiter im
      Superset — kein Pause" (or similar; exact copy is a product-taste call, keep it terse and
      consistent with existing German copy conventions in this file), no skip button (nothing to
      skip). This state should visually read as "acknowledged, move on" not as "timer, but broken."
- [ ] Keep the existing between-sets/after-exercise ring+countdown+skip UI unchanged for those two
      states — only add the third, don't restructure the first two.
- [ ] Component test (or manual verification note if no existing `RestTimer.spec.ts`): mounting
      with each of the three `restKind` values produces visually/structurally distinct output
      (assert on rendered class names / text content, not pixels).

## Task 4 — RPE capture: new UI, off the primary tap path

**Files:**
- `packages/client/src/components/workout/RpeCapture.vue` (new)
- `packages/client/src/pages/WorkoutPage.vue`
- `packages/client/src/stores/activeWorkoutStore.ts` (already extended in Task 1)

**Context — explicitly speculative per workplan-v1.md §4:** no existing pattern to anchor this on.
Scope it as small and reversible as possible. `SheetModal.vue` already exists as the shared modal
shell (used by `SetKindPicker.vue`, `ExerciseInfoPanel.vue`) — reuse it rather than inventing a
second sheet pattern.

- [ ] Build `RpeCapture.vue`: a small sheet (via `SheetModal.vue`, `height="35%"` similar to
      `SetKindPicker.vue`'s `45%`) offering an RPE 1-10 scale as a single row of tappable numbers
      (not a slider — a slider adds drag-precision friction to something meant to be a 1-tap
      afterthought; a row of 10 numbers is scannable and matches the app's existing preference for
      discrete tap targets over continuous controls, e.g. `NumberStepper`). Emits
      `pick: [rpe: number]` and `close: []`. No "required" state — closing without picking is a
      normal, silent no-op, not a dismissed-warning state.
  - **Props:** `currentRpe: number | null` (highlights the already-set value, if any — matters
    for a set the user already gave an RPE and wants to open again to check/change it, e.g. via
    Task 5's row affordance).
- [ ] `WorkoutPage.vue`: add a small, secondary (non-`.btn-primary`) affordance near the set-entry
      area — **not inline with the weight/reps steppers, not competing with `Satz speichern`**.
      Reasonable placement per Plan C's "off the primary logging path": a small pill/button below
      `SetEntry`, in the same row-family as `.warmup-btn`/`.add-ex-btn` (small, `--surface-2`
      background, `--dim` text, non-`.btn-primary`), reading e.g. "RPE" or "RPE hinzufügen" once
      set, showing the current value once picked (e.g. "RPE 8"). Tapping opens `RpeCapture.vue`.
  - This affordance is per-set (applies to `store.currentSet`, the set about to be logged) — it
    reads/writes `store.currentSet.rpe` via `setCurrentSetRpe()` from Task 1, **before** the set is
    logged, so the RPE rides along in the same `logCurrentSet()` sync payload rather than needing a
    separate post-log edit path (which the store's `setSetKind`/`removeSet` precedent explicitly
    rules out for logged sets — "a logged set is already synced server-side and this store has no
    update-in-place sync mutation").
  - Does not change `Satz speichern`'s disabled condition. Does not require any tap before logging.
    Skipping it entirely and just tapping `Satz speichern` must produce identical behavior to today
    (RPE `null`, per Task 1's defaults).
- [ ] After a set logs (`logSet()` in `WorkoutPage.vue`), the RPE affordance resets to its unset
      state for the *next* set (reads `store.currentSet.rpe`, which is `null` on the newly-current
      set — no explicit reset code needed if the affordance is a computed reading straight off
      `store.currentSet`, confirm this is the case rather than caching a local copy that could go
      stale).
- [ ] No haptic tier assigned to opening/using this control — it's a low-frequency, optional,
      non-`success`-tier interaction; don't invent a fourth haptic tier per Foundation's rule
      (`tap`/`bump`/`success` only). If a haptic is wanted at all, `tap()` on pick, matching the
      log-set tap tier — but this is optional polish, not required for the task to be done.
- [ ] Component test: `RpeCapture.vue` renders 10 options, emits `pick` with the tapped value,
      emits `close` on dismiss without picking.

## Task 5 — Set/workout notes: new UI, off the primary path

**Files:**
- `packages/client/src/components/workout/NoteCapture.vue` (new — shared shape for both set- and
  workout-level notes, parameterized, rather than two near-duplicate components)
- `packages/client/src/pages/WorkoutPage.vue`

**Context:** same "no existing pattern, explicitly speculative" framing as Task 4. Free-text needs
a text area, which doesn't fit `SheetModal`'s smallest heights well — use a taller sheet
(`height="50%"` or similar, matching `SetKindPicker`'s convention of a fixed percentage rather than
content-driven sizing).

- [ ] Build `NoteCapture.vue`: `SheetModal`-based, a single `<textarea>` (or the equivalent
      Ionic input if the codebase has a convention for multi-line text elsewhere — check
      `RoutineWizard.vue`/`ProfilePage.vue` for any existing free-text field pattern before
      inventing styling from scratch) + a save button. Props: `title: string`,
      `modelValue: string | null`. Emits `save: [value: string | null]` (empty string saved as
      `null`, not `""` — keep the store's `null` convention consistent) and `close: []`.
- [ ] **Set notes**: same secondary-affordance placement as Task 4's RPE pill — a small button in
      the same row-family (`.warmup-btn`/`.add-ex-btn`/RPE pill), reading "Notiz" or showing a
      short preview once set (truncated via a `TruncatingLabel`-equivalent if Foundation's
      primitive exists by implementation time — plain CSS `text-overflow: ellipsis` otherwise, not
      a blocker). Reads/writes `store.currentSet.notes` via `setCurrentSetNotes()` (Task 1), same
      "rides along in the next `logCurrentSet()` call" timing as RPE.
- [ ] **Workout notes**: placed in the rail column (`aside.rail-col` in `WorkoutPage.vue`), grouped
      with the other session-level controls (add-exercise, cancel) — not per-set, so it belongs
      with the exercise rail/add/cancel cluster, not inside the focus column. Reads/writes
      `store.workoutNotes` via `setWorkoutNotes()` (Task 2).
- [ ] Neither note field is required, neither blocks `Satz speichern` or `Workout beenden`.
- [ ] Component test: `NoteCapture.vue` emits `save` with trimmed/null-coalesced text, `close`
      without saving on dismiss without an explicit save tap.

## Task 6 — Jump-to-exercise rail: mobile parity

**Files:**
- `packages/client/src/components/exercise/ExerciseRail.vue`
- `packages/client/src/pages/WorkoutPage.vue`

**Context:** `ExerciseRail.vue`'s own header comment says "Desktop-only clickable exercise list"
— it already implements `jumpToExercise(i)` correctly and renders active/done/superset-grouped
states, but per its own comment it's not shown at all on mobile (confirm by checking
`WorkoutPage.vue`'s template/CSS for a `display: none` below the `900px` breakpoint or an
equivalent mobile-hides-this-column rule — `.rail-col` only gets its flex/width treatment inside
the `@media (min-width: 900px)` block, and there's no mobile-specific alternate rendering for
`ExerciseRail` visible in the file read for this plan). Plan C's spec explicitly calls for a
"jump-to-exercise rail" as part of the Active Workout screen — not scoped to desktop only.

- [ ] Confirm (read `WorkoutPage.vue`'s full CSS again at implementation time, and check
      `ExerciseRail.vue`'s own file for any component-level responsive hiding) whether the rail is
      actually invisible on mobile today or just unstyled-for-narrow — do not assume; verify first
      since the comment may be stale.
- [ ] If confirmed hidden/impractical on mobile as currently laid out: add a mobile-appropriate
      rendering — a horizontal scroll-snap strip of the same `rail-item` buttons (reuse
      `ExerciseRail.vue`'s existing template/logic, add a `variant="horizontal"` prop that switches
      the container's flex-direction and item sizing via CSS rather than duplicating the component)
      placed above or below the focus column on narrow viewports. Each item stays ≥44×44px per the
      touch-target floor.
- [ ] Preserve existing desktop behavior exactly — this task adds a mobile rendering path, it does
      not change desktop's vertical list.
- [ ] Manual verification via the `mobile-viewport-check` skill (see Task 10) that the rail is
      reachable and tappable at 390px width once this ships.

## Task 7 — Mid-session controls: confirm-tap audit (not native dialogs)

**Files:**
- `packages/client/src/pages/WorkoutPage.vue`
- `packages/client/src/composables/useConfirmTap.ts` (read-only reference — already correct,
  reusable as-is)

**Context:** Plan C requires add/skip/pause/cancel via confirm-tap, never a native `confirm()`
dialog. Current state, confirmed by reading `WorkoutPage.vue`:
- **Cancel**: already correct — `cancelConfirm = useConfirmTap(...)`, `.cancel-btn` with
  `:class="{ confirming: cancelConfirm.isArmed() }"`.
- **Add exercise**: not a destructive action (adding is additive, reversible by just not logging
  its sets), correctly has no confirm-tap gate — a toggle-open panel is the right affordance, no
  change needed.
- **Skip exercise**: `store.skipCurrentExercise()` fires directly on click, no confirmation at all.
  This is **not clearly wrong** — skipping just moves the cursor to another exercise with unlogged
  sets, it's non-destructive (nothing is lost, the skipped exercise is still reachable via
  `jumpToExercise`/the rail) — but Plan C groups "skip" alongside "add/pause/cancel" as needing
  confirm-tap. Resolve this explicitly rather than guessing:
  - [ ] **Decision for this task**: skip stays a direct, unconfirmed tap — it's reversible and
        non-destructive (unlike cancel, which discards the session, or delete, which is permanent),
        so gating it behind confirm-tap would add friction to a legitimate "equipment's busy, I'll
        come back" flow without protecting against any real loss. Document this reasoning inline
        as a code comment at the `skip-btn` click handler, matching this file's existing convention
        of citing the "why" for UX judgment calls (see the file's many inline comments doing
        exactly this). **Flagged for human confirmation** — see the report below.
- **Pause**: `store.togglePause()` fires directly, no dialog, no confirm-tap. Pausing is also
  non-destructive and reversible (unpause resumes exactly where you left off) — same reasoning as
  skip. No change needed; confirmed already correct (there is no native dialog anywhere in this
  path).
- [ ] Verify (grep `WorkoutPage.vue` and every file this task touches) that no `window.confirm(...)`
      or native `alert()` exists anywhere in the active-workout path — confirmed already: none
      found in the files read for this plan. Re-check at implementation time since new code (Tasks
      3-6) must not introduce one.

## Task 8 — Stale-session nudge: verify and extend if needed

**Files:**
- `packages/client/src/pages/WorkoutPage.vue`
- `packages/client/src/stores/activeWorkoutStore.ts`

**Context:** already implemented and correct on inspection — `activeWorkoutStore.isStale` getter
(`elapsedSeconds > STALE_WORKOUT_SECONDS`, 3 hours), `WorkoutPage.vue`'s `onMounted` sets
`showStalePrompt.value = store.isStale` once on restore (not reactively — deliberately, per its own
comment, "nudges once per app open/reload"), and the banner offers "Läuft noch" (dismiss) /
"Jetzt beenden" (finish now). This satisfies Plan C's spec as written.

- [ ] No functional change required. Confirm at implementation time this still holds (re-read the
      current file state, since Tasks 3-7 touch the same file and could shift line numbers/logic
      around it) and that the banner's dismissal doesn't get double-triggered by any new mounted
      hook this plan adds elsewhere in the same file.

## Task 9 — Today (home) screen: confirm against Plan C spec, gap-fill only

**Files:**
- `packages/client/src/pages/OverviewPage.vue`

**Context:** `OverviewPage.vue` is already substantially built to spec — readiness hero
(`ErholungszoneCard`), streak/level/rank status strip, one-tap launchpad card
(resume-in-progress / suggested-routine-start / no-routine states, all three present), unified
first-run empty state (`isFirstRun`, routes into the same `TierLadder` promise Plan C calls for).
This task is a **gap check against the spec, not a rebuild** — do not restructure working code.

- [ ] Confirm streak/tokens-remaining chip copy matches Plan C's specified framing ("streak
      protected: N rest days remaining," lens-2 §6 item 1) rather than a bare countdown. Current
      code shows `streak.streak` as a bare number in the status strip (`StatTile` "🔥 Tage Serie")
      with no tokens-remaining framing visible in the read file. **Check `streakStore.ts` for a
      `tokensRemaining` field** (already referenced elsewhere — `FinishSequence.vue`'s props list
      `tokens-remaining="streakStore.tokensRemaining"` in `WorkoutPage.vue`, confirming the field
      exists) and whether Today's own status strip should surface it, or whether that framing is
      intentionally reserved for the Finish Sequence only (a legitimate design choice, not
      necessarily a gap). **Flagged for human confirmation** — see the report below; this plan
      does not prescribe adding a second tokens-remaining display without knowing whether one
      already exists elsewhere on this screen that was missed in the read, or whether Workstream B
      (which owns streak/XP mechanics per the orchestration plan §3.2) is the correct owner of any
      change here instead.
- [ ] Everything else on this screen (readiness hero, routine-start cards, empty-state routing) is
      confirmed built to spec — no task items needed beyond the flagged check above.

## Task 10 — Sync indicator: non-modal `pendingCount`/`flushing` display

**Files:**
- `packages/client/src/components/ui/SyncIndicator.vue` (new, unless an equivalent already exists
  — search first: `Grep pendingCount packages/client/src` for any existing render of
  `syncStore.pendingCount`/`syncStore.flushing` before building a new component)
- `packages/client/src/pages/WorkoutPage.vue` or `App.vue`'s persistent chrome (placement decision
  below)

**Context:** `syncStore.ts` already tracks `pendingCount`, `flushing`, `lastError` reactively — no
store work needed, this is purely a new small presentational component. Plan C: "a small persistent
(non-modal) `pendingCount`/`flushing` indicator animating queued → syncing-pulse → settle... giving
offline confidence rather than blocking."

- [ ] Grep the codebase first for any existing consumer of `syncStore.pendingCount`/`.flushing` —
      if one already exists and satisfies this spec, this task becomes verification-only per the
      same "confirm before rebuilding" discipline as Task 9.
- [ ] If none exists: build a small, unobtrusive indicator — a dot/badge, not a banner or toast
      (non-modal, must never block or cover tappable content). Three visual states: idle
      (`pendingCount === 0 && !flushing`, effectively invisible or a subtle "synced" checkmark that
      fades), queued (`pendingCount > 0 && !flushing`, a small count badge), syncing
      (`flushing === true`, a pulse animation — reuse the existing `.shimmer` utility class already
      used elsewhere in this codebase, e.g. `WorkoutPage.vue`'s `.rank-skeleton.shimmer`, rather
      than inventing a new pulse keyframe).
- [ ] Placement: **not** inside the focus column (would compete with the logging surface, violating
      the same density discipline Nebula's layout doc applies to this screen) — a corner of the
      rail column on Train, or folded into `App.vue`'s persistent top-hud chrome if Foundation
      defines a slot for it (check Foundation's plan/primitives at implementation time; if absent,
      default to a fixed small corner placement within `WorkoutPage.vue`'s own layout, not a new
      global chrome element, to avoid touching `App.vue` outside this workstream's file boundary
      per the orchestration plan's §2 table, which assigns `App.vue` to Foundation only).
- [ ] Component test: renders distinct output for the three states listed above.

## Task 11 — Set-logged / exercise-advance motion: verify state-driven, not decorative

**Files:**
- `packages/client/src/pages/WorkoutPage.vue`

**Context:** already implemented and already documented as state-driven, not decorative — the
`justLoggedIndex` mechanism (one-shot pop-in trigger, explicitly *not* bound to the durable
`s.logged` flag, per the file's own motion-audit-fix comment explaining exactly this failure mode
and its correction) and the `wasLastUnloggedSet` → `haptics.bump()` distinction (a plain same-
exercise log gets `haptics.tap()`; an exercise-advancing log additionally gets `haptics.bump()`).
This already satisfies "quick scale/opacity settle... a slightly more deliberate
[distinction]... state-driven, not decorative."

- [ ] No functional change required. This task is a verification checkpoint in the plan's own
      task list (per the "No Placeholders" self-review — call out what's already done explicitly
      rather than silently omitting it) — confirm at implementation time this logic hasn't
      regressed from any of Tasks 1-10's edits to the same file (all of which touch `WorkoutPage.vue`
      in different regions; a merge/rebase across tasks could accidentally disturb the
      `justLoggedIndex`/`setTimeout` pairing).

## Task 12 — +XP chip: verify non-authoritative, never gates log-set

**Files:**
- `packages/client/src/composables/useXpChip.ts`
- `packages/client/src/pages/WorkoutPage.vue`

**Context:** already correct — `useXpChip.ts`'s own header comment states "Purely a feel-good echo
of the same number the server will independently add to the real total; never authoritative,"
`triggerXpChip(amount)` is called in `logSet()` fire-and-forget after the set is already logged
(the log already happened via `store.logCurrentSet()` before the chip fires), and nothing reads the
chip's state to gate any button. Nebula's layout doc additionally specifies the chip's numeral
color migrates to `--nebula-ink` (solid) — confirmed already true by `nebula-design-layout.md` §2's
own text ("already implemented"), not re-verified against live CSS by this plan (out of scope per
this workstream's "don't redo the visual layer" framing) — spot-check only if Tasks 1-11's edits
touch the `.xp-chip` CSS block, which they should not.

- [ ] No functional change required. Verification checkpoint only, same reasoning as Task 11.

---

## Migration / Atomic Cutover Requirement (binding — from Plan C §4)

**This workstream cannot ship screen-by-screen.** The active-workout state machine
(`activeWorkoutStore.ts`) and the offline-first sync outbox (`syncStore.ts`) are shared, stateful
infrastructure spanning a single continuous session (start → log → finish). Splitting "start" onto
a new version of these screens while "log set" still runs old code (or vice versa) mid-session
risks a desync this UI layer has no safety net for, unlike the data layer's own reconstructible-
from-raw-tables invariant.

**Before this workstream's branch merges to master, it must be built complete and tested against a
full session lifecycle in one pass:**

1. Start a session from a real routine (not Quick Start) with ≥2 exercises, at least one of which
   is part of a superset group and at least one standalone.
2. Log every set of the standalone exercise, confirming: direct-entry stepper works for both weight
   and reps, RPE/notes capture (Tasks 4-5) work and don't block logging, the between-sets rest state
   renders correctly (Task 3), the after-exercise rest state renders correctly on the last set.
3. Log sets across the superset group, confirming the `superset-continue` rest state (Task 3) fires
   correctly on non-wrapping advances and the between-sets state fires correctly on a wrap.
4. Mid-session, insert a warm-up set on an exercise that hasn't started yet (`canInsertWarmup`),
   confirm it logs correctly and doesn't disturb the working-set indices.
5. Mid-session, add a new exercise via the add-exercise panel, confirm it's reachable via the jump
   rail (Task 6) on both desktop and mobile viewport widths.
6. Pause, confirm the clock/timer state freezes correctly, resume, confirm elapsed time accounts
   for the pause correctly (`elapsedSeconds` already excludes `totalPausedMs` — verify this still
   holds).
7. Trigger the stale-session nudge path is unaffected (Task 8 — verification only, but confirm live
   once, not just by code review).
8. Finish the workout, confirming: the awaited `finish()` call is the only blocking network call in
   the whole run, workout-level notes (Task 2) round-trip correctly if entered, the sync indicator
   (Task 10) reflects `flushing` correctly during this one blocking call, and the Finish Sequence
   receives correct rank verdicts (verification only — Finish Sequence itself is Workstream B's
   scope, this workstream only needs to confirm the handoff/data shape it hands off is intact).
9. Repeat the whole sequence with the app offline (airplane mode / network throttling) for steps
   2-6, confirming zero blocking waits and that the outbox correctly queues everything, then bring
   the network back and confirm `flush()` drains the queue and `finish()` (attempted only once back
   online, per real usage) succeeds.

Cut over as one atomic unit — new Today/Train screens replacing old ones in the same release, not
screen-by-screen, per Plan C §4's explicit instruction.

---

## Verification

- [ ] Full lifecycle test above passes, offline and online.
- [ ] `mobile-viewport-check` skill run against every changed file (`OverviewPage.vue`,
      `WorkoutPage.vue`, `SetEntry.vue`, `RestTimer.vue`, `SetKindPicker.vue`, `ExerciseRail.vue`,
      and the new `RpeCapture.vue`/`NoteCapture.vue`/`SyncIndicator.vue`) at minimum 390px width —
      Liftr is mobile-primary, this is not optional polish.
- [ ] Existing test suite (`packages/client`, `packages/server` if Task 2's server changes are
      made) passes; new tests from Tasks 1-6, 10 pass.
- [ ] Typecheck/lint clean.
- [ ] Bodyweight-null-vs-zero spot check: an exercise with `weightKg: null` renders no weight
      stepper (unchanged `SetEntry.vue` behavior); an exercise with `weightKg: 0` renders a stepper
      starting at 0. Confirm neither RPE nor notes capture (Tasks 4-5) accidentally coerces or
      reads `weightKg` in a way that would flatten this distinction (they shouldn't touch
      `weightKg` at all — call out explicitly as a negative-check).
- [ ] No native `confirm()`/`alert()` introduced anywhere in the touched files.
- [ ] RPE/notes capture confirmed reachable and skippable without ever disabling `Satz speichern`.

## Self-Review Notes (per superpowers:writing-plans checklist)

- **No placeholders**: every task cites real files, real current code (interfaces, function names,
  line-level behavior confirmed by reading the files, not assumed), and real gaps vs. what's
  already correct — Tasks 8, 11, 12 are explicitly "verify, don't rebuild" because the code already
  satisfies the spec, called out rather than padded with invented work.
- **Grounded in real code**: `ActiveSet`/`ActiveExercise` field names, `logCurrentSet()`'s actual
  return-value logic, `sync.ts`'s actual zod schemas, `useConfirmTap`'s actual API, and
  `SheetModal.vue`'s actual prop surface are all taken from the files read for this plan, not
  guessed.
- **Open questions surfaced, not silently resolved**: Task 7's skip-confirmation question and
  Task 9's tokens-remaining placement question are flagged as human-confirmable decisions rather
  than the plan picking silently and calling it done — see below.

---

## Open Questions / Assumptions for Human Confirmation

1. **RPE UI shape (1-10 row vs. decimal picker) and notes UI shape (inline vs. modal)** — Plan C
   §6 Q4 explicitly leaves this open ("no prior pattern anywhere in the codebase to anchor a
   specific choice... real product design work"). This plan picks a 1-10 tappable row (Task 4) and
   a `SheetModal`-based textarea (Task 5) as the lowest-risk, most-consistent-with-existing-patterns
   default, but this is a genuine product-taste call Plan C itself declined to make — confirm before
   or during implementation, not a blocker to starting other tasks.
2. **Skip-exercise confirm-tap** (Task 7) — this plan concludes skip should stay unconfirmed
   (non-destructive, reversible via the jump rail) even though Plan C's prose groups it with
   add/pause/cancel. Confirm this reading before implementation, since Plan C's literal text could
   be read either way.
3. **Today screen's tokens-remaining chip** (Task 9) — needs a quick check of whether
   `streakStore.tokensRemaining` is already surfaced somewhere on `OverviewPage.vue` that this read
   missed, and whether changing it is this workstream's call or Workstream B's (streak/XP mechanics
   owner per the orchestration plan). Do not add a redundant display without checking.
4. **Workout-level notes' sync path** (Task 2) — this plan chooses to extend the offline
   `finish_workout` payload rather than bolt on a second online-only PATCH call after finish, since
   Global Constraint 1 (no blocking network in Train) argues against introducing a second network
   dependency into the finish path. This is a real server-schema change (small, additive) — flagged
   since it's the one place this workstream's plan touches a server route file.
