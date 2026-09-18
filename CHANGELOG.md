# Changelog

All notable changes to this project are documented in this file. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not yet follow
Semantic Versioning strictly (no releases have been tagged before this one — see
`.github/workflows/release.yml` for how a release is cut).

## [Unreleased]

## [1.3.3] - 2026-09-18

- Internal updates and minor improvements.

## [1.3.2] - 2026-09-18

- Internal updates and minor improvements.

## [1.3.1] - 2026-09-18

- Internal updates and minor improvements.

## [1.3.0] - 2026-09-18

### Added

- **You can now change your display name, username, and password from Profil → Konto → Anmeldedaten** , and see and sign out your other logged-in devices from a new "Aktive Sitzungen" list there — no more needing to delete and re-invite an account just to fix a username or password.
- **Forgotten a password? The server operator can reset it** with a new `pnpm reset-password` command — this app still has no email, so this replaces "there's no way to recover it at all.

### Changed

- **Changing your password or username now signs out every other device you were logged in on** , so a leaked login can be cut off just by changing your credentials.
- **The inactivity timeout for staying logged in is now 30 days (was 90), and logins now also expire after 90 days no matter how often you use the app.** Previously an actively-used login never expired at all — this bounds how long a leaked-but-actively-used login stays valid too.

## [1.2.0] - 2026-09-17

### Added

- **You'll now be signed out automatically after 90 days of inactivity.** Every action while using the app extends this window, so an account in regular use is never affected — this only bounds how long a lost or leaked login stays valid.

### Fixed

- **Live GPS run tracking didn't work at all in the installed Android app.** The app never requested location permission, so starting a run silently failed to record any route.
- **A workout logged fully offline could silently vanish from history instead of syncing.** If the offline queue happened to flush out of order, finishing a workout could be reported as synced before it actually existed on the server, permanently losing that session with no error shown.
- **A hung server connection (weak wifi, captive portal) could leave sync stuck "syncing" forever.** Requests now time out instead of waiting indefinitely.
- **Pausing a live-tracked run didn't actually pause GPS recording.** Location fixes kept being added to the route while paused, inflating distance against a duration that correctly excluded the paused time — an artificially fast pace that could get a real run rejected.
- **A sync item that could never succeed (a rejected or invalid entry) would silently retry forever on every reconnect.** After 3 days it now stops retrying and shows a sync-error indicator instead of quietly repeating in the background.
- **Creating an account with a wrong invite code wasn't meaningfully rate-limited** — guessing the code with a fresh username each time bypassed the existing protection. Registration is now throttled per device regardless of the username tried.
- **Creating or editing a planned route, or logging a manual/Health-Connect run, had no rate limit**, unlike every similar action elsewhere in the app.
- **The collapse arrow on section headers (Profil and elsewhere) wasn't vertically centered against the title text.**
- **Tapping "Starten" on a saved route's card opened a manual duration-entry form instead of starting live GPS tracking**, unlike the Workout tab, where starting a routine begins tracking immediately. It now starts live tracking directly; manual entry is still available from the route's own detail page or the standalone "Manuell" button.

### Changed

- **The "Update verfügbar" notification now takes you straight to the download button** instead of just telling you which page to visit — tapping it opens Profil with the "Konto & App" card already expanded and scrolled into view.
- **Profil page regrouped for clarity**: "Darstellung", "Konto" (Mitglieder, Konto & App, Konto löschen), and "Daten" (Health Connect, Daten-Export) are now their own sections instead of one combined "Daten & Server" group.

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
