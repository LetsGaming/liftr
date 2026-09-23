/**
 * Health Connect import. Runs entirely in the app itself via `capacitor-health`
 * (mley/capacitor-health) — its `queryWorkouts({includeRoute, includeHeartRate})` reads Health
 * Connect's real `ExerciseSessionRecord.exerciseRouteResult` API (verified against its native
 * Kotlin source, not just its TypeScript types), unlike other Capacitor Health Connect plugins.
 * No separate companion app, no WorkManager background job: this checks for new workouts on app
 * resume instead, which is enough to remove the manual GPX/FIT export step without the
 * complexity of a true background service.
 *
 * Every workout Health Connect returns gets an outcome recorded — imported, skipped (with a
 * reason), or failed — never silently dropped. `patches/capacitor-health.patch` extends the
 * plugin's Kotlin side to report `routeStatus` (`"data"` / `"consent_required"` / `"no_data"`) per
 * workout, which is what makes "the route was withheld by consent" distinguishable from "there
 * never was a route" — the ambiguity that originally let a real watch-recorded walk vanish with
 * no trace anywhere. `syncLog.ts` persists these reports client-side (a skipped workout never
 * reaches the server, so there's nothing for a server-side log to show).
 */
import { Health } from "capacitor-health";
import { ApiError, api } from "../lib/api";
import { isAndroid } from "../lib/platform";
import { recordSyncReport, type SyncTrigger } from "../lib/syncLog";

const LAST_CHECK_KEY = "liftr.healthconnect.lastCheck";

/** Only meaningful on Android — Health Connect doesn't exist on iOS/web. Also initializes the
 *  plugin's native `healthConnectClient` (a Kotlin `lateinit`), which nothing else in this file
 *  did before — `queryWorkouts`/`checkHealthPermissions` throw if it was never touched. */
export async function isHealthConnectAvailable(): Promise<boolean> {
  if (!isAndroid()) return false;
  const { available } = await Health.isHealthAvailable();
  return available;
}

export const HEALTH_CONNECT_PERMISSIONS = [
  "READ_WORKOUTS",
  "READ_ROUTE",
  "READ_HEART_RATE",
  "READ_DISTANCE",
] as const;

export const HEALTH_CONNECT_PERMISSION_LABELS: Record<
  (typeof HEALTH_CONNECT_PERMISSIONS)[number],
  string
> = {
  READ_WORKOUTS: "Aktivitäten",
  READ_ROUTE: "Strecken",
  READ_HEART_RATE: "Herzfrequenz",
  // Only used for the route-less fallback (a workout Health Connect withheld the route for) —
  // an already-connected user shows this as "missing" until they re-grant, same as any other
  // permission added after their first connect; the existing `missing` list already surfaces and
  // explains that (see useHealthConnectImport.ts).
  READ_DISTANCE: "Distanz",
};

export type HealthConnectPermissionResult = {
  granted: boolean;
  missing: string[];
};

/** Shared with `checkHealthConnectPermissions` below — both `request`/`checkHealthPermissions`
 *  return the same flat `{ PERMISSION: boolean }` shape (see this file's header comment on the
 *  real native return type diverging from the plugin's own declared array type). */
function toPermissionResult(res: { permissions: unknown }): HealthConnectPermissionResult {
  const granted = res.permissions as Record<string, boolean>;
  const missing = HEALTH_CONNECT_PERMISSIONS.filter((permission) => granted[permission] !== true).map(
    (permission) => HEALTH_CONNECT_PERMISSION_LABELS[permission],
  );
  return { granted: missing.length === 0, missing };
}

export async function requestHealthConnectPermissions(): Promise<HealthConnectPermissionResult> {
  if (!(await isHealthConnectAvailable())) {
    return { granted: false, missing: [] };
  }
  return toPermissionResult(await Health.requestHealthPermissions({ permissions: [...HEALTH_CONNECT_PERMISSIONS] }));
}

/** Non-prompting check (no native permission dialog) — used to tell whether the app is already
 *  connected, so the UI can offer "sync now" instead of "connect" once it is (see
 *  useHealthConnectImport.ts). */
export async function checkHealthConnectPermissions(): Promise<HealthConnectPermissionResult> {
  if (!(await isHealthConnectAvailable())) {
    return { granted: false, missing: [] };
  }
  return toPermissionResult(await Health.checkHealthPermissions({ permissions: [...HEALTH_CONNECT_PERMISSIONS] }));
}

function getLastCheck(): string {
  return localStorage.getItem(LAST_CHECK_KEY) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function setLastCheck(iso: string) {
  localStorage.setItem(LAST_CHECK_KEY, iso);
}

/** Re-scan control for the Diagnostics page: winds `lastCheck` back so a workout skipped once
 *  (including the walk that originally prompted this whole feature) re-enters a future scan
 *  window instead of staying permanently excluded — without this, nothing short of reinstalling
 *  the app would ever let it be reconsidered. */
export function resetHealthConnectScanWindow(daysBack: 30 | 90): void {
  setLastCheck(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
}

/**
 * Finds the nearest heart-rate sample (by timestamp) for a route point — Health Connect
 * doesn't return HR pre-merged onto route points, so this pairs them client-side, same spirit
 * as GPX's TrackPointExtension handling.
 */
function nearestHr(samples: { timestamp: string; bpm: number }[], t: number): number | undefined {
  if (samples.length === 0) return undefined;
  let best = samples[0]!;
  let bestDelta = Math.abs(new Date(best.timestamp).getTime() - t);
  for (const s of samples) {
    const delta = Math.abs(new Date(s.timestamp).getTime() - t);
    if (delta < bestDelta) {
      best = s;
      bestDelta = delta;
    }
  }
  return bestDelta <= 30_000 ? best.bpm : undefined; // don't pair samples more than 30s apart
}

/** Point-level guard: capacitor-health's `.d.ts` declares `lat`/`lng`/`timestamp` as required, but
 *  the real native Health Connect bridge doesn't always agree with its own types (see this file's
 *  own header comment on verifying against the Kotlin source, not the types) — a single point
 *  with a missing coordinate or an unparseable timestamp used to fail the server's Zod validation
 *  for the *entire* workout (a 400 with no way to tell which point or field), which also meant
 *  `setLastCheck` below was never reached, so every future check re-hit the same broken workout
 *  forever. Dropping just the bad points here (not the whole workout) is the fix. */
function isValidPoint(r: { timestamp: string; lat: number; lng: number }): boolean {
  return (
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    Number.isFinite(new Date(r.timestamp).getTime())
  );
}

/** The plugin's own `.d.ts` under-declares this shape (see this file's header comment) — `title`
 *  and `routeStatus` are both real fields the patched Kotlin side emits but the types don't know
 *  about yet. `routeStatus` is `undefined` only if the app is running against an unpatched build
 *  of the plugin (shouldn't happen once `patches/capacitor-health.patch` is applied, but handled
 *  defensively rather than assumed). */
interface RawHealthConnectWorkout {
  id?: string;
  sourceName: string;
  title?: string;
  workoutType: string;
  startDate: string;
  endDate: string;
  duration?: number;
  distance?: number;
  route?: { timestamp: string; lat: number; lng: number; alt?: number | null }[];
  heartRate?: { timestamp: string; bpm: number }[];
  routeStatus?: "data" | "consent_required" | "no_data";
}

export type HealthConnectSkipReason =
  | "route_consent_required"
  | "route_missing"
  | "no_usable_data"
  | "invalid_points";

export type HealthConnectWorkoutOutcome =
  | { kind: "imported"; runId: string }
  | { kind: "skipped"; reason: HealthConnectSkipReason }
  | { kind: "failed"; message: string };

/** One workout's full sync report row — enough to render a plain-German explanation of what
 *  happened and why (DiagnosticsPage.vue), plus a raw-data toggle for power users. */
export interface HealthConnectWorkoutReport {
  workoutId: string;
  rawWorkoutType: string;
  title: string | null;
  startDate: string;
  endDate: string;
  durationS: number;
  distanceM: number | null;
  routePointCount: number;
  routeStatus: "data" | "consent_required" | "no_data" | "unknown";
  hrSampleCount: number;
  outcome: HealthConnectWorkoutOutcome;
}

export interface HealthConnectImportResult {
  imported: number;
  skipped: number;
  /** Workouts that still failed after all the point-level filtering/fallback logic below (e.g.
   *  the server was unreachable) — counted separately from `skipped` since a failure is retried
   *  on the next check (via `setLastCheck` still advancing), while a skip is a settled outcome. */
  failed: number;
  workouts: HealthConnectWorkoutReport[];
}

/** Checks Health Connect for workouts since the last check, importing what it can and recording
 *  an outcome for every workout returned — no silent drops. `setLastCheck` always advances to
 *  `endDate` once every workout in this window has been attempted, so one bad or stuck workout
 *  can never make every future check re-fail on it forever (skips/failures are both terminal for
 *  the window; a genuine transient failure gets picked up again only if the workout still falls
 *  inside a future window, e.g. after `resetHealthConnectScanWindow`). `trigger` is passed through
 *  to the sync log for display only — it doesn't change import behavior. */
export async function importNewHealthConnectWorkouts(trigger: SyncTrigger = "resume"): Promise<HealthConnectImportResult> {
  const empty: HealthConnectImportResult = { imported: 0, skipped: 0, failed: 0, workouts: [] };
  if (!(await isHealthConnectAvailable())) return empty;

  const startDate = getLastCheck();
  const endDate = new Date().toISOString();
  const { workouts } = (await Health.queryWorkouts({
    startDate,
    endDate,
    includeHeartRate: true,
    includeRoute: true,
    includeSteps: false,
  })) as { workouts: RawHealthConnectWorkout[] };

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const reports: HealthConnectWorkoutReport[] = [];

  for (const workout of workouts) {
    const heartRate = workout.heartRate ?? [];
    const rawRoute = workout.route ?? [];
    const validPoints = rawRoute.filter(isValidPoint);
    const points = validPoints.map((r) => ({
      t: r.timestamp,
      lat: r.lat,
      lon: r.lng,
      ele: r.alt != null && Number.isFinite(Number(r.alt)) ? Number(r.alt) : null,
      hr: nearestHr(heartRate, new Date(r.timestamp).getTime()) ?? null,
    }));

    const routeStatus = workout.routeStatus ?? (rawRoute.length > 0 ? "data" : "no_data");
    const base = {
      workoutId: workout.id ?? "",
      rawWorkoutType: workout.workoutType,
      title: workout.title ?? workout.sourceName ?? null,
      startDate: workout.startDate,
      endDate: workout.endDate,
      durationS: workout.duration ?? 0,
      distanceM: workout.distance ?? null,
      routePointCount: points.length,
      routeStatus,
      hrSampleCount: heartRate.length,
    };

    if (!workout.id) {
      skipped++;
      reports.push({ ...base, outcome: { kind: "skipped", reason: "no_usable_data" } });
      continue;
    }

    const hasUsableRoute = points.length > 0;
    const hasFallbackAggregate = workout.distance != null && workout.duration != null;

    if (!hasUsableRoute && !hasFallbackAggregate) {
      const reason: HealthConnectSkipReason =
        routeStatus === "consent_required"
          ? "route_consent_required"
          : rawRoute.length > 0
            ? "invalid_points" // every point failed isValidPoint
            : "route_missing"; // Health Connect never recorded a route for this workout
      skipped++;
      reports.push({ ...base, outcome: { kind: "skipped", reason } });
      continue;
    }

    try {
      const body: Record<string, unknown> = {
        platformId: workout.id,
        name: workout.title ?? workout.sourceName ?? null,
        workoutType: workout.workoutType,
      };
      if (hasUsableRoute) {
        body.points = points;
      } else {
        // Route-less fallback: Health Connect withheld or never recorded a route, but the watch's
        // own aggregate distance/duration (READ_DISTANCE) is usable — XP + streak credit, no rank
        // (see runImportService.ts's persistRun: no points means no independent check against the
        // claimed distance).
        body.distanceM = workout.distance;
        body.durationS = workout.duration;
        body.startedAt = workout.startDate;
      }
      const run = await api.post<{ id: string }>("/api/runs/healthconnect", body);
      imported++;
      reports.push({ ...base, outcome: { kind: "imported", runId: run.id } });
    } catch (err) {
      failed++;
      const message =
        err instanceof ApiError && err.detail ? err.detail : err instanceof Error ? err.message : "Unbekannter Fehler.";
      reports.push({ ...base, outcome: { kind: "failed", message } });
    }
  }

  setLastCheck(endDate);
  const result: HealthConnectImportResult = { imported, skipped, failed, workouts: reports };
  recordSyncReport(trigger, startDate, endDate, result);
  return result;
}
