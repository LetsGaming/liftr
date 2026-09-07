import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// All packages' tests live under tests/<package>/..., mirroring packages/<package>/src/...
// (see tests/README.md). Node-only packages (server, ingest) have no public "exports" map for
// deep imports, so `~server`/`~client`/`~ingest` alias straight into their src/ — @liftr/shared
// and @liftr/db are real workspace packages instead, imported by their package name as usual.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "~server", replacement: fileURLToPath(new URL("./packages/server/src", import.meta.url)) },
      { find: "~client", replacement: fileURLToPath(new URL("./packages/client/src", import.meta.url)) },
      { find: "~ingest", replacement: fileURLToPath(new URL("./packages/ingest/src", import.meta.url)) },
      // idb/@capacitor/* are direct dependencies of @liftr/client only (not hoisted to this
      // root package.json's devDependencies the way @liftr/shared/@liftr/db are), so a bare
      // `import "idb"` resolves differently depending on who asks: from a file under
      // packages/client/src it finds packages/client/node_modules/idb, but from a test file
      // under tests/ (outside that package) plain Node resolution can't see it at all. Left
      // alone, that mismatch means `vi.mock("idb", ...)` — registered against the test file's
      // own (unresolvable) resolution of "idb" — never matches the real, differently-resolved
      // module id that packages/client/src/lib/idb.ts's own import resolves to, so the mock
      // silently doesn't apply and the real idb package loads instead. Aliasing these bare
      // specifiers straight to their real location makes every importer resolve to the exact
      // same id, so `vi.mock(...)` for them actually takes effect regardless of which file
      // performs the import.
      { find: /^idb$/, replacement: fileURLToPath(new URL("./packages/client/node_modules/idb", import.meta.url)) },
      {
        find: /^@capacitor\/core$/,
        replacement: fileURLToPath(new URL("./packages/client/node_modules/@capacitor/core", import.meta.url)),
      },
      {
        find: /^@capacitor\/haptics$/,
        replacement: fileURLToPath(new URL("./packages/client/node_modules/@capacitor/haptics", import.meta.url)),
      },
      // Same idb/@capacitor/core resolution mismatch as above, for the two native plugins
      // syncStore.ts's startAutoFlush() uses (App foreground-resume, Network status changes) —
      // needed so tests/client/stores/syncStore.test.ts's vi.mock("@capacitor/app"/"@capacitor/
      // network", ...) actually intercepts the same module id syncStore.ts itself resolves.
      {
        find: /^@capacitor\/app$/,
        replacement: fileURLToPath(new URL("./packages/client/node_modules/@capacitor/app", import.meta.url)),
      },
      {
        find: /^@capacitor\/network$/,
        replacement: fileURLToPath(new URL("./packages/client/node_modules/@capacitor/network", import.meta.url)),
      },
      // Same idb/@capacitor resolution mismatch as above, for `leaflet` — RunMap.vue's own
      // `import L from "leaflet"` and a test file's `vi.mock("leaflet", ...)` need to resolve to
      // the exact same module id for the mock to actually intercept it (see
      // tests/client/components/run/RunMap.test.ts).
      {
        find: /^leaflet$/,
        replacement: fileURLToPath(new URL("./packages/client/node_modules/leaflet", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    environment: "node",
    environmentMatchGlobs: [
      ["tests/client/components/**", "jsdom"],
      ["tests/client/pages/**", "jsdom"],
    ],
  },
});
