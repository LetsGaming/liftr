<script setup lang="ts">
/**
 * Tier badge + LP bar + next-target line (engagement rework W2). Extracted out of
 * RanksPage.vue's card markup so the exact same unit renders in three places: the Ränge grid
 * (where it always lived), the active-workout focus column (new — the mockup's "ZUM NÄCHSTEN
 * RANG ▓▓▓░░" lives *inside the exercise card, mid-session*, ../../examples/
 * Screenshot_20260824-175421.png), and the finish sequence's first beat. One implementation,
 * not three that can drift.
 *
 * LP is 0-100 within the current tier/division band. `.bar-fill` (styles/motion.css) animates
 * its width whenever `lp` changes — in the active-workout column that's a static read of the
 * session's starting rank (recompute now runs once at finish, not per set, so it doesn't move
 * mid-session); on the Ränge grid and in the finish sequence it animates whenever the
 * underlying data actually updates.
 */
import { computed } from "vue";
import { ordinal, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";

const props = withDefaults(
  defineProps<{
    tier: string;
    division: number;
    lp: number;
    nextTargetWeightKg?: number | null;
    nextTargetReps?: number | null;
    trust?: "real" | "derived" | "synthetic";
    /** "card" — badge left, stacked text right (Ränge grid). "inline" — compact single row
     *  for the active-workout focus column, where vertical space is scarce. */
    variant?: "card" | "inline";
    /** Peak snapshot (rank engine redesign R2) — when the displayed (possibly decayed) tier/
     *  division sits below peak, a low-friction caption names it instead of silently showing a
     *  lower number: never hide *why* the rank moved. Omit at call sites that don't have peak
     *  data (e.g. the in-session focus column, which never decays mid-workout). */
    peakTier?: string | null;
    peakDivision?: number | null;
  }>(),
  { nextTargetWeightKg: null, nextTargetReps: null, trust: "real", variant: "card", peakTier: null, peakDivision: null },
);

const decayCaption = computed(() => {
  if (!props.peakTier || props.peakDivision == null) return null;
  const currentOrdinal = ordinal(props.tier as Tier, props.division as Division);
  const peakOrdinal = ordinal(props.peakTier as Tier, props.peakDivision as Division);
  if (currentOrdinal >= peakOrdinal) return null;
  return `Bestleistung: ${TIER_LABEL_DE[props.peakTier as RankTier]} ${DIVISION_LABEL[props.peakDivision]}`;
});

const nextLabel = computed(() => {
  // Curiosity framing (engagement rework W8): both targets null means the top of the currently-
  // modeled standards has been reached — "???" invites "what's next?" instead of flatly stating
  // there's nothing left, which reads as a dead end. Only this genuinely-exhausted case changes;
  // a real next target still renders normally below.
  if (props.nextTargetReps == null) return "nächster: ???";
  return props.nextTargetWeightKg != null
    ? `nächster: ${props.nextTargetWeightKg} kg × ${props.nextTargetReps}`
    : `nächster: ${props.nextTargetReps} Wdh.`;
});

const lpClamped = computed(() => Math.max(0, Math.min(100, Math.round(props.lp))));
</script>

<template>
  <div class="rank-progress" :class="[`t-${tier}`, variant]">
    <span class="badge" :class="`t-${tier}`">
      <svg viewBox="0 0 24 24"><path :d="TIER_BADGE_PATH[tier as RankTier]" /></svg>
    </span>
    <div class="rp-body">
      <div class="rp-head">
        <span class="rp-tier">
          {{ TIER_LABEL_DE[tier as RankTier] }} {{ DIVISION_LABEL[division] }}
          <span v-if="trust !== 'real'" class="trust-marker" :title="trust === 'derived' ? 'abgeleiteter Standard' : 'geschätzter Standard'">≈</span>
        </span>
        <span class="rp-lp tnum">{{ lpClamped }} LP</span>
      </div>
      <div class="rankbar rp-bar">
        <i class="bar-fill" :style="{ transform: `scaleX(${lpClamped / 100})` }" />
      </div>
      <div class="rp-next">{{ nextLabel }}</div>
      <div v-if="decayCaption" class="rp-decay">{{ decayCaption }}</div>
    </div>
  </div>
</template>

<style scoped>
.rank-progress {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.rank-progress .badge {
  width: 40px;
  height: 46px;
  flex: none;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}
.rp-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp2);
}
.rp-tier {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--tt, var(--text));
}
.rp-lp {
  font-size: 11.5px;
  color: var(--dim);
}
.trust-marker {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  margin-left: 2px;
}
.rp-bar {
  height: 7px;
}
.rp-next {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dim);
}
.rp-decay {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.75;
}

/* card variant (Ränge grid) — larger badge, text can be white-on-gradient since the parent
   rank-card paints a full tier gradient behind it. */
.rank-progress.card .badge {
  width: 46px;
  height: 52px;
}
.rank-progress.card .rp-tier {
  font-size: 12px;
}
/* On the full-card tier gradient, --dim doesn't clear AA (audit P0-C) — match the original
   card's explicit light rgba text. */
.rank-progress.card .rp-lp,
.rank-progress.card .rp-next {
  color: rgba(255, 255, 255, 0.85);
}
.rank-progress.card .trust-marker {
  color: rgba(255, 255, 255, 0.6);
}

/* inline variant (active-workout focus column, finish-sequence beat) — compact, sits on the
   app's normal dark surface rather than a tier gradient, so text uses the standard tokens
   rather than --tt. */
.rank-progress.inline {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--sp3) var(--sp4);
}
.rank-progress.inline .rp-tier,
.rank-progress.inline .rp-lp {
  color: var(--dim);
}
</style>
