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

17 tables (`packages/db/src/schema.ts`), grouped by concern:

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
profile, owned equipment, etc. live here rather than as dedicated columns).

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
  with a `test` script). As of this audit: 19 test files, 154 tests, all in `@liftr/shared`
  and `@liftr/server` (pure math + service-layer logic — no client component tests exist).
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

### 7.3 Round 3 (R1-R3) — 📋 planned, **not yet implemented**
A comparative study of seven competitive games' ranked systems (League of Legends, Rainbow
Six Siege Ranked 3.0, Apex Legends, Deadlock, VALORANT, CS2 Competitive, CS2 Premier) was used
to evaluate the rank engine itself. **Conclusion: almost none of it transfers** — every one of
those games solves PvP-matchmaking-specific problems (hidden MMR vs. visible rank, opponent-
relative scoring, demotion, placement matches, entry costs, smurf detection) that don't exist
in a single-player app with no opponents and no matches. What *does* transfer is general
progression psychology: transparency over hidden math, boundary crossings feeling earned, and
(the one genuinely new idea) a single account-level "how good a lifter am I overall" number,
which Liftr currently lacks entirely (it only has independent per-exercise ladders).

Planned work, not yet built:
- **R1 — Peak Rank:** fixes the bodyweight-ratio bug (§4) by adding permanent, ratchet-only
  peak columns to `ranks`, decoupled from any retroactive bodyweight recompute.
- **R2 — Current Rank decay:** current (displayed) rank can soften with inactivity, but is
  hard-floored at the bottom of the peak tier — never risks losing all progress, while still
  giving inactivity a felt cost. Logging a new set snaps current rank back to peak instantly,
  not via a second grind.
- **R3 — Overall Lifter Rank:** an aggregate tier/number across trust-weighted anchor lifts,
  shown as one more dashboard stat tile — no new page, no leaderboard.

Plan file: `~/.claude/plans/liftr-rank-engine-redesign.md`. **This is the next work to pick
up on this project.**

---

## 8. Reference inventory

- `~/.claude/plans/the-ui-works-and-buzzing-pony.md` — Round 1 (W1-W6) plan.
- `~/.claude/plans/liftr-engagement-rework-w7-w9.md` — Round 2 (W7-W9) plan.
- `~/.claude/plans/liftr-rank-engine-redesign.md` — Round 3 (R1-R3) plan, not yet built.
- `liftr-engagement-and-rank-rework.md` (repo root) — narrative summary of all three rounds
  written alongside this audit; this document (`liftr-audit.md`) is the broader, whole-project
  reference, while that one is scoped specifically to the engagement/rank work.
- `examples/walkthrough_bundle/` — gitignored, local-only video-walkthrough reference material
  used for Round 2; not redistributed, not part of tracked history.
- `tools/catalog/curated.yaml` — the curated exercise catalog source data for ingestion.

---

## 9. How to work on this project

1. **Read §1 before changing anything user-facing.** If a change doesn't serve "log a set in
   1-2 taps, get honest rank/PR feedback," ask whether it belongs here at all.
2. **Never re-introduce multiplayer concepts** (accounts, social, leaderboards, hidden MMR,
   matchmaking) without an explicit, separate scope conversation — this has been evaluated
   and rejected multiple times across this project's history, most recently and thoroughly
   in Round 3 (§7.3).
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
