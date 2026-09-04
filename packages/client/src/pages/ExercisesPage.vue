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
import AddCustomExerciseForm from "../components/exercise/AddCustomExerciseForm.vue";
import ExerciseInfoPanel from "../components/exercise/ExerciseInfoPanel.vue";
import ExerciseList from "../components/exercise/ExerciseList.vue";
import SheetModal from "../components/ui/SheetModal.vue";
import { useCatalogStore, type CatalogExercise } from "../stores/catalogStore";

const catalog = useCatalogStore();
onMounted(() => catalog.load());

const openExercise = ref<CatalogExercise | null>(null);

// Add-custom-exercise sheet (Plan C §3 Phase 3, Task 9). Per SheetModal.vue's own header
// comment ("every close path here and in every caller was just emitting close/flipping the
// parent's own v-if straight away... yanking the element out from under it via Vue unmount
// races that teardown and null-derefs"), the form's created/cancel actions call dismiss() via
// this ref rather than flipping `showAddForm` directly — only SheetModal's own @close (fired
// after Ionic's real dismiss teardown finishes) unmounts the sheet. Mirrors
// RoutineWizard.vue's sheetRef/dismiss() pattern.
const showAddForm = ref(false);
const addFormSheetRef = ref<InstanceType<typeof SheetModal> | null>(null);
function onExerciseCreated() {
  addFormSheetRef.value?.dismiss();
}
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
        <button class="add-custom-btn" @click="showAddForm = true">+ Eigene Übung hinzufügen</button>
      </div>

      <ExerciseInfoPanel v-if="openExercise" :exercise="openExercise" @close="openExercise = null" />

      <SheetModal v-if="showAddForm" ref="addFormSheetRef" title="Eigene Übung hinzufügen" @close="showAddForm = false">
        <AddCustomExerciseForm @created="onExerciseCreated" @cancel="addFormSheetRef?.dismiss()" />
      </SheetModal>
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
.add-custom-btn {
  display: block;
  width: 100%;
  margin-top: var(--sp4);
  padding: 12px;
  border-radius: var(--r-md);
  border: 1px dashed var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 13.5px;
  font-weight: 600;
}
</style>
