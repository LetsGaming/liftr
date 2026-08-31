import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Client shell (plan 1.2): Vue 3 PWA, offline-first (plan 1.3). The service worker precaches
// the app shell; catalog + images use CacheFirst; API GETs use StaleWhileRevalidate, so the
// core logging loop keeps working with no signal (audit's "gym basement" requirement).
export default defineConfig({
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
      "/api": "http://localhost:3001",
      "/images": "http://localhost:3001",
    },
  },
});
