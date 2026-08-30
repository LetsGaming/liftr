# Engagement & Rank Rework — Full Audit + Plan

**Status:** Round 2 (W7–W9) is **✅ done and committed**. Round 3 (R1–R3, the rank engine
redesign) is **📋 planned, not yet built**. This document is the complete, unabridged merge
of both rounds' original plan files — nothing summarized away, so it stands on its own as the
full reference for this work without needing to open the source plan files separately. Those
source files (local to this machine, not repo-tracked) are:
`~/.claude/plans/liftr-engagement-rework-w7-w9.md` and
`~/.claude/plans/liftr-rank-engine-redesign.md`.

For the broader whole-project picture (architecture, full data model, everything outside this
specific rework), see `liftr-audit.md`. This document is scoped specifically to the
engagement/rank work across all rounds.

---

## 0. Why this work exists — shared context across both rounds

Liftr's founding design philosophy (see `liftr-audit.md` §1) treats immediate, variable
rewards as the retention mechanism, and states plainly: *"the rank system is the retention
mechanism, and everything else exists to support logging sets fast enough that using the rank
system doesn't feel like a chore."* Two rounds of work (prior to this document, and within
it) have pressure-tested and extended that mechanism against external references.

**Round 1 (W1–W6, pre-existing, done before this document was written)** was built from a
single reference screenshot. It added: motion/haptics foundation, an in-session rank progress
bar, satisfying set-logging feedback, a three-beat finish sequence, the "Erholungszone"
recovery-zone dashboard hero, and ambient polish (pulsing streak chip, route cross-fade,
staggered entrance). Confirmed via `grep -rn "engagement rework" packages/` — every planned
item has a matching code comment. Source plan: `~/.claude/plans/the-ui-works-and-buzzing-pony.md`.

**Round 2 (W7–W9)** — the subject of Part I below — used a much richer reference:
`examples/walkthrough_bundle/` (an 89-frame + 73-filmstrip breakdown of a 303-second screen
recording of a competitor fitness app; gitignored, local-only, not redistributed).

**Round 3 (R1–R3)** — the subject of Part II below — used a comparative study of seven
competitive video games' ranked systems (League of Legends, Rainbow Six Siege Ranked 3.0,
Apex Legends, Deadlock, VALORANT, CS2 Competitive, CS2 Premier) to evaluate Liftr's rank
engine itself, not just its UI.

**The constraint that governs every recommendation in both rounds, without exception:**
Liftr is single-user, self-hosted, no accounts (`liftr-audit.md` §1;
`workout-tracker-project-audit-v2.md` §3 "Deprioritized/Skip Entirely: Multi-user accounts,
social sharing, leaderboards" — that source document no longer exists on disk but its
decisions remain binding and are re-verified against the current code in both plans below).
Every idea from either reference that only makes sense with real other users — friends,
feeds, reactions, leaderboards, hidden MMR/matchmaking, placement matches, entry costs, smurf
detection — was evaluated and **explicitly rejected**, not overlooked. What follows is
everything from both references that is genuinely single-player-safe, in full implementation
detail.

---

# Part I — Round 2: Per-exercise depth + rank analytics (W7–W9)

**Status: ✅ done.** Commits: `f903f32` (W7), `313dc09` (W8), `6019128` (W9), plus `8c0f158`
(a motion-consistency fix found via design-lint during this round: two routine page entrances
were using the overshoot easing reserved for earned moments — corrected to match the
documented convention).

## I.1 Context

Round 1 (`the-ui-works-and-buzzing-pony.md`, W1–W6) was built from a single reference
screenshot and is **fully implemented** — motion/haptics foundation, in-session rank bar,
satisfying set-logging feedback, the three-beat finish sequence, the Erholungszone readiness
hero, and ambient polish. Confirmed via `grep -rn "engagement rework" packages/` — every
planned item has a matching code comment.

This round is driven by a much richer reference: `examples/walkthrough_bundle/` (an 89-frame
+ 73-filmstrip breakdown of a 303s screen recording of a competitor app). That app leans on
two categories of engagement:

1. **Single-player systems** (rank ladders, streaks, recovery, analytics) — Liftr already
   has first versions of all of these (round 1). This round deepens them.
2. **Social systems** (friends, feeds, reactions, cosmetics for others to see) — explicitly
   rejected by this project's own audits (`workout-tracker-project-audit-v2.md` §3
   "Deprioritized/Skip Entirely: Multi-user accounts, social sharing, leaderboards";
   `liftr-code-audit.md`: "No accounts, no multi-tenancy"). **User decision (this session):
   stay single-player.** Not attempted in this round.

**User-set priority order:** W7 (exercise detail) → W8 (rank analytics) → W9 (discovery hub).

**Constraint carried forward from round 1:** no new currencies/badges — every workstream
either deepens an existing signal (rank, streak, recovery) or surfaces an existing-but-buried
feature. The one schema change (W8's `rank_events` table) is a read-only history of an event
the server already detects; it does not add a new reward type.

Mobile is the primary target throughout (per project convention); desktop is the adapted view.

## I.2 Phase 0 — Documentation discovery

(Consolidated; gathered by direct read, not subagent — evidence is exact file:line citations,
verified inline, no re-derivation needed.)

**Allowed APIs / patterns to copy (cite before inventing anything new):**

| Need | Copy from | Notes |
|---|---|---|
| Tabbed sheet shell | `packages/client/src/components/ui/SheetModal.vue` (used by `ExerciseInfoPanel.vue`) | Sheet stays an overlay, never promoted to a route — explicit rule in `ExerciseInfoPanel.vue:1-7`'s header comment. |
| Rank display | `packages/client/src/components/rank/RankProgress.vue` | Already renders tier badge + LP bar + next-target + `≈` trust marker (`RankProgress.vue:53`, `:100`, `:129`). Used as-is by `RanksPage.vue:38-46`. Do not fork a second implementation (round-1 plan's own rule, still binding). |
| Per-exercise chart | `packages/client/src/components/rank/ProgressChart.vue` | Hand-rolled inline SVG polyline, e1RM-or-reps day-best series. **No charting library** — round 1 plan states this explicitly and the codebase has zero chart deps; keep it that way. |
| History data fetch | `packages/client/src/composables/useExerciseHistoryCache.ts` + `services/exerciseService.ts:getExerciseHistory` | Hits existing `/api/exercises/:id/history`, returns `{setIndex, weightKg, reps, loggedAt, isWarmup}[]`. No new route needed for W7. |
| Tier color tokens | `packages/client/src/styles/tokens.css` `.t-<tier>` classes (bronze/silver/gold/platinum/diamond) | Already used by `RanksPage.vue` rank cards and `RankProgress.vue`; reuse for W8's donut segments — do not invent new tier colors. |
| Rank-up detection (server) | `packages/server/src/services/rankService.ts:128-140` | `rankedUp` boolean computed at line 129; `upsertRank` call at 131 overwrites the single-row cache (`ranks` table, PK = exerciseId, no history). This is the exact point to hook a new-event insert for W8. |
| New-table pattern to copy | `packages/db/src/schema.ts:235-248` (`prs` table) | `id()`, FK to exercises with `onDelete: cascade`, enum discriminant column, timestamp column, `index(...).on(t.exerciseId)`. Copy this shape for `rank_events`, don't design a new one. |
| New read-route pattern | `packages/server/src/routes/readiness.ts` (added in round 1, W5) | Precedent for "new small read-oriented route added to `app.ts`" — copy that registration pattern for W8's rank-events route. |
| Card-grid visual language | `packages/client/src/pages/OverviewPage.vue` `.progress-tiles` / `.tile` (lines ~394-412) | Reuse for W9's "Entdecken" grid — don't invent new card styling. |
| Existing buried features | `packages/client/src/pages/ProfilePage.vue` (grep hit for `csv`/`export`/plate calc) | W9 links into these, does not rebuild them. |
| Router surface | `packages/client/src/router.ts` | 7 routes today (`/`, `/workout`, `/ranks`, `/exercises`, `/runs`, `/profile`, `/attributions`). W7–W9 add **zero new routes** — everything is either a sheet tab or a new section on an existing page. |

**Anti-patterns to avoid** (explicit, since this is a UI/UX rework and invented visuals are
the equivalent of invented APIs here):
- Do not add a charting library (Chart.js, D3, etc.) — every existing chart in this repo is
  hand-rolled inline SVG; W8's donut must follow the same convention.
- Do not promote `ExerciseInfoPanel` from a sheet to a routed page — violates the explicit
  "never leave the workout screen" rule in its own header comment.
- Do not add any social/friends/leaderboard/reactions surface — out of scope per the user's
  explicit decision this session.
- Do not add a new reward currency (points, badges, coins) — W8's rank-events table is
  history of an *existing* signal (rank-ups), not a new one.
- Do not duplicate `RankProgress.vue` or `ProgressChart.vue` — reuse the single implementation
  in all three call sites (RanksPage, W7's Rang tab, W7's Statistiken tab).

## I.3 Phase 1 (W7) — Per-exercise detail: tabbed sheet — ✅ done, `f903f32`

**What to implement:**
1. Add a tab strip to `ExerciseInfoPanel.vue`: **Über / Rang / Statistiken / Verlauf** (local
   `ref<'ueber'|'rang'|'statistiken'|'verlauf'>`), styled consistent with any existing
   segmented-control convention in the codebase (check `IonSegment` usage elsewhere first; if
   none exists, a simple bordered-pill row matching `.rank-card` button conventions in
   `RanksPage.vue` is the fallback — do not invent a third visual style).
2. **Über tab** — move the existing panel body (demo, how-to, equipment, muscles;
   `ExerciseInfoPanel.vue:56-80`) under this tab, verbatim. No behavior change.
3. **Rang tab** — mount `<RankProgress variant="card" :tier :division :lp :next-target-weight-kg :next-target-reps :trust>`
   bound to this exercise's row from `ranksStore` (`useRanksStore` — same store `RanksPage.vue`
   already uses). If the exercise has no rank yet (never logged), show the existing
   `RanksPage.vue:30-32` empty-state copy pattern, not a new one.
4. **Statistiken tab** — `<ProgressChart>` at full sheet width (component is already
   responsive via CSS; only the container width changes) + 3 stat tiles computed from the same
   `sets` array: best e1RM/reps (`estimateE1rm` from `@liftr/shared`, already imported by
   `ProgressChart.vue`), lifetime volume (`Σ weightKg × reps` over non-warmup sets), total sets
   logged (`sets.length`).
5. **Verlauf tab** — new `ExerciseHistoryList.vue`: reverse-chronological, grouped by
   `loggedAt.slice(0,10)` day, each row `{weightKg}kg × {reps}` with a warm-up marker for
   `isWarmup`. Pure presentational component, props-in, no fetching (matches the codebase's
   "a component does not fetch" convention cited in `useExerciseHistoryCache.ts:3`).
6. **Data wiring** — `ExerciseInfoPanel.vue` calls `useExerciseHistoryCache().toggleExpand`
   (or a similarly-shaped lazy fetch keyed by `exercise.id`) on first switch to Rang/
   Statistiken/Verlauf, not on mount — keeps the Über-only common case (opened from the
   workout screen mid-set) free of an extra request.

**Verification checklist:**
- `pnpm --filter @liftr/client run typecheck` clean (new prop/emit shapes on
  `ExerciseInfoPanel.vue` must satisfy both call sites: workout screen + exercise browser).
- Browser click-test at mobile width: open the sheet from `WorkoutPage.vue` mid-set → Über
  shows unchanged content → switch to Rang → tier badge appears with correct color → switch to
  Statistiken → chart renders (or empty-state, if <2 data points, matching
  `ProgressChart.vue:75`'s existing empty copy) → switch to Verlauf → sets list groups by day.
- Confirm the sheet still opens/closes exactly as before from both existing call sites
  (`ExerciseInfoPanel` is used from more than one screen — grep call sites before editing the
  prop signature).
- `prefers-reduced-motion: reduce` → tab switch has no motion dependency broken.

**Anti-pattern guards:** no new route; no forked `RankProgress`/`ProgressChart`; no fetch
inside `ExerciseHistoryList.vue` itself.

**Actual implementation notes (post-hoc, from the verified build):** `ExerciseHistoryList.vue`
groups newest-day-first and newest-set-within-day-first; the Rang tab keys off
`ranksStore.ranks.find((r) => r.exerciseId === props.exercise.id)`, not `[0]`; `activeTab`
resets to `"ueber"` on every open because the sheet is destroyed/recreated via `v-if` at both
call sites (`WorkoutPage.vue:519`, `ExercisesPage.vue:35`), satisfying the "defaults to Über
every time" requirement without extra logic. One latent (non-blocking) risk noted during
review: if a future call site ever swapped `infoExerciseId` directly from one exercise to
another without passing through `null`, the sheet wouldn't remount and `activeTab` wouldn't
reset — not currently reachable in the UI, flagged for awareness only.

## I.4 Phase 2 (W8) — Rank analytics — ✅ done, `313dc09`

**What to implement:**

1. **New table** `rank_events` in `packages/db/src/schema.ts`, copying the `prs` table shape
   (schema.ts:235-248) exactly:
   ```ts
   export const rankEvents = sqliteTable(
     "rank_events",
     {
       id: id(),
       exerciseId: text("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
       tier: text("tier", { enum: ["bronze", "silver", "gold", "platinum", "diamond"] }).notNull(),
       division: integer("division").notNull(),
       occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
     },
     (t) => [index("rank_events_exercise_idx").on(t.exerciseId)],
   );
   ```
   Generate + apply via the existing `db-migration` skill workflow (`pnpm db:generate` →
   review SQL → `pnpm db:migrate`) — do not hand-edit the generated migration file.

2. **Write the event** in `rankService.ts`, right after the existing `rankedUp` computation
   (line 129) and following the `insertPr` call pattern at lines 146-154:
   ```ts
   if (rankedUp) {
     await insertRankEvent(db, { exerciseId, tier: rank.tier, division: rank.division, occurredAt: bestSet.loggedAt });
   }
   ```
   New `insertRankEvent` repository function mirrors the existing `insertPr` in whatever
   repository file that lives in (`packages/server/src/repositories/`).

3. **New read route** `packages/server/src/routes/rankEvents.ts`, registered in `app.ts`
   following the exact pattern `routes/readiness.ts` established in round 1 (W5): a single
   drizzle query grouped by weekday over the last N days, returning
   `{ weekday: 0-6, count: number }[]`.

4. **Rangverteilung (distribution donut)** — new small component on `RanksPage.vue`, pure
   client-side aggregation of `ranksStore.ranks` grouped by `tier` (no new fetch), hand-rolled
   SVG donut (arc math, not a library) using the existing `.t-<tier>` CSS custom properties for
   segment fill.

5. **Rangaufstiege (rank-up calendar)** — new small component consuming the Phase 2.3 route,
   rendered as a 7-cell weekday strip (Mo–So) with count per day, styling consistent with the
   existing 7-day dot strip built in round 1 W4 beat 2 (`FinishSequence.vue`) — reuse that
   visual pattern rather than inventing a second "week strip" look.

6. **Curiosity framing** — in `RankProgress.vue`, where `nextTargetWeightKg`/`nextTargetReps`
   are both `null` (top of known standards), render `???` in place of the target line instead
   of hiding it (check current conditional rendering around `RankProgress.vue`'s next-target
   markup before changing — likely a `v-if` that currently suppresses the line entirely).

**Verification checklist:**
- `pnpm test` — existing `rankEngine`/`rankService` test suites stay green; add a test
  confirming `insertRankEvent` fires exactly once per genuine tier/division change, not per
  set logged (guard against a regression that would make every set look like a rank-up).
- `pnpm --filter @liftr/db generate` produces a migration touching only `rank_events` (review
  the generated SQL per the `db-migration` skill before applying).
- Browser click-test: log sets until a rank-up fires → reload `RanksPage.vue` → the
  Rangaufstiege strip shows a count on today's weekday → the donut's tier counts match the
  visible rank cards below it.
- Confirm `RankProgress.vue`'s `???` change doesn't regress the common case (a real next
  target must still render normally — only the genuinely-exhausted case changes).

**Anti-pattern guards:** no charting library for the donut or the calendar strip; no new
reward semantics — `rank_events` is a read-only log of an event the server already computes,
not a new mechanic; don't duplicate the 7-day-strip visual pattern from `FinishSequence.vue`.

**Actual implementation notes (post-hoc, from the verified build):**
- Migration `packages/db/drizzle/0007_funny_susan_delgado.sql` — confirmed to touch only the
  new table + index, nothing else.
- The `insertRankEvent` call is gated strictly on the same `rankedUp` boolean used for the
  function's return value (`rankService.ts:136`), not called unconditionally; a dedicated
  regression test (`rankService.test.ts:99-123`) logs a first set (1 row), a weaker set that
  doesn't change tier (still 1 row), and a set that clears the next threshold (2 rows) —
  a real guard, not just "table has rows."
- `RankDistributionDonut.vue` is hand-rolled SVG (`stroke-dasharray`/`stroke-dashoffset` arc
  math on a single `<circle>`), no chart library import.
- **Pre-existing bug discovered and worked around (not fixed, flagged for awareness):**
  `tokens.css` defines a `.t-plat` class (not `.t-platinum`) for the platinum tier, but every
  call site applies `t-${tier}` where `tier` is the literal string `"platinum"` — so
  platinum's `--b1/--b2/--b3/--tt` custom properties are never actually set anywhere in the
  app via that class. The donut works around this by reading `--bronze-3`/`--silver-3`/
  `--gold-3`/`--plat-3`/`--diamond-3` custom properties directly instead of through the
  `.t-<tier>` class, so its platinum segment renders correctly despite the underlying bug.
  This bug affects other, pre-existing tier-colored surfaces too and was left unfixed as
  out-of-scope for this phase.
- `RankUpCalendar.vue` reuses `FinishSequence.vue`'s `.streak-day`/`.dot`/`.dl` class names
  and the 32px circular-dot/label-below structure verbatim. One minor, flagged-but-accepted
  deviation: `RankUpCalendar.vue`'s `.streak-strip` adds `justify-content: space-between`,
  which `FinishSequence.vue`'s version does not have — a scoped-CSS-safe cosmetic difference
  (edge-to-edge fixed 7-cell layout vs. a variable-length list), not a second invented style.
- The `RankProgress.vue` next-target line was never actually hidden via `v-if` as the plan
  assumed — it already rendered a fixed string (`"Höchster Rang erreicht"`). The implemented
  fix changed that string to `"nächster: ???"`, delivering the same curiosity-framing intent
  as a wording swap rather than an added conditional. The normal case (a real next target
  exists) is untouched.

## I.5 Phase 3 (W9) — Discovery hub + nav polish — ✅ done, `6019128`

**What to implement:**
1. New "Entdecken" section on `OverviewPage.vue`, visually matching the existing
   `.progress-tiles`/`.tile` card grid (lines ~394-412) — same border/background/radius
   tokens, no new card style.
2. Cards link to: the plate calculator and CSV/ZIP export (currently only reachable via
   `ProfilePage.vue` — confirm their exact current location there before wiring the link
   target), and Phase 2's new Rangverteilung/Rangaufstiege views on `RanksPage.vue` (as a
   deep-link/anchor, not a duplicate render).
3. Nav polish: confirm the round-1 W6 200ms route cross-fade (`App.vue`) already covers any
   new interactions added in W7/W8 (tab switching inside a sheet is not a route change, so
   it's out of scope for this cross-fade — verify no regression, don't add a second transition
   system).

**Verification checklist:**
- Browser click-test: each Entdecken card navigates to/reveals the correct existing feature;
  none of them 404 or open a blank state.
- No new route added (`router.ts` diff should be empty for this phase).

**Anti-pattern guards:** this phase surfaces existing features only — if a linked feature
turns out not to exist yet (e.g., no standalone plate-calculator route), stop and flag it
rather than building it silently as scope creep beyond "discovery."

**Actual implementation notes (post-hoc, from the verified build):** per this phase's own
anti-pattern guard, the plate calculator was checked first (grep across
`packages/client/src`) and found to exist only as an inline reveal inside `SetEntry.vue` tied
to an in-progress set on `WorkoutPage.vue` — there is no standalone page/modal for it to link
to. It was correctly **left out** of the Entdecken grid rather than a new entry point being
invented for it, exactly per the guard's instruction. The shipped grid links only to
"Daten-Export" (→ `/profile`) and "Rang-Analyse" (→ `/ranks`, W8's new views).

## I.6 Files at a glance (Round 2)

**New:** `client/src/components/exercise/ExerciseHistoryList.vue` ·
`client/src/components/rank/RankDistributionDonut.vue` ·
`client/src/components/rank/RankUpCalendar.vue` ·
`server/src/routes/rankEvents.ts` · `db` migration for `rank_events`

**Modified:** `client/src/components/exercise/ExerciseInfoPanel.vue` (W7) ·
`client/src/components/rank/ProgressChart.vue` (width variant, W7) ·
`client/src/components/rank/RankProgress.vue` (curiosity framing, W8) ·
`client/src/pages/RanksPage.vue` (W8 widgets) ·
`client/src/pages/OverviewPage.vue` (W9 Entdecken section) ·
`db/src/schema.ts` (W8) · `server/src/services/rankService.ts` (W8) ·
`server/src/app.ts` (W8 route registration) ·
`server/src/repositories/*` (new `insertRankEvent`, W8)

**Reuse, don't rebuild:** `SheetModal.vue`, `RankProgress.vue`, `ProgressChart.vue`,
`useExerciseHistoryCache`, `.t-<tier>` tokens, the round-1 7-day-dot-strip pattern
(`FinishSequence.vue`), `.progress-tiles`/`.tile` card styling (`OverviewPage.vue`).

## I.7 Sequencing (Round 2)

1. **W7** — no schema change, self-contained in the client, highest user-priority. Ship first.
2. **W8** — the only phase touching the DB; depends on nothing from W7.
3. **W9** — pure surfacing; trivially depends on W8's new views existing to link to them, so it
   goes last.

Each phase is independently shippable, matching round 1's own sequencing philosophy.

## I.8 Final verification (Round 2) — all confirmed passing

- `pnpm test` and `pnpm --filter @liftr/client run typecheck` / `pnpm typecheck` across all
  packages clean after each phase (not just at the end). **Confirmed: 19 test files / 154
  tests passing after W8; typecheck clean after every phase.**
- `pnpm build` succeeds (production build, not just dev).
- Grep guard: `grep -rn "Chart.js\|d3\|recharts" packages/client/package.json` returns nothing
  — confirms no charting library snuck in. **Confirmed clean.**
- Manual, mobile-width, per the project's own recurring lesson ("click-test in a real browser,
  don't trust the diff") — repeat each phase's checklist above in one pass at the end to
  confirm no regressions between phases.
- `prefers-reduced-motion: reduce` pass across all three new surfaces.
- Regression watch (carried from round 1, still binding): the sacred 1–2-tap log-a-set path
  must not gain a single tap or a blocking animation from any of W7–W9's changes — none of
  them touch the logging path directly; **confirmed** `ExerciseInfoPanel` opened mid-set
  defaults to the Über tab every time (not wherever the user last left it), so it doesn't add
  a tap to get back to the how-to/muscle view during a set.

**Post-round fix, also committed (`8c0f158`):** a design-lint pass flagged
`RanksPage.vue:86` and `OverviewPage.vue:344` for using `--ease-spring` (the overshoot easing)
on routine page-entrance animations. `motion.css`'s own header comment reserves that easing
for earned moments (rank-up, PR, level-up) and explicitly warns that routine use "would
cheapen the moments that are supposed to feel different" — a real, if minor, violation of the
codebase's own documented convention, not a false positive. Both were switched to
`--ease-out`; no visual/behavioral change beyond the curve.

---

# Part II — Round 3: Rank engine redesign (Peak/Current split + Overall Lifter Rank, R1–R3)

**Status: 📋 planned, not yet implemented.** This is the next work to pick up on this project.

## II.1 Context

A comparative study of seven competitive games' ranked systems (League, Siege Ranked 3.0,
Apex, Deadlock, Valorant, CS2 Competitive, CS2 Premier) was used to evaluate Liftr's rank
engine. **Most of that study does not transfer**: every one of those games solves problems
specific to PvP matchmaking — hidden MMR vs. visible rank divergence, opponent-relative
scoring, demotion, placement matches, entry costs, smurf detection, teammate dependency.
Liftr has no opponents and no matches, so none of these problems exist here in the first
place, and importing their solutions (hidden MMR, entry costs, placement matches) would be
actively wrong for a single-player app.

**What does transfer** is the *psychology* of progression systems in general, filtered
through what's actually applicable to a solo mastery ladder:
- **Transparency beats mathematical purity** (Deadlock/CS2 Premier's biggest strength,
  hidden-MMR games' biggest weakness) — Liftr's rank is already fully transparent
  (`resolveRank` in `packages/shared/src/rank/tiers.ts` is pure, deterministic, no hidden
  state) and this must stay true through every change below.
- **Boundary crossings should feel earned and be celebrated** (Deadlock doubles the cost of
  the final subrank before a tier change) — Liftr already has W3's `RankUpCelebration.vue`
  tier-matched celebration; this redesign doesn't need to touch that, only make sure the
  *math* behind a crossing stays meaningful.
- **Protect against demotion frustration, but don't remove all stakes** — this is the user's
  explicit "mixture" decision for this redesign (see below), and the one place a real new
  mechanic is warranted.
- **A single account-level number matters** — every game in the study has one visible
  headline rank; Liftr has ~15+ *independent* per-exercise ladders and nothing answering "how
  good a lifter am I, overall." This is the one genuinely new, single-player-safe idea worth
  building (also present in the separate `walkthrough_bundle` reference app's aggregate
  discipline rank, which this design deliberately reinterprets without any of that app's
  social/placement-match baggage).

**A real bug found while grounding this design:** `recomputeRankForExercise`
(`packages/server/src/services/rankService.ts:69-157`) computes rank from
`e1RM / getCurrentBodyweightKg(db)` for bodyweight-relative exercises, using *current*
bodyweight against the *all-time-best* e1RM. Because bodyweight can legitimately increase
between the PR set and today without any strength loss, this silently violates the system's
own "rank never decreases" property that the rest of the design (and the report's biggest
lesson: never punish someone for something that reads as out of their control) has been
carefully preserving elsewhere. Fixing this is Workstream R1, not optional.

**User decisions (this session):**
1. Rank should never risk losing *all* progress, but total permanence removes motivation to
   keep training a lift — **a floor-protected soft decay**, not a hard "never changes" rule
   and not a real demotion system.
2. Build the aggregate "Overall Lifter Rank," explored as a real workstream.
3. Full sequenced plan (not a small tuning pass) — treat this like the `W1-W9` engagement
   rework: independently shippable workstreams.

Mobile is the primary target throughout (project convention); desktop is the adapted view.

## II.2 Phase 0 — Documentation discovery

(Grounded by direct read, exact file:line citations.)

| Need | Copy from / ground truth | Notes |
|---|---|---|
| Rank math (pure, deterministic) | `packages/shared/src/rank/tiers.ts` — `resolveRank` (57-97), `nextLoadTarget` (105-122), `nextRepTarget` (129-133) | All pure functions, unit-tested in `tiers.test.ts`. Any new "current vs peak" logic should live here too, not in the server, to keep the client/server-identical-recompute guarantee (`rankService.ts:1-8`'s own stated rule). |
| Server orchestration | `packages/server/src/services/rankService.ts` — `recomputeRankForExercise` (69-157) | `bestValue`/`bestSet` loop (90-112) is the exact spot the bodyweight bug lives; `upsertRank` (131-140) is the exact spot Peak-rank persistence hooks in. |
| Rank-up event history (already built, W8) | `packages/server/src/repositories/rankRepository.ts` — `insertRankEvent`, `findRankEventsSince`; `packages/db/src/schema.ts` `rankEvents` table (added in W8, committed `313dc09`) | Reuse as-is for any "current rank changed" logging — do not build a second event-log table. |
| Ranks table (needs new columns) | `packages/db/src/schema.ts:221-233` (`ranks`) | Currently one row per exercise: `tier, division, lp, e1rm, trust, nextTargetWeightKg, nextTargetReps, computedAt`. Peak fields are additive columns, not a new table — this stays a "derived cache, always rebuildable" per its own header comment. |
| Anchor lifts (real/derived trust) | `packages/shared/src/rank/defaultStandards.ts` `ANCHOR_STANDARDS` (40+) | back-squat, bench-press, deadlift, overhead-press, barbell-row (real, OPL-calibrated) + bodyweight anchors (pushup/pullup/chinup/dip). These are the natural weighting basis for the aggregate rank — do not weight synthetic long-tail exercises equally, or the aggregate becomes gameable/diluted by rarely-trained movements. |
| Existing "at risk" nudge pattern | `packages/client/src/App.vue` (streak "at risk" late-in-day nudge, engagement rework W6) | Reuse this exact pattern/tone for decay nudges — do not invent a second notification style. |
| Recovery heuristic honesty convention | `packages/shared/src/recovery/recovery.ts` header comment ("a fixed-window heuristic, not physiology") | The decay function must be documented the same way — an honest heuristic, not a claim of scientific detraining accuracy. |
| Bodyweight source | `packages/server/src/services/rankService.ts:29-37` `getCurrentBodyweightKg` | Used for load_ratio recompute; Workstream R1 must stop using *current* bodyweight for anything peak-related. |

**Anti-patterns to avoid:**
- Do not import any PvP-specific concept from the study: no hidden MMR, no opponent-relative
  scoring, no entry costs, no placement matches, no smurf detection, no leaderboards. None of
  these solve a problem Liftr has.
- Do not let "current rank" ever fall below the floor (bottom of the peak tier) — this is the
  hard invariant satisfying "shouldn't risk losing all your rank progress."
- Do not build a second rank-event/history table — reuse `rank_events` from W8.
- Do not weight the aggregate rank equally across all ~94 catalog exercises — weight toward
  trust tier (real > derived > synthetic) and the anchor-lift set.
- Do not add any UI motion/celebration system beyond what W1-W6 already built — this plan is
  about the underlying numbers, not new animation infrastructure.

## II.3 Phase 1 (R1) — Fix the bodyweight-ratio regression bug + establish Peak Rank

**What to implement:**
1. Add columns to `ranks` (`packages/db/src/schema.ts`): `peakTier`, `peakDivision`, `peakLp`,
   `peakE1rm`, `peakAchievedAt` — same enum/type conventions as the existing `tier`/`division`/
   `lp`/`e1rm`/`computedAt` columns immediately above them in the same table. Generate via
   `pnpm db:generate`, review the SQL (must be a single `ALTER TABLE ranks ADD COLUMN` set,
   nothing else touched), apply via `pnpm db:migrate` — per the `db-migration` skill, never
   hand-edit the generated file.
2. In `recomputeRankForExercise` (`rankService.ts`), after resolving `rank` (current line 115)
   but before `upsertRank` (current line 131): compare the newly-resolved value against the
   *stored* peak (read via `findRankByExerciseId`, already called at line 128 for
   `previousRank`) using **ordinal comparison** (`ordinal(tier, division)` — export this helper
   from `tiers.ts`, it currently exists but is private) plus LP as the tiebreaker within the
   same band. If the new value's ordinal+LP exceeds the stored peak, update peak fields;
   otherwise leave peak untouched. Peak is a ratchet — it is never computed fresh from current
   bodyweight, only compared against and possibly replaced.
3. This structurally fixes the bug: peak is locked in at the moment it's achieved (using
   whatever bodyweight was current *then*, embedded in the e1RM/ratio value already computed),
   and never recomputed retroactively against today's bodyweight. A later bodyweight increase
   can still affect *current* rank (Workstream R2 defines what "current" means going forward)
   but can never erase a peak.
4. Add a one-time backfill: for existing rows in `ranks` with no peak set, initialize
   `peak* = current *` on first recompute after migration (simplest correct backfill — every
   exercise's peak starts at whatever its current snapshot already is, then only moves up
   from there).

**Verification checklist:**
- New test in `packages/shared/src/rank/tiers.test.ts`: given a sequence of (value, bodyweight)
  pairs where a later bodyweight increase alone would have lowered the naive ratio, confirm
  the peak-tracking logic (once extracted to `tiers.ts` per Phase 0's guidance) never regresses.
- New test in `packages/server/src/services/rankService.test.ts`: two recomputes where the
  second uses a heavier bodyweight but the same or better absolute lift — peak fields must be
  unchanged or improved, never worse.
- `pnpm --filter @liftr/db run typecheck`, `pnpm --filter @liftr/server run typecheck`,
  `pnpm test` all clean.
- Migration reviewed: touches only `ranks`' new columns.

**Anti-pattern guards:** no new table (additive columns on `ranks` only); peak logic lives in
`@liftr/shared` alongside the existing pure rank math, not duplicated server/client.

## II.4 Phase 2 (R2) — Current Rank: floor-protected soft decay

**What to implement:**
1. New pure function in `packages/shared/src/rank/decay.ts` (new file, same convention as
   `packages/shared/src/recovery/recovery.ts` — documented explicitly as "a fixed-window
   heuristic, not physiology," with a `.test.ts` alongside it):
   ```ts
   RANK_DECAY_GRACE_DAYS = 21   // no decay before this many days since last logged set
   RANK_DECAY_WINDOW_DAYS = 60  // linear decay from grace-day to floor over this window
   computeCurrentBand(peak: {tier, division, lp}, daysSinceLastTrained: number)
     -> {tier, division, lp}   // floored at peak.tier's division-III/0 LP — never lower
   ```
   The floor is **the bottom of the peak tier** (e.g. a Gold peak can decay down to Gold III /
   0 LP, never into Silver) — this is the literal implementation of "shouldn't risk losing all
   your rank progress" while still giving inactivity a felt cost within the tier you've
   already proven.
2. `recomputeRankForExercise` calls `computeCurrentBand` after peak is resolved (R1), using
   `daysSinceLastTrained` from the most recent logged set for that exercise (already available
   from `loggedSets`, no new query). The existing `tier`/`division`/`lp` columns on `ranks`
   become **current** (decayed) values; `nextTargetWeightKg`/`nextTargetReps` continue to be
   computed off the current band exactly as today (no change to that logic).
3. **Only real training reverses decay** — logging a new set for that exercise recomputes
   `daysSinceLastTrained` back to 0, so current rank snaps back toward peak immediately (not
   gradually) the moment the user trains it again. This avoids a second, separate "climb back
   up" grind, which the report's universal-frustrations section flags as exactly the kind of
   mechanic that makes players feel punished twice.
4. **UI nudge** (client): reuse the exact "at risk" pattern from `App.vue`'s streak nudge
   (engagement rework W6) — when a peak-tier exercise's current band has decayed below peak,
   show a low-friction caption (not a popup) on that exercise's rank display, e.g.
   `"-1 Division seit 24 Tagen"`, in `RankProgress.vue`. Never hide *why* the number moved —
   per the transparency lesson, this line is not optional.
5. Decay changes to `current` do **not** write to `rank_events` (W8's table logs genuine
   rank-*ups* only, per its own scope) — a decay tick is not a "rank event," it's a passive
   recompute. Confirm this by construction (decay path never calls `insertRankEvent`).

**Verification checklist:**
- `tiers.test.ts`/new `decay.test.ts`: boundary cases — exactly at grace period (no decay
  yet), mid-window (partial decay), past window (floored, does not go below), floor is exactly
  peak-tier-division-III/0-LP never lower, decay reverses to 0 the instant a new set is logged
  (not gradually).
- Browser click-test: an exercise not trained in >60 days shows a visibly lower current band
  than its peak, with the "-X since Y days" caption; logging one set for it immediately
  restores current = peak.
- Regression watch: confirm `rank_events` gains no new rows from decay-only recomputes (grep
  the decay code path for `insertRankEvent` calls — there should be none).

**Anti-pattern guards:** floor is a hard invariant (peak tier's bottom), never configurable
lower; decay reversal is instant on real training, not itself a second grind; no new
DB-persisted event type for decay ticks.

## II.5 Phase 3 (R3) — Overall Lifter Rank (aggregate)

**What to implement:**
1. New pure function in `packages/shared/src/rank/aggregate.ts` (new file, tested):
   ```ts
   computeOverallRank(perExerciseCurrent: {tier, division, lp, trust}[]) -> {tier, division, lp}
   computeOverallPeak(perExercisePeak: {tier, division, lp, trust}[]) -> {tier, division, lp}
   ```
   Weight by trust tier — `real` and `derived` count fully, `synthetic` counts at a reduced
   weight (e.g. 0.5×) so the long-tail catalog can't dilute or inflate the headline number.
   Average the per-exercise **ordinal position** (tier×division, continuous via LP within
   band — reuse `ordinal()` from `tiers.ts`, exported in R1) weighted as above, then map the
   weighted-average ordinal back to a tier/division/LP triple for display. Exercises with no
   rank yet (never logged) are excluded, not counted as zero — matching the existing
   per-exercise "no rank yet" empty-state philosophy (`RanksPage.vue:30-32`), so a brand-new
   catalog addition can't drag the aggregate down.
2. Server: extend `packages/server/src/services/rankService.ts` (or a small new
   `overallRankService.ts` alongside it, if the file is getting large) with a function that
   loads all `ranks` rows, calls both aggregate functions, and persists the result — either as
   two new columns on a new tiny single-row table (`overall_rank`: current + peak fields,
   `computedAt`) or recomputed on-demand in the read route (prefer on-demand: the input data —
   all `ranks` rows — is already small, single-user, and cheap to aggregate fresh each
   request; avoids a second derived-cache table needing its own invalidation logic). Recommend
   **on-demand, no new table** unless a real performance problem shows up in testing.
3. New read route `packages/server/src/routes/overallRank.ts`, registered in `app.ts`
   following the exact pattern already used twice (`readiness.ts` in W5, `rankEvents.ts` in W8).
4. Client: `packages/client/src/stores/overallRankStore.ts` (same shape as `ranksStore.ts`),
   surfaced on `OverviewPage.vue`'s status strip (reuse `StatTile.vue`, already imported there)
   showing current tier + a small "Bestleistung: X" caption for peak — do not build a new
   dedicated page for this; it's one more fact on the existing dashboard, consistent with the
   plan's own "no new currencies, deepen existing signals" constraint from the prior
   engagement-rework plan.

**Verification checklist:**
- New `aggregate.test.ts`: weighting math (synthetic-heavy input pulls the number down less
  than an equal-weight naive average would), exclusion of never-trained exercises, a
  hand-computed example matching the function's output exactly.
- `pnpm --filter @liftr/server run typecheck`, `pnpm --filter @liftr/client run typecheck`,
  `pnpm test` clean.
- Browser click-test: Übersicht shows a plausible overall tier that moves sensibly when a
  major anchor lift (e.g. back-squat) ranks up, and doesn't swing wildly from one synthetic
  exercise's rank-up.

**Anti-pattern guards:** no new leaderboard/social surface (aggregate is still single-player,
just a bigger number); no equal-weighting of synthetic exercises; no new page — surfaced on
the existing dashboard.

## II.6 Files at a glance (Round 3)

**New:** `shared/src/rank/decay.ts` (+`.test.ts`) · `shared/src/rank/aggregate.ts` (+`.test.ts`) ·
`server/src/routes/overallRank.ts` · `client/src/services/overallRankService.ts` ·
`client/src/stores/overallRankStore.ts`

**Modified:** `db/src/schema.ts` (peak columns on `ranks`) · `shared/src/rank/tiers.ts`
(export `ordinal`) · `server/src/services/rankService.ts` (peak ratchet + decay call) ·
`server/src/services/rankService.test.ts` · `shared/src/rank/tiers.test.ts` ·
`server/src/app.ts` (route registration) · `client/src/components/rank/RankProgress.vue`
(decay caption) · `client/src/pages/OverviewPage.vue` (overall rank stat tile)

**Reuse, don't rebuild:** `resolveRank`/`nextLoadTarget`/`nextRepTarget` (`tiers.ts`),
`rank_events` table + `insertRankEvent` (W8), the `readiness.ts`/`rankEvents.ts` route
registration pattern, `App.vue`'s "at risk" nudge tone, `StatTile.vue`, the recovery module's
"honest heuristic" documentation convention.

## II.7 Sequencing (Round 3)

1. **R1** — the bug fix; everything else depends on Peak existing and being correct. Ship first.
2. **R2** — Current-rank decay; depends on R1's peak field. The single biggest behavior change
   a real user will notice — verify thoroughly before R3 builds on top of it.
3. **R3** — the aggregate; purely additive, reads R1/R2's per-exercise output, touches no
   existing per-exercise behavior. Lowest-risk phase, goes last.

Each phase is independently shippable, matching the project's established sequencing
philosophy from the prior engagement-rework plan.

## II.8 Final verification (Round 3) — not yet run, this round is unbuilt

- `pnpm test`, `pnpm typecheck` (all packages), `pnpm build` clean after each phase.
- Grep guard: no `insertRankEvent` call in any decay code path (R2 must not log decay as a
  rank event).
- Manual, mobile-width: train an exercise to a new peak → confirm celebration fires (existing
  W3 UI, untouched) → simulate inactivity (adjust a set's `loggedAt` in a local test DB, or
  add a temporary test hook) → confirm current rank softens but never crosses the peak-tier
  floor → log one new set → confirm instant snap-back to peak, not gradual.
- Confirm the Übersicht's new overall-rank tile updates after any per-exercise rank-up and
  degrades gracefully (shows nothing, not an error) when too few anchor lifts have been
  trained yet to compute a meaningful aggregate.
- Regression watch (carried from every prior plan in this series): the sacred 1-2-tap
  log-a-set path must not gain a tap or a blocking computation — all new math here runs at
  recompute time (already async, already off the hot path), not inline in `logCurrentSet()`.

---

## Appendix — reference inventory

- `~/.claude/plans/the-ui-works-and-buzzing-pony.md` — Round 1 (W1–W6) plan, pre-existing.
- `~/.claude/plans/liftr-engagement-rework-w7-w9.md` — Round 2 (W7–W9) plan, merged in full above.
- `~/.claude/plans/liftr-rank-engine-redesign.md` — Round 3 (R1–R3) plan, merged in full above,
  not yet implemented.
- `liftr-audit.md` (repo root) — the whole-project audit (architecture, full data model,
  security posture, dev workflow); this document is scoped specifically to the engagement/rank
  work, cross-referenced from `liftr-audit.md` §7.
- `examples/walkthrough_bundle/` — gitignored, local-only video-walkthrough reference material
  used for Round 2; not redistributed, not part of tracked history.

**Next step:** implement R1–R3 per Part II above, following the same implement → verify →
commit cadence used for W7–W9 in Round 2.
