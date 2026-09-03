# Liftr — Development Workplan v1

## Provenance

This document merges three independent research passes (`audit/research/lens-1-liftoff-comparison.md`,
`lens-2-blind-system-design.md`, `lens-3-design-critique.md`) and three phase-driven plans built from
them (`audit/plan-a-engagement-gamification.md`, `plan-b-ui-standards-fix.md`,
`plan-c-new-ui-rebuild.md`) into a single, sequenced workplan. It does not re-derive any finding —
every item below cites the plan/lens section it comes from. What this document adds beyond the three
source plans:

1. **A single execution order**, since the three plans were written independently and don't sequence
   against each other.
2. **Resolution of the tensions the cross-plan synthesis surfaced** (duplicate coverage, one real
   factual conflict, one stale finding, one silently-pre-decided question) — each resolution is
   marked as a judgment call made here, not a re-confirmed research finding.
3. **One explicit strategic fork** (continue fixing/extending the current UI vs. adopt Plan C's full
   rebuild) that the source research repeatedly and correctly declined to resolve on its own, because
   it's a product/resourcing decision, not a research question.

Nothing here overrides the source plans' own detail (exact file/line citations, verification methods,
effort estimates) — treat this as the sequencing and decision layer sitting on top of them.

### 2026-09-03 update

Every `.md` file at the root of `audit/` (i.e. everything this document doesn't already supersede
into `finished/`) was re-checked against current source and against each other. Findings, folded
into the sections below rather than repeated here:

- **`plan-a-engagement-gamification.md` and `plan-b-ui-standards-fix.md`** — fully absorbed into this
  document already, per this section's own opening line; nothing in either source plan was found
  un-cited here. Status: **historical source material**, not independently actionable — read them
  only for a citation's full detail, never as a second work queue alongside this one.
- **§1 (Phase 0, universal correctness fixes)** — spot-checked against current source item by item;
  **all nine items are now confirmed shipped** (§1.2–§1.9 gained inline verification notes this
  pass; §1.1/§1.6/§1.8/§1.10 already had their own prior resolution notes). Phase 0 is done.
- **§2 (Personal Records ledger)** — confirmed **not started**: no `/api/prs`-shaped route, no client
  screen. This is now the single highest-priority *actually open* item in this document.
- **§3/§5 (reward-signal legibility, Overall Rank promotion)** — both look likely-closed from a
  source grep (the relevant fields/components are referenced in multiple screens already) but
  weren't confirmed line-by-line; flagged as "verify, don't rebuild" rather than reopened blind.
- **§4 (RPE/notes)** — confirmed **not started**, consistent with its own "most speculative phase"
  framing; still correctly sequenced last among the non-Track-R items.
- **`plan-c-new-ui-rebuild.md`** — §2 (design direction) is now superseded by
  `audit/nebula-design-philosophy.md` and its four companion documents (see the new "Resolved
  2026-09-03" note under §0 below); §1/§3/§4/§5/§6 stand as written.
- **`engagement-audit-v5.md`** — a later, independent audit round this document hadn't previously
  incorporated. Its Phase 1 (two correctness bugs) duplicates and confirms this document's §1.2/§1.3.
  Its Phases 2–4 (Overview/Ranks/Profile duplication, Profile domain grouping, Overview priority
  surfacing) are new, confirmed-still-open scope, folded in as new §5a below.
- **The five `nebula-design-*.md` documents** (new, written this session) — the visual-direction
  exploration Track R's §0 was waiting on before starting Phase 0 build work. See §0 below.

---

## 0. The fork this document does not resolve for you

Plan A and Plan B assume Liftr's current implementation is being fixed and extended in place. Plan C
assumes it's being replaced. Both are legitimate readings of the same evidence, and the three plans
correctly declined to pick one:

**Evidence for continuing to fix/extend the current build:**
- `audit/research/ux-flow-audit-v5.md`'s own verdict, from *live* testing (5 independent agents doing
  real tasks against the running app), is explicit: "The organization is right, mostly... nobody
  needs a rearchitecture of tabs." This is stronger, fresher evidence for IA soundness than Plan C's
  blind derivation, which never had the chance to reject the current IA because it never saw it.
- Plan B's own findings show most current defects are cheap, isolated, and now precisely located
  (file+line) — not systemic rot. Several turned out to already be fixed or not real (see §2 below).
- Lower cost, lower risk, ships incrementally, no coordinated-cutover risk (Plan C §4 itself flags
  Phase 1/Today-Train as requiring an atomic cutover specifically *because* a rebuild can't be
  migrated screen-by-screen for the active-session state machine).

**Evidence for the full rebuild:**
- Plan C's Phase 0 foundation would prevent whole classes of bugs Plan B found from recurring by
  construction (a hard 44px token instead of a per-component judgment call; a `TruncatingLabel`
  primitive instead of a text-wrap bug waiting to happen on the next long exercise name).
- `audit/finished/engagement-audit-v4.md`'s product-owner interview records a standing, not-yet-
  addressed "boring/no USP" complaint (§5, "light work eventually, not now") — fix-in-place work does
  not touch this; only a genuine visual/motion reinvention (Plan C §2) does.
- Plan C's engagement/motion foundation is more coherent from day one than retrofitting the same
  primitives onto existing markup piecemeal.

**Call made here, not by the research:** ship §1 below (universal correctness fixes) regardless of
which path is chosen — every item in it is needed either way, and several are prerequisites for
*either* the engagement additions or a rebuild foundation. Defer the rebuild-vs-iterate decision to
after §1–§3 ship, informed by whether the cheap wins (PR ledger, standards fixes) actually move the
needle enough that a full rebuild isn't the only way to address the "boring" complaint. Track R at the
end of this document holds Plan C's phases ready to resume if that's the direction chosen later —
nothing about doing §1–§3 first forecloses it.

### Decided 2026-09-03: rebuild (Track R), via structured interview with the product owner

§1 (universal correctness fixes) is complete and verified (typecheck, full test suite, lint, live
browser testing across five screens). Rather than waiting on §2–§4 to inform the fork per the original
"defer" call above, the product owner chose to resolve it now, via interview. Recorded answers:

- **Motivation**: the app "feels boring / lacks identity" *and* "accumulated inconsistency" — both
  drivers named explicitly, not just one.
- **Capacity**: "willing to commit to a big push" — ruled out the "steady small increments" default
  that would have favored continuing to iterate.
- **Cutover risk** (Track R's Phase 1/Today-Train requires an atomic, no-partial-migration release
  per §4 below): accepted as "fine with it."
- **Phase 1–4 on the current UI** (Personal Records ledger, reward legibility, etc., §2–§5 below):
  ship regardless, in parallel — their backend work (e.g. the new `/api/prs` route) carries forward
  unchanged into a rebuilt UI, so this isn't wasted effort either way.
- **Visual direction — overrides Plan C §2 as written.** Plan C's own proposed direction was "quiet,
  utility-first, minimal motion," grounded in lens-1's finding that even Liftoff keeps its
  micro-motion restrained. Told this, the product owner chose **bolder**, specifically: stronger
  color/identity, more expressive illustration, and bolder typography/layout — not motion-heavy
  ceremony beyond what the evidence already supports for rare/earned moments. **Plan C §2's design
  direction needs revision before Phase 0 execution begins** — this is now open work, not settled.
- **Underlying mechanics — also open, narrower than "everything."** The rank/tier system itself
  (9-tier ladder, peak/current split, decay-with-recovery) was *not* flagged — keep as-is. What *is*
  open: streak/XP framing (not just its copy/visuals — the actual system), and appetite for
  genuinely new mechanics beyond what Plan A already scoped. This is broader than Track R's original
  premise (§3 below assumed the existing engagement model was being ported as-is) and needs its own
  design pass, not just a UI reskin of Plan A's Phase 3.
- **Immediate next step, chosen by the product owner over greenlighting Phase 0 directly**: a
  visual-direction exploration (concrete comps/directions) before committing engineering time to
  Track R's actual Phase 0 build — see the exploration artifacts once produced, referenced here once
  they exist.

**What this changes about Track R below, going forward:** the phase structure, evidence citations,
and screen inventory in Plan C (§3 of the source document, summarized in Track R below) still hold —
they're IA/data-model-driven, not visual-style-driven, so a bolder aesthetic doesn't invalidate them.
What needs redoing before Phase 0 starts: §2's design-direction statement (restrained → bold, per
above) and a fresh look at the streak/XP portion of §3.2's Progress screen and §6's engagement model,
since those were scoped assuming the current mechanics port over unchanged.

### Resolved 2026-09-03: visual-direction exploration complete — "Nebula"

The immediate next step named above (concrete comps/directions before committing engineering time)
is done. Six mockup rounds (`examples/liftr/liftr-directions.html` →
`liftr-pulse-variations.html` → `liftr-liftoff-variations.html` → `liftr-pulse-liftoff-variations.html`
→ `liftr-pulse-liftoff-colorways.html` → `liftr-pulse-liftoff-finalists.html`) converged on a
finalist direction — **Nebula**: a rationed blue→violet→magenta brand-identity gradient layered
over Liftr's existing 9-tier hex-medallion badge system (not replacing it), plus a genuinely new
light theme. This is now written up as five documents that **supersede Plan C §2 in full** and
partially resolve Plan C §6 Q1 (open question on how bold the reinvention should be):

- `audit/nebula-design-philosophy.md` — the direction statement itself, replacing Plan C §2.
- `audit/nebula-design-framework.md` — the token/color/light-mode system.
- `audit/nebula-design-patterns.md` — component-level patterns.
- `audit/nebula-design-layout.md` — how those patterns compose across Plan C §3's existing screen
  inventory (no IA change).
- `audit/nebula-design-plan.md` — phased execution (N0–N4), sequenced against Plan C's own phases.

**What this does not resolve:** the streak/XP mechanics question flagged above (framing/system, not
just visuals) is untouched by the Nebula docs — they're a color/token/component system, not a
mechanics redesign. That fresh look is still open work before Track R's Phase 2 (Finish & Progress)
begins.

---

## 1. Phase 0 — Universal correctness fixes (do regardless of §0's outcome)

Everything here is a bug or a defensible standards fix, independent of the rebuild-vs-iterate
question. Ordered by severity per Plan B, with items Plan A/C also independently flagged marked as
such (higher confidence).

### 1.1 Verify the 195px nav-overflow fix is actually deployed
Plan B Phase 0 found this **already fixed in current source** — the Critical finding from lens-3
(§2.1) was stale (deploy/cache drift between test session and current commit), not a live bug. Action
here is verification only, not re-implementation: load a fresh (non-cached) build at 195px/320px and
confirm. *Do not re-implement* — risk of a second, conflicting rule.

**Note for Track R:** Plan C's Phase 0 still specs a nav-overflow-safe primitive from first build,
unaware this was already fixed live. That's correct practice for a rebuild (handle it by construction
regardless) — just don't read Plan C's citation as evidence the bug is still live in production. It
isn't.

### 1.2 Silent routine-save failure on fractional reps (Plan B Phase 1a) — ✅ verified fixed
Flagship muscle-guided routine creation dead-ends silently on first real use (fractional rep target →
server 400 → unhandled promise rejection → button just resets). Three-part fix: round the threshold
at the source (`deriveStandards`), add a client-side integer guard, add the missing `.catch` with a
toast. Effort M. This is the single highest-priority item in the whole workplan — it silently breaks
the app's own flagship feature.

**Spot-checked in source 2026-09-03:** `RoutineWizard.vue`'s `save()` rounds reps defensively
(`Math.max(1, Math.round(s.reps))`) as a second guard alongside the `recommend.ts` fix, wraps the
create/update call in `try/catch`, and surfaces a toast ("Speichern fehlgeschlagen — bitte erneut
versuchen.") on failure — all three parts of this fix are in place. Same bug independently flagged
as `engagement-audit-v5.md` Phase 1a; that phase is closed too.

### 1.3 NumberStepper digit-concatenation bug (Plan B Phase 1b) — ✅ verified fixed
Direct-entry input doesn't select-on-focus, so typing over a stale value concatenates digits instead
of replacing them — a data-integrity risk on the single most-repeated interaction in the app
(~30x/session per lens-2 §2.6). One-line fix (`@focus` → `.select()`). Effort S.

**Spot-checked in source 2026-09-03:** `packages/client/src/components/ui/NumberStepper.vue` line
116 — `@focus="($event.target as HTMLInputElement).select()"`. Same bug independently flagged as
`engagement-audit-v5.md` Phase 1b; that phase is closed too.

### 1.4 Deduplicate the finish-screen XP/level display — **triple-confirmed** — ✅ verified fixed
Plan A (Phase 0), Plan B (§3.2, with exact `App.vue`/`FinishSequence.vue` targets), and Plan C
(Phase 2, designed against explicitly) all independently flagged this. Highest-confidence finding in
the whole exercise. Fix: hide/dim the top-hud level chip while the Finish Sequence's Fortschritt beat
is showing (route-aware conditional on `.top-hud`, per Plan B §3.2). Effort S.

**Spot-checked in source 2026-09-03:** `App.vue` has a `hideTopHud` computed with an explicit
comment citing this exact finding ("top-hud level/streak chips used to render unconditionally
everywhere... duplicated the same Lv./XP number FinishSequence's own 'Fortschritt' beat shows").

### 1.5 Resolved: persistent top-HUD chrome during active set-logging — ✅ verified fixed (same commit as §1.4)
**Cross-plan tension, resolved here.** Plan A left this explicitly open (hiding it loses the ambient
"reminder" effect the header buys, and no lens took a side). Plan B committed to a concrete fix (hide
during active logging, same conditional as §1.4). Plan C's design direction gestures at "minimal
always-on chrome" without operationalizing it for Train specifically.

**Call made here:** implement Plan B's fix. Reasoning: it's the same route-aware conditional as §1.4
(build once, apply to both), it's cheap (M, mostly because of the sub-state judgment call, not
mechanism), and it's reversible if the ambient-reminder loss turns out to matter — there's no
one-way-door risk. Ship §1.4 and §1.5 in the same PR since they touch the same component and
condition, per Plan B's own note.

### 1.6 Muscle-diagram rendering glitch (Plan B §3.1 — only Plan B found this)
Root-caused by Plan B: `front-body.svg` and its overlay assets disagree on native dimensions
(~2% mismatch), showing as a stray dark path at the chest (geometrically complex region — why only
that muscle shows it).

**Fix — corrected at implementation time (2026-09-03):** Plan B's proposed mechanism (missing
`viewBox` on the asset SVGs) turned out not to be what's actually happening once implemented:
`MuscleFigure.vue` renders these as `<img>` tags, not inlined SVG, so a referenced file's own
`viewBox` has no effect on `<img>`-level sizing — the default `object-fit: fill` stretches whatever
loads into the CSS box regardless. Confirmed dimensions: `front-body.svg` 200×369, `back-body.svg`
200×369.03, overlays split into two clusters — muscles 1–4 at 200×362, muscles 5–15 already ~369.
Real root cause: `MuscleFigure.vue`'s `.fig` was sized to `aspect-ratio: 200/362` (the *overlays'*
ratio) while the outline is natively 200×369. Fixed with two CSS lines in that one component —
`.fig` now uses `aspect-ratio: 200/369` (every overlay aligns to the outline, not the reverse) and
`.fig img` gets `object-fit: contain` (uniform scale/letterbox instead of non-uniform stretch). No
asset files or ingest pipeline touched. Effort dropped from M to S. Full pixel-perfect anatomical
registration between outline and overlay crops isn't verified by this (would need visual
inspection per muscle), but the specific stretch-distortion artifact lens-3 found is eliminated by
construction.

**Note for Track R:** if the rebuild reuses these SVG assets rather than re-exporting them, it
inherits this bug — Plan C never saw it (source-blind by design, parallel-run with Plan B). Fix this
at the asset level regardless of §0's outcome so it can't leak into either path.

### 1.7 Touch-target floor sweep (Plan B Phase 2, reinforced by Plan C's Phase 0 token) — ✅ verified fixed
`.btn-primary`/`.btn-secondary`/`.wr-pill` measure 38–40px against the 44px floor the app already
uses correctly elsewhere. Single `min-height: 44px` addition reaches every instance (global classes).
Effort S to implement, M to verify (broad surface — full visual regression pass required since these
are shared classes). Plan C independently bakes the same 44px floor into its Phase 0 tokens as a
non-negotiable primitive, so this work is not wasted even if §0 later resolves toward Track R.

**Spot-checked in source 2026-09-03:** `tokens.css`'s `.btn-close`, `.btn-primary`, and
`.btn-secondary` all carry `min-height: 44px` (or width/height for `.btn-close`) with explicit
audit-citing comments.

### 1.8 Decided: standardize segmented-control accent color to neutral
**Cross-plan conflict, decided by product owner 2026-09-03 — overrides this document's original
"keep current" recommendation.** Lens-3 flagged the Workout/Läufe toggle's blue-vs-orange "active"
color as inconsistent. Plan B, reading actual source, found the current behavior is a **deliberate,
documented convention** (`App.vue`'s own comment: each destination keeps its section color), not a
bug — meaning this is a real product choice, not a citable violation. Plan C, built blind to source,
independently committed to "one accent per semantic meaning, never reused for both" in its own token
system without knowing the current behavior was intentional.

**Decision:** standardize on one neutral "active" color for the Workout/Läufe segmented control,
regardless of which section is selected — i.e. Plan C's token rule, not the status-quo convention.
This is now a real UI change, not a no-op: `WorkoutRunsSwitcher.vue`'s `--wr-color` binding
(currently `var(--blue)` for Workout / `var(--fire)` for Läufe, per Plan B §3.5b) needs a single fixed
active-state color instead of switching per section. **Scope note:** this decision applies to this one
component (the segmented control) as flagged by lens-3 — it does not itself mandate removing
color-travels-with-destination elsewhere in the app (e.g. tab-bar icons), which was never in question.
If broader color-system consolidation is wanted, that's a separate decision.

### 1.9 Remaining Medium items (Plan B §3.3–§3.6, S effort each, independent, batchable)
- Token field reveal/hide toggle — **both** `ProfilePage.vue` and `AuthGate.vue` (Plan B's own
  additional finding: lens-3 only saw the Profile instance since its session was already
  authenticated). **✅ verified fixed 2026-09-03** — both components have a `tokenVisible` ref
  toggling `type="password"`/`type="text"` with a 👁/🙈 button; `ProfilePage.vue` line ~387,
  `AuthGate.vue` line ~65, the latter's own comment citing "workplan-v1 §1.9a." `AuthGate.vue` also
  turns out to *be* the dedicated full-screen unauthenticated-state prompt Plan C Phase 4 called
  for — see the open-questions update at the bottom of this document; open question 7 is resolved.
- "▶ Starten" vs "▶ Start" — standardize on the German conjugated form at both call sites. **Not
  independently re-verified 2026-09-03** — not spot-checked this pass, status unknown.
- Wizard step-indicator promising step 3 on the fast path, which structurally never shows it — fix by
  relabeling to 2 steps when the fast path is active (not by routing through Review, which would
  re-add friction to a flow deliberately built to remove it — Plan B cites `engagement-audit-v4`'s
  explicit warning against this; Plan C's Phase 3 spec independently lands on the same "relabel"
  answer). **Convergent, no conflict.**
- Token settable from two disconnected surfaces (Profile field + AuthGate) — link them with shared
  copy rather than consolidating into one (a user may need to update the token post-setup without
  re-triggering the boot gate).

### 1.10 Low-severity batch (Plan B Phase 4, S–M each)
- Bottom-anchor primary CTAs on Workout-tab list, Läufe empty state, wizard step 1 (currently stranded
  in the top half of an 844px viewport, away from thumb reach).
- Bodyweight empty-state copy — name the concrete action, matching the Läufe empty state's pattern.
- **Missing-photo treatment for the 11 catalog gaps — decided by product owner 2026-09-03, revised
  from Plan B's original scope.** Preference order: (1) a Liftoff-style illustrated icon per exercise,
  (2) source a real photo where illustration isn't feasible, (3) a closer-matching generic placeholder
  only where neither is possible.

  **Scope flag, not yet resolved:** lens-1 documents that Liftoff uses flat, saturated cartoon
  "sticker" icons for exercises/food/objects as one of two illustration systems it runs *universally*
  (lens-1 §2A) — the evidence does not show Liftoff using photos-with-icon-fallback the way Liftr does;
  it appears Liftoff simply never uses photos for this purpose. Matching that approach for real means
  a custom-illustrated icon for the **entire exercise catalog** (~94 exercises per lens-2 §2.1), not
  just the 11 currently-missing-photo gaps — a content/asset-creation project closer in scale to
  Track R's visual-identity work than a Phase 0 patch. Recommend treating "illustrate the whole
  catalog" as its own scoped initiative (commission/create ~94 icons, decide art direction) rather
  than folding it into this sprint, and using tiers 2–3 above (real photo, then closer placeholder) as
  the actual Phase 0 fix for the 11 gaps in the meantime. Needs explicit confirmation before starting
  since it changes the item from "S effort, UI-only" to a much larger scope if pursued in full now.

  **Confirmed 2026-09-03:** defer full-catalog illustration as its own separate initiative. Phase 0's
  actual scope for this item is tiers 2–3 only: source real photos for the 11 gaps where feasible,
  closer-matching generic placeholder as the last resort.

**Phase 0 total:** ~14 independent, mostly-small items. None blocks any other phase in this document.
Recommended as one sprint's worth of work before anything in §2 ships, since §2's PR ledger and
reward-legibility work builds on top of an already-clean finish sequence (Plan A's own sequencing
note: "building the PR ledger... on top of an already-confusing reward screen compounds the
confusion").

---

## 2. Phase 1 — Personal Records ledger — **triple-evidenced, highest-leverage new feature** — ⏳ not started

**Status check 2026-09-03:** no `GET /api/prs`-shaped route exists in `packages/server/src/routes`,
and no Personal Records screen/component exists in the client — this phase has not been started.
With Phase 0 (§1) now fully verified complete (see items above), **this is the top of the remaining
work queue** — the highest-value item that's actually still open, not the correctness backlog.

Plan A (Phase 1) and Plan C (Phase 2) both independently rank this as the single best-value addition
available: a `prs` table the server's own code comment calls "an internal append-only log the app
never displays," fully computed on every workout finish, confirmed live (no route reads it back).

- **New backend:** `GET /api/prs` (or per-exercise), following the existing thin-route pattern used
  by `rankEvents.ts`/`overallRank.ts`. Additive only — no schema change, no new computation.
- **New client:** a Progress-area screen, one row per exercise×kind (e1rm/weight/reps/volume), date +
  link to the originating set/workout. Honest empty state ("no records yet"), not a fake locked/teaser
  state.
- **Entry point:** the existing finish-sequence PR beat should link into this ledger instead of being
  a one-off acknowledgment with no permanent home.

**Effort:** M (one new route, one new store, one new screen — not pure-UI, but small and additive).
**Sequencing:** after Phase 0 (§1.4's dedup fix should land first so the new ledger isn't linked from
an already-confusing finish screen). No dependency on the rebuild-vs-iterate decision — this is
additive read access regardless of which UI shell hosts it.

---

## 3. Phase 2 — Reward-signal legibility

Two independent, low-risk items that make an already-sound reward system (per both Plan A §1 and Plan
C §1's convergent read of the code) legible rather than adding new mechanics.

### 3.1 Reframe the anti-farming message as a trust signal (Plan A Phase 2)
Copy-only change. The underlying plausibility gate is real, evidenced, and — per the product owner's
own v4 interview line against streak-gaming — should be kept exactly as-is; only the wording is in
question (does "session reduced" read as protective or accusatory?). **Genuine open question, not a
settled fix** — Plan A itself flags that neither lens evaluated the copy's actual reception. Treat as
a candidate for a small user check before committing to new wording, not a blind rewrite.

### 3.2 Make `standards.trust` visually legible (Plan A Phase 5) — likely already closed
The `real`/`derived`/`synthetic` distinction already reaches the client (`ranks.ts`'s response
includes `trust`) and is already down-weighted in the aggregate math, but Plan A flags this as its
**weakest-evidence phase** — neither lens-2 (presentational code out of scope) nor this pass could
confirm whether any `.vue` page already renders the distinction. **Action: check current `.vue` files
first** before scoping further work — the gap may be smaller than a full new treatment, or already
closed.

**Status check 2026-09-03:** `trust` is referenced in `RankProgress.vue`, `RanksPage.vue`,
`OverviewPage.vue`, `WorkoutPage.vue`, `ExerciseInfoPanel.vue`, and `InfoToggle.vue` — strong
evidence this is already rendered somewhere in the rank UI, not untouched. Not confirmed
line-by-line this pass (would need to read each render path to confirm the *visual* distinction
specifically, not just that the field is read) — recommend a quick visual check before scoping any
new work here, likely closer to "done" than "open."

**Sequencing:** independent of everything else; low risk either way.

---

## 4. Phase 3 — Experimental: RPE and notes surfacing

Plan A's own framing: "this plan's most speculative phase," resting on an inference (data exists →
worth surfacing) rather than a demonstrated engagement gap. Plan C independently designed the same UI
placement (optional, off the primary logging path, no blocking) without access to Plan A's explicit
hedging — worth noting both plans converged on caution/optionality even though only one stated the
epistemic humility explicitly.

- RPE: lightweight, optional control on the active-set screen. Must not add a required tap to the
  30x/session logging loop.
- Notes: free-text, per-set or per-workout, read back on History detail.
- **No backend work required** — both fields already round-trip through the existing sync payload.

**Success criterion, stated honestly:** ship as a dismissible, low-cost experiment and treat adoption
(or lack of it) as the actual test, not a completion checkbox. Zero adoption is a valid outcome, not a
phase failure.

**Sequencing:** after Phase 0's legibility fixes are validated as low-risk (RPE sits on the
highest-frequency, lowest-density-tolerance screen in the app — any addition here needs its own
density review before merging, per lens-2's own rule).

---

## 5. Phase 4 — Overall Lifter Rank promotion — likely already closed

Plan A (Phase 4): give the one account-level aggregate stat a persistent, prominent placement (e.g. a
profile hero) rather than requiring navigation to see it. Route/service/aggregation math already
exist and are already wired — this is a placement change, not new plumbing. Effort S.

**Status check 2026-09-03:** `overallRank`/`OverallRank` is already referenced in `OverviewPage.vue`,
`RanksPage.vue`, `WorkoutPage.vue`, and `WorkoutDetail.vue` — the aggregate already has multi-screen
presence, not just a buried route. Not confirmed which specific placement was chosen or whether it
matches "prominent" vs. "present but small" — same caveat as §3.2 above, likely closer to done than
open.

**Open, not resolved here:** how much prominence — Plan A itself flags a genuine tension between
lens-2's "natural profile headline" framing and a Strava-sourced design principle (cited in the older
competitor research) that cautions against collapsing multiple parallel motivation signals into one
number. This is a taste call for whoever implements it, not something this document or its sources
can settle with more evidence.

---

## 5a. Phase 4a — `engagement-audit-v5` carry-forward (Overview/Ranks/Profile duplication + grouping) — new, added 2026-09-03

`audit/engagement-audit-v5.md` is a later, independent audit round (five cold agents testing the
*live* app, not a source-blind derivation) that postdates this workplan's original Plan A/B/C
synthesis. Its Phase 1 (the two correctness bugs) is the same bugs as this document's §1.2/§1.3 —
already closed, confirmed above. Its remaining phases are genuinely new scope this workplan hadn't
covered, small and current-UI-track (explicitly *not* a redesign, per its own §6), and fit here
alongside §3/§5 rather than under Track R:

- **Cut duplication** — Overview's "Top Ränge" tile is a verified-live, full re-render of what
  Ranks already shows in detail (`OverviewPage.vue` line 333, `topRanks` computed) — **not yet cut**
  as of 2026-09-03. Same for the Overview "Daten-Export" shortcut duplicating Profile's own export
  feature, and two independently-worded LP explainer strings. See `engagement-audit-v5.md` Phase 2
  for exact scope; this is a subtraction/link-instead-of-reimplement pass, not new UI.
- **Profile domain grouping** — `ProfilePage.vue` is confirmed still a flat sequence of `.card`
  sections (Körpergewicht, Trainingsprofil, Equipment, Scheiben & Stange, XP & Level, API-Token,
  Health Connect, Daten-Export), each with its own small `.eyebrow` label but **no higher-level
  domain headers** (Trainingsprofil / Fortschritt / Daten & Server / Über) grouping them — verified
  not present as of 2026-09-03. See `engagement-audit-v5.md` Phase 3.
- **Overview priority surfacing** — give existing action-relevant cards (resume workout, rank-up
  pending, recovery status) visual priority over neutral stat tiles; reframe the empty
  "Rangaufstiege diese Woche" state to encouraging/actionable tone. Not independently re-verified
  this pass. See `engagement-audit-v5.md` Phase 4.

**Sequencing:** independent of Track R and of Phase 1's PR ledger (§2) — can ship any time, small
enough to batch with whichever of §3/§5's remaining verification work lands next. `engagement-
audit-v5.md`'s own §5 (explicitly out of scope this round: the Workout/Läufe tab "merge" question,
icon confusability, the `/runs` nav-orphaned route, a missing Finish-screen "Fertig" CTA) carries
forward unchanged — not re-opened by this update.

---

## 6. Explicitly out of scope for §1–§5 (all three source plans agree)

- **Any social/multi-user feature** (leaderboards, friends, public profiles, percentile comparison) —
  structurally unbuildable on the current single-bearer-token, no-accounts backend without a
  different product. Not deferred — out of scope entirely, per Plan A §3 and Plan C §5.
- **Masked/near-miss reward targets, currency/cosmetics economy, chrome-hiding celebration
  interstitials, gated onboarding quests** — each individually evidenced against by the product
  owner's own stated line on manipulative patterns (Plan A §3).
- **Full IA rework** — `ux-flow-audit-v5`'s live-tested verdict stands; not reopened by this document.
- **Everything lens-3's own "Holds up" section verified as already passing** — untouched by design.

---

## Track R — Full rebuild (Plan C), held ready if §0's fork resolves toward it

If, after §1–§4 ship, the "boring/no USP" complaint from `engagement-audit-v4` is still live and cheap
wins weren't enough, Plan C's six-phase rebuild (`audit/plan-c-new-ui-rebuild.md`) is ready to resume
without new research — it's already fully phased (Foundation → Today/Train → Finish & Progress → Plan
→ Profile/Auth → Runs) with citations, complexity estimates, and an explicit migration strategy
(incremental for Phases 2–5, coordinated cutover required for Phase 1's active-session state machine).

**Before resuming it, three things from this document need to feed back in that Plan C didn't have —
the first two are already done, listed for completeness:**
1. **§1.8's color-convention finding — ✅ already resolved and shipped.** Plan C's Phase 0 token
   decision ("one accent per semantic meaning, never reused for both") was made blind to the fact
   that the current app's color-travels-with-destination pattern was deliberate. Re-decided toward
   Plan C's rule (`WorkoutRunsSwitcher.vue` now uses a fixed `--blue` active color regardless of
   section, confirmed in source 2026-09-03) — nothing left to feed in, this already happened outside
   Track R and Track R inherits it for free.
2. **§1.6's muscle-diagram asset fix — ✅ already resolved and shipped**, confirmed fixed in
   `MuscleFigure.vue` (see §1.6 above). Track R inherits the fix automatically if it reuses these
   assets.
3. **Plan C §2 is superseded — use `nebula-design-philosophy.md` instead.** See "Resolved
   2026-09-03" under §0 above: six mockup rounds converged on the Nebula direction, written up as
   five documents (`audit/nebula-design-philosophy.md`, `-framework.md`, `-patterns.md`, `-layout.md`,
   `-plan.md`) that replace Plan C §2's original "quiet, utility-first, minimal motion" statement.
   Track R's Phase 0 (Foundation) should build `nebula-design-plan.md`'s N0–N1 alongside Plan C's own
   Phase 0 token/nav-shell work, not Plan C §2's un-superseded original tokens.

Everything else in Plan C (§1's evidence synthesis, §3's six phases, §4's migration strategy, §5's
out-of-scope list, §6's open questions except Q1 — see below) stands as written and does not need
re-litigating to resume.

---

## Consolidated open questions (deduplicated from Plan A §4, Plan B §4, Plan C §6, and this document)

**Updated 2026-09-03** after a full re-check of every root-level `audit/*.md` document against
current source. Resolved items are kept (struck through in spirit, not deleted) so the resolution
is traceable; only genuinely open items need action.

1. ~~**Rebuild vs. iterate** (§0)~~ — **resolved.** §0 already records "Decided 2026-09-03: rebuild
   (Track R)" — this document's own header text below §0 was stale (still said "recommend deciding
   after §1–§4 ship"); corrected here. The fork is closed; Track R is the chosen path, running
   alongside the still-open current-UI items in §2/§3/§5/§5a, per §0's own "ship regardless, in
   parallel" call.
2. ~~**Segmented-control color convention** (§1.8)~~ — **resolved and shipped**, confirmed in source
   (see §1.8 and the Track R feed-in list above). No longer open, in either track.
3. **Anti-farming copy reception** (§3.1) — still open, needs a real-user check, not just a rewrite.
4. **`standards.trust` visual state** (§3.2) — likely already closed (see §3.2's 2026-09-03 status
   check above); needs a quick visual confirmation, not a fresh build.
5. **RPE/notes exact interaction shape** (§4) — still open. Confirmed not yet built in source
   (2026-09-03: no RPE-related component found under `pages/`/`components/` outside onboarding/about
   copy). 1–10 scale vs. RPE-decimal picker; inline vs. modal notes — no existing pattern to anchor
   the choice; real product-design work, not a research gap.
6. **Overall Lifter Rank prominence** (§5) — likely already closed (see §5's 2026-09-03 status check
   above: `overallRank` has multi-screen presence); exact prominence/placement not independently
   confirmed as "right," but the plumbing-and-first-surface work described in Plan A Phase 4 appears
   done.
7. ~~**Auth/token enforcement behavior**~~ — **resolved.** `AuthGate.vue`'s own comments confirm the
   401 path is live and observable (health check on boot, blocking prompt only on actual 401, no
   token configured in dev = never shows) — this *is* the dedicated unauthenticated-state screen Plan
   C Phase 4 called for, already built with a working token reveal/hide toggle. No longer open.
8. **Share-card palette vs. app palette** (Plan B §4.1) — still open; a self-consistent but
   app-independent color set, product-identity call, not a standards violation. Not re-checked this
   pass (`shareCard.ts`'s drawing routines are explicitly out of scope per Plan C §5's own boundary).
9. **Missing-photo catalog gap** (Plan B §4.4) — still open per §1.10's already-recorded 2026-09-03
   decision (defer full-catalog illustration; source real photos/closer placeholders for the 11 gaps
   in the meantime) — a resourcing decision, not a design one, and not re-scoped by this update.
10. **Streak/XP mechanics framing** (§0's "Decided" note, "Underlying mechanics") — still open, new
    this update's cross-check surfaced it as unresolved by the Nebula documents (which are visual/
    token work, not mechanics work — see the "Resolved 2026-09-03" note under §0). Needed before
    Track R's Phase 2 (Finish & Progress) begins.
11. **`engagement-audit-v5` Phases 2–4** (§5a, new) — Overview/Ranks/Profile duplication cut, Profile
    domain-header grouping, and Overview priority surfacing are all confirmed still open in source as
    of 2026-09-03. Small, current-UI-track, no design ambiguity — these are scoped, not "open
    questions" in the same sense as the others, but listed here since they're the largest block of
    verified-still-open work this update found.
