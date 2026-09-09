<script setup lang="ts">
/**
 * Tier badge + LP bar + next-target line. Extracted out of RanksPage.vue's card markup so the
 * exact same unit renders in three places: the Ränge grid, the active-workout focus column, and
 * the finish sequence's first beat — one implementation, not three that can drift.
 *
 * LP is 0-100 within the current tier/division band. `.bar-fill` (styles/motion.css) animates
 * its width whenever `lp` changes — in the active-workout column that's a static read of the
 * session's starting rank (recompute runs once at finish, not per set, so it doesn't move
 * mid-session); on the Ränge grid and in the finish sequence it animates whenever the
 * underlying data actually updates.
 */
import { computed } from "vue";
import { MAX_ORDINAL, ordinal, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_BADGE_PATH, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";

const props = withDefaults(
  defineProps<{
    tier: string;
    division: number;
    lp: number;
    nextTargetWeightKg?: number | null;
    nextTargetReps?: number | null;
    /** Pre-formatted override for the "next target" line, for callers whose target isn't a
     *  weight×reps pair (e.g. RanksPage.vue's running rows, where the next target is a pace).
     *  Takes precedence over nextTargetWeightKg/nextTargetReps when set — this keeps the
     *  weight/reps formatting (and its "???" fallback) as the strength-specific default while
     *  letting a caller opt into fully custom wording instead of forking this component. */
    nextTargetLabel?: string | null;
    trust?: "real" | "derived" | "synthetic";
    /** "card" — badge left, stacked text right (Ränge grid). "inline" — compact single row
     *  for the active-workout focus column, where vertical space is scarce. */
    variant?: "card" | "inline";
    /** When the displayed (possibly decayed) tier/division sits below peak, a caption names the
     *  peak instead of silently showing a lower number — never hide why the rank moved. Omit at
     *  call sites that don't have peak data (e.g. the in-session focus column, which never
     *  decays mid-workout). */
    peakTier?: string | null;
    peakDivision?: number | null;
    /** Set by the caller right after a workout that applied a buffed recovery gain to this
     *  exercise (e.g. "+18 LP"). A one-time celebratory caption, not persisted — the caller is
     *  responsible for only passing this immediately after the relevant recompute, not on every
     *  render. */
    recoveryGainLabel?: string | null;
    /** A short, honest note when this exercise's rank/XP gain from the most recent session was
     *  reduced by the plausibility gate. Never shows exact thresholds. */
    plausibilityNote?: string | null;
  }>(),
  {
    nextTargetWeightKg: null,
    nextTargetReps: null,
    nextTargetLabel: null,
    trust: "real",
    variant: "card",
    peakTier: null,
    peakDivision: null,
    recoveryGainLabel: null,
    plausibilityNote: null,
  },
);

const decayCaption = computed(() => {
  if (!props.peakTier || props.peakDivision == null) return null;
  const currentOrdinal = ordinal(props.tier as Tier, props.division as Division);
  const peakOrdinal = ordinal(props.peakTier as Tier, props.peakDivision as Division);
  if (currentOrdinal >= peakOrdinal) return null;
  return `Schon mal erreicht: ${TIER_LABEL_DE[props.peakTier as RankTier]} ${DIVISION_LABEL[props.peakDivision]}`;
});

/** Visible caption rather than a `title` attribute — a tooltip is invisible on touch (the app's
 *  only platform) and to screen readers. The page-level LP-explainer already teaches what "≈"
 *  means in general; this names the specific case per card as a normal caption alongside the
 *  decay/recovery/plausibility lines below, rather than a second interactive element (which
 *  would nest inside RanksPage's own <button class="rank-card">). */
const trustLabel = computed(() => {
  if (props.trust === "derived") return "Abgeleiteter Standard";
  if (props.trust === "synthetic") return "Geschätzter Standard";
  return null;
});

const nextLabel = computed(() => {
  if (props.nextTargetLabel != null) return props.nextTargetLabel;
  // Both targets null means the top of the currently-modeled standards has been reached —
  // "???" invites "what's next?" instead of flatly stating there's nothing left, which reads as
  // a dead end. A real next target still renders normally below.
  if (props.nextTargetReps == null) return "Nächstes Ziel: ???";
  return props.nextTargetWeightKg != null
    ? `Nächstes Ziel: ${props.nextTargetWeightKg} kg × ${props.nextTargetReps}`
    : `Nächstes Ziel: ${props.nextTargetReps} Wdh.`;
});

const isTopBand = computed(() => ordinal(props.tier as Tier, props.division as Division) === MAX_ORDINAL);
/** Feeds the bar's scaleX only — a plain [0,100] clamp so a decayed apex peak (which can
 *  legitimately sit anywhere between 0 and 100 LP) still shows a true partial fill instead of
 *  always reading as full just because the tier is apex. */
const lpBarPercent = computed(() => Math.max(0, Math.min(100, Math.round(props.lp))));
/** Feeds the numeric readout only — uncapped once truly in the top band (lp can grow past 100
 *  there), clamped everywhere else (LP genuinely cannot exceed 100 below Apex). */
const lpDisplay = computed(() => (isTopBand.value ? Math.max(0, Math.round(props.lp)) : lpBarPercent.value));
</script>

<template>
  <div class="rank-progress" :class="[`t-${tier}`, variant, { 'panel-reward': variant === 'inline' }]">
    <span class="badge" :class="`t-${tier}`">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="TIER_BADGE_PATH[tier as RankTier]" /></svg>
    </span>
    <div class="rp-body">
      <div class="rp-head">
        <span class="rp-tier">
          {{ TIER_LABEL_DE[tier as RankTier] }} {{ DIVISION_LABEL[division] }}
          <span v-if="trust !== 'real'" class="trust-marker" aria-hidden="true">≈</span>
        </span>
        <span class="rp-lp tnum">{{ lpDisplay }} LP</span>
      </div>
      <div class="rankbar rp-bar">
        <i class="bar-fill" :style="{ transform: `scaleX(${lpBarPercent / 100})` }" />
      </div>
      <div class="rp-next">{{ nextLabel }}</div>
      <div v-if="trustLabel" class="rp-trust">{{ trustLabel }}</div>
      <div v-if="decayCaption" class="rp-decay">{{ decayCaption }}</div>
      <div v-if="recoveryGainLabel" class="rp-recovery">{{ recoveryGainLabel }}</div>
      <div v-if="plausibilityNote" class="rp-plausibility">{{ plausibilityNote }}</div>
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
/* The "≈" trust marker always sits on a dark tier fill (the .card variant's parent .rank-card
   gradient, or the .inline variant's .panel-reward). Both ancestors pin --dim to a
   light-on-dark value, so referencing the token here tracks theme changes automatically instead
   of hardcoding a literal. */
.trust-marker {
  color: var(--dim);
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
/* A rank loss is the second-loudest thing on the card after the tier name — deliberately not
   faint text, since it's the loudest event a rank ladder can produce. */
.rp-decay {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--fire-hi);
}
.rp-trust {
  font-size: 11px;
  color: var(--dim);
}
.rp-recovery {
  font-size: 11px;
  color: var(--blue-hi, var(--dim));
  font-weight: 600;
}
.rp-plausibility {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.75;
  font-style: italic;
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
/* Sits on the .card variant's parent tier-gradient card, where --dim doesn't clear AA contrast —
   uses the brighter --text token instead. RanksPage.vue's .rank-card pins --text to a
   light-on-dark value (mirroring tokens.css's .panel-reward), so referencing the token here
   tracks theme changes automatically instead of hardcoding a literal. */
.rank-progress.card .rp-lp,
.rank-progress.card .rp-next,
.rank-progress.card .rp-trust {
  color: var(--text);
}
.rank-progress.card .trust-marker {
  color: var(--dim);
}

/* inline variant (active-workout focus column, finish-sequence beat) — compact, sits on the
   app's normal dark surface rather than a tier gradient, so text uses the standard tokens
   rather than --tt. Uses .panel-reward (tokens.css), not the flat .panel recipe, since this is
   the one progress readout visible for most of a session. */
.rank-progress.inline {
  border-radius: var(--r-lg);
  padding: var(--sp3) var(--sp4);
}
.rank-progress.inline .rp-tier,
.rank-progress.inline .rp-lp {
  color: var(--dim);
}
</style>
