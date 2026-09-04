# Audit Verification Summary
**Last Verified:** 2026-09-04
**Scope:** All files in `./audit` and `./docs` (14 documents), verified against the live codebase at commit range up to `f7f2256` (master).
**Method:** 8 independent worker agents, each assigned a disjoint set of documents, re-derived every "finished/complete/shipped" claim from direct source inspection, greps, and test/typecheck runs — not from git history, commit messages, or the documents' own status markers.
**Verification Status:** Discrepancies Found (5 of 8 report groups), but the discrepancy rate is low relative to claim volume — the large majority of "complete" claims across ~200+ discrete items are real, wired, and tested.

Per-file detail reports: `agent-1.md` through `agent-8.md` in this directory.

| # | Documents | Verdict |
| :-- | :--- | :--- |
| 1 | `audit/workplan-v1.md` | Discrepancies Found |
| 2 | `audit/finished/liftr-audit.md`, `audit/finished/routine-builder-shape-v4.md` | Discrepancies Found |
| 3 | `audit/finished/plan-c-new-ui-rebuild.md` | Discrepancies Found |
| 4 | `audit/finished/engagement-audit-v3.md`, `audit/finished/engagement-audit-v4.md` | Fully Verified (1 citation drift) |
| 5 | `docs/superpowers/plans/2026-08-31-rank-engine-v2.md`, `docs/superpowers/specs/2026-08-31-rank-engine-v2-design.md` | Discrepancies Found |
| 6 | `docs/superpowers/plans/2026-09-03-foundation-primitives.md`, `-full-rebuild-orchestration.md`, `-nebula-and-workplan-rework.md` | Fully Verified |
| 7 | `docs/superpowers/plans/2026-09-03-workstream-a-today-train.md`, `-workstream-d-profile-auth.md`, `-workstream-e-runs.md` | Fully Verified |
| 8 | `docs/superpowers/plans/2026-09-03-workstream-b-finish-progress.md`, `-workstream-c-plan-routines.md` | Fully Verified |

## FALSE POSITIVE — claimed complete/adopted, actually missing or orphaned

* **`ThumbZoneAction.vue` primitive** (`audit/finished/plan-c-new-ui-rebuild.md`) — claimed as a Foundation deliverable "every later phase builds on," anchoring primary CTAs app-wide. Zero template usages anywhere in `packages/client/src`. Component exists but is never rendered. — agent-3
* **`DensityScope.vue` / `useDensityMode`** (same doc) — claimed as a reusable layout prop driving Train/Plan/Progress density. Zero consumers outside the primitive's own files. — agent-3
* **`TruncatingLabel.vue` adoption "at the primitive level so it cannot recur screen-by-screen"** (same doc) — only one real consumer (`ExerciseRow.vue`). `RanksPage.vue`'s exercise-name element still uses `overflow-wrap: break-word`, the exact mid-word-break bug the primitive claims to eliminate everywhere. — agent-3
* **Phase 0 five-zone nav IA (Today/Train/Progress/Plan/Profile, Train conditional on `isActive`)** (same doc) — never built. Live nav is Overview/Workout/Ranks/Exercises/Profile, static (not conditional), with routines nested inside Workout. The closure note itself only claims narrower "nav-shell hardening," but sits directly under Phase 0's explicit five-zone spec — easy to misread as delivered. — agent-3

## FALSE POSITIVE — stale status (claimed *not* done, but actually is)

* **`audit/workplan-v1.md` §2 Personal Records ledger** — explicitly marked ⏳ **not started**, "no `/api/prs` route, no client screen," called "the top of the remaining work queue." Actually fully shipped: `packages/server/src/routes/prs.ts`, `prStore.ts`, `RecordsPage.vue` routed at `/records`, linked from `RanksPage.vue`. One real partial gap: the Finish Sequence PR beat does not link into the ledger as the doc's own spec calls for. — agent-1

## Minor inaccuracies (not functional false positives)

* **`liftr-audit.md` §3** claims 17 tables; schema actually has 18 (`bodyweight_logs` omitted from the inventory though the feature is described elsewhere). — agent-2
* **`liftr-audit.md` §6** "no client component tests exist" — true at its 2026-08-31 snapshot date, stale now (`activeWorkoutStore.spec.ts` exists; current suite is 260 tests / 28 files vs. the doc's stated 154→218 progression). — agent-2
* **`engagement-audit-v4.md`** cites `WorkoutPage.vue:707-714` for the `.routine-card` tier-accent border; the code actually lives in `RoutineList.vue:251-263` after a later extraction. The change itself is real. — agent-4
* **Design spec `2026-08-31-rank-engine-v2-design.md` §3.2** plausibility thresholds (pace 12s/4s, jump 100%, ceiling 1.5x) no longer match shipped code (15s/6s, 75%, 1.3x — tightened later by "engagement-audit-v3 Phase 3"). Mechanic is correct; exact numbers are stale. — agent-5
* **"218 tests" figure**, appearing only in `liftr-audit.md` §7.4, is stale — current full suite is 260 tests / 28 files. — agent-5

## Real completeness gap surfaced during verification (not a false claim, but a latent bug the plan didn't anticipate)

* **`docs/superpowers/plans/2026-08-31-rank-engine-v2.md` Task 3** — migration `0009_cheerful_sumo.sql` widens tier-enum columns but does not remap pre-existing rows still holding old 5-tier strings (`bronze`/`silver`/etc.), which would silently break `ordinal()` lookups. This was caught and fixed by a later, plan-external migration `0010_remap_legacy_tier_strings.sql`. The plan's literal claims about migration 0009's content are accurate; the plan itself simply never accounted for this data-migration risk. — agent-5

## Confirmed still open/deferred (correctly self-labeled, not false positives)

* **Streak/XP mechanics redesign** (`workstream-b-finish-progress.md` Task 7, spec `2026-09-04-streak-xp-mechanics-design.md`) — confirmed design-only. `packages/shared/src/math/xp.ts` still uses the pre-redesign, weight-fabricable formula; repo-wide grep for `consistencyBonusXp`/`varietyBonusXp` returns zero hits. — agent-8
* **Today screen tokens-remaining chip** (`workstream-a-today-train.md` A-T9) — plan already flags this as an open product decision, confirmed unresolved in code. — agent-7
* **Nebula Phase 9 contrast/viewport verification sweep**, **Foundation plan's mobile click-test walkthroughs** (rank-engine-v2 Task 10/11), **wing/feather tier SVG signal** (engagement-audit-v3, explicitly skipped), **routine-builder Phase 1 friction redesign** (engagement-audit-v4, explicitly deferred) — all correctly self-reported as not done; no discrepancy.

## Build health (independently re-run this pass)

* `pnpm -r typecheck` — clean across all 5 packages (confirmed by agents 1, 2, 4, 5, 7).
* `pnpm test` (workspace) — 260/260 tests passing, 28 files (confirmed by agents 2, 4, 5).
* `pnpm vitest run` server package — 73/73 passing (agent 8).
* `pnpm build` (client) — succeeds, PWA precache generated (agent 5).

## Unverifiable by static audit (needs live/manual check)

* All viewport/contrast/visual-rendering claims (thumb-reach CTA placement, tier badge visual distinction, live 195px/300px nav overflow behavior).
* Native Android Health Connect behavior, live Leaflet map rendering (RunMap.vue).
* Historical point-in-time test counts and manual mobile click-test walkthroughs described in several plans.

## Recommended follow-up (documentation only, not code)

1. Update `audit/workplan-v1.md` §2 to reflect the PR ledger as shipped, and note the Finish-Sequence-link gap as the one remaining sub-task.
2. Update `audit/finished/plan-c-new-ui-rebuild.md`'s Foundation section to mark `ThumbZoneAction` and `DensityScope` as **defined but not adopted**, and flag `RanksPage.vue` as an outstanding `TruncatingLabel` migration site.
3. Correct the `liftr-audit.md` table count (17→18) and refresh its test-count figures.
4. Correct the `WorkoutPage.vue:707-714` citation in `engagement-audit-v4.md` to `RoutineList.vue:251-263`.
5. Refresh the plausibility threshold numbers in `2026-08-31-rank-engine-v2-design.md` §3.2 to match shipped values, or annotate them as superseded by engagement-audit-v3.
