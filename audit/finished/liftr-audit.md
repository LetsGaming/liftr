# Liftr — Project Audit

**Prepared:** 2026-08-31. **Why this document exists:** the two prior audit documents
(`liftr-code-audit.md`, `workout-tracker-project-audit-v2.md`) were deleted from disk outside
of git and were never committed, so they're unrecoverable. This is a fresh audit, written
directly from the current codebase rather than reconstructed from memory of the old ones —
where it overlaps with what those docs said, it's because the code still matches; where it
doesn't, this document reflects what's actually true today.

**What Liftr is:** a personal, single-user, self-hosted strength/running tracker. Vue 3 +
Ionic/Capacitor PWA client, Fastify + SQLite/Drizzle backend, TypeScript pnpm monorepo. No
accounts, no multi-tenancy — auth is a single bearer token behind a homelab reverse proxy.
Built around a tiered per-exercise rank system, offline-first set logging, and GPX/FIT run
import, with a recent multi-round "engagement rework" adding motion, haptics, recovery
tracking, and rank analytics on top of that core.

---

## 1. Goal and constraints

Liftr exists to solve a specific, personal problem: prior tools either had a rank/progression
system worth staying engaged with but were otherwise unusable (a proprietary app the owner
used before), or were fully-featured but had UI/UX bad enough that engagement died anyway
(self-hosted wger). The founding bet is that **the rank system is the retention mechanism**,
and everything else exists to support logging sets fast enough that using the rank system
doesn't feel like a chore.

**Locked-in scope decisions** (still true, verified against the current code — auth is
single-bearer-token, no accounts table exists in the schema, no social/friends/leaderboard
code exists anywhere in the client or server):
- **Single user, forever.** No multi-tenancy, no accounts, no social features, no
  leaderboards against other people. Every complexity that only pays off at multi-user scale
  is explicitly out of scope.
- **Own your data.** No load-bearing dependency on third-party APIs with rate limits, paywalls,
  or terms that can change (Strava was evaluated and explicitly rejected as a run-data
  source for this reason — GPX/FIT file import is the dependency-free baseline instead).
- **Curated exercise catalog, not a full dataset.** `tools/catalog/curated.yaml` — a
  hand-picked ~94 exercises biased toward movements with real or derivable strength
  standards, not an 800+-exercise import.
- **The backend is load-bearing, not optional.** Reference-data ingestion, rank computation,
  and run processing all happen server-side so results are consistent and cheap to re-derive
  — this reverses a "local-first, no backend" idea from an earlier iteration of the plan.
- **i18n scaffolding, not translation.** Strings are externalized (`locales/de.json`,
  `locales/exercises.de.json`) but the only shipped language is German, for the owner's own use.

**ADHD-friendly motivation as a design philosophy, not a checkbox** (this is the single most
load-bearing principle in the codebase — nearly every UI decision traces back to it):
1. **Protect the core loop.** Logging a set, seeing "last time," and getting rank/PR feedback
   must never sink below 1-2 taps, no matter how many features get added. Every plan written
   for this project (see §7) ends its verification section with a "regression watch" for
   exactly this.
2. Immediate/variable rewards (rank-ups, PR celebrations) beat long-term abstract goals.
   Starting a workout is near-zero friction. Streaks need protection so one missed day doesn't
   destroy motivation. Reminders are low-friction nudges, never naggy popups.
3. **Be honest about the synthetic tier.** Ranks come from real external standards where they
   exist, derived-from-anchor standards where they don't, and pure estimates as a last resort
   — the engine and the UI both know which tier a given number is on, and the UI does not
   over-promise precision on the estimated ones (the `≈` trust marker on `RankProgress.vue`).
4. **Don't stack gamification into noise.** Rank is the primary reward; XP is flavour on top.
   No badges, no points systems layered redundantly on top of what already exists.

---

## 2. Technical architecture

**Monorepo layout** (pnpm workspace, `packages/*`):

| Package | Role |
|---|---|
| `@liftr/shared` | Pure, framework-free TypeScript: rank math, XP/level math, streak math, recovery heuristic, e1RM formulas, plate-calculator math, equipment-requirement logic, mesocycle generation. No DB access — everything here is unit-tested and runs identically on client and server. |
| `@liftr/db` | Drizzle ORM schema + migrations, SQLite (`better-sqlite3`). Owns the one source of truth for the data model. |
| `@liftr/server` | Fastify. All routes, all business-logic orchestration (repositories + services), auth, GPX/FIT/CSV/ZIP parsing. |
| `@liftr/client` | Vue 3 + Ionic + Capacitor PWA. All UI, offline-first sync, IndexedDB write queue. |
| `@liftr/ingest` | One-time/developer-run scripts: pull the curated catalog + muscle tags + standards + images from external sources, normalize, seed the DB. Not a deployed attack surface. |

Root `package.json` scripts (run from repo root): `pnpm dev` (bootstraps + runs client and
server concurrently), `pnpm build`, `pnpm test` (vitest across all packages), `pnpm typecheck`,
`pnpm lint`, `pnpm db:generate` / `pnpm db:migrate`, `pnpm ingest`, `pnpm recompute`.

**Server responsibilities:**
- Ingest-once reference pipeline (catalog, muscle tags, mirrored images, standards) — run
  manually via `pnpm ingest`, not on every boot (though the server does auto-migrate its
  schema and auto-seed on boot if the DB is empty, so a fresh clone/prod deploy doesn't
  500 on "no such table").
- Rank engine: e1RM (Epley) → tier/division/LP via `@liftr/shared`'s pure `resolveRank` →
  next-target prediction. Runs server-side in `packages/server/src/services/rankService.ts`
  so the computation is consistent and cheap to re-derive (`pnpm recompute` rebuilds it from
  raw `sets` data if ever needed — every derived table is documented as reconstructible).
- Run ingestion: parses GPX/FIT, stores the **full per-point trackpoint array**
  (`run_points`, never compressed to a polyline blob) specifically so a finished run can be
  replayed later (animated marker + pace/HR charts), not just drawn as a static line.
- Sync: accepts the client's offline write queue (`POST /api/sync`) and reconciles it,
  including a `start_workout` item type so even *starting* a workout (not just logging a set)
  survives being offline, using client-generated UUIDs.
- Auth: single bearer token (`LIFTR_TOKEN`), constant-time comparison
  (`packages/server/src/auth.ts`, `crypto.timingSafeEqual` with a length pre-check). Skipped
  entirely when `LIFTR_TOKEN` is unset (dev mode); the server refuses to boot with
  `NODE_ENV=production` and no token set (`env.ts:18-20`).
- CORS: reflects any origin by default (documented as low-risk today since auth is a bearer
  header, not a cookie); `LIFTR_ALLOWED_ORIGINS` (comma-separated) locks it down once the
  server is reachable beyond the reverse proxy's trusted network.

**Client responsibilities:**
- Offline-first for the entire logging loop: IndexedDB (`src/lib/idb.ts`) holds an `outbox`
  (write queue) and an `activeWorkout` snapshot (crash recovery — reload mid-workout resumes
  at the exact same exercise/set/elapsed time).
- The logging screen (`WorkoutPage.vue`) is the sacred path — everything else lives in
  secondary tabs/sheets.
- Repository/service layering: routes have Fastify request/response schemas via
  `fastify-type-provider-zod`; the client has a `services/` layer between Pinia stores and
  `fetch` (`frontend.md`'s convention, quoted verbatim elsewhere in this codebase: **"a
  component does not fetch"** — composables/stores fetch, components render+emit).
- Mobile is the primary target throughout; desktop is the adapted view (this is a standing
  rule for how this project should be built/reviewed, not just a CSS breakpoint afterthought).

**Auth/CORS/security posture in one place, for anyone auditing this fresh:** this is
explicitly *not* a hardened multi-tenant service. It is "just enough to stop an open LAN port
being an open API," per `auth.ts`'s own header comment. Do not add session/cookie-based auth,
accounts, or anything implying multi-user trust boundaries without revisiting this entire
section — it would be a scope change, not a security fix.

---

## 3. Data model

18 tables (`packages/db/src/schema.ts`), grouped by concern:

**Catalog:** `muscles`, `exercises` (with `movementPattern`, `isBodyweight`,
`bodyweightLeverage` for load-ratio math, `requiredEquipment` JSON, wger `sourceAttribution`),
`exercise_muscles` (primary/secondary role per exercise).

**Routines (templates) vs. Workouts (logged sessions)** — a deliberate, load-bearing split;
the schema's own header comment says explicitly **do not collapse them**:
- `routines`, `routine_exercises` (target sets as JSON `{reps, weightKg}[]`, optional
  per-exercise/per-set rest-time overrides, nullable `supersetGroup` for circuit training)
- `mesocycles` (periodization: at most one active cycle per routine, a pre-generated
  `weekPercents` curve so a ramp/deload shape change in code later doesn't reshape a cycle
  already in progress)
- `workouts` (a logged session, `clientId` for offline-sync idempotency), `workout_exercises`,
  `sets` (`isWarmup` boolean kept alongside a richer `kind` enum — `normal|warmup|failure|dropset`
  — deliberately not derived from `kind` on read, because every rank/XP/history query already
  filters on the boolean column directly)

**Rank engine:** `standards` (per-exercise threshold table, `sex`-aware, `trust` tier
real/derived/synthetic), `ranks` (one row per exercise — a **derived cache**, always
rebuildable from `sets` + `standards`, never itself the source of truth), `prs` (PR history
with `kind` e1rm/weight/reps/volume), `rank_events` (append-only rank-up history, added in the
engagement rework's W8 — read-only log of an event `ranks` already detects, not a new reward).

**Running:** `runs` (summary), `run_points` (**every trackpoint kept**, specifically because
discarding them after computing distance/pace would foreclose run replay — this is called out
explicitly in the schema's header comment as a hard rule).

**Motivation/settings:** `streaks` (date+kind unique index, a `protectionUsed` flag so a
protected miss is distinguishable from a real gap), `settings` (JSON-encoded key/value —
profile, owned equipment, etc. live here rather than as dedicated columns), `bodyweight_logs`
(timestamped bodyweight entries backing the EMA trend line on Profile — see §5).

**Every derived/cache table must be reconstructible from raw data via `pnpm recompute`.**
This is a standing invariant, not a suggestion — if a change makes `ranks`, `prs`, or streak
state impossible to rebuild from `sets`/`standards`/`workouts` alone, that change is wrong.

---

## 4. The rank/XP/streak/recovery system, explained

This is the app's core mechanic and the most-worked-on part of the codebase. As of this
audit it works like this (see §7 for a redesign in progress):

- **Per-exercise rank** (`packages/shared/src/rank/tiers.ts`): 5 tiers (bronze → diamond) ×
  3 divisions (III → I) = 15 bands per exercise. `resolveRank(value, thresholds)` is pure and
  deterministic — no hidden state, no matchmaking, no opponents. `value` is either a load
  ratio (e1RM / bodyweight) or a raw rep count for bodyweight movements.
- **Rank is computed from your all-time-best set**, not a recent window
  (`recomputeRankForExercise` calls `findLoggedSetsForExercise` — full history — and tracks a
  running max). This makes rank **structurally monotonic** — it cannot decrease from logging a
  worse set. **Known bug, not yet fixed:** for bodyweight-relative exercises, the ratio is
  recomputed against *current* bodyweight each time, so a legitimate bodyweight increase alone
  (no strength loss) can silently lower the ratio and appear to demote the lift. A fix is
  designed but not yet implemented — see §7.3.
- **Trust tiers:** `real` (OpenPowerlifting-calibrated, squat/bench/deadlift),
  `derived` (ExRx/academic-norm-anchored, e.g. overhead-press/row), `synthetic`
  (long-tail catalog, expressed as a ratio against an anchor of the same movement pattern).
  The UI never claims more precision than the trust tier warrants (`≈` marker on derived/synthetic).
- **XP/level** (`packages/shared/src/math/xp.ts`): flavour on top of rank, computed
  client-side per set (`computeSetXp`) so it works offline with no round trip.
- **Streaks** (`packages/shared/src/streak/streak.ts`): protection tokens so a missed day
  doesn't read as a broken streak; pool size derives from the user's stated
  `workoutsPerWeek` (a lower stated frequency → a larger protection pool, since more rest
  days are expected).
- **Recovery/"Erholungszone"** (`packages/shared/src/recovery/recovery.ts`): a documented
  **heuristic, not physiology** — fixed recovery windows per muscle group (72h for large
  muscle groups, 48h for smaller ones, secondary involvement counted at 60% weight),
  surfaced as a whole-body heat-mapped figure on the dashboard.

---

## 5. Feature inventory (what's actually built today)

**Core logging loop:** routine templates, one-tap start, fast set entry (1.25kg/1-rep
steppers), "last time" reference, rest timer with a continuously-sweeping ring, warm-up/
failure/dropset classification, superset/circuit grouping, offline write queue with
crash-recovery snapshot, workout history feed with per-workout detail view.

**Progression/motivation:** per-exercise tiered rank (§4), next-rank target prediction
(ungated, never paywalled — an explicit anti-pattern to avoid, since a prior app the owner
used paywalled exactly this), automatic PR detection with a celebratory rank-up moment,
per-exercise progress charts (hand-rolled inline SVG, no charting library), streak tracking
with protection, XP/levels, bodyweight tracking with an EMA trend line.

**Beginner support:** primary/secondary muscle tagging per exercise, aggregate muscle-map
visualization per completed workout, static demo images + how-to text per exercise, a
stats-driven routine suggester (pick muscle groups → get exercises + recommended
sets/reps/weight, degrading gracefully to standards-based entry-level numbers for a new
lifter), an onboarding flow that actually feeds the rank engine and suggester (sex,
bodyweight, experience level, owned equipment) rather than just storing answers unused.

**Logging depth:** plate calculator (inline reveal during set entry, not a standalone page),
warm-up ramp calculator, CSV/ZIP export/backup, notes per set/workout, periodization/mesocycle
builder.

**Running:** GPX/FIT file import (parsed, never re-uploaded to a third party), full
trackpoint storage enabling run replay (animated marker along the route, scrubbable timeline,
speed control, GPS-jitter smoothing), Leaflet/OSM map rendering, Health Connect integration
on Android via Capacitor (native companion path for painless watch capture — file import
remains the dependency-free fallback).

**Engagement layer (the "dopamine" rework, three rounds — see §7 for the full history):**
motion/haptics foundation, an in-session rank progress bar (the reward moves *during* a set,
not just on a separate tab), satisfying set-logging feedback (+XP chip, haptics, press
states), a three-beat post-workout finish sequence (rank-ups → streak → XP/level) replacing
one flat summary card, the recovery-zone dashboard hero, a tabbed exercise-detail sheet
(Über/Rang/Statistiken/Verlauf), rank-distribution and rank-up-calendar analytics, and a
"Discover" grid surfacing already-built-but-buried features.

**Explicitly not built, by design** (verified against the actual code — no such surfaces
exist anywhere in client or server): accounts, friends/social feeds, leaderboards,
shareable/forkable routine templates with reactions from other users, cosmetic
profile customization whose purpose is being seen by others, hidden MMR/matchmaking of any
kind, entry costs, placement matches. These were all evaluated against reference material
during the engagement rework and rejected specifically because they solve multiplayer
problems a single-user app doesn't have.

---

## 6. Testing, CI, and dev workflow

- **Tests:** Vitest, run via `pnpm test` from the repo root (executes across every package
  with a `test` script). At this audit's original writing (2026-08-31): 19 test files, 154
  tests, all in `@liftr/shared` and `@liftr/server`, no client tests. That snapshot is stale —
  as of 2026-09-04 (confirmed by independently re-running `pnpm test` in two separate
  verification passes, `audit/verify/agent-2.md` and `audit/verify/round2-*.md`), the suite is
  **260 tests across 28 files**, and `packages/client/src/stores/activeWorkoutStore.spec.ts`
  now exists — the "no client tests" claim no longer holds even at the store-test level (no
  component-level Vue tests exist yet, that part is still accurate).
- **Typecheck:** `pnpm typecheck` (root) runs `tsc`/`vue-tsc --noEmit` across all packages;
  each package also has its own `run typecheck` script for scoped checks.
- **Lint:** ESLint 9 flat config (`eslint.config.js`) covering the whole workspace including
  `.vue` files.
- **CI:** `.github/workflows/ci.yml` — on every push/PR to main/master: install (frozen
  lockfile), typecheck, lint, test. No deploy step defined here.
- **DB migrations:** never hand-write or hand-edit migration SQL. `pnpm db:generate`
  (drizzle-kit) generates from `schema.ts`, review the generated SQL, `pnpm db:migrate`
  applies it. A repo hook (`.claude/settings.json` `PreToolUse`) actively blocks edits to
  generated migration files as a guardrail. See `.claude/skills/db-migration/SKILL.md` for
  the full workflow.
- **Mobile verification:** UI changes should be checked at a mobile viewport (~390×844)
  before being called done — see `.claude/skills/mobile-viewport-check/SKILL.md`. Desktop is
  the adapted view, not the primary target.
- **Environment variables** (`packages/server/src/env.ts`): `PORT` (default 3001),
  `LIFTR_DB_PATH`, `LIFTR_TOKEN` (required in production), `LIFTR_IMAGES_DIR`,
  `LIFTR_CLIENT_DIST`, `LIFTR_ALLOWED_ORIGINS` (comma-separated CORS allowlist).

---

## 7. Engagement/rank rework — history and current status

This project has been through three rounds of deliberate work on making the rank system and
overall UI *feel* rewarding, each documented in a plan file. Full rationale and file:line
citations live in the plan files themselves (local to this machine, not repo-tracked, listed
below) — this section is the summary.

### 7.1 Round 1 (W1-W6) — ✅ done, pre-existing before this audit
Built from a single reference screenshot: motion/haptics foundation, the in-session rank bar,
set-logging feedback, the three-beat finish sequence, the recovery-zone dashboard hero, and
ambient polish (pulsing streak chip, route cross-fade, staggered entrance). Plan file:
`~/.claude/plans/the-ui-works-and-buzzing-pony.md`.

### 7.2 Round 2 (W7-W9) — ✅ done, committed
Built from a fuller video-walkthrough reference of a competitor app, filtered hard through
the single-player constraint (the competitor app's entire social layer was evaluated and
rejected — see §5). Commits: `f903f32` (W7, tabbed exercise-detail sheet), `313dc09` (W8,
rank-up history + distribution/calendar analytics), `6019128` (W9, Discover grid), `8c0f158`
(a motion-consistency fix found via design-lint: two routine page entrances were using the
overshoot easing reserved for earned moments). Plan file:
`~/.claude/plans/liftr-engagement-rework-w7-w9.md`.

### 7.3 Round 3 (R1-R3) — ✅ done, committed
A comparative study of seven competitive games' ranked systems (League of Legends, Rainbow
Six Siege Ranked 3.0, Apex Legends, Deadlock, VALORANT, CS2 Competitive, CS2 Premier) was used
to evaluate the rank engine itself. **Conclusion: almost none of it transfers** — every one of
those games solves PvP-matchmaking-specific problems (hidden MMR vs. visible rank, opponent-
relative scoring, demotion, placement matches, entry costs, smurf detection) that don't exist
in a single-player app with no opponents and no matches. What *does* transfer is general
progression psychology: transparency over hidden math, boundary crossings feeling earned, and
(the one genuinely new idea) a single account-level "how good a lifter am I overall" number,
which Liftr previously lacked entirely (it only had independent per-exercise ladders).

Shipped:
- **R1 — Peak Rank** (`250f446`): fixed the bodyweight-ratio bug (§4) by adding permanent,
  ratchet-only peak columns (`peakTier`/`peakDivision`/`peakLp`/`peakE1rm`/`peakAchievedAt`) to
  `ranks`, compared via a pure `ratchetPeak()` in `@liftr/shared` — decoupled from any
  retroactive bodyweight recompute.
- **R2 — Current Rank decay** (`1de2b5e`): current (displayed) rank softens with inactivity via
  `computeCurrentBand()` (21-day grace, 60-day linear decay window), hard-floored at division
  III / 0 LP of the peak's own tier — never risks losing all progress. Logging a new set snaps
  current rank straight back to peak, not via a second grind — later superseded by the buffed
  multi-session climb-back in Round 4, §7.4. `RankProgress.vue` shows a "Bestleistung: X"
  caption on `RanksPage.vue` so a softened rank never hides why it moved.
- **R3 — Overall Lifter Rank** (`7c881fc`): a trust-weighted aggregate (real/derived full
  weight, synthetic at 0.5×) across every ranked exercise's continuous tier/division/LP
  position, computed on-demand (no new derived-cache table) via `GET /api/overall-rank` and
  shown as a fourth "Gesamtrang" stat tile on the Übersicht dashboard — no new page, no
  leaderboard.

All three phases verified: 179 tests passing, typecheck clean across all packages, migrations
reviewed (additive columns only, no table redesign). Full technical detail, file:line reuse
points, and verification checklists are preserved in git history at commit `45d6409`'s
`liftr-engagement-and-rank-rework.md` (removed after R1-R3 shipped, since this section now
supersedes it as the current-state summary).

Two follow-up design-polish commits landed after R1-R3 and are unrelated to the rank engine:
`7cbbdb7` (chrome-overlap/contrast/typography fixes from an `/impeccable` critique) and
`7986494` (further technical-audit findings, P0-P3).

### 7.4 Round 4 — Rank engine v2 (9-tier ladder, buffed recovery, plausibility gate) — ✅ done
A further iteration on the R1-R3 rank engine, driven by three requests: more tiers with more
divisions at the low end (so a new or returning lifter feels a rank-up more often, and the top
tier is a single real milestone), a buffed multi-session climb-back instead of Round 3's instant
decay snap-back, and a plausibility gate that discounts (never discards) XP/LP/peak for
structurally implausible sessions (e.g. far too many sets logged in far too little time).

- **9-tier ladder:** Bronze-through-Diamond replaced with Initiate → Apprentice → Trainee →
  Athlete → Lifter → Advanced → Elite → Expert → Apex, framed around a believable fitness
  journey rather than "power level" names. Divisions per tier taper from 6 (Initiate) to 1
  (Apex) — 33 total bands, up from 15. `ordinal`/`ordinalToBand` in `tiers.ts` generalized to
  variable per-tier division counts via a centralized cumulative-offset scheme.
- **Standards recalibration:** the old 5 anchor ratios per exercise become 9 via
  `interpolateNineTierAnchors` (geometric mean for interior tiers, self-consistent extrapolation
  for the two new ends) — computed in code, not hand-typed, so the single tunable source stays
  the original 5 numbers per exercise.
- **Buffed recovery gain:** `applySessionRecoveryGain` replaces the old instant snap-to-peak.
  Current rank climbs toward peak over ~4-5 real training sessions after a break, buffed up to
  2.5x when maximally decayed, tapering to 1x (no buff) as it nears peak — but explicitly does
  *not* throttle a genuine same-day PR with no prior decay backlog (a real bug found and fixed
  during implementation: the throttle must compare against the *old* peak, not the freshly-
  advanced one, or a lifter's just-earned PR would display behind schedule).
- **Plausibility gate:** `computeWorkoutPlausibility` scores a finished workout on session pace,
  improbable same-session jump vs. stored peak, and an absolute value ceiling — worst-of, not
  averaged. A flagged workout is never discarded; XP/current-rank-recovery are discounted and
  peak advancement is blocked below a floor, with an honest, specific note shown to the user
  (never the exact thresholds).

Spec: `docs/superpowers/specs/2026-08-31-rank-engine-v2-design.md`. Plan (11 tasks,
subagent-driven execution): `docs/superpowers/plans/2026-08-31-rank-engine-v2.md`. All tasks
independently reviewed (spec + quality gate per task), plus a final whole-branch review that
found and closed 2 Critical/3 Important cross-task integration issues (a data migration for
pre-existing tier strings and its division-clamp follow-up, dead CSS custom properties, a
plausibility-gate unit mismatch, and a peak-fabrication edge case) — see the plan's task reports
and the SDD ledger for detail. Several real bugs were also found in the plan's own literal
example code during implementation and corrected rather than transcribed blindly. Full suite
(218 tests), typecheck, and production build all clean; manually verified end-to-end via a real
logged workout in a mobile viewport (9-tier badges, next-target predictions, distribution donut,
XP/leveling all correct against freshly-ingested standards data).

---

## 8. Reference inventory

- `~/.claude/plans/the-ui-works-and-buzzing-pony.md` — Round 1 (W1-W6) plan.
- `~/.claude/plans/liftr-engagement-rework-w7-w9.md` — Round 2 (W7-W9) plan.
- `~/.claude/plans/liftr-rank-engine-redesign.md` — Round 3 (R1-R3) plan, shipped (§7.3).
- `docs/superpowers/specs/2026-08-31-rank-engine-v2-design.md` /
  `docs/superpowers/plans/2026-08-31-rank-engine-v2.md` — Round 4 (9-tier ladder, buffed
  recovery, plausibility gate) spec + plan, shipped (§7.4).
- `examples/walkthrough_bundle/` — gitignored, local-only video-walkthrough reference material
  used for Round 2; not redistributed, not part of tracked history.
- `tools/catalog/curated.yaml` — the curated exercise catalog source data for ingestion.

---

## 9. How to work on this project

1. **Read §1 before changing anything user-facing.** If a change doesn't serve "log a set in
   1-2 taps, get honest rank/PR feedback," ask whether it belongs here at all.
2. **Never re-introduce multiplayer concepts** (accounts, social, leaderboards, hidden MMR,
   matchmaking) without an explicit, separate scope conversation — this has been evaluated
   and rejected multiple times across this project's history, most thoroughly during the
   Round 3 rank-engine study (§7.3).
3. **Reuse before building.** This codebase's plans consistently cite exact file:line reuse
   points rather than inventing parallel implementations — check `packages/shared` for
   existing pure math, check existing components (`RankProgress.vue`, `ProgressChart.vue`,
   `SheetModal.vue`, `StatTile.vue`) before writing a new one that does the same thing.
4. **Migrations go through `pnpm db:generate` → review → `pnpm db:migrate`.** Never hand-edit
   generated SQL.
5. **Mobile-first.** Verify at ~390×844 before calling a UI change done.
6. **Every derived table must stay reconstructible from raw data.** If you can't rebuild
   `ranks`/`prs`/streak state from `sets`/`standards`/`workouts` alone anymore, something's wrong.
7. **Be honest about trust tiers.** Don't let a `synthetic`-trust number look as confident as
   a `real`-trust one in any new UI.
8. **No new reward currencies.** Rank is primary; XP is flavour. Don't add a third,
   fourth, fifth thing to track — deepen what exists (this is explicitly why Round 3's
   `rank_events` table is scoped as "history of an existing signal," not a new mechanic).
9. **Follow the implement → verify (typecheck/test/click-test) → commit cadence** established
   across all three engagement-rework rounds — each workstream in this project's history was
   shipped independently and verified before the next one started.
