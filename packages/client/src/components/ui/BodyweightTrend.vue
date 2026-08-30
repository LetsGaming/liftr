<script setup lang="ts">
/**
 * Bodyweight trend tile (plan Phase 6.7, mockup's "52,5 kg · stabil · 30 Tage"). Inline SVG
 * sparkline of the raw log plus an EMA-smoothed trend label from @liftr/shared — no charting
 * library, same rule as ProgressChart.vue.
 */
import { computeBodyweightTrend } from "@liftr/shared";
import { computed } from "vue";

interface Entry {
  date: string;
  weightKg: number;
}

const props = defineProps<{ entries: Entry[] }>();

const trend = computed(() => computeBodyweightTrend(props.entries));

const TREND_LABEL: Record<string, string> = { up: "steigend", down: "fallend", stable: "stabil" };

const series = computed(() => [...props.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));

const W = 200;
const H = 48;
const PAD = 3;

const points = computed(() => {
  const s = series.value;
  if (s.length < 2) return "";
  const min = Math.min(...s.map((d) => d.weightKg));
  const max = Math.max(...s.map((d) => d.weightKg));
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (s.length - 1);
  return s
    .map((d, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - ((d.weightKg - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});
</script>

<template>
  <div v-if="trend" class="bw-trend">
    <div class="tile tnum">
      {{ trend.emaKg.toFixed(1) }} kg <span class="dot">·</span> {{ TREND_LABEL[trend.trend] }}
      <span class="dot">·</span> {{ trend.daysSpan }} Tage
    </div>
    <svg v-if="points" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="spark">
      <polyline :points="points" fill="none" stroke="var(--blue-hi)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.bw-trend {
  margin-top: var(--sp3);
}
.tile {
  font-size: 13px;
  font-weight: 700;
  color: var(--dim);
}
.dot {
  color: var(--faint);
  font-weight: 400;
  margin: 0 2px;
}
.spark {
  width: 100%;
  max-width: 240px;
  height: 40px;
  margin-top: var(--sp2);
}
</style>
