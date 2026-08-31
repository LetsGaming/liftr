<script setup lang="ts">
/**
 * "Satzart auswählen" — feedback: "not possible to set what kind of set this is (warmup,
 * normal, drop, etc)". A small sheet, not inlined into WorkoutPage.vue (already the largest
 * file in the app): pick a kind for the given set, or remove it. Both actions only apply to
 * unlogged sets — see activeWorkoutStore.ts's setSetKind()/removeSet() for why.
 */
import { SET_KIND_LABEL, type SetKind } from "../../stores/activeWorkoutStore";
import SheetModal from "../ui/SheetModal.vue";

defineProps<{ workoutExerciseId: string; setIndex: number }>();
const emit = defineEmits<{ close: []; pick: [kind: SetKind]; remove: [] }>();

// Letter = the shared label's first character (same convention WorkoutPage.vue's set-row
// badge uses) — one definition (SET_KIND_LABEL) instead of a second hand-typed letter/label
// pair here that could drift from the badge's own mapping.
const OPTIONS: { kind: SetKind; letter: string; label: string }[] = (
  ["warmup", "normal", "failure", "dropset"] as const
).map((kind) => ({ kind, letter: SET_KIND_LABEL[kind][0]!, label: SET_KIND_LABEL[kind] }));
</script>

<template>
  <SheetModal title="Satzart auswählen" height="45%" @close="emit('close')">
    <div class="kind-list">
      <button v-for="opt in OPTIONS" :key="opt.kind" class="kind-row" @click="emit('pick', opt.kind)">
        <span class="kind-letter" :class="`k-${opt.kind}`">{{ opt.letter }}</span>
        {{ opt.label }}
      </button>
      <button class="kind-row danger" @click="emit('remove')">
        <span class="kind-letter k-remove">🗑</span>
        Satz entfernen
      </button>
    </div>
  </SheetModal>
</template>

<style scoped>
.kind-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.kind-row {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3) var(--sp4);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14.5px;
  font-weight: 700;
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.kind-row:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  .kind-row:hover {
    background: var(--surface-3);
  }
}
.kind-row.danger {
  color: var(--red);
}
.kind-letter {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  flex: none;
  background: var(--surface-3);
  color: var(--text);
}
.k-warmup {
  background: var(--fire);
  color: var(--k-warmup-text);
}
.k-normal {
  background: var(--surface-3);
  color: var(--text);
}
.k-failure {
  background: var(--red);
  color: var(--k-failure-text);
}
.k-dropset {
  background: var(--plat-3);
  color: var(--k-dropset-text);
}
.k-remove {
  background: transparent;
  font-size: 15px;
}
</style>
