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
  const byWeekday = new Map(store.byWeekday.map((d) => [d.weekday, d.count]));
  return MO_SO_ORDER.map((weekday) => ({
    weekday,
    label: DAY_ABBR[weekday]!,
    count: byWeekday.get(weekday) ?? 0,
  }));
});

const total = computed(() => days.value.reduce((sum, d) => sum + d.count, 0));
</script>

<template>
  <div v-if="store.loaded" class="rankup-calendar">
    <div class="eyebrow ruc-eyebrow">Rangaufstiege diese Woche</div>
    <div class="streak-strip">
      <div v-for="d in days" :key="d.weekday" class="streak-day">
        <span class="dot" :class="{ active: d.count > 0 }">{{ d.count > 0 ? d.count : "" }}</span>
        <span class="dl">{{ d.label }}</span>
      </div>
    </div>
    <p v-if="total === 0" class="ruc-empty">Der erste Aufstieg dieser Woche steht noch aus.</p>
  </div>
</template>

<style scoped>
.rankup-calendar {
  background: var(--surface);
  border: 1px solid var(--line);
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
  background: linear-gradient(160deg, var(--blue-hi), var(--blue));
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
