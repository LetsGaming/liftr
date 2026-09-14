/**
 * Persists the last geolocation fix a route-editing map got (from a "use my location" button or
 * a silent on-open lookup) so the map can open centered on somewhere relevant to the user instead
 * of a hardcoded fallback — useful both offline and while a fresh fix is still resolving.
 * Extracted out of RouteMapEditor.vue.
 */
const LAST_LOCATION_KEY = "liftr.route-editor.lastKnownLocation";

export interface Coords {
  lat: number;
  lon: number;
}

function getStoredLocation(): Coords | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lon === "number") return parsed;
  } catch {
    // corrupt/unavailable storage — fall through to the caller's own fallback
  }
  return null;
}

function storeLocation(lat: number, lon: number) {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ lat, lon }));
  } catch {
    // storage unavailable (private browsing etc.) — non-fatal, just skip persisting
  }
}

export function useLastKnownLocation() {
  /** Fetches a fresh fix and, on success, stores it and hands it to `onFix`. Errors/denials are
   *  silently ignored — callers are expected to already have a reasonable fallback center
   *  rendered before calling this. */
  function locate(onFix: (coords: Coords) => void, options?: PositionOptions) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        storeLocation(coords.lat, coords.lon);
        onFix(coords);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000, ...options },
    );
  }

  return { getStoredLocation, storeLocation, locate };
}
