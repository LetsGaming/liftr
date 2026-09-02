# Routine Builder — Shape Brief (engagement-audit-v4 Phase 1)

Discovery/shape pass for the routine-creation trust gap named in `audit/finished/engagement-audit-v4.md`
Phase 1. No code yet — this is the confirmed design brief that Phase 1B implements against.

## 1. Job and audience

Solo user (today), building or editing a workout routine before a session. They arrive either
wanting to hand-pick exercises they already know, or wanting the app to assemble something from
target muscle groups. Mode: Operate — a task to complete, not a surface to be persuaded by.

## 2. Outcome and proof

**Primary task**: leave the wizard with a routine that (a) was fast to build and (b) the user
actually understands, so a bad workout later reads as "I should adjust this" rather than "the app
got it wrong." Success is measured by the interview's own failure case going away: *"Yeah, I guess
this created workout will work, let's go"* → an actual 5-second check that catches mismatches.

**Real evidence already computed, currently discarded** (this is the whole opportunity):
`routineSuggestionService.ts` knows which requested muscle drove each pick, whether it swapped in a
substitute because the user lacks equipment (`findSubstitute`), and the client already has full
muscle/equipment metadata per exercise via `catalogStore`. Nothing here requires new data
collection — only surfacing what exists.

## 3. Selected direction

**Visual authority**: none needed — this is a structural/interaction change inside Liftr's existing
established world (tokens, `.panel`/`.panel-reward`, existing form controls). No new visual-world
decision; reuse `MuscleFigure`, `.eyebrow`, existing button/chip styles.

**Structural thesis** — three confirmed decisions:

1. **The mode choice becomes step 0**, not a toggle buried inside Pick. A single screen: "Selbst
   zusammenstellen" vs "Nach Muskelgruppe vorschlagen lassen," presented as two large equal-weight
   options (not a segmented control implying one is a settings-mode variant of the other). Both
   converge into the same Pick/Arrange/Review steps after — manual choice lands in today's Pick
   (manual list); muscle choice lands in today's muscle-picker sub-screen, then both flow to
   Arrange → Review identically. This directly answers the interview's "two competing tools, one
   makes the other basically obsolete" complaint by making the choice a deliberate first step
   instead of an easy-to-miss toggle state.
   - Edit mode is unaffected: it still skips straight to Arrange (no mode question when exercises
     already exist).

2. **Review gets three additive glance-checks**, each optional/conditional — nothing blocks Save:
   - **Muscle coverage vs. requested** (muscle-guided routines only): a compact row of the
     requested muscle chips, each showing whether the final routine actually covers it (via
     `aggregateMuscles()` on the routine's final exercise list vs. the muscles picked in step 0).
     Uncovered muscle → a quiet flag, not a warning color that reads as an error state.
   - **Equipment-substitution flag**: when the suggestion swapped a pick because of missing
     equipment (needs the server payload widened — Phase 1B Step 1), show one line per affected
     exercise: *"Ersetzt: bevorzugte Variante braucht Ausrüstung, die du nicht hast."* Manual-path
     routines never show this (nothing was substituted).
   - **Lopsided distribution flag**: if one exercise's total sets are disproportionate to the rest
     of the routine (simple client-side check — e.g. more than ~2x the median set count), a single
     quiet note near that exercise's row, not a blocking banner.
   - Explicitly **not** included this round (user did not select it): history-vs-standards
     provenance ("from your last set" vs "entry standard"). Server work for this is not scheduled.
   - All three render as small inline annotations on the existing exercise-row list, not a new
     card or section — Review stays a receipt in spirit, just an honest one.

3. **A fast path for simple routines**: when a routine has ≤4 exercises, uses the default set
   count/reps for each (i.e. nothing manually customized — same `isUntouchedDefault`-style check
   the wizard already uses for background-upgrade eligibility), and has no supersets, arrange
   collapses to a single condensed screen combining a trimmed version of today's Arrange rows
   (exercise, sets summary, quick reorder) with Review's new glance-checks inline below — one
   screen, one Save button. The moment the user customizes anything (adds a set, links a superset,
   changes rest time) it expands into the full multi-step Arrange → Review flow. This is a
   *progressive disclosure* of complexity already present in the component (edit mode's
   Pick-skipping is the existing precedent for conditional step structure), not a new mode to
   maintain in parallel.

**Focal moment**: the muscle-coverage/substitution/distribution glance-checks on Review — this is
the trust-gap fix. Everything else (step-0 screen, fast path) exists to make reaching that moment
faster and less annoying, not to compete with it.

## 4. Scope and boundaries

- **In scope**: `RoutineWizard.vue` (step union, header indicator), `PickStep.vue` (splits into a
  new step-0 chooser + the existing manual/muscle sub-screens), `ArrangeStep.vue` (fast-path
  variant), `ReviewStep.vue` (three glance-checks), `routineSuggestionService.ts` +
  `routineService.ts` + `routineSuggestions.ts` route (substitution flag plumbing).
- **Untouched**: save/update logic (`RoutineWizard.vue` save()), superset linking, rest/set-kind
  editing UI, `useRoutineManagement.ts` entry points on `WorkoutPage.vue`, Quick Start
  (`useStartRoutine.ts`).
- **Anti-goals**: no mandatory checkbox or confirmation gate on Save; no forced delay; no new
  progression/reward/badge system on top of this (rank stays the only spine); no color-coded
  "error" styling on the glance-checks — they inform, they don't scold.

## 5. States and ranges

- 0 exercises picked at step 0's manual/muscle sub-screen: existing empty states apply unchanged.
- Muscle-guided suggestion returns fewer exercises than muscle groups requested (some muscles have
  no usable candidate after equipment filtering): coverage check must show this as "not covered,"
  not error.
- `wrist-curl`/`reverse-wrist-curl` (no primary muscles in the 15-muscle taxonomy): coverage check
  must simply omit them from the muscle tally, never crash or show an empty malformed row.
- A manually-built routine with 0 muscle groups "requested": coverage check doesn't render at all
  (nothing to compare against) — only the substitution and distribution checks can ever apply to
  manual routines, and substitution never applies to manual since nothing was substituted.
- Editing an existing routine: step 0 is skipped (as today); fast-path eligibility is recalculated
  against the loaded routine's current exercise list, so an edit that trims a customized routine
  down to defaults can still drop into the fast path.

## 6. Interaction and layout

- Step 0: two full-width tappable option cards, icon + one-line description each, replacing
  Pick's current top segmented toggle. Selecting one transitions to that path's existing UI
  (manual list or muscle-chip picker) — the segmented toggle inside PickStep is removed once its
  job moves up a level.
- Fast path: single scrollable screen, condensed exercise rows (name, set×rep summary, small
  reorder handles) directly above the three glance-check annotations, one primary Save button.
  Transitioning out of the fast path (user customizes something) should feel like an expansion, not
  a jarring context switch — same transition duration/easing as other step transitions
  (`--dur-slow`/`--ease-out`, per `motion.css`; no `--ease-spring` — this isn't an earned moment).
- Glance-check annotations render inline, below each affected exercise row or as a compact summary
  chip row above the exercise list for coverage — reuse the `.eyebrow` label pattern for the section
  label, muted color (`--dim`), no alert iconography.

## 7. Constraints and open decisions

- **Platform/constraints**: German copy throughout, matching existing tone (descriptive, never
  nagging). Mobile-first — verify at mobile viewport per `mobile-viewport-check`. No new client-side
  test infra exists in this repo; server-side additions get tests, client verification stays
  typecheck + browser per the existing project pattern.
- **Left to the builder**: exact fast-path eligibility thresholds (set-count median multiplier for
  "lopsided," exact exercise-count/customization cutoff for the fast path) — implement using the
  existing `isUntouchedDefault`-style default-detection pattern already in `RoutineWizard.vue`, tune
  by feel during Step 2's browser verification, not by a hardcoded spec here.
- **Not open**: no mandatory interaction added to Review; no second progression system; no dark
  patterns per audit §2.
