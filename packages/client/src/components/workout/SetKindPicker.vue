<script setup lang="ts">
/**
 * "Satzart auswählen" — lets the lifter set what kind a set is (warmup, normal, drop, etc.). A
 * small sheet, not inlined into WorkoutPage.vue (already the largest file in the app): pick a
 * kind for the given set, or remove it. Both actions only apply to unlogged sets — see
 * activeWorkoutStore.ts's setSetKind()/removeSet() for why.
 */
import { SET_KIND_LABEL, type SetKind } from "../../stores/activeWorkoutStore";
import ListRow from "../patterns/ListRow.vue";
import AppIcon from "../ui/AppIcon.vue";
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
      <ListRow v-for="opt in OPTIONS" :key="opt.kind" as="button" class="kind-row surface-hybrid" @click="emit('pick', opt.kind)">
        <template #leading><span class="kind-letter" :class="`k-${opt.kind}`">{{ opt.letter }}</span></template>
        {{ opt.label }}
      </ListRow>
      <ListRow as="button" class="kind-row danger surface-hybrid" @click="emit('remove')">
        <template #leading><span class="kind-letter k-remove"><AppIcon name="trash" /></span></template>
        Satz entfernen
      </ListRow>
    </div>
  </SheetModal>
</template>

<style scoped>
.kind-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
/* Was a flat --surface-2 fill + 1px --line border — .surface-hybrid instead (see template), same
   recipe as every other row/card converted to it. This sheet's own backdrop (SheetModal.vue)
   still defaults to an opaque --surface fill, so the backdrop-blur this utility adds has no
   visible effect here — kept anyway for the translucent bg + gradient hairline, so this row
   still reads as "in the system" rather than needing a second, sheet-specific treatment.
   ListRow (patterns/ListRow.vue) supplies the row's flex layout and interactive-button reset;
   the element qualifier here keeps padding/color/font from losing to ListRow's own
   `.list-row-interactive` reset regardless of the two components' CSS load order. */
button.kind-row {
  padding: var(--sp3) var(--sp4);
  border-radius: var(--r-lg);
  color: var(--text);
  font-size: 14.5px;
  font-weight: 700;
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
button.kind-row.danger {
  color: var(--danger);
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
  background: var(--warning);
  color: var(--k-warmup-text);
}
.k-normal {
  background: var(--surface-3);
  color: var(--text);
}
.k-failure {
  background: var(--danger);
  color: var(--k-failure-text);
}
.k-dropset {
  background: var(--expert-3);
  color: var(--k-dropset-text);
}
.k-remove {
  background: transparent;
  font-size: 15px;
}
</style>
