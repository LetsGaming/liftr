# Liftr — Development Workplan v1

**Status as of 2026-09-04.** This is the single source of truth for what's actually shipped vs.
actually open in Liftr. It absorbs and supersedes `plan-a-engagement-gamification.md` and
`plan-b-ui-standards-fix.md` (both deleted this session — every item in both was already resolved
and cited here) and `plan-c-new-ui-rebuild.md` (moved to `audit/finished/`, its six phases executed
and merged as "Track R"). Every claim below is sourced either from direct source citation or from
one of two independent verification passes run this session: round 1 (static code read, agents 1-8,
see `audit/verify/SUMMARY.md`) and round 2 (live browser testing + rendered design-fidelity
comparison, agents 1-6 + design-agents 1-3, see `audit/verify/ROUND2-SUMMARY.md`). Where an item was
corrected by those passes, that's stated explicitly, not silently folded in.

**Visual identity ground truth:** `audit/nebula-design-system.md` and
`audit/nebula-design-components.md` are now the normative spec for Liftr's visual identity
(superseding the deleted `nebula-design-philosophy/framework/layout/patterns.md`, consolidated this
session). Read those before touching any color/chrome/CTA/reward-surface code — they state what
must be true, not just what was once proposed.

---

## 1. Done — verified, no action needed

Condensed to one line each with a pointer to the evidence; full history lives in
`audit/finished/*.md` and `audit/verify/*.md` if you need it. Do not re-open these.

- **Phase 0 universal correctness fixes** (routine-save fractional-rep crash, NumberStepper
  digit-concatenation, duplicate finish-screen XP display, persistent top-HUD during logging,
  muscle-diagram stretch glitch, 44px touch-target floor, segmented-control neutral color, token
  reveal/hide toggle on both Profile and AuthGate, wizard fast-path step relabel, bottom-anchor CTA
  copy) — all verified shipped and correct. `audit/verify/agent-1.md`.
- **Personal Records ledger** — see §2, corrected below; the *feature* is done, one integration gap
  and one live bug remain open.
- **Reward-signal legibility** (`standards.trust` rendered on Ranks/Progress/exercise-info screens,
  Overall Lifter Rank surfaced on Overview/Ranks/Workout/WorkoutDetail) — verified present and
  wired. `audit/verify/agent-1.md`, `agent-2.md`.
- **RPE and notes surfacing** — shipped 2026-09-04: `RpeCapture.vue`/`NoteCapture.vue`, off the
  primary logging path, never blocking "Satz speichern," confirmed live via real clicks (sheet
  opens, picks an option, logs without RPE set). `audit/verify/round2-agent-3.md`.
- **`engagement-audit-v5` carry-forward** (Overview/Ranks/Profile duplication cut, Profile domain
  grouping into 4 sections, Overview priority tiles) — verified shipped and correct live.
  `audit/verify/round2-agent-2.md`, `round2-design-agent-1.md`.
- **Track R (the full UI rebuild, formerly "Plan C")** — six phases (Foundation, Today/Train,
  Finish & Progress, Plan, Profile/Auth, Runs) executed via subagent-driven development and merged
  to master, commit range `9daef8e..f7f2256`. Nearly every claimed feature was independently
  reproduced live: RPE/notes capture, RestTimer 3-state rendering, non-modal sync indicator, mobile
  exercise rail, plausibility-discount muting (verified live by forcing an implausible session — the
  app correctly flagged and suppressed the gain with the exact expected copy), drag-to-reorder,
  equipment-substitution copy naming the specific missing item, muscle-coverage/lopsided-distribution
  review checks, auth 401 gate, CSV/ZIP export, PR ledger. Full detail:
  `audit/finished/plan-c-new-ui-rebuild.md`, `audit/verify/round2-agent-3.md`,
  `round2-agent-4.md`, `round2-agent-6.md`.
- **Rank engine v2** (9-tier ladder, peak/decay/recovery-gain, plausibility gate, XP discounting) —
  fully implemented and tested (260/260 tests passing). One real gap the plan itself never
  anticipated: migration 0009 didn't remap pre-existing rows holding old 5-tier strings; caught and
  fixed by a later migration (`0010_remap_legacy_tier_strings.sql`), already shipped. Design spec's
  exact plausibility threshold numbers are stale (tightened later by engagement-audit-v3) — the
  mechanic is correct, only the spec's literal numbers drifted. `audit/verify/agent-5.md`.
- **Nebula chrome/CTA layer (N0-N1)** — tokens, light-mode base palette, theme store, `.btn-primary`
  gradient — confirmed shipped AND confirmed live/rendered correctly on Overview, Workout, and
  Profile in both themes. `audit/nebula-design-plan.md`, `audit/verify/round2-design-agent-1.md`
  through `-3.md`.
- **§3.6's gym-setup 500 (WS1, 2026-09-04)** — was one bad legacy-shaped row in the dev DB, not a
  code bug; reset directly (`GET /api/settings/gym` returns 200, confirmed live in a fresh boot
  console with zero errors).
- **§3.1's custom-exercise display-name bug (WS2, 2026-09-04)** — the dead `nameKey` column
  (never read by any display code, for custom *or* catalog exercises) is gone, replaced by a real
  `name` column populated for custom exercises. `useExerciseName()` now checks it first via an
  optional second parameter, threaded through the ~9 call sites that have the exercise object in
  hand. Verified live end-to-end: created a custom exercise with an umlaut name
  ("Überkopfdrücken WS2 Live-Test"), confirmed it renders correctly in the list and round-trips
  byte-for-byte through the raw `GET /api/exercises` response; catalog exercises still resolve
  their i18n names unaffected. 261/261 tests, clean typecheck across all 5 packages, clean lint.
  Merged to master.
- **§3.10's share-card palette (2026-09-04)** — see §3.10 below for the full decision; Nebula Halo
  palette adopted, tier medal demoted to a top-right corner stamp, freed space handed to the
  muscle figures and exercise grid. Verified live across three scenarios, no overlap.
- **WS3 client UI cleanup batch (2026-09-04)** — closes §3.2, §3.3, §3.4, and the ErholungszoneCard
  half of §3.6, all in one worktree/commit: manual run-entry validation now surfaces real per-field
  German error messages (extracted to a pure, tested `validateManualEntry()`, 12 new tests) instead
  of a silently-disabled button; the `/records` blank-flash bug is fixed (a real visible loading
  skeleton, gated on the store's `loaded`/`error` state and rendered immediately on mount — see §2
  for the 2026-09-05 live re-verification, which found no separate `router.beforeResolve` guard in
  the codebase; the skeleton alone is sufficient); light mode now correctly applies to Ionic chrome, the theme-color
  meta tag, and text sitting on the (deliberately still-dark) tier surfaces on `/ranks`, via the
  same locally-pinned-token pattern `.panel-reward` already established; `ThumbZoneAction.vue` and
  `DensityScope.vue`/`useDensity.ts` are deleted outright (confirmed zero consumers via a repo-wide
  grep sweep) rather than left as dead code; `TruncatingLabel.vue` is now adopted at the two
  remaining sites where the mid-word-break bug it exists to prevent had recurred (`RanksPage.vue`,
  `WorkoutPage.vue`'s active-exercise heading), verified live at desktop and ~390px mobile width.
  273/273 tests, clean typecheck across all 5 packages, clean lint. Merged to master.

---

## 2. Personal Records ledger — corrected 2026-09-04

**This document previously stated §2 was "⏳ not started, top of the remaining work queue." That
was false and stale.** The feature is fully shipped: `packages/server/src/routes/prs.ts`
(registered), `packages/client/src/stores/prStore.ts`, `packages/client/src/pages/RecordsPage.vue`
routed at `/records`, linked from `RanksPage.vue`. Confirmed live: real PR data renders, `GET
/api/prs` returns 200, no console errors. `audit/verify/agent-1.md`, `round2-agent-2.md`.

**Finish Sequence → ledger link — closed by WS4 Wave 7 (2026-09-04).** The gap this section
originally flagged (no permanent link from the Finish Sequence's PR beat into the ledger) is fixed:
`FinishSequence.vue` now has a "🏆 Rekorde ansehen" link to `/records`, added as part of the
streak/XP mechanics work (see §3.7). This bullet is stale — kept here only long enough to record
the closure.

**Router-link blank-flash bug (`round2-agent-2.md`) — verified already resolved, 2026-09-05.**
`round2-agent-2.md` found that navigating to `/records` via `RanksPage.vue`'s in-app router-link
showed a fully blank content area for ~1-2 seconds before data rendered (reproduced 3× on fresh
tabs), unlike a direct/hard URL load. That report predates same-day WS3 client UI cleanup work,
which added `RecordsPage.vue`'s `.pr-skel-row` shimmer skeleton (gated on
`!prStore.loaded && !prStore.error`, rendered immediately on mount, not on fetch completion). Live
re-verification via an isolated Playwright session (`http://localhost:5174`, dev server, real
click on the `RanksPage.vue` router-link, not a hard load): with `/api/prs` running at its normal
near-instant local latency AND with `fetch` monkey-patched to artificially delay `/api/prs` by
700ms/900ms/1800ms to stress-test the gap, `.main-content`'s `innerHTML` was sampled every 10-15ms
across the whole transition in every run — it was never empty in any run. The outgoing
`RanksPage.vue` content stays visible through the `route-fade` leave transition (~135-150ms, the
existing `--dur-fast` transition, not a bug), then the skeleton is already mounted and painted by
~150ms, well before any of the artificially delayed fetches resolved. No `router.beforeResolve`
chunk-prefetch guard exists in this codebase (searched `router.ts`, `main.ts`, `App.vue` — none
found), so the "beforeResolve guard" some prior note attributed to the WS3 batch was not actually
part of what shipped here; it turned out not to be needed; the skeleton alone closes the gap the
bug report described. Moving this out of "still open" — `round2-agent-2.md` is a historical record
of a real bug that existed at the time it was written, not a currently-accurate status.

---

## 3. Open items

### 3.5 Rank-up ring/glow — CLOSED, verified live 2026-09-05

`FinishSequence.vue`'s `.badge-ring`/`.badge-ring-muted` split exists in code and is structurally
scoped correctly (never reachable from the plausibility-discounted branch). No session in either
verification round produced an actual rank-up crossing live, so the ring/glow's rendering during a
real beat had never been visually confirmed. Closed by deliberately engineering a small, plausible,
near-threshold improvement and completing the workout live in a dev instance (fresh bootstrapped DB,
`packages/server` on :3012, `packages/client` on :5183): a brand-new test profile's first-ever logged
set on Langhantel-Kniebeuge (back squat), 70 kg x 5 (e1RM/BW ratio ~1.09 against the default 75 kg
bodyweight fallback) — a genuine first-ever peak, so `rankService.ts`'s jump/ceiling plausibility
checks can't even fire (no `storedPeakRatio` yet) and the session's pace (single set, minutes
elapsed) was nowhere near the pace-discount floor. `applySyncBatch`'s `finish_workout` returned this
as a non-discounted (`plausibilityNote: null`) rank-up, and the client's Finish Sequence Beat 1
rendered the full colorful `--nebula-grad` `.badge-ring` around the tier badge exactly as designed —
confirmed via screenshot, not the muted `.badge-ring-muted` gray fallback, with no
`.rankup-row.discounted` desaturation and no plausibility-note caption. Repeated on a second live
session with a further plausible squat progression (82.5 kg → 90 kg x 5, a ~9% same-exercise jump,
also comfortably under the 40%-fine plausibility threshold) crossing another division boundary,
confirming the ring renders consistently across repeated genuine rank-ups, not just a first-ever
peak. No code changes were needed — the CSS/logic split works exactly as designed. Verified live:
this session, screenshot evidence in-session (not persisted to the repo). `audit/nebula-design-plan.md`
Phase N2, `audit/verify/round2-agent-3.md`.

### 3.6 Minor live-only defect — CLOSED, fixed and verified live 2026-09-05

Recurring Ionic Vue console exception (`insertBefore` on null, in `removeViewFromDom`) firing
roughly every 35-90s throughout live sessions, independent of user action — some background
overlay/controller trying to dismiss an already-removed view. `audit/verify/round2-agent-4.md`.
This is the one item this workplan explicitly does NOT want autonomously code-guessed — an
exhaustive static search already ran with no conclusive culprit found (see the implementation
plan's WS5 for the discriminating test to run instead: reproduce in a production build with the
service worker unregistered, "pause on exceptions" on, capture the full stack).

  **UPDATE (2026-09-05), live production-build investigation per this item's own instruction (WS5
  discriminating test — prod build, service worker unregistered, full stack captured via
  chrome-devtools-mcp `list_console_messages` with `includeStackTraces`, cross-referenced against
  source via a temporary sourcemapped rebuild, reverted afterward — no speculative fix applied to
  app code):**

  - **Reproduces deterministically, on demand, on *any* SheetModal-based Ionic modal dismissal** —
    it is not a mysterious background timer. Confirmed twice independently, on two unrelated
    modals, each a clean click-to-close with zero other concurrent activity:
    1. Dismissing the first-run onboarding wizard (`OnboardingGuide.vue`) via its "Später" (skip)
       button.
    2. Cancelling the routine builder (`RoutineWizard.vue`) via its "✕" close button with nothing
       yet selected (`requestClose()` -> `sheetRef.value?.dismiss()`).
    A **200-second pure-idle window** (service worker unregistered, zero interaction, console
    watched throughout) produced **zero** occurrences — ruling out a genuine background
    interval/timer as the mechanism. A third modal (ExercisesPage's "+ Eigene Übung hinzufügen"
    custom-exercise form, also `SheetModal`-based but with no inner step `<Transition>`) was
    dismissed the same way and did **not** reproduce it in this session, which is suggestive
    (not proof) that an inner `<Transition>` around step content increases the odds of hitting the
    race, rather than being strictly required. The original round-2 report's "every 35-90s,
    independent of action" read is best explained by ordinary UI-testing pacing: with the bug
    firing on essentially every sheet-modal close in the app, it will surface at roughly whatever
    cadence a tester happens to open/close things — no separate periodic mechanism is implicated.
  - **Full captured stack** (chunk names below are from the very first repro, before the
    sourcemapped rebuild):
    ```
    TypeError: Cannot read properties of null (reading 'insertBefore')
      at oc (vue-vendor-DNpSZe59.js:13:660)
      at is (vue-vendor-DNpSZe59.js:13:596)
      at wn (vue-vendor-DNpSZe59.js:13:59)
      at no (vue-vendor-DNpSZe59.js:13:1859)
      --- Promise.then -----------------------
      at eo (vue-vendor-DNpSZe59.js:13:1115)
      at ur (vue-vendor-DNpSZe59.js:13:1084)
      at S.scheduler (vue-vendor-DNpSZe59.js:13:29026)
      at trigger / notify / set value (vue-vendor-DNpSZe59.js:9:...)
      at d.value.I.onClose... (index-BeMeFz7r.js:2:38208)   // App.vue: showOnboarding = false
      at I.onClose... (index-BeMeFz7r.js:2:23253)             // OnboardingGuide.vue: emit('close')
      at I.onDidDismiss... (index-BeMeFz7r.js:2:20853)        // SheetModal.vue: @did-dismiss handler
      at ionic-vendor-DGlawHyM.js:263:25225 / emit / ei
      --- await ------------------------------
      at dismiss (ionic-vendor-DGlawHyM.js:219:24699)          // Ionic's real overlay dismiss()
      --- await ------------------------------
      at i / De (index-BeMeFz7r.js:2:20276 / 2:23095)          // OnboardingGuide.vue: skip()
    ```
    The second repro (routine-wizard cancel), captured **with sourcemaps enabled**, resolves the
    same shape directly to source with no ambiguity left:
    ```
    TypeError: Cannot read properties of null (reading 'insertBefore')
      --- Promise.then -----------------------
      at C (WorkoutPage-Ow32FmsN.js:1:34363)                  -> useRoutineManagement.ts:61
                                                                  (onRoutineCreated: showBuilder.value = false)
      at V.onClose... (WorkoutPage-Ow32FmsN.js:1:31328)       -> RoutineWizard.vue:427
                                                                  (@close="emit('created')")
      at  (SheetModal.vue:125:19)                             -- @did-dismiss="emit('close')"
      --- await ------------------------------
      at dismiss (SheetModal.vue:99:98)                       -- modalRef.$el.dismiss()
      at Ge (WorkoutPage-Ow32FmsN.js:1:31019)                 -> RoutineWizard.vue:387
                                                                  (requestClose(): sheetRef.dismiss())
    ```
  - **Diagnosis (evidenced, not fully proven — flagging as a fix proposal for review, not applied):**
    `SheetModal.vue` already implements the documented fix for the *previous* version of this same
    crash class (see its own header comment, and `App.vue`'s comment on `showOnboarding`): every
    caller is supposed to unmount only in response to `@close`, which `SheetModal.vue` only emits
    from `@did-dismiss` — i.e., *after* Ionic's own async dismiss teardown reports itself complete.
    Both captured traces confirm callers are doing exactly that (`RoutineWizard.vue:427`,
    `App.vue`'s `showOnboarding` watcher/handler). Despite following that rule correctly, the crash
    still happens **synchronously inside the `did-dismiss` handler's own call stack** — the parent's
    state flip (`showOnboarding.value = false` / `showBuilder.value = false`) triggers Vue's
    reactive unmount of the whole modal subtree in the same tick `did-dismiss` fired in, with no
    `nextTick`/microtask gap. If Ionic's `did-dismiss` event fires slightly before Ionic's own
    internal overlay-stack bookkeeping (`hasController`, per the original report's stack) has fully
    detached/cleaned up that DOM subtree, Vue's own unmount patch can end up operating on a node
    whose parent Ionic has already pulled out from under it — `insertBefore`/`removeChild` on a now-
    null `parentNode`. This would explain why the fix that closed the *previous* incarnation of this
    bug (routine-wizard/workout-delete, "fixed elsewhere") didn't fully close this one: it moved the
    unmount from "immediately on user action" to "on `@close`," but never added a tick of separation
    between Ionic's teardown completing and Vue's own unmount running.
  - **Ruled out:** a genuine `setInterval`/background-timer source (200s clean idle, zero
    occurrences; the only intervals in the client are `RestTimer.vue`, `WorkoutClock.vue`,
    `useCelebrate.ts`'s beat timer, and `NumberStepper.vue`'s press-and-hold repeat — none run
    without an active workout/press, and none touch an Ionic overlay). `ToastHost.vue` — it's a
    plain Vue `<TransitionGroup>` over a local array, not an `IonToast`/Ionic overlay at all, so it
    cannot be the "background overlay/controller" the original report speculated about.
  - **FIX APPLIED AND VERIFIED LIVE (2026-09-05):** `SheetModal.vue`'s `@did-dismiss` now defers
    its `close` emit by one `requestAnimationFrame` tick instead of emitting synchronously
    (`nextTick`/`queueMicrotask` were considered and rejected — both can still land inside the
    same microtask queue Ionic's own teardown promise resolves through, per the diagnosis above;
    `requestAnimationFrame` guarantees real separation). Centralized in `SheetModal.vue` itself, so
    every one of its ~6 callers is fixed at once. Verified live in a fresh production build
    (`pnpm --filter @liftr/client build`, served from the built server, service worker
    unregistered): reproduced both of the original crash scenarios — onboarding wizard "Später"
    and routine-builder "✕" cancel — repeating the routine-builder cancel 3× in direct succession
    (previously a reliable, deterministic repro on every attempt). Zero `insertBefore` exceptions
    across all runs. `pnpm -w test` (306/306), `typecheck`, `lint` all clean.

### 3.7 Streak/XP mechanics redesign — shipped 2026-09-04 (WS4)

`docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md`'s per-set XP (weight-independent),
consistency bonus, and variety bonus are implemented end-to-end across 7 waves: XP formula +
anti-cheat math (`packages/shared/src/math/xp.ts`), DB migration 0014 adding
`consistencyBonusXp`/`varietyBonusXp` columns, previous-workout/muscle-overlap queries, bonus
summing, client sync/finish-workout state plumbing, Finish Sequence XP breakdown UI + recap chip
total, and a PR-ledger link from the Finish Sequence into `/records` (closing part of §2's gap).
306/306 tests, clean typecheck (5 packages), clean lint. Live-verified against a real running server
over real HTTP round-trips (not just unit tests): an identical 8-rep set at 20kg vs. 500kg produced
the exact same 240 XP delta (anti-cheese: weight cannot inflate XP), and a same-exercise/same-reps
set logged 4x in one workout with cosmetically nudged weights (20/20.5/20/20.25kg) scored well below
the undecayed 4x estimate (anti-nudge: repeat-decay isn't dodged by trivial weight changes).

### 3.8 Anti-farming copy reception — addressed (copy reworded)

Reviewed against the human-writing-style audit (2026-09-05). The old wording used "wirkte
unrealistisch" ("seemed unrealistic") and "wirkte ungewöhnlich schnell/groß" ("seemed unusually
fast/large") for the trigger clause, then a passive, agentless "Rang- und XP-Gewinn wurden
reduziert" ("rank and XP gain were reduced") for the consequence. Read from a real recipient's
seat, "unrealistisch" applied directly to a value the user actually lifted reads as a verdict on
their honesty, not a system safeguard — closest to an accusation of the three, and the passive
consequence clause reads as a bureaucratic penalty notice rather than a protective/transparent
explanation.

Reworded (`useWorkoutFinish.ts`'s `PLAUSIBILITY_NOTE_DE`) to drop "wirkte"/"unrealistisch"
entirely and reframe the consequence as the system being cautious rather than a punishment for a
verdict already rendered:
- pace: "Diese Session war ungewöhnlich schnell — dein Rang- und XP-Gewinn fällt deshalb
  vorsichtiger aus."
- improbable_jump: "Dieser Sprung war ungewöhnlich groß — dein Rang- und XP-Gewinn fällt deshalb
  vorsichtiger aus."
- exceeds_ceiling: "Dieser Wert liegt ungewöhnlich hoch — dein Rang- und XP-Gewinn fällt deshalb
  vorsichtiger aus."

Still states only that the value/session was statistically unusual, never a number or threshold
(constraint from the comment above `PLAUSIBILITY_NOTE_DE` preserved). "fällt vorsichtiger aus"
("turns out more cautious") keeps the outcome first-person-possessive and attributes the caution
to the system's process, not to a claim that the user faked the number. No mechanism change; copy
only. Rest of the client's user-facing strings (`locales/de.json`, `locales/exercises.de.json`,
and inline copy across `pages/`/`components/`) were audited against the same skill and found
already in the app's established direct, concrete, non-corporate voice — no further changes
warranted there.

### 3.9 Missing-photo catalog gap — closed for 10 of 12 (2026-09-05)

Corrected count: **12** of 94 catalog exercises had no photo, not 11 — `curated.yaml`'s own
header comment always said 12; the "11" was stale in this doc and in
`ExerciseThumb.vue`'s doc comment (both now fixed). Full-catalog custom illustration remains
explicitly deferred as its own separate initiative (out of scope) — see
`audit/missing-photo-sourcing-research.md` §4 for that reference material.

Acting on the research doc's recommendation, implemented in this pass:

- **8 slugs got real free-exercise-db photos** (Unlicense, zero new licensing, matches the
  existing photo pipeline exactly): `glute-bridge` (`Butt_Lift_Bridge`), `side-plank`
  (`Side_Bridge`), `hip-abduction-machine` (`Thigh_Abductor`), `machine-chest-press`
  (`Leverage_Chest_Press`), `pec-deck` (`Butterfly`), `neutral-grip-pullup` (`V-Bar_Pullup`),
  `chest-supported-row` (`Leverage_Iso_Row`), `diamond-pushup`
  (`Push-Ups_-_Close_Triceps_Position`). Pure `curated.yaml` `freeExerciseDbId:` additions +
  `pnpm ingest --images`; no code changes needed.
- **2 slugs got real wger photos** (CC-BY-SA 4.0): `single-leg-rdl` (wger exercise 1736,
  "Single-Leg Deadlift with Dumbbell" — a different wger entry than the one already joined via
  `wgerId: 1388`, which has no photo of its own) and `pike-pushup` (wger exercise 454). This
  needed a small, precedented pipeline addition: a new `wgerImageId` field on
  `tools/catalog/curated.yaml` entries (`packages/ingest/src/catalogSchema.ts`), a second
  downloader branch in `packages/ingest/src/ingestImages.ts` that queries
  `wger.de/api/v2/exerciseimage/?exercise=<id>` and mirrors the single main photo to
  `data/images/<slug>/start.jpg` (no `end.jpg` — wger has no start/end pair; `ExerciseDemo.vue`
  already degrades a missing single frame gracefully), and one new attribution row in
  `AttributionsPage.vue` naming both authors. **`pike-pushup`'s photo is flagged
  `is_ai_generated: true` by wger's own API** — noted plainly in the attribution and in
  `curated.yaml`'s comment rather than hidden; it's the only candidate found anywhere for that
  movement (free-exercise-db, wger's other 373 images, workout-guide, Commons) and is still a
  correctly-posed CC-BY-SA photo.
- **`landmine-press` deferred** (the 1 illustration-fallback candidate, `bryllim/workout-guide`'s
  CC BY-SA 4.0 SVG frames): not done in this pass. The pipeline's `hasImage`/`start.jpg` convention
  assumes raster images served with a `.jpg` extension; browsers only content-sniff a fixed set of
  raster signatures for `<img>` (PNG/JPEG/GIF/WEBP/BMP/ICO — confirmed this works for the wger PNGs
  above), not SVG, so an SVG frame saved as `start.jpg` would serve with `Content-Type: image/jpeg`
  and fail to render. Doing this properly needs a small extension-aware change in three places
  (`exercises.ts`'s `hasImage` check, `ExerciseThumb.vue`, `ExerciseDemo.vue`), which is more than
  the one-field pattern used for the wger case above — left as a follow-up, not attempted under
  this pass's time budget per the research doc's own priority order (explicitly lower priority
  than the photo wins).
- **`goblet-lunge` remains the one deliberate placeholder** — genuinely unsourceable (no goblet
  lunge in free-exercise-db, wger's 374-image set, workout-guide's 302, or Commons), unchanged,
  keeps `ExerciseThumb.vue`'s softened radial-gradient fallback.

Verified live: server + client dev servers started, `/api/exercises`'s `hasImage` flag flips to
`true` for all 10 fixed slugs and stays `false` for `goblet-lunge`/`landmine-press`; confirmed via
browser automation that the exercise list renders decoded photos (non-zero `naturalWidth`/
`naturalHeight`) for `glute-bridge`, `single-leg-rdl`, `pike-pushup`, `diamond-pushup` and
`pec-deck`, and that `goblet-lunge` still renders the icon fallback with no `<img>` at all.
`pnpm -w test` (260/260), `typecheck`, and `lint` all clean after the change. `data/images/` is
gitignored (matches existing convention) — only the `curated.yaml`/ingest/attribution code changes
are committed, not the downloaded image files; a fresh checkout regenerates them via
`pnpm ingest --images`.

### 3.10 Share-card palette vs. app palette — resolved 2026-09-04

Decided: **Variation 1 ("Nebula Halo")** from `audit/share-card-design-variations.md`, with one
product adjustment beyond that document's own text — the tier medal, "Tier Division", "Level N",
and the rank-up caption move out of the card's centered main-content flow into a small top-right
corner stamp (`drawCornerBadge` in `packages/client/src/lib/shareCard.ts`, ~110px vs. the old
168px, "less in the foreground"). The vertical space that freed up went to
`MUSCLE_FIG_H` (300→360) and `EXERCISE_ROW_H` (118→136), per direction: "the gained space should
be filled with a size adjustment for the trained muscle groups, as well as the exercises."
Background glow, wordmark, and two of four stat-card accents now use the Nebula brand gradient
(`--nebula-1/-m/-2`) in place of the old plain-blue values, closing this open question in favor of
brand-consistent, not app-independent. Verified live: normal case, no-badge case, and a long-name +
long-rank-up-caption stress case all render cleanly with no overlap. 261/261 tests, clean
typecheck, clean lint.

---

## 4. Explicitly out of scope

- Any social/multi-user feature (leaderboards, friends, public profiles, percentile comparison) —
  structurally unbuildable on the current single-bearer-token, no-accounts backend.
- Masked/near-miss reward targets, currency/cosmetics economy, chrome-hiding celebration
  interstitials, gated onboarding quests — each rejected against the product owner's own stated line
  against manipulative patterns.
- Full IA rework — live-tested verdict stands ("the organization is right, mostly"); the five-tab
  flat nav (Overview/Workout/Ranks/Exercises/Profile) is the accepted shipped shape, not the older
  five-zone Today/Train/Progress/Plan/Profile concept some early planning docs described.
- Auto dark/light switching from OS preference beyond the existing first-launch default — revisit
  only if user feedback specifically asks for it.
- Changing the 9-tier badge system's own colors, or adding a second brand gradient — both rejected
  outright per `audit/nebula-design-system.md` §1.

---

## 5. Provenance (historical, for citation-tracing only)

This document originally merged three research passes (`audit/research/lens-1/2/3`) and three
phase-driven plans (Plan A/B/C) into one sequenced workplan, then tracked the product-owner decision
to pursue a full rebuild ("Track R"), the Nebula visual-direction exploration, and Track R's
six-workstream execution through to merge. That full narrative history — the fork decision, the
interview transcript, the phase-by-phase execution log — is preserved in git history and in
`audit/finished/plan-c-new-ui-rebuild.md`; it is not repeated here since every item it tracked is
now resolved (§1 above) or superseded by a corrected open item (§2-3 above). If you need the
original reasoning for a specific already-shipped decision, `git log` on this file or read the
`finished/` closure notes — don't treat this document's history as still-authoritative context for
new work.
