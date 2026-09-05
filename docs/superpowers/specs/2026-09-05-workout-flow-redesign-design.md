# Workout Flow & Information Architecture Redesign — Design Spec

**Status:** Approved by product owner in brainstorming session, 2026-09-05. Ready for
`writing-plans`. Deliberately **separate** from
`2026-09-05-nebula-complete-redesign-design.md` — that spec covers visual identity (background,
surfaces, glow); this one covers what information is shown, when, and how routines are started.
Both are part of the same broader "Liftr redesign" initiative and will very likely be implemented
against the visual system that spec defines, but they are independent decisions and independently
plannable/shippable.

## 1. Problem statement

Reviewing a Nebula-restyled mockup of the active Workout screen surfaced a real, pre-existing
information-architecture problem, independent of visual styling: the mid-workout screen shows
information a lifter is not using in the moment (trained-muscle diagram, rank/XP display) while
lacking information they actually need (what's coming next, and what to prep for it). Separately,
tapping a routine card starts the workout immediately with no way to see what you're about to do
without already being mid-session.

## 2. Principle

**Mid-workout, show only what a lifter actually touches while lifting.** Everything else moves
behind a deliberate action, reusing components Liftr already has rather than inventing new ones —
the goal is relocating existing functionality to the right moment, not building new features.

## 3. Changes

### 3.1 Active Workout screen (`WorkoutPage.vue`) — reduced to essentials

Shown by default, mid-set:
- Current exercise name.
- Logged sets (with their weight/reps) and the next set's input (weight/reps steppers).
- Rest timer.
- "Satz speichern" (save-set) primary action.
- A single compact **next-exercise preview line**: exercise name plus its *first set's* weight and
  reps (e.g. "Nächste Übung: Schulterdrücken · 40 kg × 10") — explicitly **not** a horizontal
  scrollable rail (the current implementation's approach, confirmed bad UX by the product owner).
  The weight/reps detail lets a lifter change plates/equipment *before* the transition, which is
  the whole point of showing it at all — a bare exercise name doesn't achieve that.

Moved behind a deliberate action, not shown by default:
- **Trained muscles + how-to-perform instructions**, reached via a small "ⓘ" affordance on the
  current-exercise header. This opens the app's **existing** `ExerciseInfoPanel.vue` sheet — this
  work relocates *when* that sheet is reachable, it does not rebuild it.
- **Rank/XP display**, reached via a small, visually minimal icon in the header (e.g. a tier-glyph
  chip). Opens the app's **existing** `RankProgress.vue` in a sheet — again, relocation, not a
  rebuild.

**Hard requirement, non-negotiable:** wherever trained muscles are shown anywhere in this
redesign (the info sheet above, and the new Routine Overview in §3.2), they are represented via
the existing front/back anatomical mannequin (`MuscleFigure.vue`, primary muscles highlighted
brighter than secondary) — the same component already used on Overview's recovery card and the
share-card. **Never** substitute a text/tag/pill list ("Brust", "Schultern") for the mannequin.
This was explicitly called out by the product owner as a core Liftr feature that must not be
deleted or replaced by something else, in response to an earlier draft of this spec's own mockup
that used tags — a mistake to not repeat.

**Layout stability:** the rest-timer's screen position is always reserved (present but idle/empty
before any set has been logged, or between exercises), so the "Satz speichern" button's position
never shifts based on timer state. Their *relative order* changes from today (timer now sits above
Save, not below) but that order is then fixed regardless of workout state.

### 3.2 New: Routine Overview screen

Tapping a routine card (in `RoutineList.vue` / wherever else a routine is presented as a
startable card, e.g. Overview's launchpad) now opens a new Routine Overview screen instead of
calling `useStartRoutine()` immediately. This is a **relocation of the start action**, not removal
of a quick-start path: the product owner confirmed the Overview screen's own prominent, sticky
"Jetzt starten" button (see below) already *is* the quick-start — no separate inline shortcut icon
is needed on the card itself.

Routine Overview shows:
- The routine's trained-muscle summary via the **mannequin** (front + back, `MuscleFigure.vue`,
  primary/secondary highlighting) — aggregated across every exercise in the routine, the same
  aggregation `aggregateMuscles()` (already used on `OverviewPage.vue`) already computes.
- Every exercise in the routine, each showing its own set count and weight/reps summary (e.g.
  "4 × 80 kg · 8 Wdh."), in the routine's defined order.
- A **sticky "Jetzt starten" button**, pinned to the bottom of the viewport so it never requires
  scrolling to reach, regardless of how many exercises the routine has. This was an explicit
  requirement — reviewing a routine must not cost more effort than starting it did before.

Tapping "Jetzt starten" here calls the same `useStartRoutine()` composable `WorkoutPage.vue` and
`OverviewPage.vue`'s launchpad already use — one implementation of "start a workout," not a second
one that can drift, consistent with how that composable was already designed to be shared.

## 4. Explicitly out of scope

- Any change to the actual set-logging data model, the rest-timer's timing logic, or
  `useStartRoutine()`'s own behavior — this is a screen/navigation restructuring, not a logic
  change.
- Redesigning `ExerciseInfoPanel.vue` or `RankProgress.vue` themselves — they're relocated to a new
  entry point (a sheet reachable mid-workout), not rebuilt. (Note: `ExerciseInfoPanel.vue`'s own
  light-mode tier-card contrast bug was already fixed separately — see `audit/workplan-v1.md`'s
  2026-09-05 contrast-audit entry — unrelated to this relocation.)
- Visual styling of any of these screens/sheets — covered by
  `2026-09-05-nebula-complete-redesign-design.md`, applied independently.
- A quick-start shortcut icon on the routine card itself — explicitly rejected; the Routine
  Overview's own sticky start button is the quick-start.

## 5. Open implementation questions (for the plan, not this spec)

- Exact placement/iconography of the "ⓘ" and rank-chip affordances on the exercise header — a
  detail to nail down live during implementation against the real header layout, not speculated
  here.
- Whether the next-exercise preview should account for a superset/no-next-exercise edge case (last
  exercise in the routine) — needs a real empty-state decision during implementation.
