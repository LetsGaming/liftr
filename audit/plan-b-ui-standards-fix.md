# Plan B — UI Standards Fix (fix-in-place)

**Scope:** fix every place Liftr's current UI fails a citable, external standard — WCAG, Apple
HIG / Material Design touch-target convention, a Nielsen usability heuristic, or a plain
functional bug — without reorganizing the information architecture or rebuilding any screen from
scratch. This is a rework plan for the existing component structure, not a redesign. Engagement
mechanics, visual-identity/"boring" complaints, and IA questions are separate workstreams (see
§3) and are excluded here even where they appear in the source research.

**How this document was built:** every finding below traces to one of: a numbered section in
`audit/research/lens-3-design-critique.md` (surface-only live critique), a bug confirmed in
`audit/research/ux-flow-audit-v5.md` (five independent cold agents against the live app),
or a citation I verified myself by reading the actual source (`packages/client/src/**`,
`packages/server/src/**`). Every fix target below (file/line) was confirmed by re-reading the
current source, not inferred from the critique's outside-in description — where source reading
changed the picture (a finding is already fixed, mis-scoped, or not reproducible in code), that
is stated plainly rather than carried forward unexamined.

---

## 1. Evidence synthesis

Of lens-3's 15 numbered findings plus its share-card delta note, the following actually bear on
**standards-compliance, internal consistency, or a functional bug** (in scope here) as opposed to
**taste, engagement framing, or a product decision** (out of scope, or an open question in §4):

| In scope (this plan) | Out of scope / open question |
|---|---|
| §2.1 Critical: 195px tab-bar overflow | §2.3 blue/orange segmented control — turns out to be the app's own documented per-section color convention, not drift (see Phase 3.5) |
| §2.2 High: text-wrap bug, duplicate import buttons | §2.3 share-card palette vs. app palette — a product-identity question (§4) |
| §2.3 Medium: muscle-diagram glitch, duplicate XP display, token field masking, Starten/Start, step-indicator mismatch, 38px touch targets | §2.4 person-silhouette placeholder — does not reproduce as described against the actual catalog/fallback logic (see Phase 4) |
| §2.4 Low: thumb-zone dead space, vague empty-state copy, persistent top HUD | Everything in `audit/engagement-audit-v5.md` / `research/competitor-design-research.md` / `research/uiux-engagement-research.md` that is about gamification pacing, reward staging, or Liftoff-comparison framing — a separate engagement workstream, not a standards question |
| §2.5 Auth structural observation | lens-2's IA/screen-inventory proposal and lens-1's Liftoff rule-by-rule comparison — both are inputs to a *different* rebuild-oriented plan, not fix-in-place items |

Two additional bugs, not in lens-3 (which never got a save-path or data-entry error to reproduce
live) but confirmed by `research/ux-flow-audit-v5.md` and verified against source for this plan,
are added under **Phase 2** because they meet the mandate's "plain bug" bar directly: a silently
failing save path in the flagship routine-suggestion feature, and a data-entry field that can
concatenate digits instead of replacing them. Both are cited as ux-flow-audit-v5 findings, with
my own source citations for the exact mechanism.

lens-2's motion-system and IA sections are **not** re-litigated here: they describe a from-scratch
system for a parallel rebuild plan, and where they touch things this plan also touches (reduced
motion, the two motion primitives), I verified independently that `styles/motion.css` and
`composables/useCelebrate.ts`/`useXpChip.ts` already implement the reduced-motion contract lens-2
describes — nothing to fix there. Noted in §3.

---

## 2. Phase-driven plan

### Phase 0 — Verify the one "Critical" finding is actually shipped (S)

**Finding:** lens-3 §2.1 — at 195px viewport width, the bottom tab bar's "Profil" item rendered
completely outside the viewport with no scroll affordance, in violation of graceful reflow.

**Target:** `packages/client/src/App.vue`, `.tab-bar` (~line 279) and its `@media (max-width:
300px)` block (~line 339).

**Source finding:** this is **already fixed in current source**. The CSS carries a comment citing
"measured 195px" verbatim and adds `overflow-x: auto; -webkit-overflow-scrolling: touch;
scrollbar-width: none` plus `.tab-link { flex: none; ... }` under a `max-width: 300px` query — the
exact fix lens-3's own "Fix" section recommended. This reads as a fix that landed after or
concurrently with the live session lens-3 tested against (dev servers/caches drift; the critique
was run against `localhost:5173` at a point in time, not against this exact commit).

**Re-triage:** downgraded from "Critical, needs a fix" to "Critical finding, verify deployment
freshness only." Do not re-implement — re-implementing an existing fix risks introducing a second,
conflicting rule.

**Verification method:** load the deployed/staging build (not a stale dev-server cache) at 195px
and 320px via viewport emulation; confirm `document.body.scrollWidth` still equals the container
width and that scrolling the tab bar horizontally reaches "Profil." If it still fails on a fresh
build, this is a caching/build issue, not a missing fix — investigate the build pipeline, not the
CSS.

---

### Phase 1 — Silent-failure and data-corruption bugs (highest real priority)

These are functional bugs, not opinions, and one of them silently breaks Liftr's own flagship
routine-suggestion feature (v4) end to end. Sequenced before every other item because both are
correctness bugs in the two most-repeated flows in the app (logging a set; building a routine).

#### 1a. Muscle-guided routine save fails silently on fractional reps

**Evidence:** `research/ux-flow-audit-v5.md` P0 (independently confirmed by 3 of 5 cold agents),
re-verified against source for this plan.

**Target and mechanism (confirmed by source read):**
- `packages/shared/src/rank/defaultStandards.ts` (~line 103-109, `deriveStandards`) computes
  `threshold: t.threshold * ratio` with **no rounding**. A `ratio` other than 1.0 (e.g.
  `hip-abduction-machine`'s `0.25` in `tools/catalog/curated.yaml`) produces a fractional
  threshold from an integer anchor rep-standard.
- `packages/shared/src/routine-builder/recommend.ts` (~line 86-87) uses that threshold directly
  as `reps` for bodyweight-substitute exercises with no `Math.round`: `return repeat({ reps:
  entry.threshold, weightKg: null }, setCount)`.
- `packages/server/src/routes/routines.ts` (line 15): `reps: z.number().int().min(1)` — the
  create/update request 400s on the fractional value.
- `packages/client/src/stores/routineStore.ts` `create()`/`update()` (~line 43-64) await the API
  call with no try/catch.
- `packages/client/src/components/routine-wizard/RoutineWizard.vue`'s `save()` (~line 338-364)
  wraps the store call in `try { ... } finally { saving.value = false }` — **no `catch`**. The
  rejection propagates as an unhandled promise rejection; `saving.value` resets, so the button
  becomes clickable again with zero user-visible error. This is the guided routine-creation path
  the app was specifically built to make routine creation *less* frictional — it dead-ends on
  first real use with fractional-rep bodyweight substitutes, which is a common case, not an edge
  case.

**Fix:**
1. `Math.round()` the threshold in `deriveStandards()` (or at the point `recommend.ts` consumes
   it) so a fractional rep target is never generated.
2. Add a client-side integer guard on the payload before POST as a backstop, independent of the
   server-side fix.
3. Add a `.catch` in `RoutineWizard.vue`'s `save()` that surfaces the failure as a toast (the app
   already has `composables/useToast.ts` — reuse it, don't invent a new pattern) instead of
   silently resetting the button.

**Complexity:** M (three small, isolated changes across shared/server/client, but touching all
three is required for defense-in-depth — the client guard alone would hide a still-broken server
contract, and the server fix alone leaves every *other* possible save failure equally silent).

**Verification:** create a muscle-guided routine that recommends a bodyweight substitute with a
non-1.0 `ratio` catalog entry (e.g. hip-abduction-machine substitute), confirm the request
succeeds; separately, force a 400 response in a test/dev harness and confirm a toast appears
instead of a silent reset.

#### 1b. NumberStepper direct-entry concatenates digits instead of replacing them

**Evidence:** `research/ux-flow-audit-v5.md` P0, re-verified against source.

**Target:** `packages/client/src/components/ui/NumberStepper.vue`, `startEdit()` (~line 94-98)
and the direct-entry `<input>` (~line 92-98, 109-120). `startEdit()` sets `editValue.value =
String(props.modelValue)` and the input carries `autofocus`, but no `@focus` handler calls
`.select()` anywhere in the file — a freshly focused input places the caret at the end by
default, so typing over a stale value (e.g. "20") appends rather than replaces (typing "9" yields
"209", not "9"). This is a data-integrity risk in the single most-repeated interaction in the app
(weight/rep entry, tens of times per session per `haptics.ts`'s own "30x-per-session" comment
cited in lens-2).

**Fix:** add `@focus="($event.target as HTMLInputElement).select()"` to the input, or call
`.select()` from `startEdit()` via a template ref + `nextTick()`.

**Complexity:** S (one line).

**Verification:** tap-to-edit a weight/rep field with a non-zero existing value, type a new
number immediately, confirm the field shows only the newly typed digits, not the old value with
digits appended.

---

### Phase 2 — Systemic touch-target floor pass (own phase — this is repeated across the app)

**Finding:** lens-3 §2.3 (Medium) — the "Läufe" empty state's "Manuell"/"GPX/FIT importieren"
pills and the Workout/Läufe segmented-toggle buttons measure 38px tall, below the 44px floor the
app already uses correctly elsewhere (the "Mehr" kebab button, confirmed 44×44px by lens-3's own
"Holds up" section; `.btn-close`, confirmed 44×44px in `tokens.css`; `NumberStepper.vue`'s large
stepper controls, also explicitly bumped to 44px per an in-file comment).

**Standard cited:** WCAG 2.2 SC 2.5.8 Target Size (Minimum, AA, 24×24px) is technically met at
38px — this is not a WCAG *failure*, it is an internal-consistency failure (Nielsen H4) against
the app's own already-adopted convention, and a shortfall against WCAG 2.2 SC 2.5.5 Target Size
(Enhanced, AAA, 44×44px), Apple HIG's 44pt minimum, and Material's 48dp recommendation — all three
of which the app holds itself to everywhere else per the tokens.css history (see `.btn-close`'s
own comment: "Bumped again 32px -> 44px (audit: touch-target floor, WCAG 2.5.5)").

**Source-verified scope (bigger than lens-3 could see from outside — this is why it's its own
phase, not a single-component fix):**
- `packages/client/src/styles/tokens.css`: `.btn-primary` (~line 272-292, `padding: 12px 20px;
  font-size: 14px` → ~40px total height) and `.btn-secondary` (~line 312-318, `padding: 10px
  16px` → ~37-38px) — both are the app's *global* primary/secondary button classes, reused across
  every screen, so this single CSS rule change reaches every instance at once (the same
  "one canonical rule, not 12 local redefinitions" pattern tokens.css already documents for these
  classes).
- `packages/client/src/components/ui/WorkoutRunsSwitcher.vue`, `.wr-pill` (~line 37-46, `padding:
  8px 10px; font-size: 13.5px`).

**Fix:** add `min-height: 44px` to `.btn-primary`, `.btn-secondary` (tokens.css), and `.wr-pill`
(WorkoutRunsSwitcher.vue). This is additive (a min-height, not a layout rewrite) but touches every
button in the app by design — treat it as a single focused PR with a full visual regression pass
across all main screens, not a "just these two spots" patch, since `.btn-primary`/`.btn-secondary`
are shared globally.

**Complexity:** S to implement, M to verify (broad surface area).

**Verification:** `getBoundingClientRect()` on a sample of `.btn-primary`/`.btn-secondary`/
`.wr-pill` instances across Overview, Workout, Runs, Ranks, Profile at 390px width — confirm all
report `height >= 44`. Re-run lens-3's own measurement method (`getBoundingClientRect()` in a live
page) on the two originally-flagged controls to close the loop.

---

### Phase 3 — Medium-severity consistency and correctness fixes

Each item below is independent and can ship separately; grouped here only by severity band.

#### 3.1 Muscle-diagram rendering glitch on workout-finish screen

**Finding:** lens-3 §2.3 (Medium) — a jagged black scribble artifact on the front-body muscle
diagram's upper-chest region on the workout-finish screen, not present on the visually identical
Overview "Erholungszone" diagram.

**Root cause (found by source+asset inspection, more precise than lens-3 could determine from
outside):** `packages/client/src/components/ui/MuscleFigure.vue` is the shared component behind
both surfaces, but the underlying SVG assets disagree on their own dimensions with no `viewBox` to
normalize them: `data/images/muscles/front-body.svg` is `width="200" height="369"` with no
`viewBox`; the chest overlay `data/images/muscles/main/muscle-4.svg` (chest = muscle id 4 per
`packages/client/src/lib/muscles.ts:18`) is `width="200" height="362"` — a ~2% height mismatch,
neither file declaring a `viewBox`. `MuscleFigure.vue`'s CSS forces both images to the same
`aspect-ratio: 200/362` box (matching the overlay, not the body outline), so the body outline is
stretched non-uniformly relative to the overlay it's supposed to align with. The outline's own
dark navy fill (`#1a2033`–`#4f5c82`) reads as near-black against the dark theme; a sliver of the
misaligned outline path showing through at the chest — a geometrically intricate region — is the
"jagged black scribble." Both the finish-screen and Overview instances use the same component and
assets, so the misalignment exists in both; it is simply more visible at the chest, where the path
geometry is complex, than at simpler muscle regions, which is why lens-3 only caught it on one
screen.

**Fix:** add a matching `viewBox` (e.g. `viewBox="0 0 200 369"` for `front-body.svg`, `viewBox="0
0 200 362"` for each overlay, matching each file's own native dimensions) to every asset SVG under
`data/images/muscles/` (both `front-body.svg`/`back-body.svg` and every `main/`/`secondary/`
overlay — 16 files per the explore pass), at the ingest pipeline
(`packages/ingest/src/ingestMuscleAssets.ts`) so future re-ingests don't regress it, plus a
one-time backfill script for existing checked-in assets. Alternatively, normalize every asset to
identical height at ingest time so no `viewBox` correction is even needed.

**Complexity:** M (touches 16 static assets + the ingest pipeline; low risk, mechanical once the
root cause is confirmed).

**Verification:** render `MuscleFigure.vue` with the chest muscle highlighted at multiple viewport
widths; confirm no stray path renders outside the overlay's clip region; diff a screenshot of the
Overview and finish-screen instances side by side to confirm they're now pixel-identical for the
same muscle set.

#### 3.2 Duplicate XP/level display on workout-finish screen

**Finding:** lens-3 §2.3 (Medium) — the top persistent status pill and a dedicated "FORTSCHRITT"
card both show the same resolved level/XP number simultaneously, with no visual or motion
connection between them (Nielsen H8, aesthetic and minimalist design — presenting the same state
twice with no reason dilutes rather than concentrates the moment).

**Target (confirmed):** `packages/client/src/App.vue`, `.top-hud .level-chip` (~line 153-160) has
no route-based gating — its `v-if` checks only XP-visibility/streak settings, not the current
route, so it renders unconditionally over the finish flow same as every other screen.
`packages/client/src/components/workout/FinishSequence.vue`'s Beat 3 ("Fortschritt," ~line
152-162) independently renders `+{{xpDisplay}} XP` / `Lv. {{levelAfter}}` / its own level bar.
Both confirmed to render simultaneously.

**Fix:** hide `.top-hud` (or just its `.level-chip`) while the Finish Sequence / finished-summary
state is active on `WorkoutPage.vue` — a route-meta flag or a boolean prop threaded down from
`WorkoutPage.vue` is sufficient; no new state machine needed, since `activeWorkoutStore`/
`WorkoutPage.vue` already know when the finish flow is showing.

**Complexity:** S.

**Verification:** complete a workout, confirm the top-hud level chip is hidden/dimmed for the
duration `FinishSequence.vue`'s Beat 3 is visible, and reappears once the finish flow exits.

#### 3.3 API-Token field has no show/hide toggle

**Finding:** lens-3 §2.3 (Medium) — the token field on Profile is `type="password"` with no reveal
toggle, which (per lens-3's Nielsen H5 "error prevention" framing) actively prevents verifying
what was typed before saving a value that isn't a login credential shared across services.

**Target (confirmed, broader than lens-3 saw):** `packages/client/src/pages/ProfilePage.vue`
(~line 368-375, `<input v-model="tokenInput" type="password" placeholder="Token" />`). **My own
additional finding, extending lens-3's**: the same unmasked-toggle-less pattern exists a second
time in `packages/client/src/components/ui/AuthGate.vue` (~line 56-62), the full-screen pre-auth
gate that appears when `LIFTR_TOKEN` is set server-side and the boot-time check 401s. Lens-3 could
not see this because the live test session's stored token already authenticated it (per lens-3
§2.5's own disclosure — the gate was never actually triggered in their session). This is a source-
verified addition, not inherited from lens-3's text, cited against the same Nielsen H5 rationale
lens-3 used for the Profile field.

**Fix:** add a reveal/hide (eye icon) toggle flipping the input's `type` between `password`/
`text`, defaulting to masked, in **both** `ProfilePage.vue` and `AuthGate.vue` — fixing only one
would leave an inconsistent pattern between the two places a user can set the same value.

**Complexity:** S (per instance; two instances).

**Verification:** confirm both fields default to masked, and that toggling reveals the literal
typed value before submission in both locations.

#### 3.4 "▶ Starten" vs. "▶ Start" — inconsistent CTA copy for the same action

**Finding:** lens-3 §2.3 (Medium) — Nielsen H4 (consistency and standards): the rest of the UI is
consistently German; a lone English-borrowed "Start" breaks the established voice.

**Target (confirmed exact strings):** `packages/client/src/pages/OverviewPage.vue:260` —
`{{ starting ? "Wird gestartet…" : "▶ Starten" }}`; `packages/client/src/pages/WorkoutPage.vue:412`
— `{{ starting ? "…" : "▶ Start" }}`. Both hardcoded strings (the app has no real i18n layer
despite a `useI18n` import in `App.vue` — this is hardcoded German copy throughout, so there is no
translation-key indirection to worry about).

**Fix:** standardize both call sites on "▶ Starten" (the grammatically correct German imperative;
"Start" is an unconjugated English/noun borrowing inconsistent with the rest of the copy).

**Complexity:** S (one-line string change in each file).

**Verification:** visual diff of both CTAs after the change; grep the codebase for any other
literal `"▶ Start"` occurrence to confirm no third instance was missed.

#### 3.5 Routine wizard's step indicator promises a step the fast path never shows

**Finding:** lens-3 §2.3 (Medium) — the wizard's own step indicator ("1 Wählen · 2 Anordnen · 3
Fertig") sets an explicit 3-step expectation the UI then doesn't fulfill (Nielsen H2/H4).

**Root cause (more precisely scoped than lens-3's outside view — this affects one path, not the
whole wizard):** `packages/client/src/components/routine-wizard/RoutineWizard.vue`'s step
indicator (~line 420-424) and step-advance logic (~line 311-334) do have a real, reachable step 3
(`ReviewStep.vue`) via the full `ArrangeStep.vue → goToReview()` path — the full manual wizard does
show all three steps correctly. The bug is specific to the **fast path**: when a routine is small
and untouched (`isFastPathEligible`, common right after a muscle-guided suggestion),
`FastPathStep.vue` renders under the same `step === 'arrange'` branch, and its "Routine speichern"
button (~line 95-97) emits `save` directly to `RoutineWizard.vue`'s `save()`, bypassing
`goToReview()` entirely — while the step indicator still displays "3 Fertig" as an unreached-but-
promised step that this specific path never shows.

**Fix:** either route `FastPathStep.vue`'s save action through a minimal version of `ReviewStep`
before committing, or (simpler, and consistent with `engagement-audit-v3`'s "fast path exists on
purpose, don't add friction back" precedent — see §3 below) change the step indicator to show only
the 2 steps that are real when the fast path is active, rather than promising a step-3 that path
structurally skips.

**Complexity:** S–M (the "re-label the indicator for the fast path" option is S; routing fast-path
save through Review is M and risks reintroducing exactly the friction the fast path exists to
avoid — see the out-of-scope note in §3).

**Verification:** step through both the full manual wizard (confirm step 3/"Fertig" still shows)
and the fast path from a muscle-guided suggestion (confirm the indicator now matches what actually
happens).

#### 3.5b — Note: blue/orange segmented-control color, re-triaged out of "bug"

**Finding as reported:** lens-3 §2.3 (Medium) — the Workout/Läufe segmented control uses blue for
the active "Workout" segment and orange for the active "Läufe" segment, described as the same
component borrowing two different "active" colors inconsistently.

**Source finding:** `packages/client/src/components/ui/WorkoutRunsSwitcher.vue` (~line 18-23)
does set `--wr-color: var(--blue)` for Workout and `--wr-color: var(--fire)` for Läufe — but
`App.vue`'s own `navItems` definition (comment ~line 67-70) documents this as a **deliberate,
already-established per-section color code**: Workout is blue, Läufe is fire/orange, matching the
same colors used for those sections' tab-bar icons elsewhere in the app. The switcher is applying
an existing, intentional convention consistently, not drifting from one.

**Re-triage:** downgraded out of "bug to fix." This is not a standards violation as described —
whether a segmented control's "active" treatment should stay visually uniform regardless of which
option is selected (one design principle) or should carry the destination's own section color
(a different, also-legitimate principle, and the one already in use here) is a genuine product
design choice, not a citable inconsistency. Moved to open questions (§4) rather than the fix list.

#### 3.6 Auth: token settable from two disconnected places

**Finding:** lens-3 §2.5 — structural observation that the token isn't treated as a distinct,
guided step.

**Source correction to lens-3's framing:** `AuthGate.vue` **does** block the entire app behind a
full-screen gate (`App.vue:125`, `<AuthGate><OnboardingGuide/><slot/></AuthGate>` wraps all
content) when `LIFTR_TOKEN` is set server-side and a boot-time `/api/health` check 401s — this is
a real, if minimal, single-card blocking screen, not merely "a field in Profile settings" as
lens-3's live session (which never triggered a 401) could observe. What *is* accurate: (a) the
gate never appears at all in a no-token dev setup, so it's easy to miss its existence entirely,
and (b) `ProfilePage.vue` has a second, independent token input (§3.3 above) with no visual or
navigational connection to the gate — the same value is settable from two unrelated UI surfaces.

**Fix:** not a bug fix so much as a consolidation decision — either the Profile-page token field
should visibly reference/link to the same flow as the boot-time gate (e.g. shared copy, a note
that this is the same value used at startup), or the gate itself should be the only place token
entry happens, with Profile showing a read-only masked status instead of a second editable field.
Recommend the former (keep both, but connect them) since a user may legitimately need to update
the token after initial setup without re-triggering the boot gate.

**Complexity:** S (shared copy/visual link) to M (if consolidating into one editable surface).

**Verification:** manual walk of both flows (fresh 401 boot state, and mid-session Profile edit)
confirming both reference the same underlying setting clearly.

---

### Phase 4 — Low-severity fixes

#### 4.1 Primary CTAs sit in the top half of the screen, not the reachable thumb zone

**Finding:** lens-3 §2.4 (Low) — Workout tab's routine list, the Läufe empty state, and wizard
step 1 (`PathChooser.vue`) leave 40-60% of the 844px viewport empty below primary content, against
established mobile thumb-zone ergonomics (cited generally in `research/uiux-engagement-research.md`
§1, not a hard WCAG criterion).

**Source finding:** confirmed mechanism, not confirmed magnitude. `packages/client/src/pages/
WorkoutPage.vue` (`.not-started`/`.routine-grid`), `packages/client/src/pages/RunsPage.vue`
(`.runs-empty`), and `packages/client/src/components/routine-wizard/PathChooser.vue`
(`.path-chooser`) are all plain top-aligned `flex-direction: column` blocks inside `<ion-content>`
with no bottom-anchoring spacer or `justify-content: flex-end`/`space-between` — the mechanism
lens-3 describes is real in source, but the specific "40-60%" figure needs a live measurement to
confirm per page (dynamic content height varies).

**Fix:** this needs a deliberate per-page layout decision (move the primary CTA to a
bottom-anchored slot, or use the reclaimed space for content that currently requires scrolling
elsewhere), not a single shared-component patch, since the three pages have different content
shapes.

**Complexity:** M (three separate, small layout decisions).

**Verification:** measure primary-CTA `y`-position via `getBoundingClientRect()` at 390×844 on
all three pages before and after; target the CTA's vertical center falling within the bottom
third of the viewport (thumb-reach zone) where content height allows.

#### 4.2 Bodyweight empty-state copy is vague relative to the Läufe pattern

**Finding:** lens-3 §2.4 (Low) — "Zwei Einträge, und dein Gewichtsverlauf steht hier" states a
threshold but not an action, unlike Läufe's actionable empty-state copy.

**Target (confirmed):** `packages/client/src/pages/OverviewPage.vue:351`, `<p v-else
class="tile-empty">Zwei Einträge, und dein Gewichtsverlauf steht hier.</p>`.

**Fix:** rewrite to name the concrete next action and where to take it (e.g. "Trag dein
Körpergewicht in Profil ein — nach zwei Einträgen siehst du hier den Verlauf"), matching the
pattern already used successfully on the Läufe empty state (`RunsPage.vue`).

**Complexity:** S (copy-only).

**Verification:** side-by-side copy review against the Läufe empty state's structure (states why
it's empty + names the concrete next action).

#### 4.3 Top status chrome persists unchanged during active set-logging

**Finding:** lens-3 §2.4 (Low) — the Level/XP pill and streak badge consume ~100-115px of the
844px viewport on every screen, including the focused, high-frequency active-workout logging
screen, competing with task-relevant content (Nielsen H8).

**Target (confirmed):** `packages/client/src/App.vue`, `.top-hud` (~line 153-162) — its `v-if`
checks only `xp.showXp`/streak-settings state, no route check, so it renders identically on
`/workout` during active logging as everywhere else. This is the same component implicated in
§3.2's duplicate-XP finding — worth planning both fixes together since both require the same
route-aware conditional on `.top-hud`.

**Fix:** collapse or hide the `.top-hud` XP/streak pill specifically during active set-logging
(not during the routine-picker or finish-sequence states, where it's contextually relevant again),
gated the same way §3.2's fix is (a route-meta flag or prop threaded from `WorkoutPage.vue`'s
active-session state).

**Complexity:** M (a genuine, if small, UX decision about exactly which sub-states of `/workout`
should hide it — implement alongside §3.2, not as a separate PR, since both touch the same
component and condition).

**Verification:** confirm `.top-hud` is hidden/collapsed specifically while `activeWorkoutStore`
reports an active, unpaused logging session, and reappears on the routine-picker and
finish-summary states.

#### 4.4 Placeholder-icon inconsistency in the Exercises list — does not reproduce as described

**Finding as reported:** lens-3 §2.4 (Low) — "Abduktoren-Maschine"/"Landmine Press" show a
person-silhouette placeholder instead of a photo, breaking the photo-led list's visual rhythm.

**Source finding:** the general fallback mechanism is real (`ExerciseThumb.vue` falls back to
`ExerciseIcon.vue`'s equipment glyph when `catalog.bySlug(slug)?.hasImage === false` or the photo
`@error`s — 11 of 94 catalog slugs have no photo per the file's own header comment). But the
specific claim doesn't hold up against the catalog data: `equipmentIcons.ts` only has a literal
human-figure glyph for `equipment: "bodyweight"`; both "Landmine Press" (tagged `barbell`) and
"Abduktoren-Maschine" (tagged `machine`) map to distinct barbell/machine glyphs, not a person
silhouette. Lens-3's specific example is not traceable to a person-icon code path — likely a loose
visual read of a generic, thin-stroke equipment glyph at small size, not a literal
bodyweight-icon bug.

**Fix:** the underlying, real gap — 11 catalog exercises with no photo, falling back to a visually
distinct icon-style placeholder that breaks a photo-led list's rhythm — still stands as a genuine,
if smaller-scoped, consistency issue and should still be addressed (source real photos for the
gaps, or use a visually closer placeholder such as a blurred/desaturated generic gym photo instead
of a flat icon). The specific two named exercises and the "person silhouette" description should
not be used as the reproduction case when this is picked up, since they don't match what the code
actually does.

**Complexity:** S (placeholder treatment) to L (sourcing real photos for the catalog gap, which is
content work, not a UI fix — flag the photo-sourcing part as out of scope for this plan and better
suited to a content/data backlog, not a UI-standards phase).

**Verification:** confirm the placeholder treatment used for missing-photo rows visually matches
the surrounding photo rows' scale/contrast better than the current flat icon; do not use the two
originally-named exercises as the test case since their fallback is unrelated to the reported
issue.

---

## 3. Explicitly out of scope

- **All engagement/gamification/reward-pacing questions** — covered by
  `audit/engagement-audit-v5.md`'s own phase plan (duplication cuts on Overview/Ranks/Profile,
  Profile section headers, Overview card re-weighting) and by lens-1/lens-2's Liftoff-comparison
  and blind-system-design material. This plan does not touch reward staging, streak framing, XP
  pacing, or the rank/tier visual language — none of those are standards failures, they're product
  decisions already tracked elsewhere.
- **Full IA rework** — `research/ux-flow-audit-v5.md`'s own verdict stands: "the organization is
  right, mostly." No tab reorganization, no merged-inbox concept, no restructuring of the routine
  wizard's step *shape* (the wizard's 3-step design is validated as sound; only the fast-path
  indicator mismatch in §3.5 above needed a fix — the shape itself is untouched).
- **Everything in lens-3's own "Holds up" section** — out of scope by the neutrality mandate: the
  44×44px kebab button, the disabled-Satz-speichern explanatory hint, the labeled bottom-sheet
  close control (WCAG 4.1.2), the labeled weight/rep stepper accessible names, the skippable rest
  timer, the immediate set-save confirmation row, the 7.67:1-contrast locked rank labels, the
  1024px tablet sidebar breakpoint, and the disabled-until-valid wizard confirm button. None of
  these are touched by this plan.
- **The Workout/Läufe "merge" naming question**, the Workout-vs-Exercises tab icon
  confusability, and the `/runs` nav-orphan status — all explicitly tracked-but-deferred in
  `audit/engagement-audit-v5.md` §5, not re-opened here.
- **The share-card's palette vs. the app's own accent system** (lens-3 §3) — this is a product-
  identity decision, not a standards failure; moved to §4 as an open question rather than a fix
  item.
- **`.panel-reward`/tier-badge visual-identity work, the "boring/no USP" complaint, and Exercise/
  Profile tab redesign** — explicitly out of scope per the product owner's own interview
  (`audit/finished/engagement-audit-v4.md` §5): "light work eventually," not now, and not a
  standards question in any case.
- **Reduced-motion / motion-system correctness** — verified independently while reading source for
  this plan (`packages/client/src/styles/motion.css`, `composables/useCelebrate.ts`,
  `composables/useXpChip.ts`, `lib/haptics.ts`'s `canHaptic()`) and found already correctly
  implemented: durations collapse under `prefers-reduced-motion`, looping animations are capped to
  one iteration, and haptics are folded into the same reduced-motion gate. No fix needed; noted so
  a future pass doesn't re-open it.
- **Global contrast/focus-ring/touch-target work already completed in prior rounds** — confirmed
  via `tokens.css`'s own in-file history: the global `:focus-visible` ring (WCAG 1.4.11/2.4.7),
  the `--dim`/`--faint` contrast retune (5.60:1/4.79:1 on `--surface-2`), the `.btn-primary`
  ink-vs-fill contrast fix, and the `.btn-close`/`.eyebrow` touch-target and reflow fixes are all
  already shipped. Do not re-audit these; Phase 2 above only targets the specific classes
  (`.btn-primary`/`.btn-secondary`/`.wr-pill`) confirmed still under 44px.

---

## 4. Open questions (need a product decision, not a standards judgment)

1. **Share-card palette vs. app palette** (lens-3 §3). `packages/client/src/lib/shareCard.ts`'s
   `STAT_COLORS = [violet, blueHi, fireHi, pr]` is confirmed, by reading the actual palette
   constants, to use violet and the dedicated `--pr` (gold/yellow) token as two of four stat-card
   accents — neither violet nor gold/yellow is used as a generic UI accent anywhere else in the
   live app (blue = primary/interactive, orange/fire = streak/rank/status). The share card is
   self-consistent internally but not derived from the app's own semantic color system. Decide:
   should the share card's palette be brought into the app's existing blue/fire semantic system,
   or is a shareable artifact allowed its own distinct visual identity (a legitimate choice many
   products make for share cards specifically, since they're seen by people who never see the app
   itself)? This plan takes no position — it is a design-identity call, not a citable violation.

2. **Segmented-control color convention (§3.5b)** — Liftr already has an established rule ("each
   section keeps its own accent color across icon/switcher/etc."), which is what produces the
   blue/orange Workout/Läufe switcher lens-3 flagged. Is that rule worth keeping generally (colors
   travel with a *destination*, not with an abstract "this is the selected option" state), or
   should segmented/toggle controls specifically use one neutral "selected" treatment regardless
   of which section they point to? Both are legitimate, mutually exclusive conventions; the app
   currently and consistently follows the first. No fix is proposed above; a decision here would
   determine whether §3.5b is reopened as a real item later.

3. **Fast-path wizard step indicator (§3.5)** — the two candidate fixes (re-label the indicator
   for 2 steps vs. route fast-path save through a minimal Review step) trade off differently:
   relabeling is cheap and honest about what the fast path actually does; routing through Review
   adds a step back to a flow that was deliberately built to remove steps
   (`audit/finished/engagement-audit-v4.md` Phase 1 explicitly warns against re-adding friction to
   the fast path "just to force engagement"). Recommend relabeling (the cheaper, boundary-
   respecting option) but flagging for a product call since it does change what the fast path
   visually promises.

4. **Missing-photo exercise placeholder (§4.4)** — sourcing real photos for the 11 catalog gaps is
   content work with real effort attached (photography/licensing), not a code fix. Worth a
   separate decision on whether to invest in real photos now, or ship only the cheaper
   placeholder-treatment fix (visually closer to the photo rows) as a stopgap indefinitely.

5. **Profile-page token field vs. AuthGate (§3.6)** — whether to keep two editable surfaces for
   the same value (connected by shared copy) or consolidate into one is a product-flow decision,
   not purely a UI fix; flagged with a recommendation in §3.6 but left open.
