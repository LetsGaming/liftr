<script setup lang="ts">
/**
 * "Rangaufstiege": a Mo-So calendar strip showing how many rank-ups happened each weekday of
 * the current rolling week, backed by /api/rank-events. Visual pattern copied from
 * FinishSequence.vue's `.streak-strip`/`.streak-day`/`.dot`/`.dl` rather than inventing a second
 * "week strip" look: same 32px circular dot + label-below layout, just filled with a rank-up
 * count instead of a streak flame.
 */
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRankEventsStore } from "../../stores/rankEventsStore";
import EmptyNote from "../base/EmptyNote.vue";

const { t } = useI18n();

/** Same JS `Date.getDay()`-indexed labels as useWorkoutFinish.ts's DAY_ABBR, reordered Mo-So
 *  (weekday 1..6 then 0) to match the calendar-strip convention this component renders. */
const DAY_ABBR = computed<Record<number, string>>(() => ({
  0: t("rank.upCalendar.days.so"),
  1: t("rank.upCalendar.days.mo"),
  2: t("rank.upCalendar.days.di"),
  3: t("rank.upCalendar.days.mi"),
  4: t("rank.upCalendar.days.do"),
  5: t("rank.upCalendar.days.fr"),
  6: t("rank.upCalendar.days.sa"),
}));
const MO_SO_ORDER = [1, 2, 3, 4, 5, 6, 0];

const store = useRankEventsStore();
onMounted(() => store.load());

const days = computed(() => {
  const byWeekday = new Map(store.byWeekday.map((d) => [d.weekday, d]));
  return MO_SO_ORDER.map((weekday) => {
    const row = byWeekday.get(weekday);
    const count = row?.count ?? 0;
    const flaggedCount = row?.flaggedCount ?? 0;
    return {
      weekday,
      label: DAY_ABBR.value[weekday]!,
      count,
      /** A day where every logged rank-up was plausibility-flagged must not render identically
       *  to a day with a genuine one. */
      hasGenuine: count > flaggedCount,
    };
  });
});

const total = computed(() => days.value.reduce((sum, d) => sum + d.count, 0));
</script>

<template>
  <div v-if="store.loaded" class="rankup-calendar">
    <div class="eyebrow ruc-eyebrow">{{ t("rank.upCalendar.eyebrow") }}</div>
    <div class="streak-strip">
      <div v-for="d in days" :key="d.weekday" class="streak-day">
        <span class="dot" :class="{ active: d.hasGenuine, flagged: d.count > 0 && !d.hasGenuine }">{{ d.count > 0 ? d.count : "" }}</span>
        <span v-if="d.hasGenuine" class="nebula-dot" aria-hidden="true" />
        <span class="dl">{{ d.label }}</span>
      </div>
    </div>
    <EmptyNote v-if="total === 0" class="ruc-empty" align="start">{{ t("rank.upCalendar.empty") }}</EmptyNote>
  </div>
</template>

<style scoped>
/* Uses the surface-hybrid bg/blur/shadow triad (tokens.css) so this analytics card reads as
   part of the same translucent system as the rest of the page, but deliberately skips the
   shared gradient-hairline ::after: this card's border (`var(--tier-accent, var(--line))`)
   tints with the tier's own accent on a genuine rank-up this week, and stacking the generic
   hairline gradient on top would fight or wash out that signal. */
.rankup-calendar {
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
.ruc-eyebrow {
  --eyebrow-color: var(--blue-hi);
}
/* Copied verbatim from FinishSequence.vue's streak strip: same shape/sizing, don't drift. */
.streak-strip {
  display: flex;
  justify-content: space-between;
  gap: var(--sp2);
}
.streak-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  color: var(--on-blue-lo);
}
.dot.active {
  /* Solid tier metal (--b2), not a two-stop gradient: a gradient's rendered midpoint color can't
     be contrast-checked against one fixed text color across all 9 possible tier accents (dark
     initiate vs. near-white apex have no text color safe against both), but every tier's own
     --b2/--tt pairing is already verified >= 4.5:1 (tokens.css's tier ramp). --tt/--b2 cascade
     down from the app shell's tier class the same way --tier-accent does. */
  background: var(--b2, var(--blue-lo));
  color: var(--tt, var(--on-blue-lo));
}
/* Small accent marking which weekdays had at least one rank-up this week; only present in the
   DOM for days with count > 0 (v-if above), not just visually hidden. A real element rather
   than .dot::after, since .dot is itself a grid/place-items container for the count number: a
   pseudo-element there would become a second grid item and fight the number for placement. */
.nebula-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nebula-grad);
}
/* A day where every rank-up was plausibility-flagged gets a flat, unlit dot instead of the tier
   gradient .dot.active uses; the count still shows, just not celebrated. No .nebula-dot accent
   for this state either (see the template's v-if="d.hasGenuine" above). */
.dot.flagged {
  background: var(--surface-3);
  opacity: 0.7;
}
.dl {
  font-size: 11px;
  color: var(--faint);
}
</style>
