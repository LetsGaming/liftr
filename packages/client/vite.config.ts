import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as {
  version: string;
};

// Client shell (plan 1.2): Vue 3 PWA, offline-first (plan 1.3). The service worker precaches
// the app shell; catalog + images use CacheFirst; API GETs use StaleWhileRevalidate, so the
// core logging loop keeps working with no signal (audit's "gym basement" requirement).
export default defineConfig(({ command }) => ({
  resolve: command === "serve" ? { conditions: ["development"] } : undefined,
  // See src/vite-env.d.ts — useAppUpdate.ts reads this as the app version on platforms with no
  // native build to ask (web/PWA); the native (Android) build reads its own real installed
  // version via @capacitor/app's App.getInfo() instead, since that's the authoritative source
  // there.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,png}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/exercises/,
            handler: "CacheFirst",
            options: { cacheName: "liftr-catalog" },
          },
          {
            urlPattern: /\/images\//,
            handler: "CacheFirst",
            options: { cacheName: "liftr-images" },
          },
          {
            urlPattern: /\/api\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "liftr-api" },
          },
          // OSM route/run map tiles (RunMap.vue, RouteMapEditor.vue, RouteThumbnail.vue) were
          // entirely uncached before this — every mount re-fetched every tile from
          // tile.openstreetmap.org, with no offline story at all. Cross-origin, so the pattern
          // matches the full URL rather than just a path.
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Esri street/place-name labels overlay for satellite mode (lib/leafletTheme.ts's
          // createLabelsTileLayer) — a more specific pattern than the arcgisonline.com rule below,
          // and listed first so it wins the match: without its own rule, every label tile would
          // count against esri-satellite-tiles' 150-entry budget too, roughly halving how much
          // imagery actually stays cached. Label PNGs are much lighter than imagery, so a bigger
          // entry count costs comparatively little offline storage.
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*\/Reference\/World_Transportation\//,
            handler: "CacheFirst",
            options: {
              cacheName: "esri-labels-tiles",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Esri World Imagery satellite basemap (lib/leafletTheme.ts's createSatelliteTileLayer,
          // toggled via BasemapToggle.vue) — its own cache entry, same reasoning as the OSM rule
          // above, since a different tile host isn't covered by that pattern. Lower maxEntries
          // than OSM's: satellite JPEGs run several times heavier per tile than OSM's PNGs, so an
          // equal entry count would use noticeably more offline storage for the same coverage.
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "esri-satellite-tiles",
              expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Liftr",
        short_name: "Liftr",
        description: "Persönlicher Kraft- und Lauf-Tracker",
        theme_color: "#0a0c14",
        background_color: "#0a0c14",
        display: "standalone",
        // Was empty (feedback: no PWA icons at all) — "any" purpose icons render as-is; the
        // maskable pair has extra padding baked in (public/icons/icon-maskable.svg) so an OS
        // that clips to a circle/squircle doesn't cut into the hex mark. See public/icons/ for
        // the source SVGs these were rasterized from.
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // The main entry chunk pulled in the full Ionic/Stencil runtime (~1MB) because it's
        // imported eagerly in main.ts and never route-split. Route pages already lazy-split
        // fine (see router.ts); this splits the framework/vendor code itself into its own
        // cacheable chunk(s) so the app's own code doesn't ship one giant >500kB bundle.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@ionic") || id.includes("ionicons")) return "ionic-vendor";
          if (
            id.includes("/vue/") ||
            id.includes("/vue-router/") ||
            id.includes("/pinia/") ||
            id.includes("/@vue/")
          ) {
            return "vue-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    proxy: {
      // BACKEND_PORT lets an isolated dev session (scripts/dev-up.mjs --id <name>) point this
      // client at its own dynamically-allocated backend instead of the default :3001 — unset in
      // the normal `pnpm dev` flow, where it keeps defaulting to 3001 exactly as before.
      "/api": `http://localhost:${process.env.BACKEND_PORT ?? 3001}`,
      "/images": `http://localhost:${process.env.BACKEND_PORT ?? 3001}`,
    },
  },
}));
