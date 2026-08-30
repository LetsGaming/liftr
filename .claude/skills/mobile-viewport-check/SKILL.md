---
name: mobile-viewport-check
description: Use after any change to packages/client/src (.vue files, styles, pages, components) to verify the UI at mobile viewport sizes before calling the work done. Liftr is used primarily on mobile; desktop is the adapted view, not the primary target.
---

# Mobile Viewport Check

Liftr's client (`packages/client`) is a Vue 3 + Ionic/Capacitor PWA used primarily on
phones. Any visual or interaction change must be verified at mobile width first —
checking only a full-width desktop browser window is not sufficient and has previously
let mobile-only layout bugs through.

## When to run this

After editing any file under `packages/client/src/**/*.vue`, `packages/client/src/styles/**`,
or any component/page/composable that changes rendered UI or touch interaction.

## Steps

1. Make sure the dev server is running: `pnpm --filter @liftr/client dev` (or the full
   `pnpm dev` if the server/API is also needed for the feature under test).
2. Use the Chrome DevTools MCP tools (`resize_page` / `emulate`) or Playwright's
   `browser_resize` to set the viewport to a phone size — default to **390x844**
   (iPhone 12/13/14 class) unless the change is specifically about a different device.
3. Navigate to the affected page(s) and exercise the changed flow with touch-style
   taps/clicks (not hover-dependent interactions — hover states don't exist on mobile).
4. Check specifically for:
   - Tap targets that are too small or too close together
   - Content clipped or requiring horizontal scroll
   - Modals/sheets that don't fit the viewport height
   - Text truncation or wrapping issues at narrow width
   - Bottom safe-area / notch clearance for fixed UI (Ionic tab bars, FABs)
5. Only after the mobile check passes, optionally verify desktop width as a secondary
   check — it is not the primary target and should never be checked instead of mobile.

Report what you saw at mobile width, not just "it works" — a screenshot or explicit
description of the interaction confirms this was actually checked rather than assumed.
