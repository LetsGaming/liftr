<script setup lang="ts">
/**
 * The full 9-tier ladder, showing where a user stands relative to the whole ladder rather than
 * just their current band. One shared component, two call sites: RanksPage's hero (real
 * position) and OverviewPage's first-run state (Initiate lit, nothing else known yet).
 *
 * Divisions are NOT uniform across tiers (TIER_DIVISION_COUNT: 5/4/4/3/3/3/2/2/1 — more at the
 * bottom for frequent early rank-ups, fewer at the top since Apex is a single real milestone).
 * This only ever labels the *current* tier's division (via DIVISION_LABEL), so it never assumes
 * three divisions or any other fixed count.
 *
 * Click-to-expand shows any tier's division breakdown, not just the current one. Purely
 * client-side: TIER_DIVISION_COUNT already gives every tier's division count, so expanding a
 * rung just renders `1..count` inline, no fetch needed. Only one rung expands at a time (an
 * accordion, not independent toggles) to keep the list from growing unbounded on a 9-tier
 * ladder.
 */
import { computed, ref } from "vue";
import { ordinal, TIER_DIVISION_COUNT, TIERS, type Division, type Tier } from "@liftr/shared";
import { DIVISION_LABEL, TIER_LABEL_DE, type RankTier } from "../../lib/tierIcons";
import TierBadge from "./TierBadge.vue";
import Chip from "../base/Chip.vue";

const props = defineProps<{
  currentTier: string | null;
  currentDivision?: number | null;
  /** Without this, a demoted user saw a ladder identical to one who'd never reached the higher
   *  tier. Reuses RankProgress.vue's per-exercise decay-caption pattern ("Schon mal erreicht:
   *  ..."). Omit at call sites with no peak data (e.g. OverviewPage's first-run state). */
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
        <TierBadge :tier="tier" small />
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
        <Chip
          v-for="d in divisions(tier)"
          :key="d"
          as="li"
          variant="tier"
          size="sm"
          class="division-chip"
          :class="{ current: rungState(tier) === 'current' && currentDivision === d }"
          :active="rungState(tier) === 'current' && currentDivision === d"
        >
          {{ DIVISION_LABEL[d] ?? d }}
        </Chip>
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
  /* --rung-gap: badge-to-label spacing, read by both .rung-row (the gap itself) and
     .division-list (to align its chips under the label, not the badge) — set here on .rung, their
     shared parent, rather than on .rung-row, since .division-list is a sibling of .rung-row, not a
     descendant, and wouldn't inherit a var defined there. Widened from the old var(--sp3) (~12px):
     wings now render at this size (TierBadge's `small` only hides the progress tick, not wings)
     and escalate from Stufe 4 through a 4-blade span at Apex, so the label needs real room to its
     left or the two collide. Even at this width the Apex wing still reaches close to the label —
     if that reads as too tight in practice, cap ladder-context wing span smaller than the
     hero/detail context rather than widening this further indefinitely. */
  --rung-gap: 28px;
  border-radius: var(--r-sm);
  transition: opacity var(--dur-base) var(--ease-out);
}
.rung-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--rung-gap);
  padding: 6px var(--sp3) 6px calc(var(--sp3) + 8px);
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
  /* Aligns under the label, not the badge: rung-row's own left padding + badge width + the
     badge-to-label gap it defines (--rung-gap). */
  padding: 0 var(--sp3) 10px calc(var(--sp3) + 8px + 26px + var(--rung-gap, 28px));
  animation: pop-in var(--dur-fast) var(--ease-out) both;
}
.rung.current .division-list {
  padding-left: calc(var(--sp3) + 8px + 34px + var(--rung-gap, 28px));
}
.division-chip.current {
  box-shadow: 0 0 0 2px var(--tier-accent, var(--nebula-1));
}
/* Divisions render worst-to-best (III -> I, see `divisions()` above), so a chip with a later
   `.current` sibling was already climbed past this rung, and one after `.current` hasn't been
   reached yet — same tier-accent-fill/opacity vocabulary as RankProgress.vue rather than a new
   one. Was previously reached into from outside via a `.ranks-tier-ladder :deep(...)` rule in
   styles/rank-card.css, which silently never applied — `:deep()` is a Vue SFC `<style scoped>`
   construct, rewritten at compile time; a plain global stylesheet ships it to the browser
   unrewritten, an invalid selector the browser drops. This file's own template is exactly where
   these selectors belong instead. */
.division-chip:has(~ .division-chip.current) {
  background: var(--tier-accent, var(--nebula-1));
  color: var(--tt, var(--text));
  opacity: 0.55;
}
.division-chip.current ~ .division-chip {
  opacity: 0.4;
}
.rung .tier-emblem {
  --badge-size: 26px;
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
   .rp-decay — the account-level equivalent. */
.rung-peak {
  font-size: 11px;
  font-weight: 700;
  color: var(--warning-hi);
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
.rung.current .tier-emblem {
  --badge-size: 34px;
}
.rung.current .rung-label {
  font-size: 13.5px;
  color: var(--tt, var(--text));
}

/* Not reached yet: dimmed, not hidden — the aspirational/teaser half of the ladder. Per Liftoff's
   own ladder (the reference for this rework): tiers above your current one keep their real material
   color, just quieter — only tiers already surpassed go fully flat. An earlier version of this rule
   desaturated every "ahead" tier to gray instead, which read as a downgrade (nothing above your
   current band looked like it was worth reaching for) and didn't match that reference — removed. */
.rung.ahead {
  opacity: 0.55;
}

/* Spotlight-cone lighting: the ladder already carries every bit of state this needs (current/
   reached/ahead), so this is a lighting pass over the existing rows, not a rebuild. The current
   rung gets a soft tier-colored glow (it already gets .panel-reward's fill above); rungs ahead
   fade toward the top via a mask, reading as "receding into the dark" rather than a hard opacity
   step. `isolation: isolate` keeps the glow's stacking contained to this list. */
.tier-ladder {
  position: relative;
  isolation: isolate;
}
/* Dialed back from an earlier, much brighter 0 0 34px -6px at full --tier-accent opacity — that
   read as too loud for a resting list row; a glow here is fine, it just needs to be a hint, not a
   halo. Smaller blur, tighter spread, and color-mix'd down to partial opacity (same idiom
   rank-card.css's tier wash already uses) instead of the accent color at full strength. */
.rung.current {
  box-shadow: 0 0 18px -8px color-mix(in srgb, var(--tier-accent) 55%, transparent);
}
.rung.ahead {
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), #000);
}

/* Pyramid backdrop — Liftoff's own ladder sits inside a literal spotlight-cone graphic, tiers in
   the foreground on top of it; this is Liftr's own take rather than a straight copy: a soft
   Nebula-tinted triangular wash (violet narrowing at Apex, deepening to blue toward the bottom)
   instead of a stark white beam, so the whole list reads as one lit shaft without borrowing the
   Nebula brand gradient onto the tier badges themselves (still forbidden — see the .t-<tier> rules
   above and docs/design/nebula-design-system.md). A static triangle spanning the ladder's own box,
   not positioned relative to the current-tier row — simpler, and correct in every state including
   the no-rank-yet first-run ladder (OverviewPage.vue's null-current call site).

   Fixed a real bug here: this used to clip-path a 24%-wide flat chord at the top (`38% 0%, 62%
   0%, ...`) instead of a single point, so it was a truncated trapezoid, not a triangle — and with
   `inset: 0` giving it no headroom above the first rung, that flat top sat flush against the
   ladder's own edge and read as cut off. Now a genuine single-point apex, in a box extended 28px
   above the ladder itself so the point has real room to breathe above the Apex rung instead of
   touching the container's edge. */
.tier-ladder::before {
  content: "";
  position: absolute;
  top: -28px;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: -1;
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  background: linear-gradient(
    to bottom,
    rgba(138, 109, 255, 0.03) 0%,
    rgba(138, 109, 255, 0.07) 45%,
    rgba(47, 159, 224, 0.11) 80%,
    rgba(47, 159, 224, 0.17) 100%
  );
  pointer-events: none;
}
</style>
