# Full Rebuild Orchestration Plan

**STATUS: ALL WORKSTREAMS SHIPPED — historical coordination record.** Written when Workstreams A-E and Foundation were still future work; all are now independently confirmed shipped and, for most, live-tested (`audit/verify/agent-6.md`, `agent-7.md`, `agent-8.md`, and the `round2-*.md` live-browser reports). Nothing in this document is an open dependency anymore — it's kept for the record of how the parallel-workstream split and file-boundary rules were reasoned about, not as an active tracker.

**Not an implementation plan itself** — this is the coordination layer above six workstream
implementation plans (listed in §3), each written separately so they can be authored and executed
independently. Read this first to understand sequencing and parallel-safety; read the workstream
plan you're executing for actual tasks.

**Scope:** everything still open across `audit/plan-c-new-ui-rebuild.md` (the full visual/UX
rebuild — six phases) and `audit/workplan-v1.md`'s remaining items not already closed by
`docs/superpowers/plans/2026-09-03-nebula-and-workplan-rework.md` (already merged — see that plan's
ledger and `audit/workplan-v1.md`'s 2026-09-03 update for what's done: Phase 0 correctness fixes,
Nebula token/color layer, PR ledger screen, Overview/Profile cleanup). This plan covers what's left:
the actual screen-by-screen rebuild Plan C specifies, plus the streak/XP mechanics question and the
plausibility-gating bug the Nebula work's final review surfaced and parked.

**Why orchestrate instead of one big plan:** Plan C's six phases already touch disjoint sets of
files (confirmed below, §2) — nothing here requires inventing artificial boundaries. Foundation
(Phase 0) is the one true bottleneck: it builds the nav shell, layout/motion primitives, and touches
`App.vue`/`tokens.css`/`motion.css` directly, and every other phase consumes what it builds. Once
Foundation ships, the remaining five phases can be planned, implemented, and reviewed as five fully
independent workstreams — different subagents, potentially different git worktrees, no shared files,
no merge risk between them.

---

## 1. Source documents this plan reconciles

- `audit/plan-c-new-ui-rebuild.md` — the six-phase structure, evidence, complexity ratings, and
  migration strategy this orchestration plan sequences. Its §2 (design direction) is superseded by
  `audit/nebula-design-system.md` et al. (already implemented); §1/§3/§4/§5/§6 stand as written.
- `audit/nebula-design-system.md` / `audit/nebula-design-components.md` / `audit/nebula-design-plan.md`
  — the visual system every workstream below builds inside (consolidated 2026-09-04 from an earlier
  five-file set of the same name-family). Already implemented at the token/chrome level; each
  workstream's job is to apply it to its screens, not re-derive it.
- `audit/workplan-v1.md` — §0's "Underlying mechanics — also open" note (streak/XP framing,
  narrower than "everything") and item 10 in the consolidated open questions ("Streak/XP mechanics
  framing... still open, new this update's cross-check surfaced it as unresolved by the Nebula
  documents"). Folded into Workstream C below (§3.3), since it shares files with that workstream.
- `docs/superpowers/plans/2026-09-03-nebula-and-workplan-rework.md`'s ledger (deleted after merge,
  content preserved in its final summary and in `audit/workplan-v1.md`) — specifically the parked
  Critical finding: the rank-up celebration beat (and its ring) can render for a plausibility-
  discounted session in one scenario, traced to `useWorkoutFinish.ts`'s `rankedUp || newPr` filter
  not checking `plausibilityReason` against `rankService.ts`'s more lenient peak-eligibility floor.
  Folded into Workstream C below, since it shares exactly the files that bug touches.

## 2. File-boundary verification

Confirmed by direct directory listing (2026-09-03) — no `.vue` file appears in more than one
workstream below:

| Directory/file | Workstream |
|---|---|
| `App.vue`, `styles/tokens.css`, `styles/motion.css`, new primitive components | Foundation (§3.0) |
| `pages/OverviewPage.vue`, `pages/WorkoutPage.vue`, `components/workout/{SetEntry,RestTimer,SetKindPicker,WorkoutClock}.vue`, `stores/activeWorkoutStore.ts`, `stores/syncStore.ts` | A — Today/Train (§3.1) |
| `components/workout/FinishSequence.vue`, `components/rank/{RankProgress,TierLadder,RankUpCalendar}.vue`, `pages/RanksPage.vue`, `composables/useCelebrate.ts`, `composables/useWorkoutFinish.ts`, `server/src/services/rankService.ts` | B — Finish, Progress & Mechanics (§3.2) |
| `components/routine-wizard/*.vue`, `pages/ExercisesPage.vue`, `components/exercise/*.vue`, mesocycle setup | C — Plan/Routines (§3.3) |
| `pages/ProfilePage.vue`, `components/onboarding/*.vue`, `components/ui/AuthGate.vue`, bodyweight/equipment/export UI | D — Profile & Auth (§3.4) |
| `pages/RunsPage.vue`, `components/run/{RunMap,RunReplay}.vue` | E — Runs (§3.5) |
| `pages/RecordsPage.vue`, `stores/prStore.ts`, `services/prService.ts`, `routes/prs.ts` (server) | Already shipped (Nebula plan) — no further work scoped here |

**One cross-workstream note:** `FinishSequence.vue`, `RankUpCalendar.vue`, and `TierLadder.vue`
already carry small Nebula additions from the merged plan (`.badge-ring`, `.nebula-dot`,
tier-accent borders) — Workstream B's plan must build on top of these, not revert or duplicate them.
Flagged explicitly in that workstream's brief.

**Boundary exception found while writing the workstream plans (2026-09-03):** Workstream C's plan
discovered the routine-list UI (density, archive, drag-reorder) physically lives inside
`WorkoutPage.vue` — a Workstream A file, not a Workstream C one, despite "routine list" being
IA-owned by Plan/Routines per Plan C's own screen inventory. Workstream C's plan resolves this by
extracting the routine-list markup into a new `components/routine/RoutineList.vue` that C owns going
forward. **This is the one Wave-1 task that is NOT parallel-safe against Workstream A**: the
extraction touches `WorkoutPage.vue` directly. Sequencing rule: Workstream C's extraction task (its
plan's Task 5) must run either (a) before Workstream A's implementation starts, or (b) after
Workstream A's implementation has fully merged — never concurrently with an in-flight Workstream A
edit to `WorkoutPage.vue`. Whichever workstream's execution is dispatched second should re-read the
other's final `WorkoutPage.vue` state before starting, not assume the file matches what its own plan
described when written. Every other Wave-1 task remains fully parallel per §2's table.

**Constraint that applies to every workstream plan below, stated once here rather than per-plan:**
Liftr has zero deployments and is still pre-v1 — no plan task needs backward-compatibility shims,
data-migration-safety scaffolding, or rollback plans for existing user data, because none exists.
Where a plan (e.g. Workstream B's `rank_events` schema change) adds a nullable column or a new
optional function parameter, that's ordinary API/schema hygiene, not legacy-compat weight — verified
this is already how the plans as written behave; nothing needed adjusting for this note, it's
recorded here so no later plan invents unneeded migration ceremony.

## 3. Workstreams

Each row names the workstream, its own implementation-plan file (to be written per §4), its Plan C
phase source, and its wave.

### 3.0 — Foundation (Wave 0, solo, blocking)

**Plan file:** `docs/superpowers/plans/2026-09-03-foundation-primitives.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 0.
**Blocks:** every other workstream — none of them can start their own *implementation* (planning
can happen in parallel, see §4) until this merges, since they all consume its nav shell/primitives.
**Scope:** design tokens beyond what Nebula already added (color-role naming, spacing/touch-target
enforcement), the five-zone nav shell with narrow-viewport fallback and desktop sidebar reflow,
`ThumbZoneAction`/density-mode/`TruncatingLabel` layout primitives, `useCountUp`/`useCelebrate`
rebuild with the three-tier haptic vocabulary, `prefers-reduced-motion` gating that also silences
haptics.
**Success criterion (from Plan C, unchanged):** nav shell renders all five destinations reachably at
195px/320px/390px/1024px+ widths; every interactive element measures ≥44×44px; motion primitives
pass a reduced-motion snapshot test.

### 3.1 — Workstream A: Today/Train (Wave 1)

**Plan file:** `docs/superpowers/plans/2026-09-03-workstream-a-today-train.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 1; `workplan-v1.md` §4 (RPE/notes, folded in here since
it's scoped to this exact screen).
**Depends on:** Foundation only.
**Scope:** Today/home screen (readiness hero, streak/tokens-remaining chip, routine-start cards),
Active Workout screen (steppers, three rest-timer states, set-kind picker, superset rail, mid-session
add/skip/pause/cancel, stale-session nudge, bodyweight-null-vs-zero distinct affordances), set-logged/
exercise-advance motion, +XP chip, RPE capture (new UI, no existing pattern), set/workout notes (new
UI, no existing pattern), sync indicator.
**Migration note (from Plan C, still binding):** this phase requires a coordinated, atomic cutover —
the active-workout state machine and offline-first sync outbox are shared, stateful infrastructure
that cannot be split screen-by-screen mid-session. Build complete, test a full session lifecycle
before merging, don't ship partial.

### 3.2 — Workstream B: Finish, Progress & Mechanics (Wave 1)

**Plan file:** `docs/superpowers/plans/2026-09-03-workstream-b-finish-progress.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 2; `workplan-v1.md` §0's open streak/XP mechanics
question; the parked plausibility-gating bug from the Nebula plan's final review.
**Depends on:** Foundation only.
**Scope, in priority order:**
1. **The plausibility-gating fix** (highest priority in this workstream — it's a real, previously-
   shipped-and-unnoticed bug, not new scope): thread `plausibilityReason` through
   `useWorkoutFinish.ts`'s `RankUpSummary`/`sessionRankUps` construction and through `/api/rank-events`
   (`rankService.ts`), so a flagged-but-still-`rankedUp` session gets the muted treatment
   `lens-2` §5 always specified, in both the Finish Sequence beat and `RankUpCalendar`'s weekday dot
   — one fix, two consumers, since both read from the same underlying gap.
2. **Finish Sequence rebuild**: sequential skippable beats, literal `prevLp`→`lp` bar animation, the
   three-way visual distinction (rank-up / same-band recovery / discounted) now that (1) makes the
   discounted case actually reachable-and-distinct, single-source-of-truth XP display.
3. **Personal Records is already shipped** (Nebula plan) — this workstream's job re: PRs is only to
   confirm the Finish Sequence's PR beat links into it, not rebuild the ledger itself.
4. **Ranks/Progress rebuild**: `synthetic`-vs-real trust legibility (likely already adequate — the
   Nebula final review's ledger triage found `trust` already wired into multiple render paths;
   confirm before rebuilding), Overall Rank placement.
5. **Streak/XP mechanics — design pass, not just reskin.** `workplan-v1.md` §0 records this as
   broader than a UI reskin: appetite for genuinely new mechanics beyond what the existing rank
   ladder/streak system does. **This sub-item needs its own brainstorm/design pass before
   implementation tasks can be written for it** — the workstream plan (§4) should treat it as a
   design-then-build two-step, not assume the shape up front.

### 3.3 — Workstream C: Plan/Routines (Wave 1)

**Plan file:** `docs/superpowers/plans/2026-09-03-workstream-c-plan-routines.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 3.
**Depends on:** Foundation only.
**Scope:** routine list (density, drag-reorder motion contract), Routine Builder/Wizard (equipment-
aware substitution surfaced explicitly, wizard step-indicator accuracy — note: `workplan-v1.md` §1.9
already fixed one instance of this; confirm it's not re-broken by any Foundation primitive change),
mesocycle setup (week-N-of-M display), exercise catalog (placeholder-image policy, browse/search).

### 3.4 — Workstream D: Profile & Auth (Wave 1)

**Plan file:** `docs/superpowers/plans/2026-09-03-workstream-d-profile-auth.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 4.
**Depends on:** Foundation only.
**Note:** `ProfilePage.vue` already carries Nebula additions from the merged plan (domain-group
headers, theme toggle, quiet-tier styling on Daten & Server cards) — this workstream's plan must
build on that structure, not replace it. `AuthGate.vue` already has a working reveal-toggle token
field and is confirmed (per the Nebula plan's workplan-v1.md status sweep) to already be the
dedicated unauthenticated/401 entry point Plan C originally called for — this workstream's job here
is verification and any remaining polish, not a rebuild from scratch.
**Scope:** onboarding (staged/skippable fields — `components/onboarding/*.vue` already exist, confirm
against Plan C's spec rather than assuming a rebuild), equipment & gym setup (deferred-until-needed
per Plan C), bodyweight log, data & backup export (already exists, confirm UI polish only).

### 3.5 — Workstream E: Runs (Wave 1)

**Plan file:** `docs/superpowers/plans/2026-09-03-workstream-e-runs.md`
**Source:** `plan-c-new-ui-rebuild.md` §3 Phase 5.
**Depends on:** Foundation only.
**Scope:** file-upload (GPX/FIT) and manual entry, Health Connect import trigger, route map/replay,
single-import-action empty state (closing the duplicate-button finding `plan-c` and
`engagement-audit-v5.md` §5 both independently name — confirm not already fixed by an unrelated
change before rebuilding).
**Explicitly out of scope per `engagement-audit-v5.md` §5** (still binding, not reopened by this
plan): the Workout/Läufe tab "merge" question, `/runs` nav-orphan discoverability — both tracked for
a future discovery pass, not this rebuild.

## 4. How to execute this orchestration plan

**Step 1 — write the six workstream plans.** Each is authored independently (they don't share
content beyond this document's boundaries), so this step itself parallelizes: one planning pass per
workstream, each with full codebase read access to ground its tasks in real files (same rigor as
`2026-09-03-nebula-and-workplan-rework.md` — bite-sized TDD tasks, real code, no placeholders, per
`superpowers:writing-plans`). Foundation's plan should be written first or concurrently with the
Wave 1 plans (they don't depend on Foundation's *plan* being finished, only its *implementation*
being merged before Wave 1 *execution* starts) — six planning passes can run at once.

**Step 2 — implement Foundation.** Subagent-driven execution of `2026-09-03-foundation-primitives.md`
per the same process as the Nebula plan (fresh implementer per task, task review, fix loops, final
whole-branch review). Merge before Step 3.

**Step 3 — implement Workstreams A-E in parallel.** Since §2 confirms zero file overlap between
them, each can run as its own subagent-driven execution — potentially each in its own git worktree,
branched from the post-Foundation `master`, merged independently once each workstream's own final
review is clean. A conflict is only possible if a workstream unexpectedly touches a file outside its
listed scope; if a workstream's plan needs to touch a shared file (e.g. `router.ts` to register a new
route), that specific file edit should be called out explicitly in that workstream's plan so it can
be sequenced/coordinated rather than assumed conflict-free.

**Step 4 — update and reorganize the audits.** After Wave 1 lands: move
`plan-c-new-ui-rebuild.md` to `audit/finished/` (its phases are now implemented, not just planned)
alongside a new short closure note; update `workplan-v1.md`'s Liftr section and consolidated
open-questions list to reflect what shipped; do **not** delete any audit document — every one stays
as historical reference, per explicit instruction. `nebula-design-*.md` stay at `audit/` root since
they're still the live design-system reference, not phase-tracking documents.

## 5. What this plan deliberately does not resolve

- **Workstream B's streak/XP mechanics design pass** has no fixed shape yet — its own plan document
  should scope a brainstorm/design step before any implementation tasks, not invent mechanics here.
- **Exact wave-3+ sequencing** if Workstream A's atomic-cutover requirement means it lands later than
  B-E — Plan C's own migration strategy (§4) already allows this (A requires coordination, B-E don't),
  so B-E merging before A is fine and expected, not a blocker.
