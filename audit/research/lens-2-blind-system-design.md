# Liftr — A UI/UX System Designed Blind, From the Data Model Up

**Status: historical input research — superseded by ratified decisions.** Findings here fed
directly into `audit/nebula-design-system.md` and `audit/finished/plan-c-new-ui-rebuild.md` (both
cite specific rules/sections of this document by name as their evidence trail, e.g. "lens-2 §4 rule
5"). Kept intact, unedited, so those citations resolve — do not delete without first updating every
citing document. Not an open work item.

## 1. Disclosure Statement

I never viewed Liftr's existing interface. I did not open any `.vue` file, any CSS or design-token
file, any screenshot or image, the dev server, the `audit/` directory, the `examples/` directory,
any README, or any product/design documentation. I did not use a browser tool at any point in this
task.

Everything below is derived exclusively from: the Drizzle schema (`packages/db/src/schema.ts`),
server routes and services (`packages/server/src/routes/**`, `packages/server/src/services/**`),
pure business logic in `packages/shared/src/**`, and non-presentational client code — Pinia stores
(`packages/client/src/stores/**`), services (`packages/client/src/services/**`), composables
(`packages/client/src/composables/**`), and `packages/client/src/lib/**` (excluding
`shareCard.ts`'s and `equipmentIcons.ts`'s icon-drawing internals, which I skimmed only for
identifier names, never for visual output). I also read `package.json` files for the client,
server, shared, and db packages to learn what platform capabilities exist (Capacitor, PWA, health
integration, offline storage).

**Files I opened and stopped reading, or deliberately did not open, because they were
presentational or out of scope:** I did not open any file under `packages/client/src/pages/` or
`packages/client/src/components/`, nor `packages/client/src/lib/shareCard.ts`'s drawing routines
(I only read `packages/shared/src/share/layout.ts`, which is pure layout math, not
`shareCard.ts` itself). I did not open `packages/client/src/lib/equipmentIcons.ts` beyond a grep
for the string "Körpergewicht" while checking `rpe` usage — that one line surfaced incidentally in
a search and was not read as design content. No screenshots or images were viewed at any point.

One caveat on neutrality: source comments throughout the server and shared code reference the
*existing* mockup and UI by name in passing (e.g. "mirrors the mockup's flow," "Ränge page's
'Rangaufstiege' calendar strip," "Übersicht 'Erholungszone' hero," German UI copy strings like
`SET_KIND_LABEL`). These are incidental exposures inside otherwise-legitimate non-presentational
files (store/service/schema comments), not something I sought out. I have not let them anchor this
redesign — where a comment names an existing screen or mockup pattern, I cite it plainly below as
"a comment in file X references screen/label Y" and treat it as one data point about product
intent, not as a visual spec to reproduce. The system I propose below is my own, built from the
underlying data and logic, not a description of what already exists.

---

## 2. Derived Product Model

### 2.1 What this product fundamentally is

Liftr is a **single-user, offline-first strength-training and running logbook** with a derived
competitive-ranking layer built entirely from the lifter's own historical data — no accounts,
no social graph, no leaderboards against other people. The single-profile design is explicit:
`packages/server/src/routes/settings.ts` stores the onboarding profile, owned equipment, and gym
setup in one generic key-value `settings` table specifically because "this is a single-user,
no-accounts app... which is exactly what a k/v row already models with no schema change needed."

The product has three structural pillars:

1. **A planning layer** (`routines`, `routine_exercises`, `mesocycles`) — reusable session
   templates the lifter builds once and reuses, optionally wrapped in a periodized
   ramp-then-deload week-by-week intensity curve.
2. **A logging layer** (`workouts`, `workout_exercises`, `sets`; `runs`, `run_points`) — the
   actual append-only record of what happened, timestamped to the set.
3. **A derived-progress layer** computed *entirely* from the logging layer: per-exercise ranks
   (`ranks`, `rank_events`, `prs`), an account-level "Overall Lifter Rank" aggregate, an XP/level
   system, and a streak-with-protection system. The schema header itself states the design
   invariant: "Every derived/cache table (`ranks`, `prs`, streak state) must be reconstructible
   from the raw tables... via a `recompute` pass" (`packages/db/src/schema.ts:1-7`).

### 2.2 Entities and their relationships

- **Exercise catalog**: `exercises` + `muscles` + `exercise_muscles` (primary/secondary role per
  muscle). Exercises carry a `movementPattern` (push/pull/squat/hinge/carry/isolation-*), an
  `isBodyweight` flag with a `bodyweightLeverage` factor, a `requiredEquipment` tiered
  requirement list, and an optional `isCustom` flag for user-added exercises
  (`packages/db/src/schema.ts:32-69`).
- **Routine (template)** vs **Workout (session)**: a schema comment explicitly calls this "a
  deliberate, load-bearing split — do not collapse them." A `routine_exercises` row stores a
  JSON array of per-set targets (`{reps, weightKg}`), where `weightKg: null` means "no weight
  target at all" (plain bodyweight) and `weightKg: 0` means "tracked, currently no added weight"
  — a distinction the schema says "drives whether SetEntry.vue shows a weight stepper at all
  during logging" (`packages/db/src/schema.ts:94-102`). Each routine-exercise can also carry
  per-exercise rest-timer overrides (`restBetweenSetsSeconds`, `restAfterExerciseSeconds`) and a
  nullable `supersetGroup` for circuit/superset grouping.
- **Mesocycle**: at most one active cycle per routine, storing a pre-generated `weekPercents`
  curve (`packages/shared/src/math/mesocycle.ts:9-16`: +5%/week ramp, deloading to 60% on the
  final week) and a `currentWeek` pointer that advances once per finished workout on that
  routine (`packages/server/src/routes/mesocycles.ts:44-52`, capped at `totalWeeks`, not looping).
- **Set**: the atomic logged unit. Carries `weightKg` (nullable for pure bodyweight), `reps`,
  optional `rpe`, a `kind` enum (`normal | warmup | failure | dropset`), free-text `notes`, and a
  `clientId` that is the offline-sync idempotency key (`packages/db/src/schema.ts:167-197`).
- **Rank engine outputs**: `standards` (population thresholds per exercise/sex/tier/division,
  each tagged `trust: real | derived | synthetic`), `ranks` (one row per exercise — current band
  *and* a ratchet-only, never-retroactively-recomputed `peak` band), `prs` (append-only best-ever
  records per kind: e1rm/weight/reps/volume), `rank_events` (append-only rank-up log).
- **Running**: `runs` (summary) + `run_points` (every trackpoint, kept in full — the schema
  comment calls this "the replay-enabling table... never discard points after computing the
  summary," `packages/db/src/schema.ts:299`).
- **Motivation state**: `streaks` (date+kind unique, with a `protectionUsed` flag) and the
  single-row `settings` table holding profile, equipment, and gym setup.

### 2.3 State machines / lifecycles derived from the code

**Workout session lifecycle** (`packages/client/src/stores/activeWorkoutStore.ts`,
`packages/server/src/services/syncService.ts`):

```
[not started] --start()--> [active, exercise 0, set 0]
  --logCurrentSet()--> advances within exercise, or auto-advances to next
    exercise with unlogged sets, or (superset) round-robins between group
    members --> [allSetsLogged]
  --togglePause()--> [paused] <--> [active]
  --addExercise() / skipCurrentExercise() / jumpToExercise()--> non-linear
    edits to remaining work, always allowed
  --cancelWorkout()--> [discarded] (already-logged sets stay synced/counted;
    only the "session" framing is undone)
  --finish()--> [ended] --awaits server flush--> rank verdicts returned
      --> streak credited for that calendar date, XP/LP recomputed once
      per touched exercise, mesocycle (if any) advances one week
```

A workout has an explicit **stale** state: `isStale` in `activeWorkoutStore.ts:141-149` fires once
elapsed time exceeds 3 hours, because "a workout runs indefinitely if it wasn't cancelled or ended
by the user" — the UI is expected to nudge, not auto-close, since "silently discarding or
finishing a session the user never actually confirmed would be its own bug."

**Rank lifecycle** (`packages/shared/src/rank/decay.ts`, `packages/server/src/services/rankService.ts`):
a *peak* (ratchet, only ever advances) and a *current* band (can soften) are tracked separately.
Current decays linearly starting 21 days after last training that exercise, reaching the floor of
the peak's own tier after another 60 days (`RANK_DECAY_GRACE_DAYS`, `RANK_DECAY_WINDOW_DAYS`).
Training the exercise again triggers a *buffed* multi-session climb-back toward peak (up to 2.5x
the normal per-session gain when the gap is largest), not an instant snap. A genuine rank-up is
defined strictly as *peak* advancing, never a decay-reversal being mistaken for progress
(`packages/server/src/services/rankService.ts:213-220`).

**Plausibility gate** (`packages/shared/src/rank/plausibility.ts`): every finished workout is
scored on three independent severity ramps — pace (seconds/set), same-session e1RM jump over
stored peak, and an absolute ceiling relative to the Apex threshold — producing a multiplier
in `[0.05, 1]` that discounts (never zeroes) XP/LP, plus separate, stricter hard-block floors for
peak-eligibility (0.3) and PR-eligibility (0.5). This is a lifecycle gate on trust, not a modal or
error: it silently shapes how much a session "counts."

**Sync/offline lifecycle**: every mutation writes to IndexedDB immediately (optimistic), is
appended to an outbox, and is flushed opportunistically (`packages/client/src/stores/syncStore.ts`).
`finish_workout` is the one mutation the UI actually *awaits* through a real network round trip
(`enqueueAndAwaitFlush`), because the finish screen needs real rank verdicts before deciding what
to celebrate — every other mutation (start, log_set, add_exercise) is fire-and-forget.

**Streak lifecycle** (`packages/shared/src/streak/streak.ts`): a fixed-window daily walk with a
"protection token pool" derived from the lifter's stated `workoutsPerWeek` (default 2, capped at
6), so a normal rest day never reads as a broken streak. Today with no activity yet is never
treated as a break.

### 2.4 Real user actions the API supports, end to end

Enumerating every route confirms these are genuinely wired, not just modeled:

- Build/edit/archive a routine, with per-set targets, per-exercise rest overrides, superset
  grouping (`routes/routines.ts`).
- Get muscle-group-driven or manually-chosen exercise **suggestions** with recommended
  sets/reps/weight, using the lifter's own last-performed set or, for a never-logged exercise, a
  standards-derived entry point scaled by stated experience level, with automatic
  equipment-aware substitution (`routes/routineSuggestions.ts` → `routineSuggestionService.ts`).
- Attach/advance/end a periodized mesocycle on a routine (`routes/mesocycles.ts`).
- Start a workout offline-capable (client-minted UUIDs so no round trip is needed before logging
  can begin), log sets, add an exercise mid-session, finish/pause/cancel — all via the sync outbox
  (`routes/sync.ts`, `routes/workouts.ts`).
- Delete a past workout, which cascades to its sets and explicitly recomputes rank for every
  touched exercise so XP/LP stay honest (`services/workoutService.ts`).
- View/query per-exercise ranks, next targets, peak snapshots (`routes/ranks.ts`), an
  account-level aggregate "Overall Lifter Rank" across every ranked exercise weighted by trust
  tier (`routes/overallRank.ts` → `overallRankService.ts` / `packages/shared/src/rank/aggregate.ts`),
  and a 7-day rank-events-by-weekday feed (`routes/rankEvents.ts`).
- View total XP and level (`routes/xp.ts`), current streak + tokens remaining (`routes/streak.ts`).
- Query per-muscle readiness/recovery ("what should I train today," a heuristic 0–1 value per
  muscle group derived from last-trained timestamp and primary/secondary involvement,
  `routes/readiness.ts` → `packages/shared/src/recovery/recovery.ts`).
- Import a run from a GPX/FIT file, log one manually, or import from Health Connect
  (native, in-app, no companion app); replay the full trackpoint path; delete a run
  (`routes/runs.ts`).
- Log bodyweight (also usable as a side-effect of the onboarding profile save).
- Configure onboarding profile (sex, birth year, experience level, workouts/week), owned
  equipment, and gym plate/bar inventory (`routes/settings.ts`).
- Add a custom exercise to the catalog (`routes/exercises.ts`).
- Export everything as plain CSVs in a zip — "own your data... works even if Liftr itself is
  gone" (`services/exportService.ts`).
- A unified reverse-chronological history feed merging workouts and runs
  (`services/historyService.ts`).

### 2.5 Data that exists in the schema/services but is not surfaced in non-presentational client code

I grepped the client stores/services/composables/lib for usage of several schema fields that the
server clearly models and persists:

- **`sets.rpe`** (Rate of Perceived Exertion) is captured end-to-end in the sync payload schema
  (`packages/server/src/routes/sync.ts:36`, `logSetPayload`) and the DB column
  (`packages/db/src/schema.ts:177`), but a repository-wide search of `packages/client/src`
  found zero references to `rpe` in any store, service, composable, or lib file — the client never
  reads it back, only silently passes `rpe: undefined`/omitted through the type. It is present as
  a wire field with no consumer.
- **`sets.notes` / `workouts.notes`**: same pattern — persisted server-side
  (`patchWorkoutInput` accepts `notes`, `logSetPayload` does not even carry it), but no client
  store/service file references `.notes` at all. There is no evidence of a client write or read
  path for either notes field.
- **`prs` table**: a comment in `packages/server/src/services/rankService.ts:14-16` states this
  outright — "an internal append-only 'was this ever a new best' log the app never displays." A
  grep across `packages/client/src` for any file referencing `prs` fetch/read turned up nothing;
  the client only ever sees a *derived boolean* (`isPr`) per set in the workout-detail response
  (`packages/server/src/routes/workouts.ts:70-77`), never the PR ledger itself (its per-kind
  values, its full history, or a "PR timeline").
- **`exercises.demoStartImage` / `demoEndImage`**: a comment in
  `packages/server/src/routes/exercises.ts:59-61` confirms these DB columns are "still-unused...
  ingest never writes them" — the route instead does a live filesystem `existsSync` check to
  decide whether a demo photo exists, bypassing these columns entirely.
- **`run_points.cadence`**: typed all the way through (`RunPoint.cadence` in
  `packages/shared/src/math/gps.ts:14`, `runService.ts` on the client), but is never read by
  `summarizeRun` for anything (only `hr`/`ele`/lat/lon feed the summary), and no client-side
  non-presentational code aggregates or surfaces a cadence figure the way it does average HR.
- **`mesocycle.currentWeek`** is read by exactly one call site
  (`useStartRoutine.ts:37`, to pick the week's weight-scaling percent when starting a session) —
  it does not appear to feed any dashboard/progress view of "week N of M" in any store I could
  read (that would live in a `.vue` page, which is out of scope, but the data itself has only this
  one narrow consumer in logic code).
- **`standards.trust` (`synthetic` tier)**: consumed correctly by the rank engine (down-weighted
  in the overall aggregate), but there is no client-side surfacing distinguishing a `synthetic`
  rank's confidence from a `real`/`derived` one beyond passing the `trust` field through — worth
  flagging as an opportunity (see §6) rather than a confirmed gap, since a `.vue` page could
  legitimately render it and I cannot see that.

This gives three genuinely available, currently-inert data sources to design *for* rather than
invent: RPE (a training-intensity signal begging for autoregulation/fatigue UI), free-text notes on
sets/workouts (a personal-journal layer), and a real PR ledger (a "trophy case" the schema already
supports end to end).

### 2.6 Interaction-frequency analysis

The code itself encodes frequency assumptions explicitly, which is unusually good evidence:

- **Set logging** — dozens of times per session. `haptics.ts` names this directly: `tap()` is
  documented as firing for "the 30x-per-session action." `activeWorkoutStore.ts`'s entire
  optimistic-write, persist-on-every-mutation design (`persist(this.$state)` called after nearly
  every action) exists *because* this happens so often and so fast that any latency or data-loss
  risk here is unacceptable — it is the "sacred loop."
- **Weight/rep adjustment** — even more frequent than logging itself: every set is preceded by
  stepper taps, and the direct-numeric-entry composable was added specifically because "±1-per-tap
  made a 20kg→100kg change ~64 taps" (comment in `activeWorkoutStore.ts:283-287`) — a UI
  correctness bug caused by *underestimating* how often this interaction recurs.
- **Finish workout** — once per session (a handful of times a week), but is the one mutation
  awaited synchronously through the real network, and is the trigger for the richest one-time
  payload in the app: rank verdicts, PR detection, streak credit, mesocycle advance, XP snapshot,
  and a full "beat sequence" celebration (`useCelebrate.ts`, `useWorkoutFinish.ts`). Its cost (a
  blocking network wait) is deliberately paid *once* per session rather than for every set — the
  code explicitly moved rank recompute "from per-set to per-workout" so "a session with many sets
  on the same exercise previously paid a recompute after every one of them, and rank-ups fired mid-
  set instead of reading as one end-of-workout moment" (`syncService.ts:84-89`).
- **Routine building / mesocycle setup** — infrequent, "planning-desk" actions. A comment in
  `useMesocycleControls.ts:1-7` calls the mesocycle toggle "a per-routine '+ Mesozyklus' reveal...
  deliberately kept off the routine card itself: this is a planning-desk action like building the
  routine, not something that should add visual weight to the one-tap 'start today's workout'
  list." This is direct code-level evidence for an information-architecture principle: planning
  surfaces and logging surfaces must be visually and navigationally separated.
- **History/detail review, export, settings/equipment/gym setup** — rare, deliberate visits. The
  history store's own comment: "history is a review surface, not the logging loop," and it is
  explicitly online-only (no offline read path), unlike the active-workout path which is
  offline-first by design.
- **Run logging** — session-level, comparable in frequency to a workout but structurally
  simpler (no per-rep interaction); its file-import path (GPX/FIT/Health-Connect) implies it is
  often a "let a device sync it" event rather than a manual entry, versus a workout, which is
  hand-logged in the moment nearly every time.
- **Rank/streak/XP reads** — passive/ambient. These are recomputed by the server and consumed by
  the client mostly as read-only dashboard data (`ranksStore`, `streakStore`, `xpStore`,
  `overallRankStore`, `readinessStore`), refreshed on load and after a finish — not something a
  user "does," but something they check, likely once per app open plus once per finish.

---

## 3. Proposed Information Architecture & Screen Inventory

The frequency analysis above (§2.6) and the explicit code-level separation of "planning" from
"logging" surfaces (§2.3, §2.6) drive a **three-zone IA**: a low-friction *Today* zone for the
one action that happens constantly, a *Progress* zone for passive/ambient review, and a *Plan*
zone for the infrequent, deliberate setup actions — kept visually and navigationally distinct so
neither clutters the other, following the principle the codebase itself states outright about the
mesocycle control.

### 3.1 Primary navigation (bottom tab bar — mobile-first, per the client's Capacitor/Ionic stack)

1. **Today** — home. Routine picker / "continue workout" / readiness hero / streak.
2. **Train** — the active-workout screen when a session is running; otherwise redirects to Today.
   (Kept as its own tab-bar slot only while `isActive` is true — a state-conditional nav item,
   not a permanent one, so the tab bar itself reflects the state machine in §2.3.)
3. **Progress** — Ranks, Overall Rank, PR ledger, History, XP/Level.
4. **Plan** — Routines list, Routine builder/wizard, Mesocycle setup, Exercise catalog/custom
   exercises.
5. **Profile** — Onboarding profile, equipment, gym setup, bodyweight log, export/backup, sync
   status.

### 3.2 Screen inventory

**Today (home)**
- *Today / Overview* — the muscle-readiness "which muscles are recovered" hero
  (`useReadinessStore`'s `recoveredSlugs`/`heat`, driving a verdict line like "Quads, Hamstrings
  and Glutes are recovered"), streak count + tokens-remaining chip, "start today's routine"
  one-tap card list, quick-start fallback. Job: get the user into a workout in the fewest taps,
  informed by what's actually recovered — this is the screen a returning user should hit dozens
  of times a week.

**Train**
- *Active Workout* — current exercise, current set stepper (weight/reps, both increment and
  direct-entry), rest timer (per-exercise overrides), warm-up ramp insert, set-kind picker
  (normal/warmup/failure/dropset), superset round-robin indicator, jump-to-exercise rail,
  mid-session add-exercise, skip-exercise, pause/resume, cancel (confirm-tap, not a native
  dialog — `useConfirmTap.ts`), stale-session nudge banner.
- *Finish Sequence* — the reward "beat" screen: rank-ups (skippable per-beat), streak strip,
  XP/level roll-up, session summary (volume/sets/duration/muscles), optional "update routine with
  today's numbers" prompt (only surfaced when the session out-performed the routine's stored
  targets — `useRoutineBeat.ts`), share-card generation entry point.

**Progress**
- *Ranks* — every exercise with a computed rank, sorted by LP, tier/division badges, trust
  indicator, "next target" (concrete weight×reps or rep count), peak-vs-current distinction, and
  the "Rangaufstiege" 7-day weekday strip.
- *Overall Rank* — the single account-level aggregate tier/division/LP, current vs. peak.
- *Personal Records* — **new, since the `prs` table exists but is never displayed** (§2.5): one
  row per exercise×kind (e1rm/weight/reps/volume), each with an achieved date and a link to the
  set/workout that earned it. This is the single highest-value "free" screen this design can add,
  because the data is already fully modeled and populated server-side.
- *History* — reverse-chronological workout+run feed, infinite-scroll (`loadMore`), tap into a
  workout for full per-exercise/per-set detail (including per-set PR flags), delete with
  confirm-tap, share card from any past workout.
- *XP & Level* — total XP, level, progress-into-level bar. Minimal, since XP is explicitly
  "purely additive, never gates or replaces the rank system."

**Plan**
- *Routines list* — one-tap-start cards (kept deliberately light per §2.6's planning/logging
  separation), archive/reorder (drag-reorder composable), mesocycle reveal-on-demand.
- *Routine Builder / Wizard* — muscle-group-driven or manual exercise picking, equipment-aware
  substitution surfaced explicitly ("this was swapped because you don't own X"), per-set
  reps/weight/kind targets, per-exercise rest overrides, superset grouping, drag-to-reorder.
- *Mesocycle setup* — attach/end a cycle, week count (2–16), current-week indicator.
- *Exercise catalog* — browse/search, muscle tags, equipment requirements, add-custom-exercise
  form.

**Profile**
- *Onboarding / Profile* — sex, birth year, experience level, workouts/week, current bodyweight.
- *Equipment & Gym Setup* — owned equipment checklist; bar-weight-by-type (barbell/EZ-bar/
  trap-bar/dumbbell-handle) and per-plate-size inventory, feeding the plate-calculator.
- *Bodyweight Log* — simple time series, feeds rank load-ratio math and the trend calculation.
- *Data & Backup* — CSV/zip export ("own your data"), sync status/pending-count indicator.

**Cross-cutting**
- *Run Import / Manual Run Entry* — file upload (GPX/FIT), manual distance/duration entry,
  Health Connect import trigger, route map + replay for any run with points.
- *Onboarding flow* (first-run only) — profile questions, equipment, first routine or quick-start
  path (see §7).

---

## 4. Visual Hierarchy & Information-Density Rules

These rules are derived from the frequency/state evidence in §2.6, not generic taste:

1. **The set-logging path gets the lowest density and the largest touch targets of any screen in
   the app.** It is tapped ~30 times per session, per `haptics.ts`'s own comment, and the code
   already treats latency and mis-taps here as unacceptable (offline-first persist-on-every-
   mutation, the ±1-tap-was-too-slow bugfix). Concretely: one exercise, one set, two steppers
   (weight, reps) plus a direct-entry affordance, one primary "log set" action, visible at a
   glance with no scrolling. Everything else (routine name, rest timer, jump rail) is secondary
   and visually recessed.
2. **Planning screens (routine builder, mesocycle setup, equipment/gym setup) may be denser and
   more form-like.** These are "planning-desk" actions per the codebase's own framing
   (§2.3/§2.6) — the user is not mid-set, they can afford to read labels, compare options, and
   make deliberate choices. Multi-column layouts, expandable sections, and inline validation are
   appropriate here in a way they are not on the Train screen.
3. **Progress/review screens (Ranks, History, PRs) are read-dominant and can be denser than Train
   but sparer than Plan** — they are consumed passively (§2.6), so scanability (sorted lists,
   consistent badge iconography for tier/trust) matters more than input affordances. The "Ränge"
   list is already explicitly sorted by LP server-side (`routes/ranks.ts:45`) — the UI should
   preserve that ordering as the primary scan axis rather than re-sorting client-side.
4. **The Finish Sequence is the one screen allowed genuine density variation over time**: it opens
   sparse (one beat at a time, per `useCelebrate.ts`'s sequential reveal) and only becomes a dense
   summary view (volume, sets, duration, muscle map) after the celebratory beats resolve or are
   skipped. This mirrors the code's own two-phase structure: `activeIndex`-driven beat playback,
   then a static `finishedSummary`.
5. **Trust must be visually legible, not just present in data.** `standards.trust` distinguishes
   `real` (measured population data) from `derived` and `synthetic` (extrapolated) — and the
   rank-aggregate math already down-weights `synthetic` at half value
   (`packages/shared/src/rank/aggregate.ts:28`). A rank badge should carry a visibly different
   treatment (not just a tooltip) for `synthetic` standards, so users understand why some ranks
   feel "softer" than others — an honest-heuristic principle the code itself follows throughout
   (recovery.ts, decay.ts, and plausibility.ts all contain explicit "this is a heuristic, not a
   claim of precision" comments).
6. **Bodyweight-null vs. bodyweight-zero must render as visibly different affordances**, not just
   different values — the schema comment is explicit that this distinction "drives whether
   SetEntry.vue shows a weight stepper at all." A `null` target should hide the weight stepper
   entirely (pure bodyweight); a `0` target should show the stepper starting at 0 (trackable added
   load). Conflating these visually would misrepresent what the data model itself protects.

---

## 5. Motion System

Every entry below is tied to a specific, code-verified state transition — not generic animation
guidance. Two motion primitives already exist and should anchor the system rather than be
replaced: `useCountUp` (rAF roll-up, ease-out-cubic, 600ms default, collapses to instant under
`prefers-reduced-motion`) and `useCelebrate` (sequential "beat" holder, ~1400ms per beat,
skippable, collapses holds to 0ms under reduced motion). `haptics.ts` defines three tactile tiers
(`tap`/`bump`/`success`) mapped to specific moments — motion and haptics should share this same
three-tier vocabulary rather than invent a fourth.

- **A set is logged** (`activeWorkoutStore.logCurrentSet()`, `packages/client/src/stores/
  activeWorkoutStore.ts:341-405`): the store marks the set `logged: true`, persists, and either
  advances `currentExerciseIndex` (standalone exercise fully logged) or round-robins within a
  superset. → The set row should transition from "editable" to "logged" state with a quick
  confirm (matches `haptics.tap()`, already fired at "the 30x-per-session action" per its own
  doc comment) — a brief scale/opacity settle, not a bounce, because this happens dozens of times
  and any per-tap flourish that doesn't get out of the way fast becomes friction, not delight.
  When the transition also *advances* to the next exercise (an actual state change, not just a
  row update), that's the one moment worth a slightly more deliberate slide/cross-fade between
  exercise contexts — distinguishing "another set of the same thing" from "moving on."
- **The +XP chip** (`useXpChip.ts`): already spec'd as a float-and-fade over exactly 1600ms
  (900ms under reduced motion) pinned to the log-set button. Keep this pattern but make explicit
  that it is *non-authoritative* — the code's own comment calls it "a feel-good echo... never
  authoritative," meaning the animation must never block or gate the actual log-set flow; it
  layers on top, purely decorative, and must never be the thing the user waits for.
- **A rank-up or PR fires** (`RecomputeResult.rankedUp` / `newPr`,
  `packages/server/src/services/syncService.ts:66-77`): this is deliberately a rare, end-of-
  workout event — the code moved rank recompute from per-set to per-workout specifically so
  rank-ups "read as one end-of-workout moment," not scattered mid-set interruptions. This is the
  correct and only place for `haptics.success()` and the heaviest animation budget in the app: a
  full-screen beat in the Finish Sequence (tier badge reveal, division-bar fill from `prevLp` to
  100 then reset, or straight to `lp` if no rank-up — the server explicitly returns both `lp` and
  `prevLp` "so the client knows how far to animate from," `rankService.ts:81-88`). This is a
  literal, code-specified animation contract: animate the LP bar from `prevLp` toward `lp`; if
  `rankedUp` is true, animate to 100, hold, then reset to 0 for the new band, rather than a
  discontinuous jump.
- **Same-band recovery gain (no rank-up)** — `useWorkoutFinish.ts:210-218` computes a
  `recoveryGainLabel` precisely when `!r.rankedUp && r.lp > r.prevLp`: this deserves a lighter,
  single-beat acknowledgment (a small "+N LP · Rückkehr-Bonus"-style tag with a brief count-up,
  not a full celebration), because the code treats it as meaningfully different from a rank-up —
  worth noting, not worth throwing a party for.
- **Plausibility-discounted session** (`plausibilityReason` set): the code is explicit that this
  copy must be "honest... never states the exact numbers that tripped it." Motion should match:
  a muted, non-celebratory inline note, never paired with the success haptic or the rank-up beat
  animation, even when the session did technically produce SOME LP gain — the discount is the
  headline, not the gain.
- **Warm-up ramp insertion** (`insertWarmupSets()`): three new rows are prepended to the set list
  atomically. Since `canInsertWarmup` only allows this before any real work has happened on the
  exercise (`activeWorkoutStore.ts:151-160`), this is a low-frequency, deliberate action — a
  gentle insert/expand animation (rows sliding in from above) communicating "these are new,
  inserted before what you already saw" is appropriate and low-cost since it happens once per
  exercise at most.
- **Rest timer countdown**: `logCurrentSet()` returns a `restSeconds` value (or `null` for
  no-rest superset transitions) — this is a real, code-computed duration, not a UI guess. The
  timer's countdown motion should be a continuous, predictable ring/bar depletion (not a
  discrete-step animation) since the underlying value ticks in real seconds, and it should
  visually distinguish the three cases the state machine actually produces: `restBetweenSetsSeconds`
  (same exercise, next set), `restAfterExerciseSeconds` (moving to a new exercise/finishing a
  superset round), and `null` (superset mid-round, no rest at all — the timer should not appear).
- **Drag-to-reorder** (`useDragReorder.ts`): the composable already computes `translateY` offsets
  live off pointer position with `transition: "none"` on the dragged card and a shift-transform on
  displaced cards — this is intentionally snappy/1:1, not eased, because the doc comment specifies
  "following the pointer 1:1 (no jumps)." The one animation opportunity the composable leaves
  open: the *displaced* cards' shift-into-place, which currently has no transition specified, should
  get a short eased transform (~150–200ms) so the "make room" effect reads as fluid rather than
  a snap, while the dragged card itself stays perfectly pointer-locked.
- **Sync/offline transitions** (`syncStore.ts`): `pendingCount` and `flushing` are real, live
  state. A small, persistent (not modal) indicator should animate between "N pending" (queued,
  pre-flush), a brief "syncing" pulse while `flushing` is true, and a settle back to hidden/zero —
  this is the one place motion should communicate infrastructure state, because the offline queue
  is a first-class, user-relevant fact (a large pending count after a "gym basement, no signal"
  session is meaningful information, not an implementation detail).
- **Streak strip** (`streakDays` in `useWorkoutFinish.ts:132-140`): a fixed 7-cell week view built
  fresh each finish. Each active day should light up in left-to-right sequence (today's cell
  arriving last, matching the beat sequencer's "reveal in order" pattern already used elsewhere in
  the Finish Sequence) rather than all cells appearing simultaneously.
- **Reduced motion**: every one of the above must degrade the way `useCelebrate`, `useXpChip`, and
  `haptics.ts` already degrade their own effects — collapse hold-times to ~0, skip float/fade in
  favor of instant appear/disappear, and suppress haptics entirely (`haptics.ts`'s own
  `canHaptic()` check folds `prefers-reduced-motion` into the *haptic* gate too, treating a
  physical jolt as "exactly the kind of motion that preference is meant to suppress, even though
  it isn't visual" — a principle worth stating explicitly to whoever implements this system, since
  it is easy to forget that reduced-motion should mute vibration, not just CSS transitions).

---

## 6. Engagement/Retention Model (grounded in owned data only)

Liftr has no accounts, no friends, no leaderboard, no server-side notion of other users at all —
the `settings` table's own single-row design confirms this is architecturally a single-user app
(§2.1). Every retention mechanic below is therefore built from data the schema and services
already produce for *this one lifter*, with citations, and nothing invented beyond that.

1. **Streak-with-protection** (`streaks` table, `computeStreak`) — already the app's primary
   return-cadence mechanic. The design should keep protection *visible but not anxiety-inducing*:
   the code deliberately never treats "today, not yet logged" as a break, and scales the token
   pool to the lifter's own stated frequency rather than a flat number — the UI should say "streak
   protected: 2 rest days remaining" rather than a bare countdown, matching the code's framing of
   tokens as an accommodation, not a penalty clock.
2. **Rank-up / peak progression, decay-with-recovery** (`ranks`, `rank_events`,
   `packages/shared/src/rank/decay.ts`) — this is the deepest, most code-supported mechanic in the
   product: a peak that never regresses, a current band that softens with inactivity but recovers
   at a *buffed* rate once training resumes (up to 2.5x normal gain the further behind you are).
   This is structurally a "welcome back" mechanic, not a punishment — the buffed recovery curve
   exists specifically so returning after a gap feels like fast, rewarding progress back to where
   you were, not a grind starting from zero. The UI's job is to make the *buff* visible ("you're
   climbing back fast") rather than dwelling on the decay itself.
3. **Overall Lifter Rank** (`packages/shared/src/rank/aggregate.ts`) — the one genuinely new
   single-player-safe idea the code's own comment calls out: a single account-level number
   aggregating every per-exercise rank, trust-weighted. This is the natural "profile headline"
   stat — a single badge that summarizes months of varied training into one number, worth a
   prominent, persistent place (e.g. a profile-screen hero), since it is the only metric in the
   entire schema designed to answer "how good a lifter am I, overall."
4. **XP/Level, with anti-grinding decay** (`packages/shared/src/math/xp.ts`) — `computeSetXp`
   explicitly decays repeat-identical-set XP toward a floor (never zero) specifically "to engage
   the user to get further and further in their training" rather than reward mindless repetition.
   The level curve (`level = floor(sqrt(totalXp/100))`) is accelerating, so early levels come fast
   — this should be surfaced honestly as a *secondary*, purely-additive layer (the code's own
   framing: "purely additive, never gates or replaces the rank system") — a level bar is a nice
   ambient number, not the headline; the rank system is.
5. **Personal Records ledger** — currently unsurfaced (§2.5) despite being fully modeled
   (`prs` table: e1rm/weight/reps/volume per exercise, each with a set/date link). This is the
   single most concrete retention opportunity available in the data: a genuine, permanent "trophy
   case" screen costs no new backend work and gives the lifter a growing, personally-owned
   artifact of progress that has nothing to do with comparison to anyone else — consistent with
   the single-player design.
6. **Rank-events weekday strip** (`rank_events`, `computeRankEventsByWeekday`) — already built
   server-side specifically to answer "which days of the week do I actually break through," a
   genuinely useful self-pattern-recognition tool (not a manufactured streak gimmick) — worth
   keeping as a small, honest chart on the Ranks screen rather than expanding it into anything
   more game-like, since the data behind it is coarse (a rolling 7-day count) and shouldn't be
   oversold.
7. **Muscle readiness ("what should I train today")** — a genuine decision-support mechanic
   (`recovery.ts`'s own comment: "a training-decision aid, not a score"). This belongs on the
   home/Today screen precisely because it answers the question at the moment of highest
   friction (deciding whether/what to train) — every other mechanic above is *reflective* (looking
   back at progress); this one is the only *prospective* mechanic the data supports, and it should
   be treated as such: framed as a suggestion ("legs are ready"), never as a score or grade.
8. **What is deliberately NOT proposed**: no friend/social feed, no comparison to other users, no
   guild/team mechanics, no push-notification-driven "you're falling behind" pressure messaging —
   none of these have any backing table or route in the schema, and the single-`settings`-row
   design is explicit evidence the product was never meant to model other users at all. Adding any
   of that would be inventing mechanics the data model cannot honestly support.

---

## 7. Onboarding, Empty, Loading, Error, and Offline States

### Onboarding
`routes/settings.ts`'s profile schema (sex, birth year, experience level, workouts/week, current
bodyweight) plus equipment and gym setup are all optional, independently-settable fields — the
server treats an unanswered field as "unset," not as blocking. This licenses a **staged,
skippable onboarding**: ask the profile questions once, but treat every field as improvable later
(from the Profile tab) rather than a gate the user must fully clear before using the app. The
routine-recommendation engine already degrades gracefully with zero history — a brand-new user
with no `lastPerformed` data gets a standards-derived first suggestion scaled by their stated
`experienceLevel` (defaulting to "beginner" if skipped) — so onboarding can end at "pick your
first routine, or Quick Start" without ever blocking on equipment/gym setup, which can be filled
in the first time a substitution or plate breakdown would actually need it.

### Empty states
- **No routines yet**: the routine list's empty state should route directly into the
  muscle-group-driven suggestion flow (`suggestExercisesForMuscles`) — since that flow already
  handles a zero-history user gracefully, "empty routines" and "empty history" are really the same
  first-run moment and should share one entry point rather than two separate blank screens.
- **No ranks yet** (an exercise never logged, or the catalog just grew): `aggregate.ts`'s own
  design principle applies directly — "Exercises with no rank yet are excluded entirely (not
  counted as zero)... a brand-new catalog addition can't drag the aggregate down the moment it's
  added." The Ranks screen should mirror this exactly: unranked exercises simply don't appear in
  the list (not shown as "unranked" placeholders), consistent with the server never fabricating a
  zero.
- **No PRs yet**: honest empty state ("no records yet — your first working set on any exercise
  will start one"), not a fake locked/teaser state, matching the plausibility system's own ethos
  of never manufacturing false achievement.
- **No history / no runs**: distinguish "never done this" from "nothing in the current page" —
  the history store already separates `items.length === 0` (empty) from a failed `error` load
  (§below), so the UI must not conflate these.
- **Streak/readiness with zero activity dates**: `computeStreak` returns `{streak: 0,
  tokensRemaining: tokenPool}` cleanly, and `computeReadiness` returns `1` (fully "ready") for a
  muscle never trained — the readiness hero should read a first-time user as "everything is
  ready," not as a warning or gap.

### Loading states
Every store in the client (`ranksStore`, `streakStore`, `xpStore`, `overallRankStore`,
`readinessStore`, `bodyweightStore`, `historyStore`) follows an identical `loaded`/`error` pair
pattern, with a comment repeated verbatim across them: this exists specifically so a "stalled-load
banner needs to tell 'still fetching' from 'failed' apart." This is a strong, consistent signal
that the UI should render three distinct visual states per data section — not-yet-loaded
(skeleton), loaded-empty (the empty states above), and loaded-error (see below) — using the exact
same treatment across every screen that reads one of these stores, since the underlying stores are
already uniform.

### Error states
The `error: true` flag set on a failed `load()` should surface as a small, non-blocking inline
banner scoped to the affected section (not a full-screen error), since a Ranks-load failure, say,
should never prevent the Train tab from working — the stores are independent and so should the
error surfaces be. `rankEventsStore.load()` notably has *no* `error` flag at all, only a comment
("offline with nothing cached yet — the strip just doesn't render") — this one section should
simply omit itself silently on failure rather than show an error banner, since the code itself
treats it as low-stakes decoration, not core data.

### Offline states
The client ships `@capacitor/network`, IndexedDB (`idb`), and `vite-plugin-pwa` (from
`packages/client/package.json`), and the entire active-workout path is explicitly offline-first:
writes go to IndexedDB before anything else, an outbox queues mutations, and `flush()` is
best-effort, triggered on `online`/`focus`/app-`resume` events. This is strong, direct evidence
for an **offline-confidence indicator** rather than an offline-blocking one: the Train screen
must never show a spinner or block on network state (it already doesn't, architecturally) — the
UI's job is to make the *sync queue* visible (pending count, last-flush status) so a lifter who
just finished a session in a signal-dead gym basement can trust that their sets are safe, without
the app pretending the sets are "unsynced" in an alarming way. Conversely, `historyStore`'s own
comment is explicit that "history is a review surface... online-only for now" — so History,
unlike Train, is the one screen that *should* show an honest "you're offline, showing last-synced
data" state rather than pretending to be live. The distinction between these two postures (Train:
always confident, History: explicitly online-dependent) should be a deliberate, visible design
choice, not an accident of which screens happen to call which stores.

---

## 8. Summary of Design Principles and Why They Fit This Specific Product

1. **Separate by frequency, not by feature category.** The single strongest, most explicit signal
   in the codebase is the repeated distinction between the "sacred," dozens-per-session logging
   loop and "planning-desk" actions that happen rarely and can afford friction. Every IA and
   density decision above traces back to this split because the code itself enforces it
   architecturally (offline-first vs. online-only stores, fire-and-forget vs. awaited mutations,
   "kept off the routine card itself" comments).
2. **Never fabricate progress; discount honestly instead of hiding.** The plausibility gate,
   `synthetic`-trust standards, the "no rank yet excluded, not zeroed" aggregate rule, and the
   German plausibility copy's explicit "never states the exact numbers" instruction all point to
   one house style: when the system isn't sure, it says so plainly and moves on — it never fakes
   confidence. The visual and motion language (muted, non-celebratory treatment for discounted
   sessions; no locked/teaser fake-achievement empty states) follows that same ethic.
3. **Celebrate rarely and specifically, not constantly.** Rank recompute was deliberately moved
   from per-set to per-workout specifically so rewards read as one coherent moment instead of
   noise. The motion system reserves its heaviest budget (full beat sequence, success haptic,
   LP-bar fill animation) for genuine peak advancement and PRs, and keeps every 30x-per-session
   interaction (logging a set) fast and undecorated by comparison.
4. **Single-player, not social — because the data literally can't support otherwise.** No
   engagement mechanic above references other users, because none exist in this schema. This
   isn't a stylistic restraint; it's the only honest reading of a one-row `settings` table and a
   product that computes an "Overall Lifter Rank" purely from one person's own history.
5. **Surface what's already earned but hidden.** The PR ledger is the clearest example: fully
   modeled, fully computed, and never shown. Good design here isn't inventing new mechanics; it's
   finishing ones the backend already paid for.
6. **Motion should mirror real state, not decorate arbitrarily.** Every animation proposed above
   names the exact store mutation, server field, or computed value driving it (`prevLp`→`lp`,
   `rankedUp`, `restSeconds`, `pendingCount`, `flushing`) — because the codebase's own two motion
   primitives (`useCountUp`, `useCelebrate`) are already built this way, animating real deltas
   between real before/after values rather than generic entrance effects.
