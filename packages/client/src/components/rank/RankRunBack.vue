<script setup lang="ts">
/**
 * The flip "backside" content of a Läufe-Ränge card — the running equivalent of
 * RankExerciseBack.vue. There's no muscle diagram to show here (no per-category muscle data
 * exists for a run), so the lead content is this category's personal best instead: the closest
 * "something extra worth flipping to" a running category has. Tier/LP/decay chrome below it is
 * identical to the Kraft back face and comes from the same global `.rank-card-back` rules
 * (styles/rank-card.css) — only the lead content above differs per caller.
 *
 * `prLabel`/`prDate` arrive pre-formatted from RankRunnerSection.vue, which already has to choose
 * the right PR source (a "time" PR for a distance category, a "speed" PR for a single-speed
 * activity like Gehen/Wandern) and the right formatter for each — this component stays a plain
 * renderer, same division of responsibility RankProgress.vue's own `nextTargetLabel` prop follows.
 */
import { computed } from "vue";
import { ordinal, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{
  tier: string | null;
  division: number | null;
  lp: number | null;
  peakTier?: string | null;
  peakDivision?: number | null;
  prLabel?: string | null;
  prDate?: string | null;
}>();

const lpDisplay = computed(() => (props.lp == null ? null : Math.max(0, Math.round(props.lp))));

/** Same "name the peak, don't hide why the rank moved" wording as RankProgress.vue's own decay
 *  caption and RankExerciseBack.vue's per-exercise version of it. */
const decayCaption = computed(() => {
  if (props.tier == null || props.division == null) return null;
  if (!props.peakTier || props.peakDivision == null) return null;
  const currentOrdinal = ordinal(props.tier as Tier, props.division as Division);
  const peakOrdinal = ordinal(props.peakTier as Tier, props.peakDivision as Division);
  if (currentOrdinal >= peakOrdinal) return null;
  return `Schon mal erreicht: ${TIER_LABEL_DE[props.peakTier as RankTier]} ${DIVISION_LABEL[props.peakDivision] ?? props.peakDivision}`;
});
</script>

<template>
  <div class="rank-card-back rank-run-back">
    <div class="reb-eyebrow">Bestleistung</div>
    <template v-if="prLabel != null && prDate != null">
      <div class="rrb-pr-value tnum">{{ prLabel }}</div>
      <div class="rrb-pr-date">{{ prDate }}</div>
    </template>
    <p v-else class="reb-empty">Noch kein Rekord für diese Distanz.</p>

    <template v-if="tier != null && division != null">
      <div class="reb-tier">
        <TierBadge class="reb-badge" :tier="tier" />
        <div class="reb-tier-body">
          <span class="reb-tier-label">{{ TIER_LABEL_DE[tier as RankTier] }} {{ DIVISION_LABEL[division] }}</span>
          <span v-if="lpDisplay != null" class="reb-lp tnum">{{ lpDisplay }} LP</span>
        </div>
      </div>
      <p v-if="decayCaption" class="reb-decay">{{ decayCaption }}</p>
    </template>
  </div>
</template>

<style scoped>
.rrb-pr-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
}
.rrb-pr-date {
  font-size: 11.5px;
  color: var(--dim);
}
</style>
