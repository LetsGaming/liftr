<script setup lang="ts">
/** The two big steppers — the core interaction of the whole app (plan 1.5). Built on the shared
 *  NumberStepper.vue (size="lg"), which this component's original markup/CSS became. */
import { calculatePlates, calculatePlatesFromInventory, DEFAULT_BAR_WEIGHT_KG } from "@liftr/shared";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useActiveWorkoutStore } from "../../stores/activeWorkoutStore";
import { useCatalogStore } from "../../stores/catalogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import AppIcon from "../base/AppIcon.vue";
import NumberStepper from "../patterns/NumberStepper.vue";

const { t } = useI18n();
const store = useActiveWorkoutStore();
const settingsStore = useSettingsStore();
const catalog = useCatalogStore();

// Plate calculator (plan Phase 6.2) — an optional reveal, not a default-on element, so it
// never adds a tap to the sacred log-a-set path. Uses the user's real bar weight + plate
// inventory (Profil > Scheiben & Stange) once configured; falls back to the unlimited 20kg-bar
// standard set until they've set one up, so the calculator is useful from day one either way.
//
// Bar weight is looked up per the current exercise's own equipment (barbell/ez-bar/trap-bar/
// dumbbell), not one flat number; anything else (machine, cable, bodyweight, ...) has no "bar"
// of its own and just uses the barbell default.
const currentEquipment = computed(() => {
  const exerciseId = store.currentExercise?.exerciseId;
  return exerciseId ? (catalog.byId(exerciseId)?.equipment ?? null) : null;
});
const showPlates = ref(false);
const plates = computed(() => {
  const w = store.currentSet?.weightKg;
  if (w == null) return null;
  const gym = settingsStore.gymSetup;
  if (!gym) return calculatePlates(w);
  const eq = currentEquipment.value as "barbell" | "ez-bar" | "trap-bar" | "dumbbell" | null;
  const barWeightKg = (eq && gym.barWeights[eq]) || DEFAULT_BAR_WEIGHT_KG;
  return calculatePlatesFromInventory(w, barWeightKg, gym.plates);
});
</script>

<template>
  <div v-if="store.currentSet" class="entry-grid">
    <NumberStepper
      v-if="store.currentSet.weightKg !== null"
      size="lg"
      :label="t('workoutUi.setEntry.weightLabel')"
      unit="kg"
      :model-value="store.currentSet.weightKg"
      @adjust="(d) => store.adjustCurrentSet('weightKg', d)"
      @set="(v) => store.setCurrentSetValue('weightKg', v)"
    >
      <button class="plates-toggle" @click="showPlates = !showPlates">
        <template v-if="showPlates">{{ t("workoutUi.setEntry.hidePlates") }}</template>
        <template v-else><AppIcon name="dumbbell" /> {{ t("workoutUi.setEntry.showPlates") }}</template>
      </button>
      <div v-if="showPlates && plates" class="plates-out tnum">
        <template v-if="plates.perSide.length > 0">
          {{ t("workoutUi.setEntry.platesBreakdown", { bar: plates.barWeightKg, perSide: plates.perSide.join(" + ") }) }}
        </template>
        <template v-else> {{ t("workoutUi.setEntry.barOnly", { bar: plates.barWeightKg }) }} </template>
      </div>
      <div v-if="showPlates && plates && !plates.exact" class="plates-warning">
        <AppIcon name="warning" /> {{ t("workoutUi.setEntry.platesInexact", { achieved: plates.achievedWeightKg }) }}
      </div>
    </NumberStepper>
    <NumberStepper
      size="lg"
      :label="t('workoutUi.setEntry.repsLabel')"
      :model-value="store.currentSet.reps"
      :emphasize="store.currentSet.reps <= 0"
      @adjust="(d) => store.adjustCurrentSet('reps', d)"
      @set="(v) => store.setCurrentSetValue('reps', v)"
    />
  </div>
</template>

<style scoped>
.entry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp3);
  margin: var(--sp4) 0;
}
.plates-toggle {
  margin-top: var(--sp2);
  font-size: 11px;
  color: var(--dim);
  background: none;
  border: none;
  padding: 4px;
}
.plates-out {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.4;
}
.plates-warning {
  margin-top: 4px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--warning-hi);
  line-height: 1.4;
}
</style>
