/**
 * Health Connect import (plan Phase 5). Runs entirely in the app itself via `capacitor-health`
 * (mley/capacitor-health) — its `queryWorkouts({includeRoute, includeHeartRate})` genuinely
 * reads Health Connect's real `ExerciseSessionRecord.exerciseRouteResult` API (verified by
 * reading its native Kotlin source, not just its TypeScript types), which is the one thing that
 * ruled out the two other Capacitor Health Connect plugins checked first. No separate companion
 * app, no WorkManager background job: this checks for new workouts on app resume instead, which
 * is enough to remove the manual GPX/FIT export ritual without the complexity (and
 * untestability, in this dev environment) of a true background service.
 */
import { Capacitor } from "@capacitor/core";
import { Health } from "capacitor-health";
import { api } from "../lib/api";

const LAST_CHECK_KEY = "liftr.healthconnect.lastCheck";

/** Only meaningful on Android — Health Connect doesn't exist on iOS/web. */
export function isHealthConnectAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (!isHealthConnectAvailable()) return false;
  const res = await Health.requestHealthPermissions({
    permissions: ["READ_WORKOUTS", "READ_ROUTE", "READ_HEART_RATE"],
  });
  return res.permissions.every((p) => Object.values(p).every(Boolean));
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

/** Checks Health Connect for workouts since the last check, importing any with a real route. */
export async function importNewHealthConnectWorkouts(): Promise<number> {
  if (!isHealthConnectAvailable()) return 0;

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
  for (const workout of workouts) {
    if (!workout.route || workout.route.length === 0 || !workout.id) continue; // no route, nothing to replay
    const heartRate = workout.heartRate ?? [];
    const points = workout.route.map((r) => ({
      t: r.timestamp,
      lat: r.lat,
      lon: r.lng,
      ele: r.alt ?? null,
      hr: nearestHr(heartRate, new Date(r.timestamp).getTime()) ?? null,
    }));

    await api.post("/api/runs/healthconnect", {
      platformId: workout.id,
      name: workout.sourceName ?? null,
      points,
    });
    imported++;
  }

  setLastCheck(endDate);
  return imported;
}
