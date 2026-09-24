/** dev-up.mjs's default auto-login (see scripts/dev-up.mjs) appends `?devToken=` to the dashboard
 *  URL it prints. `import.meta.env.DEV` keeps this out of any real build — a plain `vite dev`
 *  server (what dev-up.mjs always starts) is the only place it can ever run.
 *
 *  Must be main.ts's first import: `router`'s `createWebHistory()` snapshots `window.location` at
 *  module-evaluation time, and ES module imports evaluate in the order they're written — importing
 *  this before `./router` guarantees the URL is already stripped by the time that snapshot happens,
 *  so the devToken never reappears via the router's own history state. */
import { setToken } from "./api";

if (import.meta.env.DEV) {
  const url = new URL(window.location.href);
  const devToken = url.searchParams.get("devToken");
  if (devToken) {
    setToken(devToken);
    url.searchParams.delete("devToken");
    window.history.replaceState({}, "", url);
  }
}
