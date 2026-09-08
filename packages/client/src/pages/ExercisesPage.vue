<script setup lang="ts">
/**
 * Übungen — the exercise library, browsable any time. Every exercise's demo photos, how-to
 * text, and muscle figure already exist in ExerciseInfoPanel.vue, otherwise only reachable from
 * inside an active workout on that workout's current exercise (WorkoutPage.vue's ⓘ button). This
 * page opens the same panel standalone via the shared ExerciseList.vue in "browse" mode (the
 * routine wizard's picker step reuses the same list in "select" mode — one filterable/searchable
 * implementation, not two).
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

// Add-custom-exercise sheet: the form's created/cancel actions call dismiss() via this ref
// rather than flipping `showAddForm` directly, so only SheetModal's own @close (fired after
// Ionic's real dismiss teardown finishes) unmounts the sheet — flipping the v-if straight away
// yanks the element out from under Vue's unmount, causing teardown races and null-derefs (see
// SheetModal.vue's own header comment). Mirrors RoutineWizard.vue's sheetRef/dismiss() pattern.
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
        <button class="add-custom-btn surface-hybrid" @click="showAddForm = true">+ Eigene Übung hinzufügen</button>
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
  /* Matches the responsive card grid width tier used by Ränge/Workout's routine list
     (--content-w-wide), since this page is the same grid-content shape. */
  max-width: var(--content-w-wide);
  margin: 0 auto;
}
.add-custom-btn {
  /* Uses .surface-hybrid (translucent fill + gradient hairline, tokens.css) with its own dashed
     `border` on top — .surface-hybrid's hairline lives on a separate ::after ring, so this
     doesn't fight it; the dashed line is this button's own "insertion point" affordance (matches
     the app's other add-new dashed-border pattern, e.g. FastPathStep.vue/ArrangeStep.vue),
     independent of the surface treatment underneath it. */
  display: block;
  width: 100%;
  margin-top: var(--sp4);
  padding: 12px;
  border-radius: var(--r-md);
  border: 1px dashed var(--line-2);
  color: var(--dim);
  font-size: 13.5px;
  font-weight: 600;
}
</style>
