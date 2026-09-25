<script setup lang="ts">
/**
 * Progress chart per exercise: e1RM (or best reps, for bodyweight exercises) over time.
 * Hand-drawn inline SVG polyline rather than a charting library — a full charting dependency
 * costs more bundle size than four small sparklines are worth on a PWA. Reuses the existing
 * /api/exercises/:id/history route, which already returns {weightKg, reps, loggedAt, isWarmup}
 * per set.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { estimateE1rm } from "@liftr/shared";
import { useSparklinePoints } from "../../composables/useSparklinePoints";
import EmptyNote from "../base/EmptyNote.vue";

interface HistorySet {
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

const props = defineProps<{ sets: HistorySet[]; isBodyweight: boolean }>();

const { t } = useI18n();

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

const { points } = useSparklinePoints(
  computed(() => series.value.map((d) => d.value)),
  { width: W, height: H, pad: PAD },
);

const latestValue = computed(() => series.value[series.value.length - 1]?.value ?? null);
const latest = computed(() => {
  if (latestValue.value == null) return null;
  const n = Math.round(latestValue.value);
  return props.isBodyweight ? t("rank.progressChart.latestReps", { n }) : t("rank.progressChart.latestE1rm", { n });
});
const trendUp = computed(() => {
  const s = series.value;
  return s.length >= 2 && s[s.length - 1]!.value >= s[0]!.value;
});

/** Screen-reader label for the sparkline: `latest` alone only conveys the final value, not the
 *  trend shape, so the aria-label spells out direction and start/end values explicitly. */
const trendLabel = computed(() => {
  const s = series.value;
  if (s.length < 2) return null;
  const first = Math.round(s[0]!.value);
  const last = Math.round(s[s.length - 1]!.value);
  const unit = props.isBodyweight ? t("rank.progressChart.unitReps") : t("rank.progressChart.unitE1rm");
  const direction =
    last > first ? t("rank.progressChart.trendUp") : last < first ? t("rank.progressChart.trendDown") : t("rank.progressChart.trendFlat");
  return t("rank.progressChart.trendLabelFormat", { direction, first, last, unit });
});
</script>

<template>
  <div class="progress-chart">
    <svg v-if="series.length >= 2" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="spark" role="img" :aria-label="trendLabel!">
      <polyline :points="points" fill="none" :stroke="trendUp ? 'var(--success)' : 'var(--dim)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <EmptyNote v-else class="empty" align="start">{{ t("rank.progressChart.empty") }}</EmptyNote>
    <div v-if="latest != null" class="latest tnum">
      {{ latest }}
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
</style>
