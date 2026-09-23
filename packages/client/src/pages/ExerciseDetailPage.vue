<script setup lang="ts">
/**
 * Exercise detail — a routed page (was ExerciseInfoPanel.vue's SheetModal sheet). Reached via
 * `/exercises/:slug`, so it gets a real URL, back-button semantics, and a cold deep-link. The
 * WorkoutPage.vue mid-set ⓘ button is the one entry point that deliberately doesn't route here —
 * see its own `openInfo` for why — and opens the same ExerciseDetailContent.vue in a SheetModal
 * instead.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import ExerciseDetailContent from "../components/exercise/ExerciseDetailContent.vue";
import BasePage from "../components/ui/BasePage.vue";
import { useExerciseName } from "../composables/useExerciseName";
import { useCatalogStore } from "../stores/catalogStore";

const route = useRoute();
const slug = computed(() => route.params.slug as string);

const catalog = useCatalogStore();
const { exerciseName } = useExerciseName();
const exercise = computed(() => catalog.bySlug(slug.value));
const pageTitle = computed(() => (exercise.value ? exerciseName(exercise.value.slug, exercise.value.name) : "Übung"));
</script>

<template>
  <BasePage :title="pageTitle" back-button variant="drawer">
    <ExerciseDetailContent :slug="slug" />
  </BasePage>
</template>
