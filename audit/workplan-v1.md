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

---

## 2. Personal Records ledger — corrected 2026-09-04

**This document previously stated §2 was "⏳ not started, top of the remaining work queue." That
was false and stale.** The feature is fully shipped: `packages/server/src/routes/prs.ts`
(registered), `packages/client/src/stores/prStore.ts`, `packages/client/src/pages/RecordsPage.vue`
routed at `/records`, linked from `RanksPage.vue`. Confirmed live: real PR data renders, `GET
/api/prs` returns 200, no console errors. `audit/verify/agent-1.md`, `round2-agent-2.md`.

**What's actually still open:**
- The Finish Sequence's PR beat does not link into the ledger — still a one-off in-session
  acknowledgment with no permanent home to revisit. Grep of `FinishSequence.vue` for
  record-related terms returns zero matches.
- **New bug found by live testing**: navigating to `/records` via the in-app router-link (the
  normal way a user reaches it, from `RanksPage.vue`) shows a fully blank content area for ~1-2
  seconds before data renders — reproduced 3× on fresh tabs. A direct/hard URL load does not show
  this. Likely a mount/fetch-sequencing issue in `RecordsPage.vue` (late `onMounted` fetch, missing
  loading skeleton, or a router-transition timing issue) — not investigated further.
  `audit/verify/round2-agent-2.md`.

---

## 3. Open items

### 3.1 Custom exercise creation loses the display name (new, high severity)

Creating a custom exercise with any name (confirmed with umlauts, likely affects all names) saves
successfully — slug transliteration works, no crash — but **the exercise then has no display name
anywhere**: the list tile, the detail sheet, and the raw `GET /api/exercises` response all show/
return only the machine slug (e.g. "ueberkopfdruecken-test"), never what the user typed. This is
worse than the previously-fixed "umlaut corruption" bug (that fix only addressed the slug itself,
not the missing name field). Root cause not yet traced — needs investigation in
`packages/server/src/repositories/exerciseRepository.ts` and/or the client's exercise-name
resolution path. `audit/verify/round2-agent-4.md`.

### 3.2 Manual run-entry client-side validation doesn't actually surface errors

Round 1 verified the `manualError`/try-catch code path exists in `RunsPage.vue`. Live testing shows
it's only reachable via a genuine server-side rejection — the Save button stays `disabled` on
blank/invalid client input (`canSubmitManual` gates on `Number(...) > 0`), so no inline error ever
appears for the natural "user typed garbage" case. Minor UX gap, not a data-integrity issue.
`audit/verify/round2-agent-6.md`.

### 3.3 Light mode doesn't visually apply to Ranks-page surfaces (bug, not a design question)

Toggling to light mode correctly sets `data-theme="light"` and `--bg` correctly resolves to
`#f6f4fb` in CSS, but the rendered background of the tier-ladder panel and exercise cards on
`/ranks` stays near-black. This is a genuine rendering bug — do not confuse it with the (already
resolved, correct-by-design) decision to keep the dark-mode ground neutral rather than
violet-tinted; that's a different, settled question. See `audit/nebula-design-system.md` §6.
`audit/verify/round2-design-agent-3.md`.

### 3.4 Track R Foundation primitives — partially orphaned

- `ThumbZoneAction.vue` and `DensityScope.vue`/`useDensityMode` exist in code but have **zero live
  consumers anywhere in the app** (confirmed via DOM query across all 6 major screens). Either wire
  them in where originally intended, or remove them — dead primitives that nothing uses are worse
  than no primitive, since they falsely signal "this is handled."
- `TruncatingLabel.vue` is only adopted in one place (`ExerciseRow.vue`, the routine reorder list).
  `RanksPage.vue`'s exercise-name element and `WorkoutPage.vue`'s active-exercise heading both still
  mid-word-break (`overflow-wrap: break-word`) — the exact bug the primitive was built to eliminate
  "at the primitive level so it cannot recur." It recurred. `audit/verify/agent-3.md`,
  `round2-agent-1.md`.

### 3.5 Rank-up ring/glow — needs a one-time live confirmation, not a rebuild

`FinishSequence.vue`'s `.badge-ring`/`.badge-ring-muted` split exists in code and is structurally
scoped correctly (never reachable from the plausibility-discounted branch). No session in either
verification round produced an actual rank-up crossing live, so the ring/glow's rendering during a
real beat has never been visually confirmed. Cheapest way to close this: deliberately engineer a
small, plausible, near-threshold improvement and complete the workout. `audit/nebula-design-plan.md`
Phase N2, `audit/verify/round2-agent-3.md`.

### 3.6 Minor live-only defects found, not yet triaged for priority

- `GET /api/settings/gym` returns HTTP 500 on every page load (app degrades silently, doesn't block
  rendering). `audit/verify/round2-agent-3.md`.
- Recurring Vue warning on every Overview mount: `ErholungszoneCard` receives non-props attributes
  it can't inherit (fragment root component). Cosmetic — the `tile--priority` class still applies
  one level up. `audit/verify/round2-agent-5.md`.
- Recurring Ionic Vue console exception (`insertBefore` on null, in `removeViewFromDom`) firing
  roughly every 35-90s throughout live sessions, independent of user action — some background
  overlay/controller trying to dismiss an already-removed view. `audit/verify/round2-agent-4.md`.
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
  - **Proposed fix for review (NOT applied — no code changed this pass):** give `SheetModal.vue`'s
    own `@did-dismiss` handler one tick of separation from the `close` emit it triggers (e.g.
    `@did-dismiss="() => nextTick(() => emit('close'))"`, or defer via `queueMicrotask`/
    `requestAnimationFrame` — whichever is verified live to actually close the race, since `nextTick`
    alone may still land inside the same microtask queue Ionic's own teardown promise resolves
    through). Centralizing the deferral in `SheetModal.vue` itself would fix every caller at once
    rather than requiring each of the ~6 call sites to add its own delay. This needs a human/live
    verification pass before landing, not a blind patch — the exact deferral primitive matters and
    wasn't verified here.

### 3.7 Streak/XP mechanics redesign — spec written, not implemented

`docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md` defines per-set XP (weight-
independent), a consistency bonus, and a variety bonus, replacing the current weight-fabricable
formula. Confirmed not yet implemented: `packages/shared/src/math/xp.ts` still uses the old formula;
no `consistencyBonusXp`/`varietyBonusXp` anywhere in the repo. This is the one deliberately-deferred
item from Track R Wave 1 (needed a real product-owner brainstorm, not autonomous invention) — ready
for `writing-plans`. `audit/verify/agent-8.md`.

### 3.8 Anti-farming copy reception — needs a real-user check

Still genuinely open, unchanged from prior rounds: the plausibility-discount message's wording
("this session felt unusually fast — rank/XP gain reduced") has never been checked against how a
real recipient reads it — protective signal vs. accusation. Copy-only if it needs changing; the
underlying mechanism is correct and untouched.

### 3.9 Missing-photo catalog gap — resourcing decision, not a design one

11 of ~94 catalog exercises have no photo (fallback to a generic equipment glyph). Decided
direction: source real photos where feasible, closer-matching placeholder otherwise; full-catalog
custom illustration explicitly deferred as its own separate initiative (out of scope for now). See
`audit/missing-photo-sourcing-research.md` for sourcing research.

### 3.10 Share-card palette vs. app palette — open product-identity call

`shareCard.ts`'s stat-card accents (violet, gold/`--pr`) aren't drawn from the app's own semantic
color system (blue=primary, orange=streak/status). Self-consistent as its own artifact; whether a
shareable image is allowed a distinct identity from the app itself is an open call, not a citable
violation. See `audit/share-card-design-variations.md` for concrete redesign options already
explored.

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
