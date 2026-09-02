<script setup lang="ts">
/**
 * Verlauf tab of ExerciseInfoPanel.vue (engagement rework W7). Reverse-chronological list of a
 * single exercise's logged sets, grouped by calendar day. Pure presentational — props-in, no
 * fetching of its own (matches useExerciseHistoryCache.ts's "a component does not fetch"
 * convention); the parent sheet owns the lazy fetch and passes the resulting sets array down.
 */
import { computed } from "vue";

interface HistorySet {
  weightKg: number | null;
  reps: number;
  loggedAt: string;
  isWarmup: boolean;
}

const props = defineProps<{ sets: HistorySet[] }>();

interface DayGroup {
  day: string;
  dateLabel: string;
  sets: HistorySet[];
}

/** Grouped by `loggedAt.slice(0, 10)` (calendar day, per plan), newest day first, sets within a
 *  day newest-first too. */
const groups = computed<DayGroup[]>(() => {
  const byDay = new Map<string, HistorySet[]>();
  for (const s of props.sets) {
    const day = s.loggedAt.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(s);
    else byDay.set(day, [s]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, sets]) => ({
      day,
      dateLabel: new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
      sets: sets.slice().sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1)),
    }));
});
</script>

<template>
  <div class="history-list">
    <p v-if="groups.length === 0" class="empty">Diese Übung hast du noch nie geloggt.</p>
    <div v-for="g in groups" :key="g.day" class="day-group">
      <div class="day-label">{{ g.dateLabel }}</div>
      <ul class="set-rows">
        <li v-for="(s, i) in g.sets" :key="i" class="set-row" :class="{ warmup: s.isWarmup }">
          <span class="set-value tnum">
            <template v-if="s.weightKg != null">{{ s.weightKg }} kg × {{ s.reps }}</template>
            <template v-else>{{ s.reps }} Wdh.</template>
          </span>
          <span v-if="s.isWarmup" class="warmup-marker">Aufwärmen</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
}
.empty {
  font-size: 12px;
  color: var(--faint);
}
.day-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.day-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--dim);
}
.set-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 13px;
}
.set-row.warmup {
  border-style: dashed;
}
.set-value {
  font-weight: 700;
}
.warmup-marker {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
</style>
