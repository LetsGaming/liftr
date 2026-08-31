<script setup lang="ts">
/**
 * "Rangverteilung" — a donut showing how many exercises sit in each tier (engagement rework
 * W8). Pure client-side aggregation of `ranksStore.ranks` (no new fetch) grouped by `tier`.
 * Hand-rolled inline SVG arc math, matching ProgressChart.vue's "no charting library" rule —
 * every chart in this app is inline SVG, this one draws its arcs with `stroke-dasharray` on a
 * single circle per segment rather than a `<path>` arc command, which is enough for a donut
 * (no partial-circle geometry needed) and keeps the math trivial.
 *
 * Colors come from the same `.t-<tier>` design tokens RanksPage.vue/RankProgress.vue already
 * use for tier fills (tokens.css) — read directly as CSS custom properties rather than through
 * the `.t-<tier>` class indirection, since that class is only defined as `.t-plat` (not
 * `.t-platinum`) in tokens.css and would silently fail to resolve for the platinum segment.
 */
import { computed } from "vue";
import { TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import { useRanksStore } from "../../stores/ranksStore";

const TIER_ORDER: RankTier[] = ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"];
const TIER_COLOR_VAR: Record<RankTier, string> = {
  initiate: "var(--initiate-3)",
  apprentice: "var(--apprentice-3)",
  trainee: "var(--trainee-3)",
  athlete: "var(--athlete-3)",
  lifter: "var(--lifter-3)",
  advanced: "var(--advanced-3)",
  elite: "var(--elite-3)",
  expert: "var(--expert-3)",
  apex: "var(--apex-3)",
};

const ranksStore = useRanksStore();

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const segments = computed(() => {
  const counts = new Map<RankTier, number>();
  for (const r of ranksStore.ranks) {
    counts.set(r.tier as RankTier, (counts.get(r.tier as RankTier) ?? 0) + 1);
  }
  const total = ranksStore.ranks.length;
  if (total === 0) return [];

  let offset = 0;
  const out: { tier: RankTier; count: number; color: string; dasharray: string; dashoffset: number }[] = [];
  for (const tier of TIER_ORDER) {
    const count = counts.get(tier) ?? 0;
    if (count === 0) continue;
    const arcLen = (count / total) * CIRCUMFERENCE;
    out.push({
      tier,
      count,
      color: TIER_COLOR_VAR[tier],
      dasharray: `${arcLen} ${CIRCUMFERENCE - arcLen}`,
      dashoffset: -offset,
    });
    offset += arcLen;
  }
  return out;
});

const total = computed(() => ranksStore.ranks.length);
</script>

<template>
  <div v-if="ranksStore.loaded && total > 0" class="rank-donut">
    <div class="eyebrow rd-eyebrow">Rangverteilung</div>
    <div class="rd-body">
      <svg viewBox="0 0 100 100" class="rd-svg">
        <circle cx="50" cy="50" :r="RADIUS" fill="none" stroke="var(--surface-3)" stroke-width="14" />
        <circle
          v-for="s in segments"
          :key="s.tier"
          cx="50"
          cy="50"
          :r="RADIUS"
          fill="none"
          :stroke="s.color"
          stroke-width="14"
          :stroke-dasharray="s.dasharray"
          :stroke-dashoffset="s.dashoffset"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="47" text-anchor="middle" class="rd-total tnum">{{ total }}</text>
        <text x="50" y="62" text-anchor="middle" class="rd-total-label">Übungen</text>
      </svg>
      <ul class="rd-legend">
        <li v-for="s in segments" :key="s.tier" class="rd-legend-row">
          <span class="rd-swatch" :style="{ background: s.color }" />
          <span class="rd-legend-label">{{ TIER_LABEL_DE[s.tier] }}</span>
          <span class="rd-legend-count tnum">{{ s.count }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.rank-donut {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.rd-eyebrow {
  --eyebrow-color: var(--gold-3);
}
.rd-body {
  display: flex;
  align-items: center;
  gap: var(--sp5);
  flex-wrap: wrap;
}
.rd-svg {
  width: 120px;
  height: 120px;
  flex: none;
}
.rd-total {
  font-size: 20px;
  fill: var(--text);
}
.rd-total-label {
  font-size: 8px;
  fill: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rd-legend {
  flex: 1;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  list-style: none;
}
.rd-legend-row {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  font-size: 12.5px;
}
.rd-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.rd-legend-label {
  flex: 1;
  color: var(--dim);
}
.rd-legend-count {
  color: var(--text);
  font-size: 13px;
}
</style>
