<script setup lang="ts">
/**
 * Run replay (plan Phase 4.3): animates the stored trackpoint array back, not just a static
 * route line. Interpolates between points so the marker glides even with sparse/variable
 * sampling; time gaps (pauses, GPS loss) are collapsed to a short fixed pause in playback time
 * rather than either standing still for the real gap duration or teleporting across it.
 * HR/cadence readouts only render when the source file actually wrote those fields — audit §7
 * ties replay fidelity directly to what the watch/file provides, never fabricated.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import RunMap from "./RunMap.vue";
import type { RunPoint } from "../../stores/runsStore";

const props = defineProps<{ points: RunPoint[] }>();

const PAUSE_GAP_MS = 10_000;
const PAUSE_COLLAPSE_MS = 1_500;

const mapRef = ref<InstanceType<typeof RunMap> | null>(null);
const playing = ref(false);
const playheadMs = ref(0);
const speed = ref(1);
const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Playback-time schedule: real point-to-point gaps collapsed above PAUSE_GAP_MS. */
const schedule = computed(() => {
  const pts = props.points;
  if (pts.length === 0) return [];
  const times = [0]; // relative playback ms from the start of the run, not an absolute epoch time
  for (let i = 1; i < pts.length; i++) {
    const raw = new Date(pts[i]!.t).getTime() - new Date(pts[i - 1]!.t).getTime();
    const step = raw > PAUSE_GAP_MS ? PAUSE_COLLAPSE_MS : Math.max(raw, 0);
    times.push(times[i - 1]! + step);
  }
  return times;
});

const totalMs = computed(() => schedule.value[schedule.value.length - 1] ?? 0);
const hasHr = computed(() => props.points.some((p) => p.hr != null));
const hasCadence = computed(() => props.points.some((p) => p.cadence != null));

interface Frame {
  lat: number;
  lon: number;
  hr: number | null;
  cadence: number | null;
  paceSPerKm: number | null;
}

/** Find the bracketing pair of points for `ms` and linearly interpolate position/readouts. */
function frameAt(ms: number): Frame | null {
  const sched = schedule.value;
  const pts = props.points;
  if (pts.length === 0) return null;
  if (ms <= 0) return { lat: pts[0]!.lat, lon: pts[0]!.lon, hr: pts[0]!.hr, cadence: pts[0]!.cadence, paceSPerKm: null };

  let i = 1;
  while (i < sched.length && sched[i]! < ms) i++;
  if (i >= sched.length) {
    const last = pts[pts.length - 1]!;
    return { lat: last.lat, lon: last.lon, hr: last.hr, cadence: last.cadence, paceSPerKm: null };
  }

  const a = pts[i - 1]!;
  const b = pts[i]!;
  const ta = sched[i - 1]!;
  const tb = sched[i]!;
  const frac = tb > ta ? (ms - ta) / (tb - ta) : 0;
  const lat = a.lat + (b.lat - a.lat) * frac;
  const lon = a.lon + (b.lon - a.lon) * frac;
  const hr = a.hr != null && b.hr != null ? a.hr + (b.hr - a.hr) * frac : (a.hr ?? b.hr);
  const cadence = a.cadence ?? b.cadence;

  // instantaneous pace from this segment's real distance/time (haversine, small angle ok)
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const distM = 2 * R * Math.asin(Math.sqrt(h));
  const realDtS = (new Date(b.t).getTime() - new Date(a.t).getTime()) / 1000;
  const paceSPerKm = distM > 0.5 && realDtS > 0 ? realDtS / (distM / 1000) : null;

  return { lat, lon, hr, cadence, paceSPerKm };
}

const currentFrame = computed(() => frameAt(playheadMs.value));

watch(currentFrame, (f) => {
  if (f) mapRef.value?.setMarkerPosition(f.lat, f.lon);
});

let rafId: number | null = null;
let lastTs: number | null = null;

function tick(ts: number) {
  if (lastTs != null) {
    playheadMs.value = Math.min(totalMs.value, playheadMs.value + (ts - lastTs) * speed.value);
  }
  lastTs = ts;
  if (playheadMs.value >= totalMs.value) {
    playing.value = false;
    lastTs = null;
    return;
  }
  rafId = requestAnimationFrame(tick);
}

function play() {
  if (playheadMs.value >= totalMs.value) playheadMs.value = 0;
  playing.value = true;
  lastTs = null;
  rafId = requestAnimationFrame(tick);
}
function pause() {
  playing.value = false;
  if (rafId != null) cancelAnimationFrame(rafId);
  lastTs = null;
}
function toggle() {
  if (playing.value) pause();
  else play();
}
function seek(pct: number) {
  pause();
  playheadMs.value = (pct / 100) * totalMs.value;
}
onBeforeUnmount(pause);

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtPace(sPerKm: number | null): string {
  if (sPerKm == null) return "–";
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}
</script>

<template>
  <div class="replay">
    <div class="map-wrap">
      <RunMap ref="mapRef" :points="points" />
    </div>

    <div class="controls">
      <button class="play-btn" @click="toggle">{{ playing ? "⏸" : "▶" }}</button>
      <input
        class="scrubber"
        type="range"
        min="0"
        max="100"
        :value="totalMs > 0 ? (playheadMs / totalMs) * 100 : 0"
        @input="seek(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="time tnum">{{ fmt(playheadMs) }} / {{ fmt(totalMs) }}</span>
    </div>

    <div class="speed-row">
      <span class="eyebrow">Geschwindigkeit</span>
      <button v-for="s in [1, 2, 4, 8]" :key="s" class="speed-btn" :class="{ active: speed === s }" @click="speed = s">
        {{ s }}×
      </button>
    </div>

    <div class="readouts">
      <div class="readout">
        <span class="eyebrow">Pace</span>
        <span class="tnum">{{ fmtPace(currentFrame?.paceSPerKm ?? null) }}</span>
      </div>
      <div v-if="hasHr" class="readout">
        <span class="eyebrow">Puls</span>
        <span class="tnum">{{ currentFrame?.hr != null ? Math.round(currentFrame.hr) + " bpm" : "–" }}</span>
      </div>
      <div v-if="hasCadence" class="readout">
        <span class="eyebrow">Kadenz</span>
        <span class="tnum">{{ currentFrame?.cadence ?? "–" }}</span>
      </div>
    </div>
    <p v-if="reduceMotion" class="reduce-note">Automatisches Abspielen deaktiviert (reduzierte Bewegung) — manuell scrubben funktioniert weiterhin.</p>
  </div>
</template>

<style scoped>
.replay {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.map-wrap {
  height: 320px;
}
.controls {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.play-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  /* Was --blue-hi/--blue with white text — the exact combination tokens.css:235-241 documents
     as measured 2.3-2.7:1 (fails WCAG AA) and fixed for .btn-primary; same fix here. */
  background: linear-gradient(135deg, var(--blue-lo), var(--blue-ink));
  color: #fff;
  font-size: 15px;
  flex: none;
}
.scrubber {
  flex: 1;
}
.time {
  font-size: 12.5px;
  color: var(--dim);
  flex: none;
  min-width: 80px;
  text-align: right;
}
.speed-row {
  display: flex;
  align-items: center;
  gap: var(--sp2);
}
.speed-row .eyebrow {
  margin-right: var(--sp2);
}
.speed-btn {
  padding: 6px 12px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 700;
}
.speed-btn.active {
  background: var(--blue);
  color: #fff;
}
.readouts {
  display: flex;
  gap: var(--sp5);
}
.readout {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.readout span:last-child {
  font-size: 15px;
  font-weight: 700;
}
.reduce-note {
  font-size: 11.5px;
  color: var(--faint);
}
</style>
