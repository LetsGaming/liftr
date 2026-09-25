/**
 * Live phone-GPS run tracking, as opposed to the manual-entry quick-start in
 * useStartPlannedRoute.ts. Records a run in real time via the device's own built-in GPS (`@capacitor/geolocation`'s
 * `watchPosition`), with zero dependency on a smartwatch: every requirement here (start/pause/
 * finish, live distance/pace, XP/LP on finish) has to work from phone GPS alone, since that's the
 * whole point — a watch is a bonus later (`reconcileWithHealthConnect` on the server), never a
 * prerequisite.
 *
 * Deliberately a thin recorder, not a router: this composable only tracks and buffers points and
 * exposes live-computed stats. Submitting the finished run (via `runsStore.submitLiveRun`) and
 * navigating away from the tracking screen are the caller's job (RouteOverviewPage.vue /
 * RunsPage.vue via LiveRunScreen.vue).
 */
import { computed, onUnmounted, ref, shallowRef } from "vue";
import { Geolocation, type Position } from "@capacitor/geolocation";
import { pathDistanceM } from "@liftr/shared";
import { t } from "../i18n";
import type { PhoneGpsRunPoint } from "../services/runService";

export type LiveRunStatus = "idle" | "tracking" | "paused" | "finished";

/** Below this accuracy (meters, per `Position.coords.accuracy`), a fix is dropped rather than
 *  folded into the trace — an indoor/urban-canyon fix can jump 50m+ in one sample, which would
 *  register as a burst of fake pace. Generous enough that ordinary open-sky GPS noise (typically
 *  3–15m) never gets rejected. */
const MAX_FIX_ACCURACY_M = 30;

export function useLiveRun() {
  const status = ref<LiveRunStatus>("idle");
  const points = shallowRef<PhoneGpsRunPoint[]>([]);
  const error = ref<string | null>(null);

  let watchId: string | null = null;
  let startedAtMs: number | null = null;
  // Elapsed tracking excludes paused time — accumulated on each pause, resumed from on unpause,
  // exactly like a stopwatch's lap/split bookkeeping.
  let accumulatedMs = 0;
  let lastResumeMs: number | null = null;

  const distanceM = computed(() => pathDistanceM(points.value));

  const elapsedS = ref(0);
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  function startTicking() {
    stopTicking();
    tickTimer = setInterval(() => {
      const liveMs = lastResumeMs != null ? Date.now() - lastResumeMs : 0;
      elapsedS.value = Math.floor((accumulatedMs + liveMs) / 1000);
    }, 1000);
  }
  function stopTicking() {
    if (tickTimer != null) clearInterval(tickTimer);
    tickTimer = null;
  }

  const paceSPerKm = computed(() => {
    const km = distanceM.value / 1000;
    if (km < 0.05 || elapsedS.value === 0) return null; // too little distance yet for a meaningful pace
    return elapsedS.value / km;
  });

  function onFix(pos: Position) {
    // Dropped while paused too — otherwise distance (computed from points.value) keeps growing
    // against elapsed time that correctly excludes the paused interval, feeding an artificially
    // fast, implausible pace into the server's plausibility gate on finish.
    if (status.value !== "tracking") return;
    if (pos.coords.accuracy != null && pos.coords.accuracy > MAX_FIX_ACCURACY_M) return;
    points.value = [
      ...points.value,
      {
        t: new Date(pos.timestamp).toISOString(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ele: pos.coords.altitude ?? null,
        hr: null, // phone GPS alone never has heart rate — a later Health Connect sync can add it
        cadence: null,
      },
    ];
  }

  async function start() {
    if (status.value !== "idle") return;
    error.value = null;
    try {
      const perms = await Geolocation.checkPermissions();
      if (perms.location !== "granted" && perms.coarseLocation !== "granted") {
        const requested = await Geolocation.requestPermissions();
        if (requested.location !== "granted" && requested.coarseLocation !== "granted") {
          error.value = t("liveRun.locationDenied");
          return;
        }
      }
      watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, (pos: Position | null, err?: Error) => {
        if (err) {
          error.value = t("liveRun.gpsSignalLost");
          return;
        }
        if (pos) onFix(pos);
      });
      startedAtMs = Date.now();
      lastResumeMs = startedAtMs;
      accumulatedMs = 0;
      points.value = [];
      status.value = "tracking";
      startTicking();
    } catch {
      error.value = globalThis.isSecureContext
        ? t("liveRun.startFailedDevice")
        : t("liveRun.startFailedInsecure");
    }
  }

  function pause() {
    if (status.value !== "tracking") return;
    if (lastResumeMs != null) accumulatedMs += Date.now() - lastResumeMs;
    lastResumeMs = null;
    status.value = "paused";
    stopTicking();
  }

  function resume() {
    if (status.value !== "paused") return;
    lastResumeMs = Date.now();
    status.value = "tracking";
    startTicking();
  }

  async function clearWatch() {
    if (watchId != null) {
      await Geolocation.clearWatch({ id: watchId });
      watchId = null;
    }
    stopTicking();
  }

  /** Stops tracking and returns everything needed to submit the run — does not itself call the
   *  API, leaving that (and any error handling/toast) to the caller (see LiveRunScreen.vue). */
  async function finish() {
    if (status.value === "tracking") pause();
    await clearWatch();
    status.value = "finished";
    return {
      startedAt: startedAtMs != null ? new Date(startedAtMs).toISOString() : new Date().toISOString(),
      durationS: elapsedS.value,
      distanceM: distanceM.value,
      points: points.value,
    };
  }

  async function discard() {
    await clearWatch();
    status.value = "idle";
    points.value = [];
    elapsedS.value = 0;
    accumulatedMs = 0;
    startedAtMs = null;
    lastResumeMs = null;
  }

  onUnmounted(() => {
    void clearWatch();
  });

  return {
    status,
    points,
    error,
    distanceM,
    elapsedS,
    paceSPerKm,
    start,
    pause,
    resume,
    finish,
    discard,
  };
}
