/**
 * Health Connect import. Runs entirely in the app itself via `capacitor-health`
 * (mley/capacitor-health) — its `queryWorkouts({includeRoute, includeHeartRate})` reads Health
 * Connect's real `ExerciseSessionRecord.exerciseRouteResult` API (verified against its native
 * Kotlin source, not just its TypeScript types), unlike other Capacitor Health Connect plugins.
 * No separate companion app, no WorkManager background job: this checks for new workouts on app
 * resume instead, which is enough to remove the manual GPX/FIT export step without the
 * complexity of a true background service.
 */
import { Health } from "capacitor-health";
import { api } from "../lib/api";
import { isAndroid } from "../lib/platform";

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
] as const;

export const HEALTH_CONNECT_PERMISSION_LABELS: Record<
  (typeof HEALTH_CONNECT_PERMISSIONS)[number],
  string
> = {
  READ_WORKOUTS: "Aktivitäten",
  READ_ROUTE: "Strecken",
  READ_HEART_RATE: "Herzfrequenz",
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

export type HealthConnectImportResult = {
  imported: number;
  /** Workouts that still failed after the point-level filtering above (e.g. the server was
   *  unreachable, or every point in that workout was invalid) — surfaced so the caller can tell
   *  the user something didn't make it across, instead of a silently-incomplete "done". */
  failed: number;
};

/** Checks Health Connect for workouts since the last check, importing any with a real route.
 *  Per-workout failures are isolated (caught and counted, not thrown) so one bad workout can
 *  never block the rest of the batch, and `setLastCheck` always advances to `endDate` once
 *  every workout in this window has been attempted — otherwise a single stuck workout would
 *  make every future check (button tap or app-resume) re-fail on that same workout forever. */
export async function importNewHealthConnectWorkouts(): Promise<HealthConnectImportResult> {
  if (!(await isHealthConnectAvailable())) return { imported: 0, failed: 0 };

  const startDate = getLastCheck();
  const endDate = new Date().toISOString();
  const { workouts } = await Health.queryWorkouts({
    startDate,
    endDate,
    includeHeartRate: true,
    includeRoute: true,
    includeSteps: false,
  });

  let imported = 0;
  let failed = 0;
  for (const workout of workouts) {
    if (!workout.route || workout.route.length === 0 || !workout.id) continue; // no route, nothing to replay
    const heartRate = workout.heartRate ?? [];
    const points = workout.route.filter(isValidPoint).map((r) => ({
      t: r.timestamp,
      lat: r.lat,
      lon: r.lng,
      ele: r.alt ?? null,
      hr: nearestHr(heartRate, new Date(r.timestamp).getTime()) ?? null,
    }));
    if (points.length === 0) continue; // every point in this workout was invalid — nothing to replay

    try {
      await api.post("/api/runs/healthconnect", {
        platformId: workout.id,
        name: workout.sourceName ?? null,
        points,
      });
      imported++;
    } catch {
      failed++;
    }
  }

  setLastCheck(endDate);
  return { imported, failed };
}
