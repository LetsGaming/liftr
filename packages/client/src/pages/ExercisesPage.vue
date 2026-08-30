<script setup lang="ts">
/**
 * Übungen — the exercise library (feedback: "no tab or way to just go through the exercises
 * and see how they're done and what muscles are being trained"). Every exercise's demo photos,
 * how-to text, and muscle figure already existed in ExerciseInfoPanel.vue, but it was reachable
 * only from inside an active workout, on that workout's current exercise (WorkoutPage.vue's ⓘ
 * button). This page opens the same panel standalone, browsable any time, via the shared
 * ExerciseList.vue in "browse" mode (the routine wizard's picker step reuses the same list in
 * "select" mode — one filterable/searchable implementation, not two).
 */
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { onMounted, ref } from "vue";
import ExerciseInfoPanel from "../components/exercise/ExerciseInfoPanel.vue";
import ExerciseList from "../components/exercise/ExerciseList.vue";
import { useCatalogStore, type CatalogExercise } from "../stores/catalogStore";

const catalog = useCatalogStore();
onMounted(() => catalog.load());

const openExercise = ref<CatalogExercise | null>(null);
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Übungen</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <div class="ex-page">
        <ExerciseList mode="browse" @open="openExercise = $event" />
      </div>

      <ExerciseInfoPanel v-if="openExercise" :exercise="openExercise" @close="openExercise = null" />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.ex-page {
  /* Was --content-w-standard (720px) despite being a responsive card grid like Ränge/Workout's
     routine list (both --content-w-wide) — the odd one out was left noticeably narrower on
     desktop with no reason tied to its actual content shape (feedback: tabs should feel
     coherent). Matches the grid-content tier it actually belongs to. */
  max-width: var(--content-w-wide);
  margin: 0 auto;
}
</style>
