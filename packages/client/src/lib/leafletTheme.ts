/**
 * Shared Leaflet setup for every map in the app: reading design tokens as CSS custom properties,
 * and the OSM tile layer. Single-user, low-volume interactive viewing is within OSM's tile usage
 * policy — no bulk prefetch, attribution shown; that reasoning lives here once, not copy-pasted
 * into every map component.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function createOsmTileLayer(): L.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  });
}
