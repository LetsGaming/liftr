# HTTP API Reference

Lookup reference for every endpoint the server exposes. Generated from the actual route
registrations, not from a spec — if this drifts from the code, the code wins. Source of truth for
each entry is linked inline; when in doubt, open the linked file.

## How to read this document

- **Base**: all endpoints below are mounted under `/api/*` except the static file servers
  (`/images/*`, and the client SPA at `/`) registered in
  [`packages/server/src/app.ts`](../../packages/server/src/app.ts).
- **Auth**: every `/api/*` route sits behind a single bearer-token gate — see
  [Auth](#auth) below. It is not repeated per-endpoint.
- **Validation**: request bodies/params/query are Zod schemas registered via
  `fastify-type-provider-zod` directly on the route (`{ schema: { body, params, querystring,
  response } }`). A schema mismatch never reaches route code — it's rejected by the validator
  before the handler runs.
- **Errors**: see [Error shapes](#error-shapes) below — every non-2xx response documented here
  follows one of those shapes, produced by the single `setErrorHandler` in `app.ts`, not by
  individual routes.
- Response shapes are the route's registered Zod `response` schema where one exists. A few routes
  (noted inline) have no response schema — the shape shown there is the object the handler
  literally returns/throws, read from the code.

## Auth

Source: [`packages/server/src/auth.ts`](../../packages/server/src/auth.ts),
wired up in `app.ts`'s `onRequest` hook for every request whose URL starts with `/api/`.

- Single bearer token, checked with a constant-time comparison (`timingSafeEqual`) against
  `LIFTR_TOKEN` (see [environment-variables.md](./environment-variables.md)).
- Header: `Authorization: Bearer <LIFTR_TOKEN>`.
- **Dev mode**: if `LIFTR_TOKEN` is unset, `requireAuth` returns immediately — no token is
  required at all. This is also why the route tests (`tests/server/routes/*.test.ts`) never send
  an `Authorization` header: `LIFTR_TOKEN` is unset under vitest.
- On failure: `401 { "error": "unauthorized" }`.
- There are no accounts, sessions, or per-user scoping anywhere in the API — Liftr is single-user
  by design (see `env.ts`'s and `auth.ts`'s own comments). This token is "is this a request from
  the app I trust", not "which user is this".

## Error shapes

Source: `configureApp()`'s `setErrorHandler` in
[`packages/server/src/app.ts`](../../packages/server/src/app.ts), and the typed errors in
[`packages/server/src/lib/errors.ts`](../../packages/server/src/lib/errors.ts).

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "invalid_request", "detail": string }` | Zod schema validation failed (body/params/querystring don't match) |
| `401` | `{ "error": "unauthorized" }` | Missing/wrong bearer token (see [Auth](#auth)) |
| `404` | `{ "error": "not_found" }` | Route throws `NotFoundError` — entity looked up by id doesn't exist |
| `409` | `{ "error": "conflict", "detail": string }` | Route throws `ConflictError` — action conflicts with current state |
| `500` | `{ "error": "internal_error" }` | Anything else (unexpected exception); real error is logged server-side only, never leaked to the client |

A few routes without a Zod `body` schema (multipart upload endpoints) do inline validation and
return their own 400 body shapes instead of `invalid_request` — called out under
[Runs](#runs-runsts) below.

---

## Bodyweight (`bodyweight.ts`)

Source: [`packages/server/src/routes/bodyweight.ts`](../../packages/server/src/routes/bodyweight.ts) ·
Tests: [`tests/server/routes/bodyweight.test.ts`](../../tests/server/routes/bodyweight.test.ts)

Feeds `rankEngine.ts`'s load_ratio rank calculation, which otherwise falls back to a hardcoded
75kg guess.

### `GET /api/bodyweight`
Returns recent bodyweight log entries, most-recent-date first.

Response `200`:
```ts
Array<{ id: string; date: string; weightKg: number }>
```

### `POST /api/bodyweight`
Upserts by `date` (YYYY-MM-DD) — logging twice for the same date overwrites, never duplicates.

Request body:
```ts
{ date: string; weightKg: number } // date: /^\d{4}-\d{2}-\d{2}$/, weightKg: >0, <=400
```

Response `201`: same shape as the GET item (`{ id, date, weightKg }`).

Notable statuses: `400` for a malformed date or a weight outside `(0, 400]`.

---

## Exercises (`exercises.ts`)

Source: [`packages/server/src/routes/exercises.ts`](../../packages/server/src/routes/exercises.ts) ·
Tests: [`tests/server/routes/exercises.test.ts`](../../tests/server/routes/exercises.test.ts)

### `GET /api/exercises`
Full catalog + muscle tags. Cacheable — the catalog only changes on ingest, so the response
carries `Cache-Control: public, max-age=300`.

Response `200`:
```ts
Array<{
  id: string;
  slug: string;
  name: string | null;          // set for custom exercises; null for catalog ones (resolved client-side via i18n on `slug`)
  equipment: string | null;
  requiredEquipment: Array<{ item: string; tier: "required" | "recommended" | "optional" }>;
  movementPattern: string;
  isBodyweight: boolean;
  isCustom: boolean;
  demoStartImage: string | null;
  demoEndImage: string | null;
  howToKey: string | null;
  hasImage: boolean;            // live existsSync() check against the mirrored images dir, not a stored column
  muscles: Array<{ slug: string; role: "primary" | "secondary" }>;
}>
```

### `POST /api/exercises`
Creates a custom (user-added) exercise.

Request body:
```ts
{
  slug: string;              // must match EXERCISE_SLUG_PATTERN (@liftr/shared): lowercase, alphanumeric, hyphen-separated
  name: string;               // min length 1
  equipment?: string;
  movementPattern: string;    // min length 1
  isBodyweight?: boolean;     // default false
  muscleSlugs?: Array<{ slug: string; role: "primary" | "secondary" }>;
}
```

Response `201`: the created exercise row (no explicit response schema on this route — shape comes
from `insertCustomExercise`'s return value; matches the `exerciseResponse` shape above with
`isCustom: true`).

Notable statuses: `400` for a slug that doesn't match the required pattern (rejects spaces/
uppercase), or a missing `name`/`movementPattern`.

---

## Export (`export.ts`)

Source: [`packages/server/src/routes/export.ts`](../../packages/server/src/routes/export.ts) ·
Tests: [`tests/server/routes/export.test.ts`](../../tests/server/routes/export.test.ts)

### `GET /api/export.zip`
Full data export/backup as a zip. **No Zod response schema** — this returns binary, not JSON.
See [`services/exportService.ts`](../../packages/server/src/services/exportService.ts) for what's
included.

Response `200`: binary `application/zip`, with
`Content-Disposition: attachment; filename="liftr-export-<YYYY-MM-DD>.zip"`.

---

## History (`history.ts`)

Source: [`packages/server/src/routes/history.ts`](../../packages/server/src/routes/history.ts) ·
Tests: [`tests/server/routes/history.test.ts`](../../tests/server/routes/history.test.ts)

### `GET /api/history`
Unified, cursor-paginated feed of workouts + runs, newest first.

Query:
```ts
{ cursor?: string; limit?: number } // limit coerced to int, positive; server clamps to min(limit ?? 20, 50)
```

Response `200`:
```ts
{
  items: Array<{
    kind: "workout" | "run";
    id: string;
    at: Date;
    title: string | null;
    meta: Record<string, unknown>;
  }>;
  nextCursor: string | null;
}
```

### `GET /api/exercises/:id/history`
Per-exercise set history ("last time you did this" reference + chart series).

Params: `{ id: string }`

Response `200`:
```ts
{
  sets: Array<{
    setIndex: number;
    weightKg: number | null;
    reps: number;
    loggedAt: Date;
    isWarmup: boolean;
  }>;
}
```

---

## Mesocycles (`mesocycles.ts`)

Source: [`packages/server/src/routes/mesocycles.ts`](../../packages/server/src/routes/mesocycles.ts) ·
Tests: [`tests/server/routes/mesocycles.test.ts`](../../tests/server/routes/mesocycles.test.ts)

Attach/advance/end a week-by-week periodization curve on a routine.

### `POST /api/routines/:id/mesocycle`
Attach a new cycle, replacing any existing one for this routine.

Params: `{ id: string }` (routine id) · Body: `{ totalWeeks: number }` (int, 1-16)

Response `200`:
```ts
{
  id: string;
  routineId: string;
  totalWeeks: number;
  currentWeek: number;
  weekPercents: number[];
  createdAt: Date;
}
```

### `DELETE /api/routines/:id/mesocycle`
End/detach the cycle — the routine reverts to plain (non-periodized) behavior.

Params: `{ id: string }` · Response `200`: `{ ok: true }`

### `POST /api/routines/:id/mesocycle/advance`
Called once a workout on this routine finishes. Advances `currentWeek`, capped at `totalWeeks`
(a finished cycle needs a deliberate restart, it doesn't loop).

Params: `{ id: string }` · Response `200`: same mesocycle shape as the POST above.

---

## Overall rank (`overallRank.ts`)

Source: [`packages/server/src/routes/overallRank.ts`](../../packages/server/src/routes/overallRank.ts) ·
Tests: [`tests/server/routes/overallRank.test.ts`](../../tests/server/routes/overallRank.test.ts)

### `GET /api/overall-rank`
Account-level "how good a lifter am I overall" aggregate. Thin schema wrapper — aggregation
logic lives in `services/overallRankService.ts`.

Response `200`:
```ts
{
  current: { tier: Tier; division: number; lp: number } | null;
  peak:    { tier: Tier; division: number; lp: number } | null;
}
```
`Tier` is the shared tier enum (`tierSchema` in
[`packages/server/src/schemas.ts`](../../packages/server/src/schemas.ts), sourced from
`@liftr/shared`'s `TIERS`).

---

## PRs (`prs.ts`)

Source: [`packages/server/src/routes/prs.ts`](../../packages/server/src/routes/prs.ts) ·
Tests: [`tests/server/routes/prs.test.ts`](../../tests/server/routes/prs.test.ts)

### `GET /api/prs`
Personal records ledger.

Response `200`:
```ts
Array<{
  id: string;
  exerciseId: string;
  exerciseSlug: string;
  exerciseName: string | null;
  kind: "e1rm" | "weight" | "reps" | "volume";
  value: number;
  achievedAt: string;
  workoutId: string | null;
}>
```

---

## Rank events (`rankEvents.ts`)

Source: [`packages/server/src/routes/rankEvents.ts`](../../packages/server/src/routes/rankEvents.ts) ·
Tests: [`tests/server/routes/rankEvents.test.ts`](../../tests/server/routes/rankEvents.test.ts)

### `GET /api/rank-events`
Rank-ups grouped by weekday over the current rolling week. Feeds the Ränge page's
"Rangaufstiege" calendar strip.

Response `200`:
```ts
Array<{
  weekday: number;      // 0-6
  count: number;         // >= 0
  flaggedCount: number;  // >= 0
}>
```

---

## Ranks (`ranks.ts`)

Source: [`packages/server/src/routes/ranks.ts`](../../packages/server/src/routes/ranks.ts) ·
Tests: [`tests/server/routes/ranks.test.ts`](../../tests/server/routes/ranks.test.ts)

### `GET /api/ranks`
Every exercise with a computed rank, sorted by `lp` descending.

Response `200`:
```ts
Array<{
  exerciseId: string;
  slug: string;
  name: string | null;
  isBodyweight: boolean;
  tier: Tier;
  division: number;
  lp: number;
  e1rm: number;
  trust: "real" | "derived" | "synthetic";
  nextTargetWeightKg: number | null;
  nextTargetReps: number | null;
  // Peak snapshot (rank engine redesign) — null only for rows never recomputed since that migration.
  peakTier: Tier | null;
  peakDivision: number | null;
}>
```

---

## Readiness (`readiness.ts`)

Source: [`packages/server/src/routes/readiness.ts`](../../packages/server/src/routes/readiness.ts) ·
Tests: [`tests/server/routes/readiness.test.ts`](../../tests/server/routes/readiness.test.ts)

### `GET /api/readiness`
Last-trained timestamp per muscle, primary vs. secondary role. Feeds the Übersicht
"Erholungszone" hero. The actual 0-1 readiness math runs client-side against these raw
timestamps (`@liftr/shared`'s `computeReadiness`) — this endpoint returns facts, not a derived
score.

Response `200`:
```ts
Array<{
  slug: string;
  lastTrainedAt: string | null;
  wasPrimary: boolean;
}>
```

---

## Routines (`routines.ts`)

Source: [`packages/server/src/routes/routines.ts`](../../packages/server/src/routes/routines.ts) ·
Tests: [`tests/server/routes/routines.test.ts`](../../tests/server/routes/routines.test.ts)

### `GET /api/routines`
Lists routines with their exercises and any active mesocycle attached.

Response `200` (no explicit schema — inferred from the handler):
```ts
Array<Routine & { mesocycle: Mesocycle | null }>
```

### `POST /api/routines`
Creates a routine and its exercise list in one call.

Request body:
```ts
{
  name: string;                  // min length 1
  orderIndex?: number;            // int, default 0
  exercises?: Array<{
    exerciseId: string;
    orderIndex?: number;          // int, default 0
    targetSets?: Array<{
      reps: number;               // int, >= 1
      weightKg: number | null;    // null = no weight target (plain bodyweight)
      kind?: "normal" | "warmup" | "failure" | "dropset"; // default "normal"
    }>;                           // min 1 entry, defaults to three {reps: 8, weightKg: null} sets
    supersetGroup?: number | null;
    restBetweenSetsSeconds?: number | null;  // int, >= 0 (0 is a real "no rest" value, not rejected)
    restAfterExerciseSeconds?: number | null; // int, >= 0
  }>;                              // default []
}
```

Response `201`: the created routine row (no response schema declared on this route).

### `PATCH /api/routines/:id`
Edit name/order, or replace the exercise list wholesale (any combination of fields).

Params: `{ id: string }` · Body: `routineInput.partial()` (all fields above, all optional)

Response `200`: `{ ok: true }`

### `DELETE /api/routines/:id`
Soft delete (archive) — past workouts keep a valid `routineId` reference.

Params: `{ id: string }` · Response `200`: `{ ok: true }`

---

## Routine suggestions (`routineSuggestions.ts`)

Source: [`packages/server/src/routes/routineSuggestions.ts`](../../packages/server/src/routes/routineSuggestions.ts) ·
Tests: [`tests/server/routes/routineSuggestions.test.ts`](../../tests/server/routes/routineSuggestions.test.ts)

Route is a thin wrapper — candidate-selection/recommendation logic lives in
`services/routineSuggestionService.ts`.

### `POST /api/routines/suggest`
Suggests exercises for a set of target muscle groups.

Request body:
```ts
{
  muscleSlugs: string[];              // min 1
  exercisesPerMuscle?: number;         // int, 1-5, default 2
  ownedEquipment?: string[];
  experienceLevel?: "beginner" | "intermediate" | "advanced";
}
```

Response `200` (no explicit schema): `{ exercises: [...] }` — shape produced by
`suggestExercisesForMuscles`.

### `POST /api/routines/recommend`
Sets/reps/weight recommendations for exercises the user already picked manually (routine wizard,
Quick Start) — reuses the same recommendation engine as `/suggest` instead of a hardcoded
"8 reps, 0 kg" default.

Request body:
```ts
{
  exerciseIds: string[];               // min 1
  experienceLevel?: "beginner" | "intermediate" | "advanced";
}
```

Response `200` (no explicit schema): `{ exercises: [...] }` — shape produced by
`recommendForChosenExercises`.

---

## Runs (`runs.ts`)

Source: [`packages/server/src/routes/runs.ts`](../../packages/server/src/routes/runs.ts) ·
Tests: [`tests/server/routes/runs.test.ts`](../../tests/server/routes/runs.test.ts)

Both file-import and manual-entry paths converge on the same `runs`/`run_points` tables — see
`services/runImportService.ts`.

Common run shape (`runResponse`):
```ts
{
  id: string;
  source: "gpx" | "fit" | "manual" | "healthconnect";
  name: string | null;
  startedAt: Date;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
  clientId: string;
}
```

### `GET /api/runs`
Response `200`: `Array<runResponse>`, most recent first.

### `GET /api/runs/:id`
Includes the full GPS point array (route map + replay).

Params: `{ id: string }`

Response `200`: `runResponse & { points: Array<{ runId: string; idx: number; t: Date; lat: number; lon: number; ele: number | null; hr: number | null; cadence: number | null }> }`

Notable statuses: `404 { error: "not_found" }` if the run doesn't exist.

### `POST /api/runs/import`
Multipart GPX/FIT file upload. **No `schema.body`** — this route is multipart, not JSON, so
validation happens inline in the handler rather than via a declared Zod schema.

Request: `multipart/form-data` with a `file` part.

Response `201`: `runResponse` (source `"gpx"` or `"fit"` depending on the file).

Notable statuses (all inline, not the generic `invalid_request` shape):
- `400 { "error": "no_file" }` — no file part in the multipart body
- `400 { "error": "unsupported_format", "detail": string }` — unrecognized file extension
- `400 { "error": "parse_failed", "detail": string }` — recognized extension, but the file
  couldn't be parsed (thrown as `RunParseError`)

### `POST /api/runs/healthconnect`
Native in-app import via `capacitor-health`. `platformId` (Health Connect's own record id) is the
idempotency key — replaying the same `platformId` returns the same run's `id` instead of
duplicating it.

Request body:
```ts
{
  platformId: string;    // min length 1
  name?: string | null;
  points: Array<{
    t: Date;               // coerced
    lat: number;
    lon: number;
    ele?: number | null;
    hr?: number | null;
  }>;                     // min 1
}
```

Response `200` (not 201 — this is an idempotent upsert): `runResponse`.

### `DELETE /api/runs/:id`
Cascades to `run_points` via FK. Runs don't feed XP/LP (only logged sets do), so unlike workout
deletion there's no rank recompute here. Deliberately leaves that date's streak credit alone even
if this was the day's only run.

Params: `{ id: string }` · Response `200`: `{ ok: true }` · `404` if the run doesn't exist.

### `POST /api/runs`
Manual run entry — no file.

Request body:
```ts
{
  name?: string | null;
  startedAt: Date;         // coerced
  distanceM: number;        // positive
  durationS: number;        // positive
}
```

Response `201`: `runResponse` with `source: "manual"`.

---

## Settings (`settings.ts`)

Source: [`packages/server/src/routes/settings.ts`](../../packages/server/src/routes/settings.ts) ·
Tests: [`tests/server/routes/settings.test.ts`](../../tests/server/routes/settings.test.ts)

Single-user app — every setting here is one k/v row (`readJsonSetting`/`writeJsonSetting`), not
per-account data. `null` distinguishes "never configured" from "configured to an empty value."

### `GET /api/settings/profile` / `PUT /api/settings/profile`
Onboarding profile: sex, birth year, experience level, workouts/week.

`GET` response `200`:
```ts
Partial<{
  sex: "male" | "female";
  birthYear: number;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  workoutsPerWeek: number;
}> | null   // null until onboarding has been completed once
```

`PUT` request body:
```ts
{
  sex?: "male" | "female";
  birthYear?: number;              // 1900..currentYear
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  workoutsPerWeek?: number;        // int, 1-14
  // Convenience only — not itself part of the stored/returned profile:
  currentWeightKg?: number;        // positive, <=400; also upserts today's bodyweightLogs entry
}
```
`PUT` **merges** into the existing profile rather than replacing it wholesale. Response `200`:
same shape as the `GET` (without `currentWeightKg`).

### `GET /api/settings/equipment` / `PUT /api/settings/equipment`
Owned-equipment filter, used by routine suggestions.

`GET` response `200`: `{ equipment: string[] | null }` (`null` = never configured, `[]` would
mean "configured to own nothing" — the two are kept distinct).

`PUT` request body: `{ equipment: string[] }` · Response `200`: echoes the same body.

### `GET /api/settings/gym` / `PUT /api/settings/gym`
Bar weights per bar type + owned plate inventory, used to compute "how to load the barbell."

`GET` response `200`:
```ts
{
  barWeights: {
    barbell?: number;    // positive, <=50
    "ez-bar"?: number;    // positive, <=50
    "trap-bar"?: number;  // positive, <=50
    dumbbell?: number;    // positive, <=10 (adjustable-dumbbell handle)
  };
  plates: Array<{ weightKg: number; count: number }>; // weightKg positive, count int >= 0
} | null   // null until gym setup has ever been configured
```

`PUT` request body: same shape (non-nullable) · Response `200`: echoes the same body.

---

## Streak (`streak.ts`)

Source: [`packages/server/src/routes/streak.ts`](../../packages/server/src/routes/streak.ts) ·
Tests: [`tests/server/routes/streak.test.ts`](../../tests/server/routes/streak.test.ts)

### `GET /api/streak`
Current streak + remaining streak-protection tokens. Protection scales with the onboarding
profile's `workoutsPerWeek` when set (a 2x/week-by-design lifter's on-schedule rest days
shouldn't read as a broken streak) — see `@liftr/shared`'s `computeStreak`.

Response `200`: `{ streak: number; tokensRemaining: number }`

---

## Sync (`sync.ts`)

Source: [`packages/server/src/routes/sync.ts`](../../packages/server/src/routes/sync.ts) ·
Tests: [`tests/server/routes/sync.test.ts`](../../tests/server/routes/sync.test.ts) ·
Service (per-item behavior in full): [`packages/server/src/services/syncService.ts`](../../packages/server/src/services/syncService.ts)

The offline outbox flush endpoint — the heart of Liftr's offline-first design. This route is only
the schema wrapper; per-item idempotency/plausibility/XP decisions live in `syncService.ts`.

### `POST /api/sync`
Applies a batch of client-generated mutation items in order.

Request body:
```ts
{
  items: Array<
    | { clientId: string; type: "start_workout"; payload: {
        id: string;                    // client-generated (crypto.randomUUID()); server upserts on this id
        routineId?: string | null;
        startedAt: Date;                // coerced
        exercises: Array<{ id: string; exerciseId: string; orderIndex: number }>;
      } }
    | { clientId: string; type: "log_set"; payload: {
        workoutExerciseId: string;
        setIndex: number;               // int, >= 0
        weightKg: number | null;        // >= 0
        reps: number;                    // int, >= 0
        rpe?: number | null;
        kind?: "normal" | "warmup" | "failure" | "dropset"; // default "normal"
        notes?: string | null;
        loggedAt: Date;                  // coerced
      } }
    | { clientId: string; type: "finish_workout"; payload: {
        workoutId: string;
        endedAt: Date;                    // coerced
        pausedSeconds?: number;            // int, >= 0, default 0
        notes?: string | null;
      } }
    | { clientId: string; type: "add_exercise"; payload: {
        id: string;                        // client-generated
        workoutId: string;
        exerciseId: string;
        orderIndex: number;
      } }
  >;   // min 1, max 200 items per batch
}
```

Response `200` (no explicit response schema; shape from `SyncResult` in `syncService.ts`):
```ts
{
  results: Array<{
    clientId: string;
    status: "created" | "already_synced" | "error";
    serverId?: string;
    error?: string;              // set when status is "error" (e.g. "unknown_workout_exercise", "implausible_set")
    // finish_workout results only:
    ranks?: Array<{
      exerciseId: string; rankedUp: boolean;
      newPr: { kind: string; value: number } | null;
      tier: string; division: number; lp: number; prevLp: number;
      plausibilityReason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
    }>;
    consistencyBonusXp?: number;
    varietyBonusXp?: number;
  }>;
}
```

Notable statuses: `400 invalid_request` for an empty `items` array, a missing `items` field, an
unrecognized `type` (discriminated union mismatch), a `payload` missing required fields for its
`type`, or a batch over the 200-item cap. A per-item failure (e.g. an unknown
`workoutExerciseId`) is **not** an HTTP error — it's `status: "error"` inside an otherwise-`200`
response, so one bad item in a batch doesn't fail the rest.

---

## Workouts (`workouts.ts`)

Source: [`packages/server/src/routes/workouts.ts`](../../packages/server/src/routes/workouts.ts) ·
Tests: [`tests/server/routes/workouts.test.ts`](../../tests/server/routes/workouts.test.ts)

### `POST /api/workouts`
Starts a session. Idempotent on `clientId` — replaying the same `clientId` returns the existing
workout (status `200`) instead of creating a duplicate (status `201` on first creation).

Request body:
```ts
{
  clientId: string;               // min length 1
  routineId?: string | null;
  startedAt: Date;                 // coerced
  exerciseIds?: string[];          // default []; snapshot of the routine's order at session start
}
```

Response: `201` (created) or `200` (already existed) with the workout row (no explicit response
schema declared).

### `PATCH /api/workouts/:id`
Finish / update paused-seconds / notes.

Params: `{ id: string }` · Body:
```ts
{ endedAt?: Date; pausedSeconds?: number; notes?: string } // pausedSeconds: int, >= 0
```

Response `200`: `{ ok: true }`

### `GET /api/workouts/:id`
Full detail for the history detail view and share cards.

Params: `{ id: string }` (no response schema declared)

Response `200`: the workout with `workoutExercises[].sets[]`, each set carrying a computed
`isPr: boolean` (collapsed from a joined `prs` existence check — history/share views previously
hardcoded this to `false`).

Notable statuses: `404 { error: "not_found" }` if the workout doesn't exist.

### `DELETE /api/workouts/:id`
Deletes the workout; cascades to its exercises/sets and triggers a rank recompute — see
[`services/workoutService.ts`](../../packages/server/src/services/workoutService.ts).

Params: `{ id: string }` · Response `200`: `{ ok: true }` · `404` if the workout doesn't exist.

---

## XP (`xp.ts`)

Source: [`packages/server/src/routes/xp.ts`](../../packages/server/src/routes/xp.ts) ·
Tests: [`tests/server/routes/xp.test.ts`](../../tests/server/routes/xp.test.ts)

### `GET /api/xp`
Total XP across every logged non-warmup set + the resulting level.

Response `200`:
```ts
{
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}
```

---

## Non-`/api` endpoints

Registered directly in `app.ts`, outside the per-file route registrations above — no auth gate
(only `/api/*` is gated):

- `GET /api/health` — `{ ok: true }`. **Note**: despite the `/api/` prefix this route is
  registered, it still passes through the auth `onRequest` hook like any other `/api/*` path
  (the hook matches on URL prefix, not on which file registered the route).
- `GET /images/*` — static file server rooted at `LIFTR_IMAGES_DIR`, only registered if that
  directory exists on disk at startup.
- `GET /*` — serves the built client SPA from `LIFTR_CLIENT_DIST`, only registered if that
  directory exists on disk at startup (in dev, the client runs on its own Vite dev server instead).
