<script setup lang="ts">
/**
 * "Rangaufstiege" — a Mo-So calendar strip showing how many rank-ups happened each weekday of
 * the current rolling week (engagement rework W8), backed by /api/rank-events. Visual pattern
 * copied from FinishSequence.vue's `.streak-strip`/`.streak-day`/`.dot`/`.dl` (round-1 W4 beat
 * 2) rather than inventing a second "week strip" look — same 32px circular dot + label-below
 * layout, just filled with a rank-up count instead of a streak flame.
 */
import { computed, onMounted } from "vue";
import { useRankEventsStore } from "../../stores/rankEventsStore";

/** Same JS `Date.getDay()`-indexed labels as useWorkoutFinish.ts's DAY_ABBR, reordered Mo-So
 *  (weekday 1..6 then 0) to match the calendar-strip convention this component renders. */
const DAY_ABBR: Record<number, string> = { 0: "So", 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr", 6: "Sa" };
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
      label: DAY_ABBR[weekday]!,
      count,
      /** Workstream B task 3: a day where every logged rank-up was plausibility-flagged should
       *  not render identically to a day with a genuine one (Global Constraint). */
      hasGenuine: count > flaggedCount,
    };
  });
});

const total = computed(() => days.value.reduce((sum, d) => sum + d.count, 0));
</script>

<template>
  <div v-if="store.loaded" class="rankup-calendar">
    <div class="eyebrow ruc-eyebrow">Rangaufstiege diese Woche</div>
    <div class="streak-strip">
      <div v-for="d in days" :key="d.weekday" class="streak-day">
        <span class="dot" :class="{ active: d.hasGenuine, flagged: d.count > 0 && !d.hasGenuine }">{{ d.count > 0 ? d.count : "" }}</span>
        <span v-if="d.hasGenuine" class="nebula-dot" aria-hidden="true" />
        <span class="dl">{{ d.label }}</span>
      </div>
    </div>
    <p v-if="total === 0" class="ruc-empty">Dein nächster Rangaufstieg wartet — leg los!</p>
  </div>
</template>

<style scoped>
.rankup-calendar {
  background: var(--surface);
  /* engagement-audit-v4 Phase 2B critique fix: see RankDistributionDonut.vue's identical
     comment — analytics card, not a reward, so only the border picks up tier flavor. */
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
/* Copied verbatim from FinishSequence.vue's streak strip — same shape/sizing, don't drift. */
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
  /* engagement-audit-v4 Phase 2B critique fix: was a flat --blue-hi/--blue gradient regardless
     of tier — a rank-up is a tier event, so the dot should carry the tier's own accent. Keeps
     --blue as the base stop rather than --tier-deep (b1 tones run near-black at low tiers,
     which would read as a muddy dot at 32px) — only the bright stop picks up tier flavor. */
  background: linear-gradient(160deg, var(--tier-accent, var(--blue-hi)), var(--blue));
}
/* Nebula dot (nebula-and-workplan-rework task 9) — a small accent marking which weekdays had at
   least one rank-up this week; only present in the DOM for days with count > 0 (v-if above), not
   just visually hidden. A real element (not .dot::after) since .dot is itself a grid/
   place-items container for the count number — a pseudo-element there would become a second
   grid item and fight the number for placement instead of sitting below it. */
.nebula-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nebula-grad);
}
/* Workstream B task 3 (Global Constraint: a flagged rank-up must never look genuine) — a day
   where every rank-up was plausibility-flagged gets a flat, unlit dot instead of the tier
   gradient .dot.active uses; the count still shows (the day isn't hidden), just not celebrated.
   No .nebula-dot accent for this state either (see the template's v-if="d.hasGenuine" above). */
.dot.flagged {
  background: var(--surface-3);
  opacity: 0.7;
}
.dl {
  font-size: 11px;
  color: var(--faint);
}
.ruc-empty {
  font-size: 12px;
  color: var(--dim);
}
</style>
