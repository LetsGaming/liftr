<script setup lang="ts">
/** Step 1's manual path (and the "+ Übung hinzufügen" return trip from step 2): pick exercises by
 *  hand via the shared ExerciseList in select mode. Picks land in the wizard's `selected` draft,
 *  reviewable/editable on the next step, never saved directly from here.
 *
 *  Split out of a single PickStep.vue that took a `mode: "manual" | "muscles"` prop and branched
 *  its whole template/state on it — the two modes shared no DOM, state, or emits (this one emits
 *  `continue`, PickStepMuscles.vue emits `suggest`), so they were two components glued together by
 *  a prop rather than one. RoutineWizard.vue picks between this and PickStepMuscles.vue directly. */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ExerciseList from "../exercise/ExerciseList.vue";
import Button from "../base/Button.vue";

const props = defineProps<{ selectedIds: Set<string> }>();
const emit = defineEmits<{ toggle: [exerciseId: string]; continue: [] }>();

const { t } = useI18n();
const count = computed(() => props.selectedIds.size);
</script>

<template>
  <div class="pick-step">
    <ExerciseList mode="select" :selected-ids="selectedIds" :default-only-doable="true" @toggle="emit('toggle', $event.id)" />

    <div class="continue-bar">
      <Button size="lg" block :disabled="count === 0" @click="emit('continue')">
        {{ count === 0 ? t("routine.pickStepManual.selectPrompt") : t("routine.pickStepManual.selectedCount", { n: count }) }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.pick-step {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  padding-bottom: 72px; /* clears the sticky bar */
}
.continue-bar {
  position: sticky;
  bottom: 0;
  padding: var(--sp3) 0;
  background: linear-gradient(0deg, var(--bg) 60%, transparent);
}
</style>
