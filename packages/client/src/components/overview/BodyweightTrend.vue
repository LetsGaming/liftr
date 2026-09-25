<script setup lang="ts">
/**
 * Bodyweight trend tile. Inline SVG sparkline of the raw log plus an EMA-smoothed trend label
 * from @liftr/shared — no charting library, same rule as ProgressChart.vue.
 */
import { computeBodyweightTrend, type BodyweightTrendDirection } from "@liftr/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSparklinePoints } from "../../composables/useSparklinePoints";

interface Entry {
  date: string;
  weightKg: number;
}

const props = defineProps<{ entries: Entry[] }>();
const { t } = useI18n();

const trend = computed(() => computeBodyweightTrend(props.entries));

const TREND_LABEL_KEY: Record<BodyweightTrendDirection, string> = {
  up: "overview.bodyweightTrend.up",
  down: "overview.bodyweightTrend.down",
  stable: "overview.bodyweightTrend.stable",
};

const series = computed(() => [...props.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));

const W = 200;
const H = 48;
const PAD = 3;

const { points } = useSparklinePoints(
  computed(() => series.value.map((d) => d.weightKg)),
  { width: W, height: H, pad: PAD },
);
</script>

<template>
  <div v-if="trend" class="bw-trend">
    <div class="tile tnum">
      {{ trend.emaKg.toFixed(1) }} kg <span class="dot">·</span> {{ t(TREND_LABEL_KEY[trend.trend]) }}
      <span class="dot">·</span> {{ t("overview.bodyweightTrend.daysSpan", { n: trend.daysSpan }) }}
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
