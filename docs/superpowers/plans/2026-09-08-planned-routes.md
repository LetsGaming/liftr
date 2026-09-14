# Planned Routes ("Strecken") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user place waypoints on a map, have the app snap them to real roads/trails and compute distance + elevation gain (via OpenRouteService, gracefully degrading to a straight line when unavailable), save the result as a reusable "planned route", and quick-start a manual run log pre-filled from it.

**Architecture:** New `plannedRoutes`/`plannedRoutePoints` tables mirroring `routines`/`run_points`; a server-side ORS adapter + service that both `POST /api/planned-routes` and a debounced `POST /api/planned-routes/preview` converge on so create and preview can never drift; a new interactive Leaflet map editor (tap-to-place, drag-to-reposition) client-side; a single-screen creation sheet reusing `SheetModal`/`useConfirmTap`/`useToast`; a quick-start hand-off that pre-fills the existing manual run-entry form instead of adding live GPS tracking (which doesn't exist anywhere in the app and this feature deliberately doesn't add).

**Tech Stack:** Fastify + Zod + Drizzle/SQLite (server), Vue 3 + Pinia + Leaflet (client), OpenRouteService HTTP API (external, opt-in).

**Spec:** `/home/kirchner/.claude/plans/nifty-bouncing-graham.md` (the approved brainstorm/architecture doc this plan argues from — read it for the full rationale behind each decision below; conflicts between that doc and this plan resolve in this plan's favor since it was written after inspecting the actual current code).

## Global Constraints

- Domain object is **planned route** — `plannedRoutes`/`planned_routes` in code, never "route" (that word means "Fastify HTTP route module" everywhere in `packages/server/src/routes/`) or "routine" (unrelated existing concept). German UI copy, inline in `.vue` files (no i18n convention exists to follow): **"Strecke"/"Strecken"**, waypoint = **"Wegpunkt"**, elevation gain = **"Höhenmeter"/"hm"**, straight-line fallback shown as **"≈"** on the distance and **"Höhe unbekannt"** where elevation is null.
- ORS's coordinate order is **`[lon, lat]`** — the opposite of every other lat/lon pair in this codebase (`{lat, lon}`). This swap happens in exactly **one** place — `packages/server/src/lib/openRouteService.ts`, both request and response directions — commented clearly there and nowhere else.
- Env vars (`packages/server/src/env.ts`): `LIFTR_ORS_API_KEY` (optional; unset is a fully supported degraded state, **no** production-throw like `LIFTR_TOKEN` has), `LIFTR_ORS_BASE_URL` (default `"https://api.openrouteservice.org"`), `LIFTR_ORS_PROFILE` (default `"foot-walking"`).
- `geometrySource` is the enum `"ors" | "straight"` — nothing else. It drives the `≈`/"Höhe unbekannt" UI markers.
- Zod bounds enforced before ever calling ORS: waypoints array `min(2).max(50)`, each `lat` in `[-90, 90]`, each `lon` in `[-180, 180]`, `name` `min(1)`.
- No live GPS tracking, no "active run" mode — quick-start only pre-fills the existing manual-entry form (`RunsPage.vue`'s `submitManual`), same as starting a routine pre-fills expected sets.
- No `/routes/:id` detail page in v1 — the create/edit sheet (`RouteWizard.vue`) doubles as the detail view.
- The server **always** recomputes geometry from waypoints server-side on create/update — the client never posts geometry it claims came from ORS.
- **Never hand-edit files under `packages/db/drizzle/`** — a `PreToolUse` hook blocks it. Schema changes go through `packages/db/src/schema.ts` only; generating and applying the migration (`pnpm db:generate` → review the SQL → `pnpm db:migrate`) is the **db-migration skill**, which is `disable-model-invocation: true` — **no implementer subagent in this plan may run `pnpm db:generate` or `pnpm db:migrate` itself.** Task 2 ends with a hard stop for exactly this reason; the controller running this plan asks the human partner to run it before dispatching Task 4.
- Every task touching `packages/client/src` must pass the **mobile-viewport-check** skill before being reported done — Liftr is used primarily on mobile.
- `pnpm typecheck && pnpm lint && pnpm test` must be clean before any non-trivial task is considered done.
- OpenRouteService's terms require attribution (`AttributionsPage.vue`, Task 13).

---

### Task 1: Shared GPS math helpers (`pathDistanceM`, `elevationGainFrom`)

**Files:**
- Modify: `packages/shared/src/math/gps.ts`
- Test: `tests/shared/math/gps.test.ts`

**Interfaces:**
- Produces: `pathDistanceM(points: { lat: number; lon: number }[]): number` and `elevationGainFrom(points: { ele?: number | null }[]): number | null`, both exported from `@liftr/shared` (already re-exported via `packages/shared/src/index.ts`'s `export * from "./math/gps.js"` — no index change needed). Used by: Task 3's ORS adapter (ascent fallback), Task 4's service (straight-line fallback), Task 9's client map editor (provisional distance).

- [ ] **Step 1: Write the failing tests**

Append to `tests/shared/math/gps.test.ts` (the file already imports `haversineM, summarizeRun` from `@liftr/shared` at the top — extend that import to add `elevationGainFrom, pathDistanceM`):

```ts
describe("pathDistanceM", () => {
  it("returns 0 for fewer than 2 points", () => {
    expect(pathDistanceM([])).toBe(0);
    expect(pathDistanceM([{ lat: 52.5, lon: 13.4 }])).toBe(0);
  });

  it("sums haversine distance over consecutive waypoints", () => {
    const points = [
      { lat: 52.4732, lon: 13.4021 },
      { lat: 52.475, lon: 13.4021 },
      { lat: 52.475, lon: 13.405 },
    ];
    const total = pathDistanceM(points);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeCloseTo(
      haversineM(points[0]!, points[1]!) + haversineM(points[1]!, points[2]!),
      3,
    );
  });
});

describe("elevationGainFrom", () => {
  it("returns null when no point carries elevation", () => {
    expect(elevationGainFrom([{}, {}])).toBeNull();
  });

  it("sums only positive deltas between consecutive points", () => {
    const gain = elevationGainFrom([{ ele: 10 }, { ele: 15 }, { ele: 12 }, { ele: 20 }]);
    expect(gain).toBe(5 + 8); // 10->15 (+5), 15->12 (skip, descent), 12->20 (+8)
  });

  it("treats a missing ele on either side of a pair as a gap, not a drop", () => {
    const gain = elevationGainFrom([{ ele: 10 }, {}, { ele: 20 }]);
    expect(gain).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm --filter @liftr/shared exec vitest run tests/shared/math/gps.test.ts` (or `pnpm test -- tests/shared/math/gps.test.ts` from repo root — use whichever the repo's `pnpm test` script actually resolves to; check `package.json`'s `test` script first).
Expected: FAIL — `pathDistanceM`/`elevationGainFrom` are not exported.

- [ ] **Step 3: Implement**

Append to `packages/shared/src/math/gps.ts` (after `haversineM`, anywhere before or after `summarizeRun` — after `haversineM` is cleanest since both new functions call it or share its shape):

```ts
/** Sum of haversineM over consecutive waypoints — the straight-line distance through an ordered
 *  point list. Used both as the server-side fallback when ORS is unavailable, and client-side for
 *  an instant provisional distance while the user is still placing waypoints on the map. */
export function pathDistanceM(points: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Same positive-delta-sum rule already inlined in summarizeRun, extracted since a planned route
 *  has no timestamps and so can't reuse summarizeRun directly. Returns null when no point in the
 *  array carries elevation at all (same "unknown, not zero" convention summarizeRun uses). */
export function elevationGainFrom(points: { ele?: number | null }[]): number | null {
  if (!points.some((p) => p.ele != null)) return null;
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.ele;
    const cur = points[i]!.ele;
    if (prev != null && cur != null && cur > prev) {
      gain += cur - prev;
    }
  }
  return gain;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run the same command as Step 2. Expected: PASS, all cases including the pre-existing `haversineM`/`summarizeRun` tests in the same file.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/math/gps.ts tests/shared/math/gps.test.ts
git commit -m "feat(shared): add pathDistanceM and elevationGainFrom for planned routes"
```

---

### Task 2: DB schema — `plannedRoutes`, `plannedRoutePoints`, `runs.plannedRouteId`

**Files:**
- Modify: `packages/db/src/schema.ts`

**Interfaces:**
- Produces: Drizzle tables `plannedRoutes`, `plannedRoutePoints` (importable from `@liftr/db`), `runs.plannedRouteId` column, relations `plannedRoutesRelations`, `plannedRoutePointsRelations`, and an updated `runsRelations` with a `plannedRoute` one-relation. Task 4 (repository) and Task 6 (runs handoff) both import these directly by name.
- **This task does NOT run `pnpm db:generate` or `pnpm db:migrate`, and does not touch anything under `packages/db/drizzle/`.** It ends with a stop, not a `DONE` — see Step 5.

- [ ] **Step 1: Add the two new tables**

In `packages/db/src/schema.ts`, insert immediately after the `runPoints` table definition (currently ends around the `run_points_run_idx` index, right before the `// --- Motivation: streaks + settings ---` section comment):

```ts
// ---------------------------------------------------------------------------
// Planned routes ("Strecken") — pre-planned, re-runnable routes.
// ---------------------------------------------------------------------------

export const plannedRoutes = sqliteTable("planned_routes", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  /** JSON-encoded {lat,lon}[] — the user-placed waypoints, distinct from the (much denser)
   *  road-snapped geometry stored in plannedRoutePoints below. Same JSON-text-column convention
   *  as routineExercises.targetSets. */
  waypoints: text("waypoints_json").notNull(),
  distanceM: real("distance_m").notNull(),
  elevationGainM: real("elevation_gain_m"),
  /** "ors" when the last (re)compute got a real road-snapped geometry + elevation from
   *  OpenRouteService; "straight" when it fell back to a straight line between waypoints (ORS
   *  unset/unavailable) — drives the "≈"/"Höhe unbekannt" honesty marker in the UI. */
  geometrySource: text("geometry_source", { enum: ["ors", "straight"] }).notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

/** The road-snapped (or straight-line-fallback) geometry for a planned route — mirrors
 *  run_points: never compressed to a polyline blob, kept as a full ordered point array so the
 *  map renders the exact line the server computed. No userId of its own (child-via-parent, like
 *  run_points). */
export const plannedRoutePoints = sqliteTable(
  "planned_route_points",
  {
    routeId: text("route_id")
      .notNull()
      .references(() => plannedRoutes.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    ele: real("ele"),
  },
  (t) => [
    primaryKey({ columns: [t.routeId, t.idx] }),
    index("planned_route_points_route_idx").on(t.routeId),
  ],
);
```

- [ ] **Step 2: Link `runs` back to its source route**

In the `runs` table definition, add `plannedRouteId` right before `clientId`:

```ts
    elevationGainM: real("elevation_gain_m"),
    /** Set when this run was logged from a saved planned route's quick-start hand-off (see
     *  useStartPlannedRoute.ts). Archiving/deleting the route never breaks this run's history —
     *  a literal mirror of workouts.routineId's onDelete behavior. */
    plannedRouteId: text("planned_route_id").references(() => plannedRoutes.id, { onDelete: "set null" }),
    clientId: text("client_id").notNull(), // unique per user (below)
```

- [ ] **Step 3: Update relations**

Change `runsRelations` (currently `({ many }) => ({ points: many(runPoints) })`) to:

```ts
export const runsRelations = relations(runs, ({ one, many }) => ({
  points: many(runPoints),
  plannedRoute: one(plannedRoutes, { fields: [runs.plannedRouteId], references: [plannedRoutes.id] }),
}));
```

Add two new relation blocks near it (after `runPointsRelations`):

```ts
export const plannedRoutesRelations = relations(plannedRoutes, ({ many }) => ({
  points: many(plannedRoutePoints),
}));

export const plannedRoutePointsRelations = relations(plannedRoutePoints, ({ one }) => ({
  route: one(plannedRoutes, { fields: [plannedRoutePoints.routeId], references: [plannedRoutes.id] }),
}));
```

- [ ] **Step 4: Typecheck (no migration involved)**

Run: `pnpm --filter @liftr/db exec tsc --noEmit` (or the package's own `typecheck` script — check `packages/db/package.json`).
Expected: PASS. This only proves the schema module compiles; it does **not** and cannot run any test that touches these new tables, since `createTestDb()` (`tests/server/helpers/testDb.ts`) calls `runMigrations(db)`, which replays the generated SQL files under `packages/db/drizzle/` — files that don't exist yet for this change.

- [ ] **Step 5: Commit, then stop — do not generate or apply the migration**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add plannedRoutes/plannedRoutePoints schema + runs.plannedRouteId"
```

Report status **DONE_WITH_CONCERNS**, concern text: "Schema changed but no migration exists yet. Per CLAUDE.md, generating (`pnpm db:generate`), reviewing, and applying (`pnpm db:migrate`) the migration is the user-invoked-only db-migration skill — do not run those commands or hand-edit `packages/db/drizzle/`. Every task from Task 4 onward needs the migration applied first, since `createTestDb()` replays the same generated SQL `runMigrations` uses in production." The controller running this plan must get the human partner to run the migration before dispatching Task 4 — this is a hard checkpoint, not a suggestion.

---

### Task 3: OpenRouteService adapter + env vars

**Files:**
- Create: `packages/server/src/lib/openRouteService.ts`
- Modify: `packages/server/src/env.ts`
- Create: `tests/server/lib/openRouteService.test.ts` (new directory — no `tests/server/lib/` exists yet)

**Interfaces:**
- Consumes: `elevationGainFrom` from `@liftr/shared` (Task 1), `env.orsApiKey`/`env.orsBaseUrl`/`env.orsProfile` (this task, Step 1).
- Produces: `fetchOrsRoute(waypoints: {lat:number;lon:number}[]): Promise<OrsRouteResult>` and `class OrsUnavailableError extends Error { status: number | "network" | "timeout" | "parse" }`, both from `packages/server/src/lib/openRouteService.ts`. `OrsRouteResult = { coordinates: {lat:number;lon:number;ele?:number}[]; distanceM: number; elevationGainM: number | null }`. Used by Task 4's `computeGeometry`.
- This task has **no DB dependency** — it can be dispatched and reviewed before Task 2's migration checkpoint is resolved, same as Task 1.

- [ ] **Step 1: Add env vars**

In `packages/server/src/env.ts`, add to the `env` object (after `elevationGainM`... no — after the existing `allowedOrigins` field, before the closing `};`):

```ts
  /** OpenRouteService: BYO API key for planned-route road-snapping + elevation. Unset is a fully
   *  supported degraded state (straight-line distance, no elevation) — no production-throw like
   *  LIFTR_TOKEN has, since self-hosting without this key is a legitimate, deliberate choice. */
  orsApiKey: process.env.LIFTR_ORS_API_KEY,
  orsBaseUrl: process.env.LIFTR_ORS_BASE_URL ?? "https://api.openrouteservice.org",
  orsProfile: process.env.LIFTR_ORS_PROFILE ?? "foot-walking",
```

- [ ] **Step 2: Write the failing tests**

Create `tests/server/lib/openRouteService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~server/env.js", () => ({
  env: { orsApiKey: "test-key", orsBaseUrl: "https://ors.test", orsProfile: "foot-walking" },
}));

import { fetchOrsRoute, OrsUnavailableError } from "~server/lib/openRouteService.js";

function orsSuccessBody() {
  return {
    features: [
      {
        geometry: { coordinates: [[13.4021, 52.4732, 40], [13.4025, 52.4736, 42]] },
        properties: { summary: { distance: 123.4 }, ascent: 2 },
      },
    ],
  };
}

function fakeResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOrsRoute", () => {
  it("swaps {lat,lon} waypoints to ORS's [lon,lat] order in the request body", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, orsSuccessBody()));

    await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    const call = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.coordinates).toEqual([[13.4021, 52.4732], [13.4025, 52.4736]]);
  });

  it("parses coordinates back to {lat,lon,ele}, distance, and ascent on success", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, orsSuccessBody()));

    const result = await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    expect(result.coordinates).toEqual([
      { lon: 13.4021, lat: 52.4732, ele: 40 },
      { lon: 13.4025, lat: 52.4736, ele: 42 },
    ]);
    expect(result.distanceM).toBe(123.4);
    expect(result.elevationGainM).toBe(2);
  });

  it("derives elevation gain from the geometry when ascent is absent", async () => {
    const body = orsSuccessBody();
    delete (body.features[0]!.properties as { ascent?: number }).ascent;
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, body));

    const result = await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    expect(result.elevationGainM).toBe(2); // 40 -> 42
  });

  it("throws OrsUnavailableError with the HTTP status on a non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(401));

    await expect(fetchOrsRoute([{ lat: 0, lon: 0 }])).rejects.toMatchObject(
      new OrsUnavailableError(401, expect.any(String)),
    );
  });

  it("throws OrsUnavailableError on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    await expect(fetchOrsRoute([{ lat: 0, lon: 0 }])).rejects.toBeInstanceOf(OrsUnavailableError);
  });

  it("throws OrsUnavailableError when the response body doesn't match the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, { unexpected: true }));

    await expect(fetchOrsRoute([{ lat: 0, lon: 0 }])).rejects.toBeInstanceOf(OrsUnavailableError);
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/lib/openRouteService.test.ts` (adjust to the repo's actual `pnpm test` invocation if this differs — check the root `package.json` `test` script first).
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement the adapter**

Create `packages/server/src/lib/openRouteService.ts`:

```ts
import { elevationGainFrom } from "@liftr/shared";
import { z } from "zod";
import { env } from "../env.js";

export class OrsUnavailableError extends Error {
  constructor(
    public status: number | "network" | "timeout" | "parse",
    message: string,
  ) {
    super(message);
    this.name = "OrsUnavailableError";
  }
}

const orsResponseSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          coordinates: z.array(z.array(z.number()).min(2).max(3)),
        }),
        properties: z.object({
          summary: z.object({ distance: z.number() }),
          ascent: z.number().optional(),
        }),
      }),
    )
    .min(1),
});

export interface OrsCoordinate {
  lat: number;
  lon: number;
  ele?: number;
}

export interface OrsRouteResult {
  coordinates: OrsCoordinate[];
  distanceM: number;
  elevationGainM: number | null;
}

/**
 * Calls OpenRouteService's directions API for a road/trail-snapped route + per-point elevation.
 * ORS's own coordinate order is [lon, lat] — the opposite of every other lat/lon pair in this
 * codebase, which is always {lat, lon}. This swap happens ONLY here, in both directions (request
 * and response), so it can never leak into the rest of the app as a silent bug.
 */
export async function fetchOrsRoute(waypoints: { lat: number; lon: number }[]): Promise<OrsRouteResult> {
  const url = `${env.orsBaseUrl}/v2/directions/${env.orsProfile}/geojson`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.orsApiKey! },
      body: JSON.stringify({
        coordinates: waypoints.map((w) => [w.lon, w.lat]), // [lon, lat] — see module doc above
        elevation: true,
        instructions: false,
        units: "m",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new OrsUnavailableError(timedOut ? "timeout" : "network", (err as Error).message);
  }

  if (!res.ok) {
    throw new OrsUnavailableError(res.status, `ORS responded ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new OrsUnavailableError("parse", (err as Error).message);
  }

  const parsed = orsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new OrsUnavailableError("parse", parsed.error.message);
  }

  const feature = parsed.data.features[0]!;
  const coordinates: OrsCoordinate[] = feature.geometry.coordinates.map((c) => ({
    lon: c[0]!,
    lat: c[1]!,
    ele: c[2],
  }));
  const distanceM = feature.properties.summary.distance;
  const elevationGainM =
    feature.properties.ascent ?? elevationGainFrom(coordinates.map((c) => ({ ele: c.ele ?? null })));

  return { coordinates, distanceM, elevationGainM };
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Same command as Step 3. Expected: PASS. Also run `pnpm --filter @liftr/server exec tsc --noEmit` to confirm `env.ts`'s new fields typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/lib/openRouteService.ts packages/server/src/env.ts tests/server/lib/openRouteService.test.ts
git commit -m "feat(server): add OpenRouteService adapter with graceful-degradation error type"
```

---

> **Checkpoint before Task 4:** the migration for Task 2's schema change must be generated, reviewed, and applied (`pnpm db:generate` → read the SQL → `pnpm db:migrate`) by a human, via the db-migration skill. `createTestDb()` calls `runMigrations()`, which replays those generated files — every task from here on fails at the first test run without it. Do not dispatch Task 4 until this is confirmed done.

---

### Task 4: `plannedRouteRepository.ts` + `plannedRouteService.ts`

**Files:**
- Create: `packages/server/src/repositories/plannedRouteRepository.ts`
- Create: `packages/server/src/services/plannedRouteService.ts`
- Test: `tests/server/repositories/plannedRouteRepository.test.ts`
- Test: `tests/server/services/plannedRouteService.test.ts`

**Interfaces:**
- Consumes: `plannedRoutes`, `plannedRoutePoints` tables (Task 2); `pathDistanceM` (Task 1); `fetchOrsRoute`, `OrsUnavailableError` (Task 3); `NotFoundError` from `packages/server/src/lib/errors.ts` (existing).
- Produces (repository): `findActivePlannedRoutes(db, userId)`, `findPlannedRouteById(db, userId, id)`, `findPlannedRoutePoints(db, routeId)`, `insertPlannedRoute(db, userId, values: NewPlannedRoute)`, `insertPlannedRoutePoints(db, routeId, points: RoutePoint[])`, `deletePlannedRoutePoints(db, routeId)`, `updatePlannedRouteMeta(db, userId, id, patch)`, `archivePlannedRoute(db, userId, id)`. Types `Waypoint`, `RoutePoint`, `NewPlannedRoute` exported from this file.
- Produces (service): `computeGeometry(waypoints: Waypoint[], logger): Promise<ComputedGeometry>`, `previewPlannedRoute(waypoints, logger)`, `createPlannedRoute(db, userId, input, logger)`, `updatePlannedRoute(db, userId, id, patch, logger)` (assumes the caller — Task 5's route handler — has already checked the route exists; does not re-check). Used by Task 5's routes.

- [ ] **Step 1: Write the repository**

Create `packages/server/src/repositories/plannedRouteRepository.ts`:

```ts
import { plannedRoutePoints, plannedRoutes, type LiftrDb } from "@liftr/db";
import { and, eq } from "drizzle-orm";

export interface Waypoint {
  lat: number;
  lon: number;
}

export interface RoutePoint {
  idx: number;
  lat: number;
  lon: number;
  ele: number | null;
}

export interface NewPlannedRoute {
  name: string;
  orderIndex: number;
  waypoints: Waypoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: "ors" | "straight";
  computedAt: Date;
}

/** `waypoints` is stored as JSON text — parsed here, at the repository edge, same convention as
 *  routineRepository.ts's targetSets. */
export async function findActivePlannedRoutes(db: LiftrDb, userId: string) {
  const rows = await db.query.plannedRoutes.findMany({
    where: (r, { isNull, and: andOp, eq: eqOp }) => andOp(eqOp(r.userId, userId), isNull(r.archivedAt)),
    orderBy: (r, { asc }) => asc(r.orderIndex),
  });
  return rows.map((r) => ({ ...r, waypoints: JSON.parse(r.waypoints) as Waypoint[] }));
}

export async function findPlannedRouteById(db: LiftrDb, userId: string, id: string) {
  const row = await db.query.plannedRoutes.findFirst({
    where: and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)),
  });
  if (!row) return undefined;
  return { ...row, waypoints: JSON.parse(row.waypoints) as Waypoint[] };
}

/** `planned_route_points` has no `user_id` of its own (child-via-parent, like `run_points`) —
 *  callers must already have resolved/authorized `routeId` via `findPlannedRouteById` first. */
export function findPlannedRoutePoints(db: LiftrDb, routeId: string) {
  return db.query.plannedRoutePoints.findMany({
    where: eq(plannedRoutePoints.routeId, routeId),
    orderBy: plannedRoutePoints.idx,
  });
}

export async function insertPlannedRoute(db: LiftrDb, userId: string, values: NewPlannedRoute) {
  const [route] = await db
    .insert(plannedRoutes)
    .values({ ...values, userId, waypoints: JSON.stringify(values.waypoints) })
    .returning();
  if (!route) throw new Error("planned route insert failed");
  return { ...route, waypoints: values.waypoints };
}

/** No-op on an empty array, mirrors insertRunPoints. */
export function insertPlannedRoutePoints(db: LiftrDb, routeId: string, points: RoutePoint[]) {
  if (points.length === 0) return Promise.resolve();
  return db.insert(plannedRoutePoints).values(points.map((p) => ({ ...p, routeId })));
}

export function deletePlannedRoutePoints(db: LiftrDb, routeId: string) {
  return db.delete(plannedRoutePoints).where(eq(plannedRoutePoints.routeId, routeId));
}

export function updatePlannedRouteMeta(
  db: LiftrDb,
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    orderIndex: number;
    waypoints: Waypoint[];
    distanceM: number;
    elevationGainM: number | null;
    geometrySource: "ors" | "straight";
    computedAt: Date;
  }>,
) {
  const { waypoints, ...rest } = patch;
  return db
    .update(plannedRoutes)
    .set({ ...rest, ...(waypoints ? { waypoints: JSON.stringify(waypoints) } : {}) })
    .where(and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)));
}

export function archivePlannedRoute(db: LiftrDb, userId: string, id: string) {
  return db
    .update(plannedRoutes)
    .set({ archivedAt: new Date() })
    .where(and(eq(plannedRoutes.userId, userId), eq(plannedRoutes.id, id)));
}
```

- [ ] **Step 2: Write repository tests**

Create `tests/server/repositories/plannedRouteRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, plannedRoutePoints, plannedRoutes, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import {
  archivePlannedRoute,
  findActivePlannedRoutes,
  findPlannedRouteById,
  findPlannedRoutePoints,
  insertPlannedRoute,
  insertPlannedRoutePoints,
  updatePlannedRouteMeta,
} from "~server/repositories/plannedRouteRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

function newRoute(overrides: Partial<Parameters<typeof insertPlannedRoute>[2]> = {}) {
  return insertPlannedRoute(db, OWNER_USER_ID, {
    name: "Tempelhof-Runde",
    orderIndex: 0,
    waypoints: [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }],
    distanceM: 500,
    elevationGainM: 10,
    geometrySource: "ors",
    computedAt: new Date(),
    ...overrides,
  });
}

describe("insertPlannedRoute / findPlannedRouteById", () => {
  it("round-trips waypoints through the JSON column", async () => {
    const route = await newRoute();

    const found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);

    expect(found?.waypoints).toEqual([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }]);
  });

  it("returns undefined for another user's route", async () => {
    const route = await newRoute();
    await db.insert(plannedRoutes).values({ userId: "other-user", name: "Other", waypoints: "[]", distanceM: 0, geometrySource: "straight", computedAt: new Date() });

    const found = await findPlannedRouteById(db, "other-user", route.id);

    expect(found).toBeUndefined();
  });
});

describe("findActivePlannedRoutes", () => {
  it("excludes archived routes and orders by orderIndex", async () => {
    const b = await newRoute({ name: "B", orderIndex: 1 });
    const a = await newRoute({ name: "A", orderIndex: 0 });
    const archived = await newRoute({ name: "Archived", orderIndex: 2 });
    await archivePlannedRoute(db, OWNER_USER_ID, archived.id);

    const result = await findActivePlannedRoutes(db, OWNER_USER_ID);

    expect(result.map((r) => r.id)).toEqual([a.id, b.id]);
  });
});

describe("insertPlannedRoutePoints / findPlannedRoutePoints / deletePlannedRoutePoints", () => {
  it("no-ops on an empty array", async () => {
    const route = await newRoute();
    await expect(insertPlannedRoutePoints(db, route.id, [])).resolves.not.toThrow();
    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });

  it("stores and orders points by idx, and cascades on route deletion", async () => {
    const route = await newRoute();
    await insertPlannedRoutePoints(db, route.id, [
      { idx: 1, lat: 52.474, lon: 13.403, ele: 41 },
      { idx: 0, lat: 52.4732, lon: 13.4021, ele: 40 },
    ]);

    const points = await findPlannedRoutePoints(db, route.id);
    expect(points.map((p) => p.idx)).toEqual([0, 1]);

    await deletePlannedRoutePoints(db, route.id);
    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });

  it("cascades on the DB's own onDelete when the parent route row is deleted directly", async () => {
    const route = await newRoute();
    await insertPlannedRoutePoints(db, route.id, [{ idx: 0, lat: 1, lon: 1, ele: null }]);

    await db.delete(plannedRoutes).where(eq(plannedRoutes.id, route.id));

    expect(await findPlannedRoutePoints(db, route.id)).toEqual([]);
  });
});

describe("updatePlannedRouteMeta", () => {
  it("updates only the provided fields, re-serializing waypoints when present", async () => {
    const route = await newRoute();

    await updatePlannedRouteMeta(db, OWNER_USER_ID, route.id, { name: "Renamed" });
    let found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);
    expect(found?.name).toBe("Renamed");
    expect(found?.waypoints).toEqual(route.waypoints); // untouched

    await updatePlannedRouteMeta(db, OWNER_USER_ID, route.id, { waypoints: [{ lat: 1, lon: 2 }] });
    found = await findPlannedRouteById(db, OWNER_USER_ID, route.id);
    expect(found?.waypoints).toEqual([{ lat: 1, lon: 2 }]);
  });
});

describe("archivePlannedRoute", () => {
  it("soft-deletes — the row survives with archivedAt set", async () => {
    const route = await newRoute();

    await archivePlannedRoute(db, OWNER_USER_ID, route.id);

    const row = await db.query.plannedRoutes.findFirst({ where: eq(plannedRoutes.id, route.id) });
    expect(row?.archivedAt).not.toBeNull();
  });
});
```

Import `eq` from `drizzle-orm` at the top of this file alongside the other imports (`import { eq } from "drizzle-orm";`) — the two tests above use it directly.

- [ ] **Step 3: Run repository tests, verify pass**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/repositories/plannedRouteRepository.test.ts`.
Expected: PASS. If it fails with "no such table: planned_routes", the Task 2 migration checkpoint was not actually resolved — stop and report BLOCKED, do not proceed.

- [ ] **Step 4: Write the service**

Create `packages/server/src/services/plannedRouteService.ts`:

```ts
import { pathDistanceM } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../env.js";
import { fetchOrsRoute, OrsUnavailableError } from "../lib/openRouteService.js";
import {
  insertPlannedRoute,
  insertPlannedRoutePoints,
  deletePlannedRoutePoints,
  updatePlannedRouteMeta,
  type RoutePoint,
  type Waypoint,
} from "../repositories/plannedRouteRepository.js";

export interface ComputedGeometry {
  points: RoutePoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: "ors" | "straight";
}

/** The one place every write path (create, update, preview) converges so ORS-vs-fallback can't
 *  drift between them — the line the preview endpoint shows is provably the line that gets saved. */
export async function computeGeometry(waypoints: Waypoint[], logger: FastifyBaseLogger): Promise<ComputedGeometry> {
  if (env.orsApiKey) {
    try {
      const result = await fetchOrsRoute(waypoints);
      return {
        points: result.coordinates.map((c, idx) => ({ idx, lat: c.lat, lon: c.lon, ele: c.ele ?? null })),
        distanceM: result.distanceM,
        elevationGainM: result.elevationGainM,
        geometrySource: "ors",
      };
    } catch (err) {
      if (!(err instanceof OrsUnavailableError)) throw err;
      logger.warn({ status: err.status }, "ORS unavailable, falling back to straight-line geometry");
    }
  }
  return {
    points: waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null })),
    distanceM: pathDistanceM(waypoints),
    elevationGainM: null,
    geometrySource: "straight",
  };
}

export async function previewPlannedRoute(waypoints: Waypoint[], logger: FastifyBaseLogger) {
  return computeGeometry(waypoints, logger);
}

export async function createPlannedRoute(
  db: LiftrDb,
  userId: string,
  input: { name: string; orderIndex: number; waypoints: Waypoint[] },
  logger: FastifyBaseLogger,
) {
  const geometry = await computeGeometry(input.waypoints, logger);
  const route = await insertPlannedRoute(db, userId, {
    name: input.name,
    orderIndex: input.orderIndex,
    waypoints: input.waypoints,
    distanceM: geometry.distanceM,
    elevationGainM: geometry.elevationGainM,
    geometrySource: geometry.geometrySource,
    computedAt: new Date(),
  });
  await insertPlannedRoutePoints(db, route.id, geometry.points);
  return { ...route, points: geometry.points };
}

/** Recomputes geometry + replaces points only when `waypoints` is present in the patch — mirrors
 *  routine PATCH only touching exercises when `body.exercises` is present, so a rename-only patch
 *  never calls ORS. Assumes the caller (the route handler) has already confirmed the route exists
 *  and belongs to `userId` — this function does not re-check. */
export async function updatePlannedRoute(
  db: LiftrDb,
  userId: string,
  id: string,
  patch: { name?: string; orderIndex?: number; waypoints?: Waypoint[] },
  logger: FastifyBaseLogger,
) {
  if (!patch.waypoints) {
    await updatePlannedRouteMeta(db, userId, id, { name: patch.name, orderIndex: patch.orderIndex });
    return;
  }
  const geometry = await computeGeometry(patch.waypoints, logger);
  await updatePlannedRouteMeta(db, userId, id, {
    name: patch.name,
    orderIndex: patch.orderIndex,
    waypoints: patch.waypoints,
    distanceM: geometry.distanceM,
    elevationGainM: geometry.elevationGainM,
    geometrySource: geometry.geometrySource,
    computedAt: new Date(),
  });
  await deletePlannedRoutePoints(db, id);
  await insertPlannedRoutePoints(db, id, geometry.points);
}
```

- [ ] **Step 5: Write service tests — this is the important test file in this task**

Create `tests/server/services/plannedRouteService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { findPlannedRoutePoints } from "~server/repositories/plannedRouteRepository.js";

vi.mock("~server/env.js", () => ({
  env: { orsApiKey: undefined as string | undefined, orsBaseUrl: "https://ors.test", orsProfile: "foot-walking" },
}));

import { env } from "~server/env.js";
import { computeGeometry, createPlannedRoute, updatePlannedRoute } from "~server/services/plannedRouteService.js";

const noopLogger = { warn: vi.fn() } as unknown as FastifyBaseLogger;
const waypoints = [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }];

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
  vi.stubGlobal("fetch", vi.fn());
  env.orsApiKey = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeGeometry", () => {
  it("skips fetch entirely and falls back to straight-line when the key is unset", async () => {
    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(fetch).not.toHaveBeenCalled();
    expect(geometry.geometrySource).toBe("straight");
    expect(geometry.elevationGainM).toBeNull();
    expect(geometry.distanceM).toBeGreaterThan(0);
    expect(geometry.points).toEqual([
      { idx: 0, lat: 52.4732, lon: 13.4021, ele: null },
      { idx: 1, lat: 52.475, lon: 13.405, ele: null },
    ]);
  });

  it("uses ORS's result when the key is set and the call succeeds", async () => {
    env.orsApiKey = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [[13.4021, 52.4732, 40], [13.405, 52.475, 45]] },
              properties: { summary: { distance: 6400 }, ascent: 5 },
            },
          ],
        }),
    } as Response);

    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(geometry.geometrySource).toBe("ors");
    expect(geometry.distanceM).toBe(6400);
    expect(geometry.elevationGainM).toBe(5);
    expect(geometry.points).toHaveLength(2);
  });

  it("falls back to straight-line and logs a warning when ORS responds with a non-2xx status", async () => {
    env.orsApiKey = "test-key";
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response);

    const geometry = await computeGeometry(waypoints, noopLogger);

    expect(geometry.geometrySource).toBe("straight");
    expect(noopLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }), expect.any(String));
  });
});

describe("createPlannedRoute", () => {
  it("persists the computed geometry's points alongside the route", async () => {
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Test", orderIndex: 0, waypoints }, noopLogger);

    expect(route.geometrySource).toBe("straight");
    const points = await findPlannedRoutePoints(db, route.id);
    expect(points).toHaveLength(2);
  });
});

describe("updatePlannedRoute", () => {
  it("does not call fetch on a rename-only patch (no waypoints in the patch)", async () => {
    env.orsApiKey = "test-key";
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Original", orderIndex: 0, waypoints }, noopLogger);
    vi.mocked(fetch).mockClear();

    await updatePlannedRoute(db, OWNER_USER_ID, route.id, { name: "Renamed" }, noopLogger);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("recomputes geometry and replaces points when waypoints change", async () => {
    const route = await createPlannedRoute(db, OWNER_USER_ID, { name: "Original", orderIndex: 0, waypoints }, noopLogger);
    const newWaypoints = [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.48, lon: 13.41 }, { lat: 52.49, lon: 13.42 }];

    await updatePlannedRoute(db, OWNER_USER_ID, route.id, { waypoints: newWaypoints }, noopLogger);

    const points = await findPlannedRoutePoints(db, route.id);
    expect(points).toHaveLength(3);
  });
});
```

- [ ] **Step 6: Run both test files, verify pass, then commit**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/services/plannedRouteService.test.ts tests/server/repositories/plannedRouteRepository.test.ts`.
Expected: PASS.

```bash
git add packages/server/src/repositories/plannedRouteRepository.ts packages/server/src/services/plannedRouteService.ts tests/server/repositories/plannedRouteRepository.test.ts tests/server/services/plannedRouteService.test.ts
git commit -m "feat(server): add plannedRoute repository + service with ORS/straight-line convergence"
```

---

### Task 5: `routes/plannedRoutes.ts` + `app.ts` registration

**Files:**
- Create: `packages/server/src/routes/plannedRoutes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `tests/server/routes/plannedRoutes.test.ts`

**Interfaces:**
- Consumes: `findPlannedRouteById`, `findPlannedRoutePoints`, `findActivePlannedRoutes`, `archivePlannedRoute` (Task 4 repository); `computeGeometry` → exposed as `previewPlannedRoute`, `createPlannedRoute`, `updatePlannedRoute` (Task 4 service); `NotFoundError` (existing).
- Produces: `registerPlannedRouteRoutes(app, db)`, registered in `app.ts`. Five endpoints: `GET /api/planned-routes`, `GET /api/planned-routes/:id`, `POST /api/planned-routes/preview`, `POST /api/planned-routes`, `PATCH /api/planned-routes/:id`, `DELETE /api/planned-routes/:id`.
- The 404-check-first pattern below matches `routes/routines.ts`'s PATCH/DELETE and `routes/runs.ts`'s GET `/:id`/DELETE exactly: the route handler calls the repository's `findPlannedRouteById` directly for the existence check, not a service wrapper.

- [ ] **Step 1: Write the route module**

Create `packages/server/src/routes/plannedRoutes.ts`:

```ts
import { z } from "zod";
import type { AppDb } from "../db.js";
import { NotFoundError } from "../lib/errors.js";
import {
  archivePlannedRoute,
  findActivePlannedRoutes,
  findPlannedRouteById,
  findPlannedRoutePoints,
} from "../repositories/plannedRouteRepository.js";
import { createPlannedRoute, previewPlannedRoute, updatePlannedRoute } from "../services/plannedRouteService.js";
import type { ZodFastifyInstance } from "../types.js";

const waypointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const waypointsSchema = z.array(waypointSchema).min(2).max(50);

const createInput = z.object({ name: z.string().min(1), orderIndex: z.number().int().default(0), waypoints: waypointsSchema });
const updateInput = z.object({
  name: z.string().min(1).optional(),
  orderIndex: z.number().int().optional(),
  waypoints: waypointsSchema.optional(),
});
const previewInput = z.object({ waypoints: waypointsSchema });
const routeIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });

const routePointResponse = z.object({ idx: z.number(), lat: z.number(), lon: z.number(), ele: z.number().nullable() });

const plannedRouteResponse = z.object({
  id: z.string(),
  name: z.string(),
  orderIndex: z.number(),
  waypoints: z.array(waypointSchema),
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  geometrySource: z.enum(["ors", "straight"]),
  computedAt: z.date(),
  createdAt: z.date(),
});

const previewResponse = z.object({
  points: z.array(routePointResponse),
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  geometrySource: z.enum(["ors", "straight"]),
});

export function registerPlannedRouteRoutes(app: ZodFastifyInstance, db: AppDb) {
  app.get("/api/planned-routes", { schema: { response: { 200: z.array(plannedRouteResponse) } } }, async (req) => {
    return findActivePlannedRoutes(db, req.userId);
  });

  app.get(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, response: { 200: plannedRouteResponse.extend({ points: z.array(routePointResponse) }) } } },
    async (req) => {
      const route = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!route) throw new NotFoundError();
      const points = await findPlannedRoutePoints(db, req.params.id);
      return { ...route, points };
    },
  );

  // Not persisted, no id — this is what makes the map show the real snapped line while editing,
  // via the exact same computeGeometry the create/update paths use, so it can't drift from them.
  app.post(
    "/api/planned-routes/preview",
    { schema: { body: previewInput, response: { 200: previewResponse } } },
    async (req) => {
      return previewPlannedRoute(req.body.waypoints, req.log);
    },
  );

  app.post(
    "/api/planned-routes",
    { schema: { body: createInput, response: { 201: plannedRouteResponse.extend({ points: z.array(routePointResponse) }) } } },
    async (req, reply) => {
      const route = await createPlannedRoute(db, req.userId, req.body, req.log);
      reply.code(201);
      return route;
    },
  );

  app.patch(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, body: updateInput, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!existing) throw new NotFoundError();
      await updatePlannedRoute(db, req.userId, req.params.id, req.body, req.log);
      return { ok: true as const };
    },
  );

  app.delete(
    "/api/planned-routes/:id",
    { schema: { params: routeIdParams, response: { 200: okResponse } } },
    async (req) => {
      const existing = await findPlannedRouteById(db, req.userId, req.params.id);
      if (!existing) throw new NotFoundError();
      await archivePlannedRoute(db, req.userId, req.params.id);
      return { ok: true as const };
    },
  );
}
```

- [ ] **Step 2: Register the routes in `app.ts`**

Add the import alongside the other route imports (alphabetically, after `registerPlannedRouteRoutes` would sort before `registerPrRoutes`):

```ts
import { registerPlannedRouteRoutes } from "./routes/plannedRoutes.js";
```

Add the registration call in `buildApp()` next to `registerRunRoutes(app, db);`:

```ts
  registerRunRoutes(app, db);
  registerPlannedRouteRoutes(app, db);
```

- [ ] **Step 3: Write route tests**

Create `tests/server/routes/plannedRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plannedRoutes } from "@liftr/db";
import { registerPlannedRouteRoutes } from "~server/routes/plannedRoutes.js";
import { createTestApp } from "../helpers/testApp.js";

function waypoints() {
  return [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.475, lon: 13.405 }];
}

describe("GET /api/planned-routes", () => {
  it("returns an empty array when there are no routes", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "GET", url: "/api/planned-routes" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("excludes a soft-archived route", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    await db.insert(plannedRoutes).values({
      name: "Archived",
      waypoints: JSON.stringify(waypoints()),
      distanceM: 100,
      geometrySource: "straight",
      computedAt: new Date(),
      archivedAt: new Date(),
    });

    const res = await app.inject({ method: "GET", url: "/api/planned-routes" });

    expect(res.json()).toEqual([]);
  });
});

describe("POST /api/planned-routes", () => {
  it("creates a route with straight-line geometry when ORS is unconfigured", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/planned-routes",
      payload: { name: "Tempelhof-Runde", waypoints: waypoints() },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ name: "Tempelhof-Runde", geometrySource: "straight" });
    expect(body.points.length).toBe(2);
  });

  it("rejects fewer than 2 waypoints with a 400, never persisting a row", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({
      method: "POST",
      url: "/api/planned-routes",
      payload: { name: "Too short", waypoints: [{ lat: 0, lon: 0 }] },
    });

    expect(res.statusCode).toBe(400);
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });

  it("rejects more than 50 waypoints with a 400", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ lat: 52 + i * 0.001, lon: 13 }));

    const res = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "x", waypoints: tooMany } });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/planned-routes/:id", () => {
  it("returns 404 for a route belonging to another user", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const [row] = await db
      .insert(plannedRoutes)
      .values({
        userId: "other-user",
        name: "Not mine",
        waypoints: JSON.stringify(waypoints()),
        distanceM: 100,
        geometrySource: "straight",
        computedAt: new Date(),
      })
      .returning();

    const res = await app.inject({ method: "GET", url: `/api/planned-routes/${row!.id}` });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/planned-routes/:id", () => {
  it("renames without recomputing geometry", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const created = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "Original", waypoints: waypoints() } });
    const id = created.json().id;

    const res = await app.inject({ method: "PATCH", url: `/api/planned-routes/${id}`, payload: { name: "Renamed" } });

    expect(res.statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/planned-routes/${id}` });
    expect(detail.json().name).toBe("Renamed");
  });

  it("returns 404 when patching a nonexistent id", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "PATCH", url: "/api/planned-routes/nonexistent", payload: { name: "x" } });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/planned-routes/:id", () => {
  it("soft-archives — the route disappears from the list", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);
    const created = await app.inject({ method: "POST", url: "/api/planned-routes", payload: { name: "Original", waypoints: waypoints() } });
    const id = created.json().id;

    const res = await app.inject({ method: "DELETE", url: `/api/planned-routes/${id}` });

    expect(res.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });
});

describe("POST /api/planned-routes/preview", () => {
  it("returns computed stats without persisting anything", async () => {
    const { app, db } = createTestApp();
    registerPlannedRouteRoutes(app, db);

    const res = await app.inject({ method: "POST", url: "/api/planned-routes/preview", payload: { waypoints: waypoints() } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ geometrySource: "straight" });
    const list = await app.inject({ method: "GET", url: "/api/planned-routes" });
    expect(list.json()).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests, verify pass, then commit**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/plannedRoutes.test.ts`.
Expected: PASS. Also run `pnpm --filter @liftr/server exec tsc --noEmit` to confirm `app.ts` still compiles.

```bash
git add packages/server/src/routes/plannedRoutes.ts packages/server/src/app.ts tests/server/routes/plannedRoutes.test.ts
git commit -m "feat(server): register planned-route CRUD + preview endpoints"
```

---

### Task 6: Run-logging handoff — `runs.ts` / `runImportService.ts` / `runRepository.ts`

**Files:**
- Modify: `packages/server/src/routes/runs.ts`
- Modify: `packages/server/src/services/runImportService.ts`
- Modify: `packages/server/src/repositories/runRepository.ts`
- Modify (extend): `tests/server/routes/runs.test.ts`

**Interfaces:**
- Consumes: `findPlannedRouteById` (Task 4).
- Produces: `manualRunInput` gains `plannedRouteId`/`elevationGainM`; `runResponse` gains `plannedRouteId` (a serializer schema — a field missing here is silently stripped from every `GET /api/runs` response, so this is easy to miss); `logManualRun`'s input type and `NewRun` gain the same two/one fields.

- [ ] **Step 1: `runRepository.ts` — add the field to `NewRun`**

In `packages/server/src/repositories/runRepository.ts`, add to the `NewRun` interface (after `elevationGainM?: number | null;`):

```ts
  plannedRouteId?: string | null;
```

No other change needed in this file — `insertRun`'s `{ ...values, userId }` spread already passes it through, and the schema column exists from Task 2.

- [ ] **Step 2: `runImportService.ts` — resolve and default from the route**

Add the import at the top: `import { findPlannedRouteById } from "../repositories/plannedRouteRepository.js";` and `import { NotFoundError } from "../lib/errors.js";`. Change `logManualRun` to:

```ts
/** POST /api/runs — manual fallback for runs without a file. */
export async function logManualRun(
  db: LiftrDb,
  userId: string,
  input: {
    name: string | null;
    startedAt: Date;
    distanceM: number;
    durationS: number;
    plannedRouteId?: string | null;
    elevationGainM?: number | null;
  },
) {
  let elevationGainM = input.elevationGainM ?? null;
  if (input.plannedRouteId) {
    const route = await findPlannedRouteById(db, userId, input.plannedRouteId);
    if (!route) throw new NotFoundError(); // prevents a cross-user FK write
    if (elevationGainM == null) elevationGainM = route.elevationGainM;
  }

  return persistRun(
    db,
    userId,
    {
      source: "manual",
      name: input.name,
      startedAt: input.startedAt,
      clientId: crypto.randomUUID(),
      distanceM: input.distanceM, // always from the body — adjusting the real result is the point
      durationS: input.durationS,
      avgPaceSPerKm: input.distanceM > 0 ? input.durationS / (input.distanceM / 1000) : null,
      elevationGainM,
      plannedRouteId: input.plannedRouteId ?? null,
    },
    [],
  );
}
```

- [ ] **Step 3: `runs.ts` — extend the input/response schemas and the handler**

Change `manualRunInput` to:

```ts
const manualRunInput = z.object({
  name: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  distanceM: z.number().positive(),
  durationS: z.number().positive(),
  plannedRouteId: z.string().nullable().optional(),
  elevationGainM: z.number().nullable().optional(),
});
```

Add one field to `runResponse` (after `elevationGainM: z.number().nullable(),`):

```ts
  plannedRouteId: z.string().nullable(),
```

Change the `POST /api/runs` handler body to:

```ts
    const run = await logManualRun(db, req.userId, {
      name: req.body.name ?? null,
      startedAt: req.body.startedAt,
      distanceM: req.body.distanceM,
      durationS: req.body.durationS,
      plannedRouteId: req.body.plannedRouteId ?? null,
      elevationGainM: req.body.elevationGainM ?? null,
    });
```

- [ ] **Step 4: Extend route tests**

Append to `tests/server/routes/runs.test.ts` (import `plannedRoutes` from `@liftr/db` alongside whatever it already imports):

```ts
describe("POST /api/runs — planned route handoff", () => {
  it("defaults elevationGainM from the route and stores plannedRouteId", async () => {
    const { app, db } = createTestApp();
    registerRunRoutes(app, db);
    const [route] = await db
      .insert(plannedRoutes)
      .values({
        name: "Tempelhof-Runde",
        waypoints: "[]",
        distanceM: 6400,
        elevationGainM: 34,
        geometrySource: "ors",
        computedAt: new Date(),
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { startedAt: new Date().toISOString(), distanceM: 6500, durationS: 1800, plannedRouteId: route!.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.plannedRouteId).toBe(route!.id);
    expect(body.elevationGainM).toBe(34);
  });

  it("rejects a plannedRouteId belonging to another user with 404", async () => {
    const { app, db } = createTestApp();
    registerRunRoutes(app, db);
    const [route] = await db
      .insert(plannedRoutes)
      .values({
        userId: "other-user",
        name: "Not mine",
        waypoints: "[]",
        distanceM: 100,
        geometrySource: "straight",
        computedAt: new Date(),
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { startedAt: new Date().toISOString(), distanceM: 100, durationS: 60, plannedRouteId: route!.id },
    });

    expect(res.statusCode).toBe(404);
  });

  it("keeps plannedRouteId null for a run logged without one — GET /api/runs still serializes the field", async () => {
    const { app, db } = createTestApp();
    registerRunRoutes(app, db);

    await app.inject({ method: "POST", url: "/api/runs", payload: { startedAt: new Date().toISOString(), distanceM: 5000, durationS: 1500 } });
    const list = await app.inject({ method: "GET", url: "/api/runs" });

    expect(list.json()[0].plannedRouteId).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests, verify pass, then commit**

Run: `pnpm --filter @liftr/server exec vitest run tests/server/routes/runs.test.ts`.
Expected: PASS.

```bash
git add packages/server/src/routes/runs.ts packages/server/src/services/runImportService.ts packages/server/src/repositories/runRepository.ts tests/server/routes/runs.test.ts
git commit -m "feat(server): thread plannedRouteId through manual run logging"
```

---

### Task 7: Seed data — `scripts/seed-mock-data.ts`

**Files:**
- Modify: `scripts/seed-mock-data.ts`
- Modify: `CLAUDE.md` (the "Before doing any dev/manual-testing work" section's description of what gets seeded)
- Modify: `docs/guides/local-development.md` ("Isolated dev sessions & mock data" section)

**Interfaces:**
- Consumes: `insertPlannedRoute`, `insertPlannedRoutePoints` (Task 4 repository — writes directly, **never** calls ORS, since this script must work fully offline); `pathDistanceM` (Task 1).

- [ ] **Step 1: Add `seedPlannedRoutes`**

Add the import: `import { insertPlannedRoute, insertPlannedRoutePoints } from "../packages/server/src/repositories/plannedRouteRepository.js";` and `import { pathDistanceM } from "../packages/shared/src/index.js";` (match whatever import specifier the file already uses for `@liftr/shared` equivalents — if the script imports workspace packages by their package name elsewhere, use `import { pathDistanceM } from "@liftr/shared";` instead, consistent with the rest of the file).

Add this function, placed after `seedRoutines` and before `seedWorkoutHistory` (or anywhere before `main()` calls it):

```ts
/** Two routes writing straight through plannedRouteRepository — must NEVER call ORS (this script
 *  has to work fully offline, same as its existing image-fetch step already treats network as
 *  optional). Reuses seedGpsRun's 52.4732/13.4021 Tempelhof coordinates so the mock data reads as
 *  one person's neighborhood. Returns the "ors" route's id so the manual run below can link to it. */
async function seedPlannedRoutes(db: LiftrDb): Promise<string> {
  const waypointCount = 8;
  const waypoints = Array.from({ length: waypointCount }, (_, i) => {
    const angle = (i / waypointCount) * 2 * Math.PI;
    return { lat: 52.4732 + Math.sin(angle) * 0.004, lon: 13.4021 + Math.cos(angle) * 0.006 };
  });
  const orsRoute = await insertPlannedRoute(db, USER_ID, {
    name: "Tempelhof-Runde",
    orderIndex: 0,
    waypoints,
    distanceM: 6400,
    elevationGainM: 34,
    geometrySource: "ors",
    computedAt: new Date(),
  });
  await insertPlannedRoutePoints(
    db,
    orsRoute.id,
    waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: 40 + Math.sin(idx) * 3 })),
  );

  // A second route covers what the feature *can't* show — no ORS key, so a real straight-line
  // fallback, same reasoning that already put a manual run alongside the GPS run in this script.
  const parkweg = [{ lat: 52.4732, lon: 13.4021 }, { lat: 52.478, lon: 13.4021 }, { lat: 52.478, lon: 13.409 }];
  const straightRoute = await insertPlannedRoute(db, USER_ID, {
    name: "Parkweg (ungeprüft)",
    orderIndex: 1,
    waypoints: parkweg,
    distanceM: pathDistanceM(parkweg),
    elevationGainM: null,
    geometrySource: "straight",
    computedAt: new Date(),
  });
  await insertPlannedRoutePoints(db, straightRoute.id, parkweg.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null })));

  console.log("  2 planned routes seeded (Tempelhof-Runde: ors, Parkweg: straight-line fallback).");
  return orsRoute.id;
}
```

- [ ] **Step 2: Link the existing manual run to the "ors" route**

Change `seedManualRun`'s signature to accept the route id and pass it through:

```ts
async function seedManualRun(db: LiftrDb, plannedRouteId: string) {
  const startedAt = daysAgo(3, 6, 45);
  const distanceM = 8000;
  const durationS = 2460; // 41 min

  await insertRun(db, USER_ID, {
    source: "manual",
    name: null,
    startedAt,
    clientId: randomUUID(),
    distanceM,
    durationS,
    avgPaceSPerKm: durationS / (distanceM / 1000),
    plannedRouteId,
  });
  console.log(`  Manual run seeded (${(distanceM / 1000).toFixed(1)} km, no GPS points) linked to planned route ${plannedRouteId}.`);
}
```

- [ ] **Step 3: Wire it into `main()`**

Change:

```ts
  console.log("[seed] runs (GPS + manual entry)...");
  await seedGpsRun(db);
  await seedManualRun(db);
```

to:

```ts
  console.log("[seed] planned routes...");
  const plannedRouteId = await seedPlannedRoutes(db);

  console.log("[seed] runs (GPS + manual entry)...");
  await seedGpsRun(db);
  await seedManualRun(db, plannedRouteId);
```

- [ ] **Step 4: Update the module docblock + docs**

In `scripts/seed-mock-data.ts`'s top-of-file docblock, add a sentence after the existing runs bullet noting two planned routes are also seeded (one `ors`, one `straight`), and that the manual run is linked to the first via `plannedRouteId`. Apply the equivalent update to `CLAUDE.md`'s "Before doing any dev/manual-testing work" paragraph (it currently enumerates "two finished runs" — extend it to mention "plus two planned routes (Tempelhof-Runde with full ORS-style geometry, a second left as an unresolved straight-line fallback), with the manual run linked back to the first") and to `docs/guides/local-development.md`'s "Isolated dev sessions & mock data" section, which restates the same list.

- [ ] **Step 5: Run a real `dev-up.mjs` session and verify**

Run: `node scripts/dev-up.mjs --id planned-routes-seed-check` (no `LIFTR_ORS_API_KEY` needed for this check). Confirm the console output includes the "2 planned routes seeded" and "linked to planned route" lines with no errors, then `curl` (or use the printed backend URL) `GET /api/planned-routes` and confirm two rows come back. Then run `node scripts/dev-down.mjs --id planned-routes-seed-check` to clean up — do not leave this session running.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-mock-data.ts CLAUDE.md docs/guides/local-development.md
git commit -m "feat(seed): seed two planned routes and link the manual run to one"
```

---

### Task 8: Client service + store — `plannedRouteService.ts`, `plannedRouteStore.ts`, `api.ts` widening

**Files:**
- Create: `packages/client/src/services/plannedRouteService.ts`
- Create: `packages/client/src/stores/plannedRouteStore.ts`
- Modify: `packages/client/src/lib/api.ts`
- Test: `tests/client/services/plannedRouteService.test.ts`
- Test: `tests/client/stores/plannedRouteStore.test.ts`

**Interfaces:**
- Produces: `api.post<T>(path, body, init?: RequestInit)` (widened — `init` passes through, letting a caller supply `signal` for cancellation). `PlannedRoute`, `PlannedRouteDetail`, `RoutePreview`, `Waypoint`, `RoutePoint` types and `getPlannedRoutes`/`getPlannedRouteDetail`/`previewPlannedRoute`/`createPlannedRoute`/`updatePlannedRoute`/`deletePlannedRoute` from the service; `usePlannedRouteStore` (Pinia option store: `routes`, `loaded`, `error`, `byId`, `load`/`create`/`update`/`remove`). Consumed by Task 9's `RouteMapEditor.vue`/`RouteWizard.vue` (preview + create/update) and Task 10's `RouteList.vue`.

- [ ] **Step 1: Widen `api.post`**

In `packages/client/src/lib/api.ts`, change the `post` entry in the exported `api` object from:

```ts
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
```

to:

```ts
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),
```

(`method`/`body` after the `...init` spread so a caller-supplied `init` can never override them — only fields like `signal` pass through.)

- [ ] **Step 2: Write the client service**

Create `packages/client/src/services/plannedRouteService.ts`:

```ts
import { api } from "../lib/api";

export interface Waypoint {
  lat: number;
  lon: number;
}

export interface RoutePoint {
  idx: number;
  lat: number;
  lon: number;
  ele: number | null;
}

export type GeometrySource = "ors" | "straight";

export interface PlannedRoute {
  id: string;
  name: string;
  orderIndex: number;
  waypoints: Waypoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: GeometrySource;
  computedAt: string;
  createdAt: string;
}

export interface PlannedRouteDetail extends PlannedRoute {
  points: RoutePoint[];
}

export interface RoutePreview {
  points: RoutePoint[];
  distanceM: number;
  elevationGainM: number | null;
  geometrySource: GeometrySource;
}

export function getPlannedRoutes(): Promise<PlannedRoute[]> {
  return api.get<PlannedRoute[]>("/api/planned-routes");
}

export function getPlannedRouteDetail(id: string): Promise<PlannedRouteDetail> {
  return api.get<PlannedRouteDetail>(`/api/planned-routes/${id}`);
}

export function previewPlannedRoute(waypoints: Waypoint[], signal?: AbortSignal): Promise<RoutePreview> {
  return api.post<RoutePreview>("/api/planned-routes/preview", { waypoints }, signal ? { signal } : undefined);
}

export function createPlannedRoute(name: string, waypoints: Waypoint[]): Promise<PlannedRouteDetail> {
  return api.post<PlannedRouteDetail>("/api/planned-routes", { name, waypoints });
}

export function updatePlannedRoute(
  id: string,
  payload: { name?: string; waypoints?: Waypoint[]; orderIndex?: number },
): Promise<void> {
  return api.patch(`/api/planned-routes/${id}`, payload);
}

export function deletePlannedRoute(id: string): Promise<void> {
  return api.del(`/api/planned-routes/${id}`);
}
```

- [ ] **Step 3: Write the Pinia store**

Create `packages/client/src/stores/plannedRouteStore.ts`:

```ts
import { defineStore } from "pinia";
import {
  createPlannedRoute,
  deletePlannedRoute,
  getPlannedRoutes,
  updatePlannedRoute,
  type PlannedRoute,
  type Waypoint,
} from "../services/plannedRouteService";

export const usePlannedRouteStore = defineStore("plannedRoute", {
  state: () => ({
    routes: [] as PlannedRoute[],
    loaded: false,
    error: false,
  }),
  getters: {
    byId: (state) => (id: string) => state.routes.find((r) => r.id === id),
  },
  actions: {
    async load() {
      try {
        this.routes = await getPlannedRoutes();
        this.loaded = true;
        this.error = false;
      } catch {
        this.error = true;
      }
    },
    async create(name: string, waypoints: Waypoint[]) {
      const route = await createPlannedRoute(name, waypoints);
      await this.load();
      return route;
    },
    async update(id: string, payload: { name?: string; waypoints?: Waypoint[] }) {
      await updatePlannedRoute(id, payload);
      await this.load();
    },
    async remove(id: string) {
      await deletePlannedRoute(id);
      this.routes = this.routes.filter((r) => r.id !== id);
    },
  },
});
```

- [ ] **Step 4: Write service tests**

Create `tests/client/services/plannedRouteService.test.ts`, mocking `~client/lib/api` exactly like `tests/client/services/runService.test.ts` does:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import { api } from "~client/lib/api";
import { createPlannedRoute, deletePlannedRoute, getPlannedRoutes, previewPlannedRoute, updatePlannedRoute } from "~client/services/plannedRouteService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);
const mockDel = vi.mocked(api.del);

beforeEach(() => vi.clearAllMocks());

describe("getPlannedRoutes", () => {
  it("GETs the list endpoint", async () => {
    mockGet.mockResolvedValue([]);
    await getPlannedRoutes();
    expect(mockGet).toHaveBeenCalledWith("/api/planned-routes");
  });
});

describe("previewPlannedRoute", () => {
  it("passes an AbortSignal through to api.post when given one", async () => {
    mockPost.mockResolvedValue({ points: [], distanceM: 0, elevationGainM: null, geometrySource: "straight" });
    const controller = new AbortController();

    await previewPlannedRoute([{ lat: 1, lon: 2 }], controller.signal);

    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes/preview", { waypoints: [{ lat: 1, lon: 2 }] }, { signal: controller.signal });
  });

  it("omits the init argument when no signal is given", async () => {
    mockPost.mockResolvedValue({ points: [], distanceM: 0, elevationGainM: null, geometrySource: "straight" });

    await previewPlannedRoute([{ lat: 1, lon: 2 }]);

    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes/preview", { waypoints: [{ lat: 1, lon: 2 }] }, undefined);
  });
});

describe("createPlannedRoute / updatePlannedRoute / deletePlannedRoute", () => {
  it("POSTs name + waypoints to create", async () => {
    mockPost.mockResolvedValue({ id: "r1" });
    await createPlannedRoute("Test", [{ lat: 1, lon: 2 }]);
    expect(mockPost).toHaveBeenCalledWith("/api/planned-routes", { name: "Test", waypoints: [{ lat: 1, lon: 2 }] });
  });

  it("PATCHes only the given fields", async () => {
    mockPatch.mockResolvedValue(undefined);
    await updatePlannedRoute("r1", { name: "Renamed" });
    expect(mockPatch).toHaveBeenCalledWith("/api/planned-routes/r1", { name: "Renamed" });
  });

  it("DELETEs by id", async () => {
    mockDel.mockResolvedValue(undefined);
    await deletePlannedRoute("r1");
    expect(mockDel).toHaveBeenCalledWith("/api/planned-routes/r1");
  });
});
```

- [ ] **Step 5: Write store tests**

Create `tests/client/stores/plannedRouteStore.test.ts`:

```ts
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/services/plannedRouteService", () => ({
  getPlannedRoutes: vi.fn(),
  createPlannedRoute: vi.fn(),
  updatePlannedRoute: vi.fn(),
  deletePlannedRoute: vi.fn(),
}));

import { createPlannedRoute, deletePlannedRoute, getPlannedRoutes } from "~client/services/plannedRouteService";
import { usePlannedRouteStore } from "~client/stores/plannedRouteStore";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("usePlannedRouteStore", () => {
  it("load() populates routes and flips loaded on success", async () => {
    vi.mocked(getPlannedRoutes).mockResolvedValue([{ id: "r1" } as never]);
    const store = usePlannedRouteStore();

    await store.load();

    expect(store.routes).toEqual([{ id: "r1" }]);
    expect(store.loaded).toBe(true);
    expect(store.error).toBe(false);
  });

  it("load() sets error on failure without throwing", async () => {
    vi.mocked(getPlannedRoutes).mockRejectedValue(new Error("network"));
    const store = usePlannedRouteStore();

    await store.load();

    expect(store.error).toBe(true);
  });

  it("create() reloads the list after creating", async () => {
    vi.mocked(createPlannedRoute).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getPlannedRoutes).mockResolvedValue([{ id: "r1" } as never]);
    const store = usePlannedRouteStore();

    await store.create("Test", [{ lat: 1, lon: 2 }]);

    expect(getPlannedRoutes).toHaveBeenCalled();
    expect(store.routes).toEqual([{ id: "r1" }]);
  });

  it("remove() splices locally without a reload", async () => {
    const store = usePlannedRouteStore();
    store.routes = [{ id: "r1" } as never, { id: "r2" } as never];
    vi.mocked(deletePlannedRoute).mockResolvedValue(undefined);

    await store.remove("r1");

    expect(store.routes).toEqual([{ id: "r2" }]);
    expect(getPlannedRoutes).not.toHaveBeenCalled();
  });

  it("byId finds a loaded route by id", async () => {
    const store = usePlannedRouteStore();
    store.routes = [{ id: "r1", name: "Test" } as never];

    expect(store.byId("r1")).toEqual({ id: "r1", name: "Test" });
    expect(store.byId("missing")).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run tests, verify pass, then commit**

Run: `pnpm --filter @liftr/client exec vitest run tests/client/services/plannedRouteService.test.ts tests/client/stores/plannedRouteStore.test.ts`. Also run the existing `tests/client/lib/api.test.ts` to confirm the `api.post` widening didn't break its existing assertions.
Expected: PASS.

```bash
git add packages/client/src/services/plannedRouteService.ts packages/client/src/stores/plannedRouteStore.ts packages/client/src/lib/api.ts tests/client/services/plannedRouteService.test.ts tests/client/stores/plannedRouteStore.test.ts
git commit -m "feat(client): add plannedRoute service + store, widen api.post for AbortSignal"
```

---

### Task 9: `leafletTheme.ts` extraction + `RouteMapEditor.vue`

**Files:**
- Create: `packages/client/src/lib/leafletTheme.ts`
- Modify: `packages/client/src/components/run/RunMap.vue`
- Create: `packages/client/src/components/route/RouteMapEditor.vue`
- Test: `tests/client/components/RouteMapEditor.test.ts`

**Interfaces:**
- Produces: `cssVar(name, fallback): string`, `createOsmTileLayer(): L.TileLayer` from `packages/client/src/lib/leafletTheme.ts`. `RouteMapEditor.vue` — props `{ waypoints: Waypoint[]; routedPoints: RoutePoint[]; approximate?: boolean; initialCenter?: {lat:number;lon:number}; readonly?: boolean }`, emits `add: [Waypoint]`, `move: [index: number, Waypoint]`, `remove: [index: number]`. Consumed by Task 10's `RouteWizard.vue`.
- `Leaflet itself can't really initialize under jsdom` — the test in Step 4 verifies the emit contract against a stubbed `L`, not real rendering (mirrors the plan's own testing note).

- [ ] **Step 1: Extract `leafletTheme.ts`**

Create `packages/client/src/lib/leafletTheme.ts`:

```ts
/**
 * Shared Leaflet setup for every map in the app: reading design tokens as CSS custom properties,
 * and the OSM tile layer. Single-user, low-volume interactive viewing is within OSM's tile usage
 * policy — no bulk prefetch, attribution shown; that reasoning lives here once, not copy-pasted
 * into every map component.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function createOsmTileLayer(): L.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  });
}
```

- [ ] **Step 2: Refactor `RunMap.vue` to use it**

In `packages/client/src/components/run/RunMap.vue`: remove the local `cssVar` function definition (lines 21–25 in the current file) and the side-effect import `import "leaflet/dist/leaflet.css";` (line 10 — the CSS now loads once via `leafletTheme.ts`, an ES module side effect runs only once regardless of how many files import it). Keep `import L from "leaflet";` (still needed for `L.polyline`/`L.circleMarker`). Add:

```ts
import { cssVar, createOsmTileLayer } from "../../lib/leafletTheme";
```

Replace the inline tile-layer construction in `onMounted`:

```ts
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  });
```

with:

```ts
  const osm = createOsmTileLayer();
```

Everything else in `RunMap.vue` (the module doc comment about OSM's usage policy, `render()`, `setMarkerPosition`, `defineExpose`) stays unchanged. Run `pnpm --filter @liftr/client exec vitest run` for any existing `RunMap`-adjacent test (there may be none — check `tests/client/components/` for a `RunMap.test.ts`; if it exists, it must still pass unmodified) to confirm the refactor didn't change behavior.

- [ ] **Step 3: Write `RouteMapEditor.vue`**

Create `packages/client/src/components/route/RouteMapEditor.vue`:

```vue
<script setup lang="ts">
/**
 * Tap-to-place / drag-to-reposition waypoint editor. A new sibling to RunMap.vue (not an
 * extension of it) — RunMap is view-only and hosts a deliberately-imperative replay fast-path;
 * this component's whole job is click/drag interaction, a genuinely different concern.
 */
import L from "leaflet";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cssVar, createOsmTileLayer } from "../../lib/leafletTheme";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { RoutePoint, Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{
  waypoints: Waypoint[];
  routedPoints: RoutePoint[];
  approximate?: boolean;
  initialCenter?: { lat: number; lon: number };
  readonly?: boolean;
}>();

const emit = defineEmits<{
  add: [waypoint: Waypoint];
  move: [index: number, waypoint: Waypoint];
  remove: [index: number];
}>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let markers: L.Marker[] = [];
let line: L.Polyline | null = null;

const removeConfirm = useConfirmTap((key) => emit("remove", Number(key)));

function renderMarkers() {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = props.waypoints.map((w, i) => {
    const confirming = removeConfirm.isArmed(String(i));
    const icon = L.divIcon({
      className: "route-waypoint-icon",
      html: `<span class="${confirming ? "confirming" : ""}">${confirming ? "×" : i + 1}</span>`,
      iconSize: [28, 28],
    });
    const marker = L.marker([w.lat, w.lon], { draggable: !props.readonly, icon });
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      emit("move", i, { lat: pos.lat, lon: pos.lng });
    });
    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (props.readonly) return;
      removeConfirm.trigger(String(i));
    });
    marker.addTo(map!);
    return marker;
  });
}

function renderLine() {
  if (!map) return;
  line?.remove();
  const source =
    props.routedPoints.length > 0
      ? props.routedPoints
      : props.waypoints.map((w, idx) => ({ idx, lat: w.lat, lon: w.lon, ele: null }));
  if (source.length < 2) return;
  line = L.polyline(
    source.map((p) => [p.lat, p.lon] as [number, number]),
    {
      color: cssVar("--fire", "#ff7a1f"),
      weight: 4,
      opacity: props.approximate ? 0.6 : 0.9,
      dashArray: props.approximate ? "6 8" : undefined,
    },
  );
  line.addTo(map);
}

function locate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => map?.setView([pos.coords.latitude, pos.coords.longitude], 15),
    () => {}, // denied/unavailable — the parent's initialCenter fallback already covers this
    { enableHighAccuracy: false, timeout: 5000 },
  );
}

onMounted(() => {
  if (!container.value) return;
  const center = props.waypoints[0] ?? props.initialCenter ?? { lat: 52.52, lon: 13.405 };
  map = L.map(container.value, { attributionControl: true, zoomControl: true }).setView([center.lat, center.lon], 14);
  createOsmTileLayer().addTo(map);
  map.on("click", (e: L.LeafletMouseEvent) => {
    if (props.readonly) return;
    emit("add", { lat: e.latlng.lat, lon: e.latlng.lng });
  });
  requestAnimationFrame(() => map?.invalidateSize());
  renderMarkers();
  renderLine();
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

watch(() => props.waypoints, () => { renderMarkers(); renderLine(); }, { deep: true });
watch(() => [props.routedPoints, props.approximate], renderLine, { deep: true });
watch(removeConfirm.armedKey, renderMarkers);

defineExpose({ invalidateSize: () => map?.invalidateSize() });
</script>

<template>
  <div class="route-map-editor">
    <div ref="container" class="map-surface" />
    <button v-if="!readonly" type="button" class="locate-btn" aria-label="Meinen Standort verwenden" @click="locate">
      📍
    </button>
    <button
      v-if="!readonly && waypoints.length > 0"
      type="button"
      class="remove-last-btn"
      @click="emit('remove', waypoints.length - 1)"
    >
      Letzten Punkt entfernen
    </button>
  </div>
</template>

<style scoped>
.route-map-editor {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.map-surface {
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  background: var(--bg);
}
.locate-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 20px;
}
.remove-last-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 1000;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
</style>
```

The `invalidateSize` exposed method is for the hosting `SheetModal`'s `did-present` callback in Task 10 — a map initialized inside a still-animating `IonModal` renders a grey box otherwise, the same reason `RunMap.vue`'s replay flow already schedules its own post-mount work carefully.

- [ ] **Step 4: Write the emit-contract test against a stubbed `L`**

Leaflet cannot really initialize under jsdom, so this test stubs the `leaflet` module entirely and asserts the click/drag handlers call `emit` with the right shape — it does not render real markers. Create `tests/client/components/RouteMapEditor.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { clickHandler: null as ((e: unknown) => void) | null };

vi.mock("leaflet", () => {
  const fakeMap = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: (e: unknown) => void) => {
      if (event === "click") state.clickHandler = handler;
    }),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
  };
  const fakeMarker = { on: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), getLatLng: vi.fn(() => ({ lat: 1, lng: 2 })) };
  const fakeLine = { addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
  return {
    default: {
      map: vi.fn(() => fakeMap),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      marker: vi.fn(() => fakeMarker),
      polyline: vi.fn(() => fakeLine),
      divIcon: vi.fn(() => ({})),
      DomEvent: { stopPropagation: vi.fn() },
    },
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import RouteMapEditor from "~client/components/route/RouteMapEditor.vue";

beforeEach(() => {
  state.clickHandler = null;
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());
});

describe("RouteMapEditor", () => {
  it("emits add with {lat,lon} from a map click", async () => {
    const wrapper = mount(RouteMapEditor, { props: { waypoints: [], routedPoints: [] } });
    await wrapper.vm.$nextTick();

    state.clickHandler?.({ latlng: { lat: 52.5, lng: 13.4 } });

    expect(wrapper.emitted("add")).toEqual([[{ lat: 52.5, lon: 13.4 }]]);
  });

  it("does not emit add when readonly", async () => {
    const wrapper = mount(RouteMapEditor, { props: { waypoints: [], routedPoints: [], readonly: true } });
    await wrapper.vm.$nextTick();

    state.clickHandler?.({ latlng: { lat: 52.5, lng: 13.4 } });

    expect(wrapper.emitted("add")).toBeUndefined();
  });

  it("emits remove with the last index from the 'Letzten Punkt entfernen' button", async () => {
    const wrapper = mount(RouteMapEditor, {
      props: { waypoints: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], routedPoints: [] },
    });
    await wrapper.vm.$nextTick();

    await wrapper.find(".remove-last-btn").trigger("click");

    expect(wrapper.emitted("remove")).toEqual([[1]]);
  });
});
```

- [ ] **Step 5: Run tests, verify pass, then commit**

Run: `pnpm --filter @liftr/client exec vitest run tests/client/components/RouteMapEditor.test.ts`.
Expected: PASS.

```bash
git add packages/client/src/lib/leafletTheme.ts packages/client/src/components/run/RunMap.vue packages/client/src/components/route/RouteMapEditor.vue tests/client/components/RouteMapEditor.test.ts
git commit -m "feat(client): extract leafletTheme, add RouteMapEditor for waypoint placement"
```

Run the **mobile-viewport-check** skill on this component before moving to Task 10 — it's the largest piece of new mobile UI in this plan (full-height Leaflet map inside a modal, 44px touch targets on draggable markers).

---

### Task 10: `RouteWizard.vue` — the creation/edit sheet

**Files:**
- Create: `packages/client/src/components/route-wizard/RouteWizard.vue`

**Interfaces:**
- Consumes: `SheetModal.vue` (existing, reused as-is — `dismiss()` via `defineExpose`, `@close` on real Ionic `did-dismiss`), `useConfirmTap` (existing), `useToast` (existing), `usePlannedRouteStore` (Task 8), `RouteMapEditor` (Task 9), `pathDistanceM` (Task 1), `previewPlannedRoute` (Task 8 service).
- Produces: props `{ route?: PlannedRoute | null; initialCenter?: {lat:number;lon:number} }`, emits `saved: []`. Consumed by Task 11's `RunsPage.vue`.
- No multi-step machine — a route needs one screen: pinned header (close + name input) → map filling the remaining height → pinned bottom bar with live stats + "Speichern", per the architecture doc's own conclusion.

- [ ] **Step 1: Write the component**

Create `packages/client/src/components/route-wizard/RouteWizard.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { pathDistanceM } from "@liftr/shared";
import SheetModal from "../ui/SheetModal.vue";
import RouteMapEditor from "../route/RouteMapEditor.vue";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useToast } from "../../composables/useToast";
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { previewPlannedRoute, type PlannedRoute, type RoutePoint, type Waypoint } from "../../services/plannedRouteService";

const props = defineProps<{ route?: PlannedRoute | null; initialCenter?: { lat: number; lon: number } }>();
const emit = defineEmits<{ saved: [] }>();

const plannedRouteStore = usePlannedRouteStore();
const { toast } = useToast();

const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);
const name = ref("");
const waypoints = ref<Waypoint[]>([]);
const routedPoints = ref<RoutePoint[]>([]);
const geometrySource = ref<"ors" | "straight">("straight");
const lastComputedDistanceM = ref(0);
const elevationGainM = ref<number | null>(null);
const saving = ref(false);

const distanceM = computed(() =>
  routedPoints.value.length > 0 ? lastComputedDistanceM.value : pathDistanceM(waypoints.value),
);
const canSave = computed(() => name.value.trim().length > 0 && waypoints.value.length >= 2);

function hydrateFrom(route: PlannedRoute | null | undefined) {
  if (!route) {
    name.value = "";
    waypoints.value = [];
    routedPoints.value = [];
    geometrySource.value = "straight";
    lastComputedDistanceM.value = 0;
    elevationGainM.value = null;
    return;
  }
  name.value = route.name;
  waypoints.value = route.waypoints.map((w) => ({ ...w }));
  geometrySource.value = route.geometrySource;
  lastComputedDistanceM.value = route.distanceM;
  elevationGainM.value = route.elevationGainM;
}
watch(() => props.route, hydrateFrom, { immediate: true });

let previewController: AbortController | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 400);
}

async function runPreview() {
  if (waypoints.value.length < 2) {
    routedPoints.value = [];
    return;
  }
  previewController?.abort();
  previewController = new AbortController();
  try {
    const result = await previewPlannedRoute(waypoints.value, previewController.signal);
    routedPoints.value = result.points;
    geometrySource.value = result.geometrySource;
    lastComputedDistanceM.value = result.distanceM;
    elevationGainM.value = result.elevationGainM;
  } catch {
    // A failed/aborted preview is a non-event — the straight line and its ≈ label just stay.
  }
}

function onAdd(waypoint: Waypoint) {
  waypoints.value = [...waypoints.value, waypoint];
  schedulePreview();
}
function onMove(index: number, waypoint: Waypoint) {
  waypoints.value = waypoints.value.map((w, i) => (i === index ? waypoint : w));
  schedulePreview();
}
function onRemove(index: number) {
  waypoints.value = waypoints.value.filter((_, i) => i !== index);
  schedulePreview();
}

const closeConfirm = useConfirmTap(() => sheetRef.value?.dismiss());
function requestClose() {
  if (waypoints.value.length === 0) {
    sheetRef.value?.dismiss();
    return;
  }
  closeConfirm.trigger();
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    if (props.route) {
      await plannedRouteStore.update(props.route.id, { name: name.value.trim(), waypoints: waypoints.value });
    } else {
      await plannedRouteStore.create(name.value.trim(), waypoints.value);
    }
    emit("saved");
    sheetRef.value?.dismiss();
  } catch {
    toast("Speichern fehlgeschlagen — bitte erneut versuchen.");
  } finally {
    saving.value = false;
  }
}

function onDidPresent() {
  mapRef.value?.invalidateSize();
}
const mapRef = ref<InstanceType<typeof RouteMapEditor> | null>(null);
</script>

<template>
  <SheetModal ref="sheetRef" :sheet="false" background="var(--bg)" @close="hydrateFrom(null)" @did-present="onDidPresent">
    <template #header>
      <header class="wizard-head">
        <button class="btn-close close-btn" :class="{ confirming: closeConfirm.isArmed() }" aria-label="Schließen" @click="requestClose">
          {{ closeConfirm.isArmed() ? "Verwerfen?" : "×" }}
        </button>
        <input v-model="name" class="name-input" type="text" placeholder="Name der Strecke" aria-label="Name der Strecke" />
      </header>
    </template>
    <RouteMapEditor
      ref="mapRef"
      class="wizard-map"
      :waypoints="waypoints"
      :routed-points="routedPoints"
      :approximate="geometrySource === 'straight'"
      :initial-center="initialCenter"
      @add="onAdd"
      @move="onMove"
      @remove="onRemove"
    />
    <footer class="wizard-foot">
      <div class="stats">
        <span>{{ (distanceM / 1000).toFixed(2) }} km{{ geometrySource === "straight" ? " ≈" : "" }}</span>
        <span>{{ elevationGainM != null ? Math.round(elevationGainM) + " hm" : "Höhe unbekannt" }}</span>
        <span>{{ waypoints.length }} Wegpunkte</span>
      </div>
      <button class="btn-primary" :disabled="!canSave || saving" @click="save">Speichern</button>
    </footer>
  </SheetModal>
</template>

<style scoped>
.wizard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.name-input {
  flex: 1;
  min-height: 44px;
  border: none;
  background: transparent;
  font-size: 1.05rem;
}
.close-btn {
  min-width: 44px;
  min-height: 44px;
}
.wizard-map {
  flex: 1;
  min-height: 0;
}
.wizard-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}
.stats {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  color: var(--text-dim);
}
</style>
```

If `SheetModal.vue` does not already emit a `did-present` event (check its `<template>`/`defineEmits` before assuming it does — it wraps `@ionic/vue`'s `<IonModal>`, which fires `didPresent` natively), wire `onDidPresent` to whatever the real hook is instead (e.g. `@ionDidPresent` forwarded straight off the underlying `<ion-modal>`, or fall back to a `requestAnimationFrame` after mount if `SheetModal` exposes nothing — `RouteMapEditor.vue` already double-guards with its own internal `requestAnimationFrame(() => map?.invalidateSize())` at mount, so a missing `did-present` hook degrades to "usually fine, occasionally a grey box on a slow device," not broken).

- [ ] **Step 2: Manual verification via `dev-up.mjs`**

This component has no dedicated unit test (its logic — debounced preview, hydrate, save — is thin orchestration over already-tested pieces: `RouteMapEditor`'s emit contract, Task 8's store, and `pathDistanceM`). Verify it manually: `node scripts/dev-up.mjs --id route-wizard-check`, open the dashboard, navigate to the Strecken tab (added in Task 11 — if Task 11 isn't done yet, skip this step and fold it into Task 11's own verification instead), place a few waypoints, confirm the provisional straight distance appears immediately and upgrades after ~400ms, save, and confirm the sheet closes and the list refreshes. Then `node scripts/dev-down.mjs --id route-wizard-check`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/route-wizard/RouteWizard.vue
git commit -m "feat(client): add RouteWizard single-screen creation/edit sheet"
```

---

### Task 11: `RouteList.vue` + `RunsPage.vue` segmented control

**Files:**
- Create: `packages/client/src/components/route/RouteList.vue`
- Modify: `packages/client/src/pages/RunsPage.vue`

**Interfaces:**
- Consumes: `usePlannedRouteStore` (Task 8), `useConfirmTap` (existing), `RouteWizard.vue` (Task 10).
- Produces: `RouteList.vue` emits `edit: [PlannedRoute]`, `start: [PlannedRoute]`.
- **No `App.vue` change is needed.** Strecken is reached only as an in-page tab of `/runs`, exactly like `WorkoutRunsSwitcher` already keeps `/runs` itself out of the 5-item bottom nav — adding a 6th nav item would reintroduce the mobile-width bug that comment documents. Do not touch `App.vue`'s `navItems`.

- [ ] **Step 1: Write `RouteList.vue`**

Create `packages/client/src/components/route/RouteList.vue`:

```vue
<script setup lang="ts">
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";
import { useConfirmTap } from "../../composables/useConfirmTap";
import type { PlannedRoute } from "../../services/plannedRouteService";

const emit = defineEmits<{ edit: [route: PlannedRoute]; start: [route: PlannedRoute] }>();

const plannedRouteStore = usePlannedRouteStore();
const deleteConfirm = useConfirmTap((id) => id && plannedRouteStore.remove(id));

function thumbnailPath(route: PlannedRoute): string {
  const pts = route.waypoints;
  if (pts.length < 2) return "";
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const spanLat = Math.max(...lats) - minLat || 1;
  const minLon = Math.min(...lons);
  const spanLon = Math.max(...lons) - minLon || 1;
  const coords = pts.map((p) => {
    const x = ((p.lon - minLon) / spanLon) * 100;
    const y = 100 - ((p.lat - minLat) / spanLat) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${coords.join(" L ")}`;
}
</script>

<template>
  <div v-if="plannedRouteStore.routes.length > 0" class="route-grid">
    <div v-for="route in plannedRouteStore.routes" :key="route.id" class="route-card surface-hybrid">
      <svg class="route-thumb" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path :d="thumbnailPath(route)" :class="{ approximate: route.geometrySource === 'straight' }" fill="none" />
      </svg>
      <div class="route-info">
        <b>{{ route.name }}</b>
        <span>
          {{ (route.distanceM / 1000).toFixed(2) }} km{{ route.geometrySource === "straight" ? " ≈" : "" }} ·
          {{ route.elevationGainM != null ? Math.round(route.elevationGainM) + " hm" : "Höhe unbekannt" }}
        </span>
      </div>
      <div class="route-actions">
        <button class="btn-secondary" @click="emit('start', route)">Starten</button>
        <button class="icon-btn" aria-label="Bearbeiten" @click="emit('edit', route)">✎</button>
        <button
          class="icon-btn danger"
          :class="{ confirming: deleteConfirm.isArmed(route.id) }"
          aria-label="Löschen"
          @click="deleteConfirm.trigger(route.id)"
        >
          {{ deleteConfirm.isArmed(route.id) ? "Wirklich?" : "🗑" }}
        </button>
      </div>
    </div>
  </div>
  <div v-else class="route-empty surface-hybrid">
    <div class="eyebrow">Noch keine Strecke</div>
    <p>Platziere Wegpunkte auf der Karte und speichere sie als wiederverwendbare Strecke.</p>
  </div>
</template>

<style scoped>
.route-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.route-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--r-lg);
}
.route-thumb {
  width: 100%;
  height: 80px;
}
.route-thumb path {
  stroke: var(--fire);
  stroke-width: 3;
}
.route-thumb path.approximate {
  stroke-dasharray: 4 4;
  opacity: 0.6;
}
.route-actions {
  display: flex;
  gap: 6px;
}
.icon-btn {
  min-width: 44px;
  min-height: 44px;
}
</style>
```

- [ ] **Step 2: Wire the segmented control into `RunsPage.vue`**

Read the current `packages/client/src/pages/RunsPage.vue` in full before editing (its exact `<script setup>` state, imports, and template structure around line 126's `<WorkoutRunsSwitcher active="runs" />` and the manual-form block matter here — do not guess at surrounding code that isn't shown below).

Add to the `<script setup>` block: a tab ref, the planned-route store, wizard state, and a handler that opens a fresh wizard while resolving `initialCenter` from the most recent non-manual run's first point:

```ts
import RouteList from "../components/route/RouteList.vue";
import RouteWizard from "../components/route-wizard/RouteWizard.vue";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";
import { getRunDetail } from "../services/runService";
import type { PlannedRoute } from "../services/plannedRouteService";

const activeSubTab = ref<"verlauf" | "strecken">("verlauf");
const plannedRouteStore = usePlannedRouteStore();
const showRouteWizard = ref(false);
const editingRoute = ref<PlannedRoute | null>(null);
const initialCenter = ref<{ lat: number; lon: number } | undefined>(undefined);

plannedRouteStore.load();

async function openNewRouteWizard() {
  editingRoute.value = null;
  const gpsRun = runsStore.runs.find((r) => r.source !== "manual");
  if (gpsRun) {
    const detail = await getRunDetail(gpsRun.id);
    initialCenter.value = detail.points[0] ? { lat: detail.points[0].lat, lon: detail.points[0].lon } : undefined;
  } else {
    initialCenter.value = undefined;
  }
  showRouteWizard.value = true;
}
function openEditRouteWizard(route: PlannedRoute) {
  editingRoute.value = route;
  showRouteWizard.value = true;
}
```

(`runsStore` here is whatever the file already calls its `useRunsStore()` instance — reuse the existing local name rather than introducing a second one.)

Add the segmented control template right below the existing `<WorkoutRunsSwitcher active="runs" />` line, matching that component's own pill CSS shape (`.wr-switcher`/`.wr-pill`):

```vue
<div class="sub-switcher wr-switcher">
  <button class="wr-pill" :class="{ active: activeSubTab === 'verlauf' }" @click="activeSubTab = 'verlauf'">Verlauf</button>
  <button class="wr-pill" :class="{ active: activeSubTab === 'strecken' }" @click="activeSubTab = 'strecken'">Strecken</button>
</div>
```

Wrap the page's existing run-list/manual-form/import content (everything currently below the switcher) in `<template v-if="activeSubTab === 'verlauf'">...</template>`, and add a sibling block:

```vue
<template v-if="activeSubTab === 'strecken'">
  <button class="btn-primary btn-block" @click="openNewRouteWizard">+ Neue Strecke</button>
  <RouteList @edit="openEditRouteWizard" @start="(route) => { activeSubTab = 'verlauf'; startFromRoute(route); }" />
  <RouteWizard
    v-if="showRouteWizard"
    :route="editingRoute"
    :initial-center="initialCenter"
    @saved="showRouteWizard = false"
  />
</template>
```

(`startFromRoute` is wired in Task 12 — until that task lands, leave the `start` handler as `@start="openEditRouteWizard"` so the button does something reasonable in the interim, then swap it in Task 12's own step.)

- [ ] **Step 3: Manual verification + mobile-viewport-check**

Run `node scripts/dev-up.mjs --id runs-page-tabs`, confirm both tabs render, the Strecken tab shows the two seeded routes from Task 7 with correct thumbnails/labels (one plain, one with `≈`/dashed thumbnail), editing a route reopens the wizard hydrated with its waypoints, and deleting a route (tap-twice-to-confirm) removes it from the grid. Then `node scripts/dev-down.mjs --id runs-page-tabs`. Run the **mobile-viewport-check** skill on `RunsPage.vue` before calling this task done.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/route/RouteList.vue packages/client/src/pages/RunsPage.vue
git commit -m "feat(client): add RouteList + Verlauf/Strecken segmented control on RunsPage"
```

---

### Task 12: Quick-start hand-off — `useStartPlannedRoute.ts` + manual-form prefill + `RunDetail.vue` chip

**Files:**
- Create: `packages/client/src/composables/useStartPlannedRoute.ts`
- Modify: `packages/client/src/pages/RunsPage.vue`
- Modify: `packages/client/src/services/runService.ts`
- Modify: `packages/client/src/stores/runsStore.ts` (only if it independently duplicates `runService`'s manual-log field list — check first)
- Modify: `packages/client/src/components/run/RunDetail.vue`

**Interfaces:**
- Consumes: `PlannedRoute` (Task 8), `validateManualEntry` (existing, unchanged), `runResponse.plannedRouteId` (Task 6 — the field a `GET /api/runs/:id` now returns).
- Produces: `useStartPlannedRoute()` → `{ activeRoute, start(route), dismiss() }`. `RunSummary`/`RunDetail` client types gain `plannedRouteId: string | null` alongside the already-present `elevationGainM: number | null`. `logManualRun`'s client-side payload type gains `plannedRouteId?: string | null` and `elevationGainM?: number | null`.

- [ ] **Step 1: Write the composable**

Create `packages/client/src/composables/useStartPlannedRoute.ts`:

```ts
import { ref } from "vue";
import type { PlannedRoute } from "../services/plannedRouteService";

/** Quick-start hand-off: starts nothing live (the app has no live GPS tracking anywhere) — just
 *  pre-fills the existing manual-entry form with a route's known distance/elevation so the user
 *  only has to confirm duration and date once they've actually run it. Mirrors "start a routine
 *  pre-fills expected sets" exactly. */
export function useStartPlannedRoute() {
  const activeRoute = ref<PlannedRoute | null>(null);

  function start(route: PlannedRoute) {
    activeRoute.value = route;
  }
  function dismiss() {
    activeRoute.value = null;
  }
  return { activeRoute, start, dismiss };
}
```

- [ ] **Step 2: Extend the client run types and `logManualRun`**

Read `packages/client/src/services/runService.ts` in full first. Find its `RunSummary`/`RunDetail` (or equivalently-named response) interfaces — they already carry `elevationGainM: number | null` per the existing code — and add a sibling field:

```ts
  plannedRouteId: string | null;
```

Find `logManualRun`'s parameter type (the object shape it POSTs to `/api/runs`) and add:

```ts
  plannedRouteId?: string | null;
  elevationGainM?: number | null;
```

threaded straight through into the `api.post("/api/runs", { ... })` body object alongside the existing fields — do not rename or reorder anything already there. If `packages/client/src/stores/runsStore.ts` re-declares this same field list on its own `logManual` action's parameter type (rather than just forwarding whatever `runService.logManualRun` accepts), add the identical two fields there too; if it just forwards an already-typed object through, no change is needed there.

- [ ] **Step 3: Wire the banner + prefill into `RunsPage.vue`**

Read the current `submitManual()` function and the manual-form template block in full before editing — do not guess at the existing field names. Add:

```ts
import { useStartPlannedRoute } from "../composables/useStartPlannedRoute";

const { activeRoute, start: startFromRoute, dismiss: dismissRouteBanner } = useStartPlannedRoute();
const minutesInputRef = ref<HTMLInputElement | null>(null);

watch(activeRoute, (route) => {
  if (!route) return;
  activeSubTab.value = "verlauf";
  showManualForm.value = true;
  manualName.value = route.name;
  manualDistanceKm.value = (route.distanceM / 1000).toFixed(2).replace(".", ",");
  manualDate.value = new Date().toISOString().slice(0, 10);
  nextTick(() => minutesInputRef.value?.focus());
});
```

(`showManualForm`, `manualName`, `manualDistanceKm`, `manualDate` are the existing refs already driving the manual form per the codebase's real field names — use those exact names once confirmed from the file, not the placeholders here if they differ.)

Add `ref="minutesInputRef"` to the existing minutes `<input>` in the manual-form template. Add the dismissible banner directly above that form:

```vue
<div v-if="activeRoute" class="route-banner panel">
  <span>
    Strecke: {{ activeRoute.name }} · {{ (activeRoute.distanceM / 1000).toFixed(2).replace(".", ",") }} km{{ activeRoute.geometrySource === "straight" ? " ≈" : "" }}{{ activeRoute.elevationGainM != null ? " · " + Math.round(activeRoute.elevationGainM) + " hm" : "" }} — nur noch Dauer eintragen
  </span>
  <button aria-label="Schließen" @click="dismissRouteBanner">×</button>
</div>
```

In the existing `submitManual()`, add two fields to the payload object already passed to the run-logging call (`runsStore.logManual(...)` or equivalent — use the function's real current name):

```ts
    plannedRouteId: activeRoute.value?.id ?? null,
    elevationGainM: activeRoute.value?.elevationGainM ?? null,
```

and call `dismissRouteBanner()` after a successful submit, alongside whatever the function already does to close the form on success.

Finally, swap Task 11's interim `RouteList`'s `@start` handler from `openEditRouteWizard` to:

```vue
@start="(route) => { activeSubTab = 'verlauf'; startFromRoute(route); }"
```

- [ ] **Step 4: Add the elevation stat + route chip to `RunDetail.vue`**

In `packages/client/src/components/run/RunDetail.vue`, add the planned-route store and a computed lookup:

```ts
import { usePlannedRouteStore } from "../../stores/plannedRouteStore";

const plannedRouteStore = usePlannedRouteStore();
const sourceRouteName = computed(() =>
  props.detail.plannedRouteId ? (plannedRouteStore.byId(props.detail.plannedRouteId)?.name ?? null) : null,
);
```

(`computed` must already be imported from `vue` in this file — if not, add it. `props` is whatever the component's existing `defineProps` result is bound to.)

Add the chip above the existing `.stat-row`, and a 5th `StatTile` inside it:

```vue
<div v-if="sourceRouteName" class="route-chip">Strecke: {{ sourceRouteName }}</div>
<div class="stat-row">
  <StatTile :value="`${(detail.distanceM / 1000).toFixed(2)} km`" label="Distanz" />
  <StatTile :value="formatDuration(detail.durationS)" label="Dauer" />
  <StatTile :value="formatPace(detail.avgPaceSPerKm)" label="Pace ø" />
  <StatTile :value="detail.avgHr != null ? Math.round(detail.avgHr) + ' bpm' : '–'" label="Puls ø" />
  <StatTile v-if="detail.elevationGainM != null" :value="Math.round(detail.elevationGainM) + ' hm'" label="Höhenmeter" />
</div>
```

Change the `.stat-row` CSS `grid-template-columns` from `repeat(4, 1fr)` to `repeat(auto-fit, minmax(80px, 1fr))` so a 5th tile wraps cleanly instead of squeezing four columns into five.

- [ ] **Step 5: Manual verification + mobile-viewport-check**

`node scripts/dev-up.mjs --id quick-start-check`: from the Strecken tab, tap "Starten" on a seeded route, confirm the banner appears, the manual form is prefilled with the route's distance (German-comma formatted) and today's date, the minutes field is focused, submitting creates a run whose detail page shows the "Strecke: …" chip and (for the `ors` route) an elevation stat tile. `node scripts/dev-down.mjs --id quick-start-check`. Run the **mobile-viewport-check** skill on the updated `RunDetail.vue`/`RunsPage.vue`.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/composables/useStartPlannedRoute.ts packages/client/src/pages/RunsPage.vue packages/client/src/services/runService.ts packages/client/src/components/run/RunDetail.vue
git commit -m "feat(client): quick-start hand-off from a planned route into the manual run form"
```

---

### Task 13: Docs — env vars, HTTP API, features, security, attribution, ADR

**Files:**
- Modify: `docs/reference/environment-variables.md`
- Modify: `docs/reference/http-api.md`
- Modify: `docs/features.md`
- Modify: `docs/SECURITY.md`
- Modify: `README.md`
- Modify: `packages/client/src/pages/AttributionsPage.vue`
- Create: `docs/adr/0007-openrouteservice-external-routing-exception.md`

- [ ] **Step 1: Environment variables reference**

Read `docs/reference/environment-variables.md` first to match its exact existing table/row format. Add three rows for `LIFTR_ORS_API_KEY` (optional, default: unset, description: "OpenRouteService API key for planned-route road-snapping and elevation. Unset is a fully supported degraded state — straight-line distance, no elevation — not a misconfiguration."), `LIFTR_ORS_BASE_URL` (default `https://api.openrouteservice.org`, description: "ORS API base URL — point this at a self-hosted ORS instance to remove the third party entirely, no code change."), `LIFTR_ORS_PROFILE` (default `foot-walking`, description: "ORS routing profile.").

- [ ] **Step 2: HTTP API reference**

Read `docs/reference/http-api.md` first to match its existing per-resource section format (compare against how it documents `/api/runs` or `/api/routines`). Add a "Planned Routes" section documenting: `GET /api/planned-routes` (list, no geometry), `GET /api/planned-routes/:id` (detail + points), `POST /api/planned-routes/preview` (body `{waypoints}`, not persisted), `POST /api/planned-routes` (create, 201), `PATCH /api/planned-routes/:id` (partial; recomputes geometry only when `waypoints` is present), `DELETE /api/planned-routes/:id` (soft archive). Use the exact request/response field names from Task 5's `plannedRouteResponse`/`previewResponse` zod schemas.

- [ ] **Step 3: Features doc**

Add one bullet to `docs/features.md` (match its existing bullet style/section): "**Strecken planen** — Wegpunkte auf einer Karte setzen; die App berechnet automatisch Distanz und Höhenmeter (via OpenRouteService, optional) und merkt sich die Strecke zum späteren Start."

- [ ] **Step 4: Security doc**

Add a note to `docs/SECURITY.md`: with `LIFTR_ORS_API_KEY` configured, every waypoint coordinate set is sent to OpenRouteService (or a self-hosted ORS instance, if `LIFTR_ORS_BASE_URL` points there) as part of route creation/preview — the first outbound runtime request this server makes anywhere. Opt-in (unset by default), and self-hostable to remove the third party entirely.

- [ ] **Step 5: README asterisk**

Find the "no third party in the loop" (or equivalent) claim in `README.md` and add a footnote/asterisk pointing to the `docs/SECURITY.md` note from Step 4 — the claim is no longer unconditionally true once a self-hoster opts into `LIFTR_ORS_API_KEY`.

- [ ] **Step 6: Attribution**

In `packages/client/src/pages/AttributionsPage.vue`, add a sibling `<li class="surface-hybrid">` directly after the existing OpenStreetMap entry:

```vue
<li class="surface-hybrid">
  <b>OpenRouteService</b> — Routenberechnung für geplante Strecken
  <span class="license">CC-BY 4.0</span>
  <p>openrouteservice.org · © openrouteservice.org by HeiGIT</p>
</li>
```

The page's intro paragraph currently frames everything as data "ingested once" — since ORS routing is a live per-request call, not a one-time ingest, add one clarifying sentence there too (read the existing paragraph first and word it consistently with its tone).

- [ ] **Step 7: ADR 0007**

Create `docs/adr/0007-openrouteservice-external-routing-exception.md`, following the same structure as `docs/adr/0006-multi-user-hardening.md` (read it first for the section headings this repo's ADRs use — likely Context/Decision/Consequences or similar). Content: the server has made zero outbound runtime requests until now; planned-route creation needs real road-snapped distance and elevation, which cannot come from any data already in this app; OpenRouteService was chosen because one call returns both geometry and elevation; the exception is scoped narrowly (only this one feature, only when `LIFTR_ORS_API_KEY` is set, self-hostable via `LIFTR_ORS_BASE_URL` to remove the third party entirely) and gracefully degrades (straight-line distance, no elevation) rather than failing when unset or unreachable.

- [ ] **Step 8: Commit**

```bash
git add docs/reference/environment-variables.md docs/reference/http-api.md docs/features.md docs/SECURITY.md README.md packages/client/src/pages/AttributionsPage.vue docs/adr/0007-openrouteservice-external-routing-exception.md
git commit -m "docs: document planned routes' env vars, HTTP API, and OpenRouteService exception"
```

---

### Task 14: Full verification

**Files:** none (no code changes — this task runs the suite and the manual matrix, and only touches files if it finds something the review loop should catch instead).

- [ ] **Step 1: Full automated suite**

Run, from the repo root: `pnpm typecheck && pnpm lint && pnpm test`.
Expected: all clean. Any failure here is a real regression from one of Tasks 1–13 — do not silence it; identify which task's change is responsible and treat it as a finding against that task.

- [ ] **Step 2: Mobile viewport check**

Run the **mobile-viewport-check** skill across the full feature surface if it wasn't already run per-task in 9/11/12 (`RouteMapEditor.vue`, `RunsPage.vue`'s segmented control, `RunDetail.vue`'s new chip/tile) — confirm nothing regressed once all pieces are combined.

- [ ] **Step 3: End-to-end walkthrough via `dev-up.mjs`**

Run `node scripts/dev-up.mjs --id planned-routes-final` (no `LIFTR_ORS_API_KEY` set — a fresh session exercises the degraded/straight-line path by default) and walk this matrix:

| scenario | expected |
|---|---|
| create with key unset | dashed straight line; `≈` distance; "Höhe unbekannt"; still saves |
| edit waypoints | geometry + stats recomputed, points replaced |
| rename only | no ORS request fired (irrelevant with no key set, but confirm no error either) |
| delete | soft archive; a run that referenced it still shows the route name |
| quick-start | manual form opens pre-filled, minutes focused, save writes `plannedRouteId` |
| >50 or <2 waypoints | 400 from zod, never reaches ORS |

If a `LIFTR_ORS_API_KEY` is available for testing, additionally set it (e.g. `LIFTR_ORS_API_KEY=... node scripts/dev-up.mjs --id planned-routes-final-ors`) and confirm: markers snap to streets, distance matches ORS's summary, elevation populates, `geometrySource: "ors"`. This half of the matrix is optional if no test key is available — note in the final report which half was actually exercised; do not claim the ORS-configured path was verified if it wasn't.

Then `node scripts/dev-down.mjs --id planned-routes-final` (and the `-ors` session too, if started).

- [ ] **Step 4: Report**

Summarize: automated suite status, which mobile viewports were checked, which rows of the manual matrix were walked and their outcome, and whether the ORS-configured half was exercised or skipped for lack of a key.

