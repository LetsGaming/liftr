<script setup lang="ts">
/**
 * Floating standard/satellite switch for an interactive map — same "floating chrome over the map
 * surface" recipe RouteMapEditor.vue's own 📍 locate button uses (surface + border, z-index 1000
 * to clear Leaflet's own control panes). Purely a dumb button: the shared preference itself lives
 * in useBasemap.ts so every mounted map can react to it at once.
 */
import AppIcon from "../base/AppIcon.vue";
import { useBasemap } from "../../composables/useBasemap";

const { basemap, toggle } = useBasemap();
</script>

<template>
  <button
    type="button"
    class="basemap-toggle"
    :class="{ active: basemap === 'satellite' }"
    :aria-pressed="basemap === 'satellite'"
    :aria-label="basemap === 'satellite' ? 'Kartenansicht' : 'Satellitenansicht'"
    @click="toggle"
  >
    <AppIcon name="layers" :size="20" />
  </button>
</template>

<style scoped>
.basemap-toggle {
  position: absolute;
  z-index: 1000;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  border-radius: 50%;
  background: var(--surface-hybrid-bg);
  backdrop-filter: blur(var(--surface-hybrid-blur));
  -webkit-backdrop-filter: blur(var(--surface-hybrid-blur));
  border: 1px solid var(--line);
  color: var(--text);
  display: grid;
  place-items: center;
}
/* Satellite is active — same accent-fill convention RouteWizard.vue's active speed button
   (RunReplay.vue's .speed-btn.active) uses for "this mode is on". */
.basemap-toggle.active {
  background: var(--blue);
  border-color: var(--blue);
  color: #fff;
}
</style>
