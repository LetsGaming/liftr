<script setup lang="ts">
/**
 * The flip "backside" every Kraft-Ränge card shares — the account's overall rank, not the
 * individual exercise the card is otherwise about. Same content on every card's back (see
 * RankLifterSection.vue's flip wiring); this component doesn't know or care which exercise it's
 * attached to. Replaces the old per-card e1RM chart-expand behavior — that chart still lives in
 * ExerciseInfoPanel.vue's Statistiken tab, reached here via the "Rang-Statistiken" button instead.
 */
import { computed } from "vue";
import { ordinal, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import MuscleFigure from "../ui/MuscleFigure.vue";
import TierBadge from "./TierBadge.vue";

const props = defineProps<{
  tier: string | null;
  division: number | null;
  lp: number | null;
  peakTier?: string | null;
  peakDivision?: number | null;
  heat: Record<string, number>;
}>();
defineEmits<{ stats: []; back: [] }>();

const lpDisplay = computed(() => (props.lp == null ? null : Math.max(0, Math.round(props.lp))));

/** Same "name the peak, don't hide why the rank moved" wording as RankProgress.vue's own
 *  decay caption — the account-level equivalent of that per-exercise pattern. */
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
  <div class="rank-overall-back panel-reward" :class="tier ? `t-${tier}` : ''">
    <MuscleFigure :heat="heat" :size="84" />
    <p class="rob-heat-caption">Warm = zuletzt trainiert</p>

    <template v-if="tier != null && division != null">
      <div class="rob-tier">
        <TierBadge :tier="tier" />
        <div class="rob-tier-body">
          <span class="rob-tier-label">{{ TIER_LABEL_DE[tier as RankTier] }} {{ DIVISION_LABEL[division] }}</span>
          <span v-if="lpDisplay != null" class="rob-lp tnum">{{ lpDisplay }} LP</span>
        </div>
      </div>
      <p v-if="decayCaption" class="rob-decay">{{ decayCaption }}</p>
    </template>
    <p v-else class="rob-empty">Noch kein Gesamtrang.</p>

    <div class="rob-actions">
      <button type="button" class="btn-secondary" @click.stop="$emit('stats')">Rang-Statistiken</button>
      <button type="button" class="rob-back-btn" @click.stop="$emit('back')">Zurück</button>
    </div>
  </div>
</template>

<style scoped>
.rank-overall-back {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp2);
  text-align: center;
}
.rob-heat-caption {
  font-size: 11px;
  color: var(--dim);
  margin: 0;
}
.rob-tier {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  margin-top: var(--sp2);
}
.rob-tier-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.rob-tier-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  /* var(--tt): this readout sits directly on .panel-reward's own tier fill, unlike
     RankProgress.vue's .rp-tier which sits on neutral card glass — see that component's comment
     for the full reasoning on when --tt is/isn't safe to use. */
  color: var(--tt, var(--text));
}
.rob-lp {
  font-size: 12px;
  color: var(--dim);
}
.rob-decay {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--warning-hi);
  margin: 0;
}
.rob-empty {
  font-size: 12.5px;
  color: var(--dim);
  margin: var(--sp2) 0 0;
}
.rob-actions {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  margin-top: var(--sp2);
}
/* No global plain-text-button class exists in tokens.css to reuse here — a minimal local one
   rather than adding a new global variant for a single call site. */
.rob-back-btn {
  background: none;
  border: none;
  padding: var(--sp2) var(--sp1);
  min-height: var(--touch-target-min);
  font-size: 13px;
  font-weight: 700;
  color: var(--tt, var(--dim));
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
