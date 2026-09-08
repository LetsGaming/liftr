<script setup lang="ts">
/**
 * "Rangverteilung" — a donut showing how many exercises sit in each tier. Pure client-side
 * aggregation of `ranksStore.ranks` grouped by `tier`, no separate fetch.
 *
 * Every chart in this app is inline SVG rather than a charting library (see ProgressChart.vue).
 * Segments are drawn with `stroke-dasharray` on stacked circles rather than `<path>` arcs —
 * a donut needs no partial-circle geometry, so this keeps the math trivial.
 *
 * Colors come from the same per-tier tokens (tokens.css) RanksPage.vue/RankProgress.vue use
 * for tier fills, read directly as CSS custom properties (e.g. `--advanced-3`) instead of via
 * the `.t-<tier>` class, since each legend row needs a single accent color without mounting a
 * `.t-<tier>`-classed element per row.
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
        <!-- Arcs are aria-hidden: the legend below already carries this data as real text. -->
        <circle cx="50" cy="50" :r="RADIUS" fill="none" stroke="var(--surface-3)" stroke-width="14" aria-hidden="true" />
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
          aria-hidden="true"
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
  /* Shares the surface-hybrid bg/blur/shadow with RankUpCalendar.vue in the same
     .rank-analytics row. Keeps its own semantic border instead of the generic gradient-hairline
     ::after, since the border already signals the account's current overall tier and a second
     ring would compete with it. This is an analytics card, not a reward, so it stays a plain
     fill rather than .panel-reward's full tier gradient.
     --tier-accent falls back to --line for a brand-new account with no overall rank yet
     (App.vue's overallTierClass is "" until then, so --tier-accent is unset). */
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  box-shadow: var(--surface-hybrid-shadow);
  border: 1px solid var(--tier-accent, var(--line));
  border-radius: var(--r-xl);
  padding: var(--sp5);
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.rd-eyebrow {
  --eyebrow-color: var(--advanced-3);
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
