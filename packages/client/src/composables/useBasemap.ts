/**
 * Shared standard/satellite basemap preference — one module-scope ref, not a per-call ref, so
 * every mounted map switches together: pick satellite in the route wizard and the run replay
 * opens in satellite too. Persists across reloads the same way useLastKnownLocation.ts does.
 * `RouteThumbnail.vue` deliberately opts out (pins `basemap="standard"` on `LeafletMapBase`)
 * rather than reading this — a tiny inert card preview isn't where satellite imagery earns its
 * bandwidth, and route cards benefit from a consistent look regardless of the live preference.
 */
import { ref, watch } from "vue";
import type { BasemapId } from "../lib/leafletTheme";

const BASEMAP_KEY = "liftr.map.basemap";

function readStored(): BasemapId {
  try {
    const raw = localStorage.getItem(BASEMAP_KEY);
    return raw === "satellite" ? "satellite" : "standard";
  } catch {
    // storage unavailable (private browsing etc.) — non-fatal, just start from the default
    return "standard";
  }
}

const basemap = ref<BasemapId>(readStored());

watch(basemap, (value) => {
  try {
    localStorage.setItem(BASEMAP_KEY, value);
  } catch {
    // storage unavailable — non-fatal, just skip persisting
  }
});

export function useBasemap() {
  function toggle() {
    basemap.value = basemap.value === "satellite" ? "standard" : "satellite";
  }
  return { basemap, toggle };
}
