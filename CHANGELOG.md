# Changelog

All notable changes to this project are documented in this file. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not yet follow
Semantic Versioning strictly (no releases have been tagged before this one — see
`.github/workflows/release.yml` for how a release is cut).

## [Unreleased]

## [1.2.0] - 2026-09-17

- Internal updates and minor improvements.

## [1.1.3] - 2026-09-17

### Fixed

- **First login/setup on a new device could leave the app stuck with no data and no onboarding.** Setting the owner password (or logging in) on a device with no cached session left the level ring, streak, and onboarding wizard silently empty until the app was fully restarted — the app now reloads that data immediately after signing in.
- **"Health Connect verbinden" crashed with `permissions.every is not a function`.** A wrong type in the Health Connect plugin masked a real runtime shape mismatch.
- **The barbell/EZ-bar/trap-bar weight couldn't go below 5 kg** , even though some aluminum barbells weigh less.

### Changed

- **The app no longer draws under the Android status bar / camera notch** , including onboarding, the routine/route wizards, and the live-run screen.
- **"Nach Updates suchen" now confirms when you're already up to date** , instead of appearing to do nothing.
- **Profil page reorganized** : "Scheiben & Stange" merged into the Equipment card, and Server/Version/Diagnose/Abmelden merged into one "Konto & App" card.

## [1.1.2] - 2026-09-17

### Fixed

- **Native app couldn't connect to a server with `LIFTR_ALLOWED_ORIGINS` set.** The Android app's own WebView origin was never on the allow-list, so the server rejected its requests with no useful error — the app just showed "Server nicht erreichbar".

### Changed

- **New app icon and logo.** Replaced the plain blue hexagon with a new mark on the app's Nebula gradient — favicons, the installed-app icon, and the Android launcher/splash screens all updated.

## [1.1.1] - 2026-09-17

- Internal updates and minor improvements.

## [1.1.0] - 2026-09-17

### Added

- **In-app version display + update checks.** Every platform now shows the app's own version on Profil → Version.
- **Runtime server connection for the native app.** The Android app now asks for its server's address on first launch and verifies it's actually a running Liftr instance (`GET /api/health` now returns `service: "liftr"`) before proceeding, instead of baking a fixed backend URL in at build time — the same pattern as Home Assistant/Jellyfin.

### Changed

- Removed the `VITE_API_BASE` build-time variable and the `LIFTR_BACKEND_URL` CI variable it read from — no longer needed now that the native app resolves its server at runtime.
- Android now permits plain `http://` server addresses (previously blocked by default since API 28), since a self-hosted instance often has no reverse-proxy/TLS in front yet.

## [1.0.1] - 2026-09-16

- Internal updates and minor improvements.

## [1.0.0] - 2026-09-16

Initial release. Liftr is a self-hosted strength + running tracker: Vue 3 (Ionic/Capacitor PWA)
client, Fastify server, SQLite via Drizzle. This entry captures the full feature set as it stands
today — see [`docs/features.md`](docs/features.md) for the detailed tour this summary is drawn
from.

### Added

- **Workout logging** — routine-based or freeform, with last-time-aware defaults, set-kind
  tagging (warm-up/drop/failure), optional RPE/notes capture, a rest timer, a mobile exercise
  rail, warm-up ramp suggestions, a plate-math calculator, and a beat-by-beat Finish Sequence
  recapping XP/streaks/rank-ups/PRs.
- **Rank system** — nine tiers (Initiate → Apex) with divisions, computed from real strength
  standards where available and clearly-marked estimates where not. Separate peak/current rank
  (peak is a ratchet, current decays gracefully after inactivity), a corroboration gate against
  one-off flukes, a plausibility gate that discounts (never discards) implausible sessions, an
  Overall Rank aggregate, and rank UI (tier ladder, distribution donut, progress chart, rank-up
  calendar). Personal Records ledger at `/records`.
- **XP, levels, and streaks** — decelerating level curve, consistency/variety bonuses,
  streaks that forgive a missed day instead of resetting, discounted (never zero) XP for
  plausibility-flagged sessions.
- **Recovery Zone** — a heuristic green-light/rest-day read on the Overview page from recent
  training load.
- **Running as a first-class second discipline** — GPX/FIT import, Android Health Connect
  import, run detail view with route map and replay, manual entry with inline validation, a
  combined workout/runs switcher, and full XP/rank parity with lifting (five distance categories,
  peak/current rank, corroboration, decay, PRs, Overall Runner Rank) — no third-party fitness
  platform dependency.
- **Routines and planning** — a guided + fast-path routine builder wizard, drag-to-reorder,
  equipment-substitution copy, optional mesocycle planning, custom exercises, and route planning
  (waypoints on a map, automatic distance/elevation, loop-closing).
- **Exercise catalog** — ~94 curated exercises with demos, muscle-group tagging and an
  interactive muscle diagram, per-exercise history, and a third-party attributions page.
- **Multi-user accounts** — a per-instance owner (set up on first launch) can invite other
  people via time-limited invite codes; everyone logs in with their own username/password to a
  session-scoped bearer token. Supersedes the original single shared `LIFTR_TOKEN` design (see
  `docs/adr/0006-multi-user-hardening.md`). Includes self-service account deletion.
- **Profile and settings** — staged skippable onboarding, bodyweight tracking with a trend
  chart, API token management, CSV/ZIP data export, light/dark theme, shareable workout image
  cards.
- **PWA / offline-first** — installable, no app store required; every mutation writes to
  IndexedDB and queues in an outbox that flushes opportunistically, so logging never blocks on
  the network. Self-hosted, single SQLite file, no cloud account or analytics by default.
- **Operational hardening** — graceful shutdown, non-root container execution, per-user rate
  limiting on high-value endpoints, Dependabot-managed dependency updates, and a self-hosted
  error-tracking/diagnostics panel (owner-only) with a Sentry-compatible interface for future
  GlitchTip-style integration.
- **Android release pipeline** — tag-triggered GitHub Actions workflow that runs CI, builds a
  signed release APK, and attaches it to a GitHub Release (see
  `docs/operations/android-release-signing.md`).
