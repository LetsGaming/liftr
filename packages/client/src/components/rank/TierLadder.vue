<script setup lang="ts">
/**
 * The full 9-tier ladder (rework Phase 3 — critique finding: 36 tier tokens exist, each
 * referenced exactly once, reaching only a single rank card; nowhere in the app could a user
 * see where they stand relative to the whole ladder, only their current band in isolation). One
 * shared component, two call sites: RanksPage's hero (real position) and OverviewPage's
 * first-run state (Initiate lit, nothing else known yet).
 *
 * Divisions are NOT uniform across tiers (TIER_DIVISION_COUNT: 6/5/5/4/4/3/3/2/1 — more at the
 * bottom for frequent early rank-ups, fewer at the top since Apex is a single real milestone).
 * This only ever labels the *current* tier's division (via DIVISION_LABEL), so it never assumes
 * three divisions or any other fixed count.
 *
 * Click-to-expand (UI audit fix): a rung only ever showed its own current-tier division, with no
 * way to see any other tier's division breakdown at all — the ladder read as a flat list of tier
 * names, not a real ladder with per-tier structure. Purely client-side: TIER_DIVISION_COUNT
 * already gives every tier's division count, so expanding a rung just renders
 * `1..count` inline, no fetch needed. Only one rung expands at a time (an accordion, not
 * independent toggles) to keep the list from growing unbounded on a 9-tier ladder.
 */
import { computed, ref } from "vue";
import { ordinal, TIER_DIVISION_COUNT, TIERS, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";

const props = defineProps<{
  currentTier: string | null;
  currentDivision?: number | null;
  /** Rank engine redesign R1/R2 (critique finding, clarify P2): fetched by every caller
   *  already, but never shown here — a demoted user saw a ladder identical to one who'd never
   *  reached the higher tier. Naming it reuses RankProgress.vue's own per-exercise decay-caption
   *  pattern ("Schon mal erreicht: ...") on the one element it was never applied to: the hero
   *  ladder itself. Omit at call sites with no peak data (e.g. OverviewPage's first-run state). */
  peakTier?: string | null;
  peakDivision?: number | null;
}>();

const currentIndex = () => (props.currentTier ? TIERS.indexOf(props.currentTier as Tier) : -1);

function rungState(tier: Tier): "current" | "reached" | "ahead" {
  const idx = TIERS.indexOf(tier);
  const cur = currentIndex();
  if (cur === -1) return idx === 0 ? "current" : "ahead"; // no rank yet — only Initiate is "lit"
  if (idx === cur) return "current";
  return idx < cur ? "reached" : "ahead";
}

const peakCaption = computed(() => {
  if (!props.currentTier || props.currentDivision == null) return null;
  if (!props.peakTier || props.peakDivision == null) return null;
  const currentOrdinal = ordinal(props.currentTier as Tier, props.currentDivision as Division);
  const peakOrdinal = ordinal(props.peakTier as Tier, props.peakDivision as Division);
  if (currentOrdinal >= peakOrdinal) return null;
  return `Schon mal erreicht: ${TIER_LABEL_DE[props.peakTier as RankTier]} ${DIVISION_LABEL[props.peakDivision] ?? props.peakDivision}`;
});

const expandedTier = ref<Tier | null>(null);

function divisions(tier: Tier): number[] {
  const count = TIER_DIVISION_COUNT[tier];
  // Divisions count DOWN (III -> II -> I, i.e. highest number = furthest from Apex), matching
  // DIVISION_LABEL/ordinal()'s own convention elsewhere in the app (RankProgress.vue, etc.).
  return Array.from({ length: count }, (_, i) => count - i);
}

function toggleExpand(tier: Tier) {
  expandedTier.value = expandedTier.value === tier ? null : tier;
}
</script>

<template>
  <ol class="tier-ladder">
    <li
      v-for="tier in [...TIERS].reverse()"
      :key="tier"
      class="rung"
      :class="[`t-${tier}`, rungState(tier), { 'panel-reward': rungState(tier) === 'current', expanded: expandedTier === tier }]"
    >
      <button type="button" class="rung-row" :aria-expanded="expandedTier === tier" @click="toggleExpand(tier)">
        <span class="badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="TIER_BADGE_PATH[tier as RankTier]" /></svg>
        </span>
        <span class="rung-label">
          <span class="rung-label-row">
            {{ TIER_LABEL_DE[tier as RankTier] }}
            <b v-if="rungState(tier) === 'current' && currentDivision != null" class="tnum">
              {{ DIVISION_LABEL[currentDivision] ?? currentDivision }}
            </b>
          </span>
          <span v-if="rungState(tier) === 'current' && peakCaption" class="rung-peak">{{ peakCaption }}</span>
        </span>
        <span v-if="rungState(tier) === 'ahead'" class="rung-count">{{ TIER_DIVISION_COUNT[tier] }} Stufen</span>
        <svg class="chevron" :class="{ open: expandedTier === tier }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <ul v-if="expandedTier === tier" class="division-list">
        <li
          v-for="d in divisions(tier)"
          :key="d"
          class="division-chip"
          :class="{ current: rungState(tier) === 'current' && currentDivision === d }"
        >
          {{ DIVISION_LABEL[d] ?? d }}
        </li>
      </ul>
    </li>
  </ol>
</template>

<style scoped>
.tier-ladder {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0 auto var(--sp4);
  max-width: var(--content-w-standard);
}
.rung {
  border-radius: var(--r-sm);
  transition: opacity var(--dur-base) var(--ease-out);
}
.rung-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: 6px var(--sp3);
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  border-radius: inherit;
  min-height: var(--touch-target-min);
}
.chevron {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--faint);
  transition: transform var(--dur-fast) var(--ease-out);
}
.chevron.open {
  transform: rotate(180deg);
}
.division-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 var(--sp3) 10px calc(26px + var(--sp3) + var(--sp3));
  animation: pop-in var(--dur-fast) var(--ease-out) both;
}
.rung.current .division-list {
  padding-left: calc(34px + var(--sp3) + var(--sp3));
}
.division-chip {
  font-size: 11px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-3);
  border-radius: 999px;
  padding: 3px 10px;
}
.division-chip.current {
  color: var(--tt, var(--text));
  background: var(--tier-accent, var(--nebula-1));
}
.rung .badge {
  width: 26px;
  height: 26px;
  flex: none;
}
.rung-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--dim);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rung-label-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.rung-label b {
  font-size: 11px;
  color: var(--tt, var(--text));
}
/* Same "second-loudest, name it, don't hide it" treatment as RankProgress.vue's per-exercise
   .rp-decay — the account-level equivalent, on the one element that previously never showed it. */
.rung-peak {
  font-size: 11px;
  font-weight: 700;
  color: var(--fire-hi);
}
.rung-count {
  font-size: 11px;
  color: var(--faint);
}

/* Already-climbed tiers: legible, not the focus — full badge color, quieter label. */
.rung.reached {
  opacity: 0.65;
}
.rung.reached .rung-label {
  color: var(--faint);
}

/* The one rung that matters: full size, full saturation, .panel-reward's tier-tinted background
   (tokens.css) so it reads as "you are here" at a glance, not just another list row. */
.rung.current {
  opacity: 1;
}
.rung.current .badge {
  width: 34px;
  height: 34px;
}
.rung.current .rung-label {
  font-size: 13.5px;
  color: var(--tt, var(--text));
}

/* Not reached yet: greyed silhouette, not hidden — the aspirational/teaser half of the ladder. */
.rung.ahead {
  opacity: 0.4;
}
.rung.ahead .badge {
  filter: grayscale(1);
}
</style>
