<script setup lang="ts">
/**
 * Round demo-photo thumbnail for an exercise, for the exercise library / dense pickers where
 * there's room for more than a bare equipment glyph (see ExerciseIcon.vue for that). Reuses
 * the same slug-convention image path ExerciseDemo.vue already proved
 * (`${apiBase()}/images/<slug>/start.jpg`) rather than the dead `demoStartImage` DB column
 * (see lib/equipmentIcons.ts's sibling note — that column is always null, ingest never writes
 * it). 11 of 94 catalog slugs have no mirrored photo (no open-licensed source exists); those
 * fall back to the equipment icon instead of a broken-image frame.
 */
import { computed, ref } from "vue";
import { apiBase } from "../../lib/api";
import { useCatalogStore } from "../../stores/catalogStore";
import ExerciseIcon from "./ExerciseIcon.vue";

const props = withDefaults(defineProps<{ slug: string; equipment: string; size?: number }>(), { size: 40 });
const catalog = useCatalogStore();
const failed = ref(false);
// `!== false` — an unloaded/stale-cached catalog entry has hasImage undefined, which keeps the
// old "attempt it, fall back on @error" behavior; only a *known* false skips the request outright.
const knownMissing = computed(() => catalog.bySlug(props.slug)?.hasImage === false);
</script>

<template>
  <div class="exercise-thumb" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="!failed && !knownMissing" :src="`${apiBase()}/images/${props.slug}/start.jpg`" alt="" loading="lazy" @error="failed = true" />
    <ExerciseIcon v-else :equipment="equipment" :size="Math.round(size * 0.55)" />
  </div>
</template>

<style scoped>
.exercise-thumb {
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  color: var(--dim);
}
.exercise-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
</style>
