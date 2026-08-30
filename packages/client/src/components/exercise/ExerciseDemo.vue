<script setup lang="ts">
/**
 * Start/end demonstration frames (plan Phase 3.2). Only 2 real frames exist for any exercise
 * from any open-licensed source (free-exercise-db, and wger's own photos, both ultimately
 * Everkinetic-style start/end pairs) — a hard ceiling, not a corner cut; the audit already
 * ruled out GIF/video sources for lacking a clean open license. To read as more of a "tutorial"
 * without fabricating a 3rd frame, the two real images auto-loop cross-fading into each other.
 * Falls back to a static side-by-side pair under prefers-reduced-motion.
 *
 * Images are mirrored by `pnpm ingest --images` into data/images/<slug>/{start,end}.jpg and
 * served at /images/<slug>/... — never hotlinked from free-exercise-db at request time.
 * Degrades to a placeholder when a slug has no mirrored images yet.
 */
import { computed, ref } from "vue";
import { apiBase } from "../../lib/api";
import { useCatalogStore } from "../../stores/catalogStore";

const props = defineProps<{ slug: string }>();
const catalog = useCatalogStore();

// A missing photo means *both* start.jpg and end.jpg are missing (they're mirrored as a pair,
// see ingestImages.ts) — one known-missing flag covers both frames instead of needing a second.
// `!== false` keeps today's attempt-then-@error behavior for an unloaded/stale-cached catalog.
const knownMissing = computed(() => catalog.bySlug(props.slug)?.hasImage === false);
const startFailed = ref(false);
const endFailed = ref(false);
const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const bothLoaded = () => !knownMissing.value && !startFailed.value && !endFailed.value;
</script>

<template>
  <!-- animated: single stage, two frames cross-fading in a loop -->
  <div v-if="!reduceMotion && bothLoaded()" class="demo-stage">
    <img class="frame-a" :src="`${apiBase()}/images/${props.slug}/start.jpg`" alt="Übungsablauf" @error="startFailed = true" />
    <img class="frame-b" :src="`${apiBase()}/images/${props.slug}/end.jpg`" alt="" @error="endFailed = true" />
  </div>

  <!-- static fallback: reduced motion, known-missing photos, or one/both frames failed anyway -->
  <div v-else class="exercise-demo">
    <div class="frame">
      <img v-if="!knownMissing && !startFailed" :src="`${apiBase()}/images/${props.slug}/start.jpg`" alt="Startposition" @error="startFailed = true" />
      <div v-else class="placeholder">Kein Bild</div>
      <span class="label">Start</span>
    </div>
    <div class="frame">
      <img v-if="!knownMissing && !endFailed" :src="`${apiBase()}/images/${props.slug}/end.jpg`" alt="Endposition" @error="endFailed = true" />
      <div v-else class="placeholder">Kein Bild</div>
      <span class="label">Ende</span>
    </div>
  </div>
</template>

<style scoped>
.demo-stage {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-3);
}
.demo-stage img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.frame-a {
  animation: demo-crossfade-a 3.6s ease-in-out infinite;
}
.frame-b {
  animation: demo-crossfade-b 3.6s ease-in-out infinite;
}
@keyframes demo-crossfade-a {
  0%,
  33% {
    opacity: 1;
  }
  50%,
  83% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes demo-crossfade-b {
  0%,
  33% {
    opacity: 0;
  }
  50%,
  83% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.exercise-demo {
  display: flex;
  gap: var(--sp2);
}
.frame {
  flex: 1;
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-3);
}
.frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--faint);
  font-size: 11px;
}
.label {
  position: absolute;
  bottom: 4px;
  left: 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text);
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 6px;
  border-radius: 999px;
}
</style>
