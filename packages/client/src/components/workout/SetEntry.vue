<script setup lang="ts">
/** The two big steppers — the core interaction of the whole app (plan 1.5, audit §2.1). Built
 *  on the shared NumberStepper.vue (size="lg"), which this component's original markup/CSS became. */
import { calculatePlates, calculatePlatesFromInventory, DEFAULT_BAR_WEIGHT_KG } from "@liftr/shared";
import { computed, ref } from "vue";
import { useActiveWorkoutStore } from "../../stores/activeWorkoutStore";
import { useCatalogStore } from "../../stores/catalogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import NumberStepper from "../ui/NumberStepper.vue";

const store = useActiveWorkoutStore();
const settingsStore = useSettingsStore();
const catalog = useCatalogStore();

// Plate calculator (plan Phase 6.2) — an optional reveal, not a default-on element, so it
// never adds a tap to the sacred log-a-set path. Uses the user's real bar weight + plate
// inventory (Profil > Scheiben & Stange) once configured; falls back to the unlimited 20kg-bar
// standard set until they've set one up, so the calculator is useful from day one either way.
//
// Feedback: "usually a barbell has a different weight than a dumbbell" — the bar weight is
// looked up per the current exercise's own equipment (barbell/ez-bar/trap-bar/dumbbell), not one
// flat number; anything else (machine, cable, bodyweight, ...) has no "bar" of its own and just
// uses the barbell default, same as before this feature existed.
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
      label="Gewicht"
      unit="kg"
      :model-value="store.currentSet.weightKg"
      @adjust="(d) => store.adjustCurrentSet('weightKg', d)"
      @set="(v) => store.setCurrentSetValue('weightKg', v)"
    >
      <button class="plates-toggle" @click="showPlates = !showPlates">
        {{ showPlates ? "Scheiben ausblenden" : "🏋 Scheiben anzeigen" }}
      </button>
      <div v-if="showPlates && plates" class="plates-out tnum">
        <template v-if="plates.perSide.length > 0">
          {{ plates.barWeightKg }} kg Stange + je Seite {{ plates.perSide.join(" + ") }} kg
        </template>
        <template v-else> nur die {{ plates.barWeightKg }} kg Stange </template>
      </div>
      <div v-if="showPlates && plates && !plates.exact" class="plates-warning">
        ⚠ Mit deinen Scheiben nicht exakt erreichbar — {{ plates.achievedWeightKg }} kg stattdessen
      </div>
    </NumberStepper>
    <NumberStepper
      size="lg"
      label="Wiederholungen"
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
  color: var(--fire-hi);
  line-height: 1.4;
}
</style>
