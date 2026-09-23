<script setup lang="ts">
/**
 * Übungen — the exercise library, browsable any time. Every exercise's demo photos, how-to
 * text, and muscle figure live at the routed `/exercises/:slug` detail page (ExerciseDetailPage.vue),
 * otherwise only reachable from inside an active workout on that workout's current exercise
 * (WorkoutPage.vue's ⓘ button). This page opens that route via the shared ExerciseList.vue in
 * "browse" mode (the routine wizard's picker step reuses the same list in "select" mode — one
 * filterable/searchable implementation, not two).
 */
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AddCustomExerciseForm from "../components/exercise/AddCustomExerciseForm.vue";
import ExerciseList from "../components/exercise/ExerciseList.vue";
import BasePage from "../components/ui/BasePage.vue";
import SheetModal from "../components/ui/SheetModal.vue";
import { useCatalogStore } from "../stores/catalogStore";

const router = useRouter();
const catalog = useCatalogStore();
onMounted(() => catalog.load());

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
  <BasePage title="Übungen">
    <div class="ex-page">
      <ExerciseList mode="browse" @open="router.push(`/exercises/${$event.slug}`)" />
      <button class="add-custom-btn surface-hybrid" @click="showAddForm = true">+ Eigene Übung hinzufügen</button>
    </div>

    <SheetModal v-if="showAddForm" ref="addFormSheetRef" title="Eigene Übung hinzufügen" @close="showAddForm = false">
      <AddCustomExerciseForm @created="onExerciseCreated" @cancel="addFormSheetRef?.dismiss()" />
    </SheetModal>
  </BasePage>
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
