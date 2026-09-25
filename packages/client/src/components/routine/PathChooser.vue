<script setup lang="ts">
/** Step 0 (create mode only): the manual-vs-muscle-guided choice gets its own explicit first
 *  screen so both paths carry equal visual weight before either one starts — a toggle buried
 *  inside a later step would read as "one mode is the real one, the other is a fallback," which
 *  isn't true. Both paths converge into the same Pick/Arrange/Review steps after. Edit mode
 *  never reaches this screen — it jumps straight to Arrange since exercises already exist. */
import { useI18n } from "vue-i18n";

defineEmits<{ choose: [mode: "manual" | "muscles"] }>();
const { t } = useI18n();
</script>

<template>
  <div class="path-chooser">
    <button class="path-card surface-hybrid" @click="$emit('choose', 'manual')">
      <span class="path-title">{{ t("routine.pathChooser.manualTitle") }}</span>
      <span class="path-desc">{{ t("routine.pathChooser.manualDesc") }}</span>
    </button>
    <button class="path-card surface-hybrid" @click="$emit('choose', 'muscles')">
      <span class="path-title">{{ t("routine.pathChooser.musclesTitle") }}</span>
      <span class="path-desc">{{ t("routine.pathChooser.musclesDesc") }}</span>
    </button>
  </div>
</template>

<style scoped>
.path-chooser {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp3);
  /* Prevents the two choice cards from pinning at the top of the sheet with a tall empty area
     below on most viewports. Same reasoning as WorkoutPage.vue's .not-started fix. */
  min-height: 50vh;
}
.path-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp4);
  border-radius: var(--r-lg);
  text-align: left;
}
.path-card:active {
  outline: 1px solid var(--line-2);
  outline-offset: -1px;
}
.path-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}
.path-desc {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
