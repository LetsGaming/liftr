<script setup lang="ts">
/**
 * Progress chart per exercise (plan Phase 2.5): e1RM (or best reps, for bodyweight exercises)
 * over time. Deliberately a hand-drawn inline SVG polyline, not a charting library — the plan
 * is explicit about this ("lightweight inline SVG... do not pull in a charting library for
 * four chart types; it costs more bundle than the charts are worth on a PWA that must load in
 * a basement"). Reuses the already-existing /api/exercises/:id/history route — no new endpoint
 * needed, since it already returns exactly {weightKg, reps, loggedAt, isWarmup} per set.
 */
import { computed } from "vue";
import { estimateE1rm } from "@liftr/shared";

interface HistorySet {
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

const props = defineProps<{ sets: HistorySet[]; isBodyweight: boolean }>();

interface DayBest {
  date: string;
  value: number; // e1RM (kg) for loaded lifts, best reps for bodyweight
}

/** Best value per calendar day, ascending — a day's PR set represents that day on the chart. */
const series = computed<DayBest[]>(() => {
  const byDay = new Map<string, number>();
  for (const s of props.sets) {
    if (s.isWarmup) continue;
    const day = s.loggedAt.slice(0, 10);
    const value = props.isBodyweight ? s.reps : s.weightKg != null ? estimateE1rm(s.weightKg, s.reps).e1rm : 0;
    if (!byDay.has(day) || value > byDay.get(day)!) byDay.set(day, value);
  }
  return [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
});

const W = 280;
const H = 64;
const PAD = 4;

const points = computed(() => {
  const s = series.value;
  if (s.length === 0) return "";
  const min = Math.min(...s.map((d) => d.value));
  const max = Math.max(...s.map((d) => d.value));
  const span = max - min || 1;
  const stepX = s.length > 1 ? (W - PAD * 2) / (s.length - 1) : 0;
  return s
    .map((d, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - ((d.value - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

const latest = computed(() => series.value[series.value.length - 1]?.value ?? null);
const trendUp = computed(() => {
  const s = series.value;
  return s.length >= 2 && s[s.length - 1]!.value >= s[0]!.value;
});
</script>

<template>
  <div class="progress-chart">
    <svg v-if="series.length >= 2" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="spark">
      <!-- A text-muted token must never be a chart stroke — --faint (even at its raised,
           AA-passing value) reads as "barely there" for data, which is wrong; a downward
           trend is still real data, just not the "good" color. Use --dim (readable, neutral)
           instead of the accent when the trend isn't up. -->
      <polyline :points="points" fill="none" :stroke="trendUp ? 'var(--green)' : 'var(--dim)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <p v-else class="empty">Noch nicht genug Daten für einen Verlauf.</p>
    <div v-if="latest != null" class="latest tnum">
      {{ isBodyweight ? `${Math.round(latest)} Wdh.` : `${Math.round(latest)} kg e1RM` }}
    </div>
  </div>
</template>

<style scoped>
.progress-chart {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.spark {
  width: 140px;
  height: 32px;
  flex: none;
}
.latest {
  font-size: 12.5px;
  color: var(--dim);
  font-weight: 700;
}
.empty {
  font-size: 12px;
  color: var(--faint);
}
</style>
