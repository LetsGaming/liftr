<script setup lang="ts">
/**
 * The flip "backside" content of a Kraft-Ränge card — renamed from RankOverallBack.vue as part of
 * fixing a real data bug: this used to bind the ACCOUNT'S overall rank (identical on every card)
 * instead of the specific exercise the card is about, and used MuscleFigure's `heat` (readiness/
 * recency) mode instead of its `primary`/`secondary` (what-does-this-exercise-train) mode — also
 * account-wide data on a per-exercise face. Both are now genuinely per-exercise: the caller
 * (RankLifterSection.vue, via RankFlipCard.vue) passes this row's own RankRow fields and this
 * row's own catalog muscle list, the same primary/secondary split ExerciseInfoPanel.vue already
 * uses for its own muscle figure. Still replaces the old per-card e1RM chart-expand — that chart
 * lives in ExerciseInfoPanel.vue's Statistiken tab, reached here via "Rang-Statistiken".
 *
 * Pure content now, not a self-contained card: RankFlipCard.vue's own flip-face supplies the
 * surface (background, border, padding, sizing, centering) that this used to provide itself via
 * `.panel-reward` — the whole point of that split (see RankFlipCard.vue's own header comment) is
 * that the back face gets the exact same full card box the front face does, not a smaller nested
 * container. Text tokens follow accordingly: this sits on the card's own NEUTRAL glass now, not a
 * saturated tier fill, so it reads from `--text`/`--dim` like RankProgress.vue's card/hero variants
 * do, not the on-metal `--tt` tint `.panel-reward` content needs.
 *
 * No "Zurück" button: RankFlipCard.vue's whole back face is tappable to flip back now (matching
 * the front face's whole-card tap target), the same as tapping the card was always how you got
 * TO the back in the first place — a redundant explicit control here just for the reverse
 * direction was asymmetric. "Rang-Statistiken" stays as the one explicit action, since opening the
 * stats panel isn't undoable by tapping the card again the way a flip is.
 */
import { computed } from "vue";
import { ordinal, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import MuscleFigure from "../ui/MuscleFigure.vue";
import TierBadge from "./TierBadge.vue";

const props = withDefaults(
  defineProps<{
    tier: string | null;
    division: number | null;
    lp: number | null;
    peakTier?: string | null;
    peakDivision?: number | null;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
  }>(),
  { primaryMuscles: () => [], secondaryMuscles: () => [] },
);
defineEmits<{ stats: [] }>();

const lpDisplay = computed(() => (props.lp == null ? null : Math.max(0, Math.round(props.lp))));

/** Same "name the peak, don't hide why the rank moved" wording as RankProgress.vue's own
 *  decay caption — now the per-exercise version of that pattern (this used to be the account-
 *  level equivalent; see this file's header comment). */
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
  <div class="rank-exercise-back">
    <div class="reb-eyebrow">Trainierte Muskeln</div>
    <MuscleFigure :primary="primaryMuscles" :secondary="secondaryMuscles" :size="76" />
    <div class="reb-legend">
      <span><i class="pri" />Primär</span>
      <span><i class="sec" />Sekundär</span>
    </div>

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
    <p v-else class="reb-empty">Noch kein Rang für diese Übung.</p>

    <div class="reb-actions">
      <button type="button" class="btn-secondary" @click.stop="$emit('stats')">Rang-Statistiken</button>
    </div>
  </div>
</template>

<style scoped>
.rank-exercise-back {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp2);
  text-align: center;
}
.reb-eyebrow {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
}
.reb-legend {
  display: flex;
  gap: var(--sp3);
  justify-content: center;
  font-size: 10.5px;
  color: var(--dim);
}
.reb-legend i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  display: inline-block;
  margin-right: 4px;
  vertical-align: -1px;
}
.reb-legend .pri {
  background: var(--blue-hi);
}
.reb-legend .sec {
  /* Same --muscle-secondary token ExerciseInfoPanel.vue's own legend draws from, so both stay in
     sync across themes rather than a second hardcoded copy. */
  background: var(--muscle-secondary);
}
.reb-tier {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  margin-top: var(--sp2);
}
/* Matches RankProgress.vue's hero-variant badge size (both faces of the flip card now read at the
   same scale) — this used to be TierBadge's `small` variant at ~26px, sized down purely to fit a
   cramped auto-height card before the flip card got its own fixed-height, full-space redesign. */
.reb-badge {
  --badge-size: 40px;
}
.reb-tier-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.reb-tier-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text);
}
.reb-lp {
  font-size: 12px;
  font-weight: 700;
  color: var(--tier-accent, var(--dim));
}
.reb-decay {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--warning-hi);
  margin: 0;
}
.reb-empty {
  font-size: 12.5px;
  color: var(--dim);
  margin: var(--sp2) 0 0;
}
/* The one action left now that "Zurück" is gone (tapping anywhere on the back face flips it,
   RankFlipCard.vue) — centers on its own via the parent's flex centering, same as everything
   else on this face, rather than sitting off to one side the way it did next to a sibling. */
.reb-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: var(--sp2);
}
</style>
