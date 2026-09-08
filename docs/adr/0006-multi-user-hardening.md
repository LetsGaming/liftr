# 0006. Harden the schema and backend for multi-user, ahead of building it

**Date:** 2026-09-07
**Status:** Accepted
**Supersedes:** [0002](0002-single-bearer-token-auth.md)'s "Single user, forever" framing

## Context

0002 treated single-user as a permanent decision ("Single user, forever"). That's no longer true —
Liftr is planned to grow into multi-user support, similar to how Home Assistant lets several
people share one instance with their own logins. Building that later, against a schema and
codebase that assume exactly one implicit user everywhere, would mean a much larger and riskier
migration once real data exists.

Since Liftr is still pre-v1 with no deployments and no running databases, this was the cheapest
possible time to do the hard part: reshape the schema and thread user-scoping through every
repository, service, and route now, while there's no legacy data to migrate or keep compatible.

## Decision

Harden and prepare only — this change does **not** add login, passwords, or per-user tokens.
`LIFTR_TOKEN` (0002) still gates the whole API as one shared bearer token, and every request still
resolves to a single identity.

What changed:

- **Schema**: a `users` table (`id`, `name`, `role: "owner" | "member"`), and a `user_id` column
  added to every table that holds per-person data: `workouts`, `sets`, `runs`, `bodyweight_logs`,
  `ranks`, `prs`, `rank_events`, `routines`, `streaks`, `settings`. The exercise catalog
  (`exercises`, `muscles`, `standards`, and their join tables) stays shared/global — every user
  ranks against the same catalog, per the "shared catalog, per-user everything else" data model.
  `exercises` also gained a nullable `created_by_user_id` (`ON DELETE SET NULL`) for attribution
  only, not filtering: a custom exercise stays visible to everyone once created, the way the
  catalog itself is shared.
- Composite primary keys/unique indexes where the natural key changed shape: `ranks`
  (`user_id, exercise_id`), `settings` (`user_id, key`), and `user_id`-qualified uniqueness on
  `workouts.client_id`, `sets.client_id`, `runs.client_id`, and `streaks.(date, kind)` — each of
  those was previously unique alone, which would collide the moment a second user logged the same
  offline-sync `clientId` shape or trained on the same calendar date.
  `mesocycles`/`routine_exercises`/`workout_exercises`/`run_points` stay child-via-parent with no
  `user_id` of their own — ownership is enforced by joining through their parent row
  (`routines`/`workouts`/`runs`), the same pattern `sets` used before this change for
  `workout_exercises`.
  `workoutExercises.findWorkoutExerciseById` uses that join for existence checks. The baseline
  migration seeds one well-known `OWNER_USER_ID` row — the only user that exists until real
  per-person login ships.
- **`packages/server/src/userContext.ts`**: an `onRequest` hook (wired into both `buildApp()` and
  the test app builder) resolves `request.userId` once per request. Today `resolveCurrentUserId`
  always returns `OWNER_USER_ID` — every repository and service function that touches per-user data
  now takes `userId` as an explicit parameter and every route reads `request.userId`, rather than
  the DB-level default silently doing the scoping. When real per-person login lands, only
  `resolveCurrentUserId` needs to change (to read a verified session instead of returning the
  constant); nothing downstream does.
- Fixed a latent correctness bug surfaced while doing this: `PATCH /api/routines/:id` and
  `PATCH /api/workouts/:id` returned `{ ok: true }` unconditionally, even when the id didn't exist
  or (now) belonged to a different user — a zero-row update silently reported success. Both now
  404 instead.

## Consequences

- Every per-user repository function grew a `userId` parameter, and every route now passes
  `request.userId` through. This is a wide, mechanical diff, but it means "who can see/touch this
  row" is answered the same way everywhere, not ad hoc per feature.
- The exercise catalog is intentionally the one place that stays unscoped — ranking, standards, and
  suggestions all read against it directly, matching the original decision that the catalog is
  shared infrastructure, not per-user data.
- No behavior actually changes for the deployed app today: `resolveCurrentUserId` is a constant, so
  every request still resolves to the same owner identity 0002 already assumed. This ADR is
  entirely prep — the follow-up work (per-person login, roles, session handling) is a separate,
  future decision, not committed to here.
