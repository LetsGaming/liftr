# Round 2 Verification Summary (Live Browser + Design Fidelity)
**Last Verified:** 2026-09-04
**Method:** 9 independent worker agents, each with live browser access to the running dev app (`http://localhost:5174`, server on `:3001`), re-verifying round 1's static-analysis verdicts through real interaction, DOM/computed-style inspection, network capture, and console monitoring. 6 agents re-tested behavioral claims from round 1; 3 agents did direct rendered-screenshot comparison against the design mockups in `./examples/liftr` to check whether the shipped "Nebula" design system actually matches the chosen Pulse × Liftoff × Nebula direction across the whole app.

**Tooling note (affects every report):** `chrome-devtools-mcp` and the `playwright` MCP could not launch in this environment (no local Chrome binary at the expected paths — only Edge, or a session-managed Chrome via the `claude-in-chrome` extension). Agents fell back to `claude-in-chrome` or a self-launched Edge via CDP/puppeteer-core. Several agents also noted the shared Chrome session had contention from other concurrently-running agents, and one flagged the Chrome profile has Dark Reader / a forced-dark override active, which corrupted some raw screenshot color sampling (agents compensated by reading `getComputedStyle`/CSS source directly, which is unaffected).

---

## Part A — Behavior re-verification: round 1 mostly held up, but 2 real overturns + several live-only bugs found

**No sweeping reversal of round 1.** Every "orphaned primitive," nav-shell, PR-ledger, Profile, RPE/notes/RestTimer/sync-indicator, plausibility-discount, and routine-builder-flow claim round 1 made from static code reading was independently reproduced through actual clicks, drags, and form submissions. Round 1's static analysis was not fabricated.

**Two claims WERE overturned by live testing** — bugs invisible to a static/test-only read:

1. **Custom exercise creation with umlauts (round2-agent-4)** — round 1 (agent-8) verified this via passing server tests only. Live: creating "Überkopfdrücken Test" saves successfully with correct slug transliteration, but **the exercise then displays the raw slug ("ueberkopfdruecken-test") everywhere as its name** — list tile, detail sheet, `GET /api/exercises` response has no display-name field at all, only `slug`/`nameKey`. This is a materially worse bug than the "umlaut corruption" round 1 confirmed fixed: every custom exercise loses its human-readable name entirely.
2. **Manual run-entry inline error validation (round2-agent-6)** — round 1 verified the `manualError`/try-catch code path exists. Live: the Save button stays `disabled` on invalid/blank client input, so that error path is only reachable via a genuine server-side rejection — typing garbage or leaving fields blank never triggers the claimed inline error UI.

**New defects found only by live testing** (not overturns, since neither doc made a claim either way):
- `/records` navigated to via the in-app router-link (not a hard URL load) shows a ~1-2s fully blank content area before data renders — reproduced 3x.
- `GET /api/settings/gym` returns HTTP 500 on every single page load (app degrades silently).
- Recurring Vue warning on every Overview mount: `ErholungszoneCard` receives non-props attributes it can't inherit (fragment root).
- Recurring Ionic Vue console exception (`insertBefore` on null) firing every 35-90s throughout the whole session, independent of user action.
- A GPX-imported run showed `distanceM: 0, durationS: 0` despite valid timestamped trackpoints and a correctly-rendered map — flagged unconfirmed (may be a test-fixture artifact).

Full detail: `round2-agent-1.md` through `round2-agent-6.md`.

---

## Part B — Design fidelity: the "Nebula shipped app-wide" claim is a FALSE POSITIVE at the whole-app level

You said some findings were false without saying which — this is almost certainly it. Multiple audit docs (`nebula-design-*.md`, `workplan-v1.md` Nebula phases, `2026-09-03-nebula-and-workplan-rework.md`) claim the Pulse × Liftoff / Nebula direction is fully shipped. Direct rendered comparison against `examples/liftr/liftr-directions.html` (Pulse), `liftr-liftoff-variations.html` (Pulse × Liftoff, the chosen variation), and `liftr-pulse-liftoff-finalists.html` (Nebula finalist, dark + light) shows it is **not** — the Nebula identity shipped as an isolated accent, not the app's dominant visual language.

### What actually matches
- **CTA buttons** ("Jetzt trainieren", "Satz speichern", Profile "Speichern") render the correct 3-stop Nebula gradient (`#2f9fe0 → #8a6dff → #d63aff`, essentially identical to the mockup's `#2f9fe0 → #7c5cff → #d63aff`). This is the one element where the identity clearly shipped.
- **Light-mode base tokens** (`--bg:#f6f4fb`, `--surface:#ffffff`) are near-exact matches to the mockup's Nebula-Light spec, and the light-mode "no glow, neutral elevation" intent is honored.
- Overall card-stack structure (hero card → status strip → tiles → feed) matches the Pulse × Liftoff layout rhythm.

### What does not match — the app's most important screens use an entirely different visual system
- **Rank/tier badges and progress bars — the dominant visual on `/ranks` and the Workout progress card — use a bronze/orange or grey/silver "medal" gradient per tier, not the Nebula gradient at all.** This is not a minor accent gap; it's the screen users see most, and its defining color is amber/copper, the opposite of the mockup's blue-violet-magenta.
- **No gradient-clipped tier-name text anywhere** — the mockup's signature "Nebula" text treatment (`-webkit-text-fill-color: transparent` over the gradient) has no live equivalent; all tier labels are plain solid-color text.
- **Dark-mode background/surface are neutral blue-black (`#0a0c14`/`#161c2d`), not the mockup's violet-tinted radial wash (`#1c1a3a`→`#0a0912`)** — confirmed on Overview, Workout, and Ranks. The mockup's whole premise was that the identity lives in the *ground*, not just accents; it doesn't.
- **No colored glow/shadow anywhere** — the `--nebula-glow`/`--nebula-glow-strong` tokens exist with mockup-matching values but are used in exactly one place app-wide (a transient streak-pulse celebration animation), never on any standing card or CTA.
- **Streak/level stat tiles use plain solid orange/blue colors** (`--fire-hi`/`--blue-hi`), directly contradicting tokens.css's own comment that Nebula is meant for "streak/level accents."
- **The hexagon medallion shape — Liftoff's defining structural contribution to "Pulse × Liftoff"** — doesn't exist anywhere live. Rank badges are small (~40px) rounded-square/diamond chips, not the large centerpiece hexagon the mockup built the whole rank-up moment around.
- **CTA typography** (mockup: small, uppercase, letter-spaced) is not applied (live: 15px, sentence-case, no tracking).
- **Corner radius drift**: mockup uses one uniform ~20px; shipped app uses three different values (16/22/28px).
- **A real light-mode theming bug, independent of the Nebula question**: toggling "Hell" correctly sets `data-theme="light"` and `--bg` resolves correctly in CSS, but the rank-ladder panel and exercise cards' *actual rendered* background stays near-black — light mode does not visually apply to these surfaces at all.

Full detail with computed-style evidence: `round2-design-agent-1.md` (Overview), `round2-design-agent-2.md` (Workout), `round2-design-agent-3.md` (Ranks).

---

## Bottom line

1. **Round 1's static analysis was largely accurate on behavior** — the errors it made were errors of *omission* (couldn't see runtime-only bugs), not fabrication, plus two real overturns (custom-exercise name loss, manual-entry validation gap) that only live testing could catch.
2. **The Nebula design system is genuinely NOT "fully shipped app-wide."** It shipped correctly on CTA buttons and light-mode base tokens, but the app's rank/tier UI — arguably the core of the product — runs on an entirely separate, un-migrated bronze/silver medal-color system, dark mode never got its violet-tinted ground, and the defining hexagon-medallion structural element from "Liftoff" was never built. Any audit doc claiming this phase is "done" is describing the token definitions existing, not the rendered app matching the chosen direction.
