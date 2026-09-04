# Round 2 (Live Browser) Audit Report: Ranks/Overview Visual Treatment
**Last Verified:** 2026-09-04
**Verification Status:** Discrepancies Found

## Environment note
The connected Chrome instance was shared with other concurrently-running round-2 verification agents (tabs kept getting re-navigated mid-task by another process). To get a reliable, uncontended, true mobile viewport, I injected a same-origin `<iframe>` (width 360px, height increased to fit content) into a page in my own tab and drove/measured that nested browsing context directly — its `window.innerWidth` was independently confirmed (356px), so the screenshots and DOM reads below at "mobile width" are genuine live renders at that viewport, not desktop CSS read statically. `resize_window` and `window.resizeTo()` on the shared top-level window were unreliable/blocked, which is why this workaround was used instead of the resize tool named in the task.

## Summary Table
| Claim | Round 1 Verdict | Live Browser Verdict | Agreement | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| Top HUD borderless (no solid background/box) | Complete | PASSED | CONFIRMED | Live `getComputedStyle('.top-hud')`: `background: rgba(0,0,0,0)`, `border: 0px none`, `boxShadow: none`. Screenshot of mobile iframe view shows only individual pill chips ("Lv. 4 …", "🔥 2 Tage"), no bounding box around the strip. |
| Overall/Gesamtrang stat tile present, visually prominent | Complete | PASSED | CONFIRMED | Mobile-width screenshot: "LEHRLING I / Gesamtrang" tile renders with a warm gold/bronze gradient background, clearly distinct from the 3 flat dark neighboring tiles (Tage Serie, Level, Workouts diese Woche). |
| Priority-marked tiles visually distinct | Complete | PASSED | CONFIRMED | Live DOM: `.erholungszone.tile--priority` and `.launchpad.tile--priority` both compute `border: 1px solid rgb(47,159,224)` — a real blue outline, not just a class with no effect. |
| Bodyweight/recovery card present | Complete | PASSED | CONFIRMED | "ERHOLUNGSZONE" card with front/back body-heatmap SVG and "DEIN STATUS" pill renders on Overview both desktop and mobile widths. |
| Discover/Entdecken grid section present | Complete | PASSED | CONFIRMED | "ENTDECKEN" section with "Rang-Analyse" card renders at both widths; wraps cleanly at 356px (only one card currently populates the "grid"). |
| Exactly one Daten-Export entry point (not duplicated) | Complete | PASSED | CONFIRMED | Live text-search: `/Daten-Export/gi` matches 0 times on `/` (Overview), 1 time on `/profile`. No duplicate. |
| Tier badge/medal genuine metallic rendering (gradient, bevel, not flat circle) | Complete | PASSED | CONFIRMED | Live `getComputedStyle` on `.badge::before`: `background-image: linear-gradient(-25deg, rgb(143,180,255) 0%, rgb(21,36,73) 70%)` (bevel/face gradient); badge itself has two overlaid diagonal white-streak gradients (specular highlight bands). Not a flat single-color fill. |
| Trust marker/legibility element near rank progress bars | Complete | PASSED | CONFIRMED | "≈" tilde glyph found live in page text next to rank labels, e.g. "LEHRLING III ≈" on the Bizepscurls (KH) and Bizepscurls (LH) rank cards on `/ranks`. |
| Link to Records/Rekorde from Ranks page | Complete | PASSED | CONFIRMED | "🏆 Rekorde ansehen" button present and live on `/ranks`. |
| Active-tab treatment differs visibly from inactive (bottom nav) | Complete | PASSED | CONFIRMED | Mobile-width (356px) screenshot of bottom nav: active "Übersicht" tab shows a filled navy background block + full-color blue icon/text; the 4 inactive tabs (Workout, Ränge, Übungen, Profil) show grey icon/text with no background block — a clear, non-subtle difference. |
| StatTile 2×2 mobile grid, no overflow/cutoff | Complete | PASSED | CONFIRMED | At true 356px viewport width (iframe-verified), the 4 stat tiles render as a clean 2×2 grid; all labels ("Tage Serie", "Level", "Workouts diese Woche", "Gesamtrang") and values fully visible, no clipping or overlap. |
| Workout+Läufe merged into one tab via switcher; bottom nav has no separate Läufe tab | Complete | PASSED | CONFIRMED | `/workout` and `/runs` both show a "Workout / Läufe" pill switcher at the top of the content area; the actual nav (sidebar at desktop width, bottom tab bar at mobile width) lists exactly 5 items — Übersicht, Workout, Ränge, Übungen, Profil — no "Läufe" entry. |
| No console errors on visited pages | (not explicitly claimed) | AMBIGUOUS | N/A | No `console.error` entries found. One recurring `[Vue warn]` on Overview (see Newly Discovered Issues) — a warning, not an error. |

## Round 1 Confirmed
* **Top HUD borderless**: Live computed style confirms transparent background, no border, no box-shadow on `.top-hud` itself; visually only the inner pill chips carry their own background, matching round 1's description exactly.
* **Tier badge metallic rendering**: Live computed styles on `.badge`/`.badge::before` show real diagonal gradients (face-gradient bevel + dual specular streak overlays), not a flat colored circle. This directly contradicts what a "flat fake badge" regression would look like — round 1's claim holds up under live inspection.
* **Trust marker (`≈`)**: Found live in rendered page text next to rank progress on `/ranks`, exactly as round 1 described.
* **StatTile 2×2 mobile grid**: Verified at a genuine 356px live viewport (via same-origin iframe technique) — clean 2×2 layout, no wrapping/overflow issues. This is the strongest possible confirmation short of a real phone, since it's a real rendered DOM/CSS viewport, not a static CSS read.
* **Workout+Läufe merge**: Confirmed live — switcher pill present on both `/workout` and `/runs`, and the persistent nav (both desktop sidebar and mobile bottom bar) has only 5 items with no separate Läufe entry.
* **Single Daten-Export entry point**: Confirmed by live text search — 0 occurrences on Overview, 1 on Profile.
* **Active-tab bottom-nav treatment**: Confirmed at true mobile width — filled background block + full-color icon distinguishes the active tab, clearly more than "a subtle color shift."
* **Overall Rank tile prominence / priority tiles**: Both confirmed live via distinct gradient background (Gesamtrang tile) and a real applied blue border (`tile--priority` class) on the recovery/launchpad cards.

## Round 1 Overturned (Round 1 was WRONG)
* None found. Every claim checked in this pass rendered live exactly as round 1 (and agent-4's static-code re-verification) described. I found no case where the live app contradicted a "Complete" verdict from round 1 for the items in scope of this report.

## Newly Discovered Issues
* **Recurring Vue console warning on Overview page load**: `[Vue warn]: Extraneous non-props attributes (class) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.` — fires at `<ErholungszoneCard class="tile--priority" heat=Object recovered-slugs=Array(0) ...>` inside `OverviewPage`. This recurs on every Overview mount. I verified it is **not** currently causing a visible regression — the `tile--priority` class and its blue border are actually applied one level up, on the wrapping `<section class="erholungszone tile--priority">`, so the border renders correctly — but the warning indicates `ErholungszoneCard` itself is receiving attributes it can't consume (likely because its template root is a fragment/text/teleport node), which is fragile and worth cleaning up before it silently breaks something in a future refactor.
* **Discover/Entdecken "grid" is currently a single card**: Not a bug, but worth flagging — the section is described as a "Discover grid" but at present only one entry ("Rang-Analyse") populates it, so the grid layout itself (multi-column wrapping behavior) is untested by real content.

## Unverified (Needs Further Manual Check)
* **True on-device mobile testing**: All mobile-width evidence here came from a same-origin iframe workaround (necessary because the shared browser's top-level window would not reliably resize below its ~1080px desktop width during this session, and `window.resizeTo()` is blocked). This is a legitimate live-render test (confirmed `innerWidth` inside the iframe), but it is still an emulated viewport inside a desktop Chrome process, not a real phone or Chrome's native device-emulation mode. Recommend a follow-up with actual DevTools device toolbar or a physical device for full confidence, particularly for touch-target sizing and safe-area insets which an iframe can't reproduce.
* **`FinishSequence.vue` beat timing (`--dur-cele`)**: Out of scope for this report's assigned checks (no rank-up was triggered live), consistent with agent-4's own "unverified" flag on this item.
