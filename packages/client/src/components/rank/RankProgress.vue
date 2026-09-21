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
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import TierBadge from "./TierBadge.vue";

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
    /** "card" — badge left, stacked text right. "inline" — compact single row for the
     *  active-workout focus column, where vertical space is scarce. "hero" — vertical stack with
     *  a large centered badge as the card's focal point (tier+LP header above it, labeled Kg/Wdh
     *  fields and the bar below) — the Kraft grid's front face, modeled directly on the Liftoff
     *  reference's own card layout rather than the compact badge-left row the other two variants
     *  use. */
    variant?: "card" | "inline" | "hero";
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
    /** The Ränge grid cards (RankLifterSection.vue/RankRunnerSection.vue) already render the
     *  medal themselves, in ListCard's #badge slot next to the exercise name — set false there so
     *  it isn't shown twice. Every other call site keeps the default. */
    badge?: boolean;
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
    badge: true,
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
 *  would nest inside the grid's own tappable ListCard). */
const trustLabel = computed(() => {
  if (props.trust === "derived") return "Abgeleiteter Standard";
  if (props.trust === "synthetic") return "Geschätzter Standard";
  return null;
});

/** 1-2 chip strings for the "next target" readout: outline chip first (weight, or the sole chip
 *  when there's only one), filled chip second (reps) — a lone filled pill next to nothing reads
 *  worse than a single outline one, so a reps-only/label-only target renders as one outline chip,
 *  never a lone filled one. */
const nextChips = computed<string[]>(() => {
  if (props.nextTargetLabel != null) return [props.nextTargetLabel];
  // Both targets null means the top of the currently-modeled standards has been reached —
  // "???" invites "what's next?" instead of flatly stating there's nothing left, which reads as
  // a dead end. A real next target still renders normally below.
  if (props.nextTargetReps == null) return ["???"];
  const reps = `${props.nextTargetReps} Wdh.`;
  return props.nextTargetWeightKg != null ? [`${props.nextTargetWeightKg} kg`, reps] : [reps];
});

/** hero variant only — the same next-target data as `nextChips` above, but as separate labeled
 *  fields (Liftoff's own "Kg" / "Wdh." boxes) instead of one combined pill string per value, since
 *  the hero layout has room to label each field the way the compact card/inline rows don't. Same
 *  ordering/fallback rules as nextChips (weight first when present, "???" at the top of modeled
 *  standards, a single field for a custom label or a reps-only/bodyweight target) so the two never
 *  disagree about what "next" means, just how it's laid out. */
interface HeroField {
  label: string;
  value: string;
  filled: boolean;
}
const heroFields = computed<HeroField[]>(() => {
  if (props.nextTargetLabel != null) return [{ label: "Ziel", value: props.nextTargetLabel, filled: false }];
  if (props.nextTargetReps == null) return [{ label: "Ziel", value: "???", filled: false }];
  const fields: HeroField[] = [];
  if (props.nextTargetWeightKg != null) fields.push({ label: "Kg", value: String(props.nextTargetWeightKg), filled: false });
  fields.push({ label: "Wdh.", value: String(props.nextTargetReps), filled: true });
  return fields;
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
  <div class="rank-progress" :class="[`t-${tier}`, `variant-${variant}`, { 'panel-reward': variant === 'inline' }]">
    <!-- hero — vertical stack, badge as the card's focal point (Liftoff's own card layout: tier
         + LP above a large centered medal, target fields and the bar below it). -->
    <template v-if="variant === 'hero'">
      <div class="rp-hero-tier">
        {{ TIER_LABEL_DE[tier as RankTier] }} {{ DIVISION_LABEL[division] }}
        <span v-if="trust !== 'real'" class="trust-marker" aria-hidden="true">≈</span>
      </div>
      <div class="rp-hero-lp tnum">{{ lpDisplay }} LP</div>
      <TierBadge v-if="badge" class="rp-hero-badge" :tier="tier" />
      <div class="rp-hero-fields">
        <div v-for="f in heroFields" :key="f.label" class="rp-hero-field">
          <span class="rp-hero-field-label">{{ f.label }}</span>
          <span class="rp-hero-field-value" :class="{ fill: f.filled }">{{ f.value }}</span>
        </div>
      </div>
      <div class="rankbar rp-hero-bar">
        <i class="bar-fill" :style="{ transform: `scaleX(${lpBarPercent / 100})` }" />
      </div>
      <div v-if="trustLabel" class="rp-trust">{{ trustLabel }}</div>
      <div v-if="decayCaption" class="rp-decay">{{ decayCaption }}</div>
      <div v-if="recoveryGainLabel" class="rp-recovery">{{ recoveryGainLabel }}</div>
      <div v-if="plausibilityNote" class="rp-plausibility">{{ plausibilityNote }}</div>
    </template>

    <!-- card/inline — compact badge-left row. -->
    <template v-else>
      <TierBadge v-if="badge" :tier="tier" />
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
        <div class="rp-next">
          <span class="rp-next-label">Nächstes Ziel</span>
          <span v-for="(chip, i) in nextChips" :key="chip" class="rp-chip" :class="i === 0 ? 'outline' : 'fill'">{{ chip }}</span>
        </div>
        <div v-if="trustLabel" class="rp-trust">{{ trustLabel }}</div>
        <div v-if="decayCaption" class="rp-decay">{{ decayCaption }}</div>
        <div v-if="recoveryGainLabel" class="rp-recovery">{{ recoveryGainLabel }}</div>
        <div v-if="plausibilityNote" class="rp-plausibility">{{ plausibilityNote }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rank-progress {
  display: flex;
  align-items: center;
  gap: var(--sp3);
}
.rank-progress .tier-emblem {
  --badge-size: 40px;
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
  /* var(--text), not var(--tt): --tt is an on-metal color (tokens.css's per-tier tokens, all
     near-white) meant for text sitting directly on a saturated tier fill. This readout now sits
     on the card's own neutral glass (or .panel-reward for the inline variant, which re-pins
     --text locally) — --tt would be unreadable in light theme, where the page background is
     light and there's no dark fill underneath to contrast against. */
  color: var(--text);
}
.rp-lp {
  font-size: 11.5px;
  color: var(--dim);
}
.trust-marker {
  color: var(--dim);
  font-weight: 600;
  margin-left: 2px;
}
.rp-bar {
  height: 7px;
}
.rp-next {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.rp-next-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--faint);
}
/* Twin stat chips (weight outline, reps filled) replacing a plain text line — the outline chip is
   the sole chip for a reps-only/pace/label target (never a lone filled pill, see nextChips' own
   comment). `.fill` uses --tier-deep (--b1), not --b3, so the on-metal --tt tint stays readable
   against it — the same reasoning `.rp-tier` above already gives for avoiding --tt on lighter
   surfaces. */
.rp-chip {
  font-size: 11.5px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.rp-chip.outline {
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--tier-accent, var(--line));
}
.rp-chip.fill {
  color: var(--tt, var(--text));
  background: var(--tier-deep, var(--surface-3));
  box-shadow: inset 0 0 0 1px var(--tier-accent, var(--line));
}
/* A rank loss is the second-loudest thing on the card after the tier name — deliberately not
   faint text, since it's the loudest event a rank ladder can produce. */
.rp-decay {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--warning-hi);
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

/* card variant (Ränge grid, ExerciseInfoPanel's Rang tab) — larger badge, roomier text. `variant`
   now only controls density; which surface it sits on (plain card glass, or ExerciseInfoPanel's
   .panel-reward) is the caller's choice, not baked in here. Prefixed `variant-` (not a bare
   `card`/`inline` class matching the `variant` prop) so this component's own root class can never
   collide with an unrelated global class of the same name — it did, once list-card.css's own
   `.card` became this component's typical container (RankLifterSection.vue/
   RankRunnerSection.vue), matching a descendant selector meant for the grid's own cards. */
.rank-progress.variant-card .tier-emblem {
  --badge-size: 46px;
}
.rank-progress.variant-card .rp-tier {
  font-size: 12px;
}

/* inline variant (active-workout focus column, finish-sequence beat) — compact, sits on the
   app's normal dark surface rather than a tier gradient, so text uses the standard tokens
   rather than --tt. Uses .panel-reward (tokens.css), not the flat .panel recipe, since this is
   the one progress readout visible for most of a session. */
.rank-progress.variant-inline {
  border-radius: var(--r-lg);
  padding: var(--sp3) var(--sp4);
}
.rank-progress.variant-inline .rp-tier,
.rank-progress.variant-inline .rp-lp {
  color: var(--dim);
}

/* hero variant (Kraft grid's flip-card front face) — modeled on the Liftoff reference's own card:
   tier+LP as a header, a large centered medal as the card's actual focal point (the thing this
   variant exists to fix — every other variant treats the badge as a small label next to text),
   labeled Kg/Wdh. fields, the bar last. Column layout, centered, replacing the row layout the
   other two variants share. */
.rank-progress.variant-hero {
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  width: 100%;
}
.rp-hero-tier {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--text);
}
.rp-hero-lp {
  font-size: 13px;
  font-weight: 700;
  color: var(--tier-accent, var(--dim));
}
.rank-progress.variant-hero .tier-emblem {
  --badge-size: 96px;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45));
  margin: 2px 0;
}
.rp-hero-fields {
  display: flex;
  /* Tighter than --sp3 (12px) — the Kraft grid runs these cards two-up on phones (rank-card.css),
     down to a ~160px column, and two field boxes at the old 52px min-width + 12px gap (116px)
     plus the card's own side padding didn't fit that width. */
  gap: 6px;
  margin-top: 2px;
}
.rp-hero-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.rp-hero-field-label {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--faint);
}
/* Same outline/fill vocabulary as .rp-chip (weight outline, reps filled — see that rule's own
   comment), just laid out as a labeled box instead of a pill, to match Liftoff's boxed Kg/Wdh.
   fields. Sized to fit two side by side on the narrowest two-up phone card (see .rp-hero-fields'
   own comment) — smaller than the old 52px/12px would allow. */
.rp-hero-field-value {
  min-width: 40px;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--tier-accent, var(--line));
}
.rp-hero-field-value.fill {
  color: var(--tt, var(--text));
  background: var(--tier-deep, var(--surface-3));
}
.rp-hero-bar {
  width: 100%;
  max-width: 220px;
  height: 7px;
  margin-top: 4px;
}
</style>
