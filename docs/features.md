# Features

A tour of what Liftr actually does today, organized by area. This is a description of shipped,
built functionality — for planned or in-progress work, see [`ROADMAP.md`](ROADMAP.md).

## Workout logging

The core loop: start a routine (or an empty freeform workout), log sets, finish. Every set input
defaults to your last-time weight/reps or the routine's target, so you're rarely typing a number
from scratch. Reps and weight are one- or two-tap entries via a stepper control, not a form.

- **Set kinds** beyond a plain working set — warm-up sets, drop sets, and other set-kind tagging
  so your history and rank calculations know which sets should count toward strength standards.
- **RPE and notes capture**, off the primary logging path — you can attach perceived-effort and a
  free-text note to a set, but neither is required to log it; "Satz speichern" never blocks on
  them.
- **Rest timer** with multiple states (idle/running/overdue), tuned to stay out of the way between
  sets.
- **A mobile exercise rail** for jumping between exercises mid-workout without leaving the active
  logging screen.
- **Warm-up ramp suggestions** computed from your working weight, so you don't have to plan your
  own warm-up sets by hand.
- **Plate-math calculator** that works out which plates go on the bar for a target weight, given
  your configured bar and available plate sizes.
- **A Finish Sequence** at the end of a workout — a short beat-by-beat reveal of what you earned
  this session: XP, streak/variety bonuses, rank-ups (with a distinct glowing badge ring for a
  genuine rank-up vs. a muted one for a plausibility-discounted session), and new PRs, with a
  direct link into the Records ledger.
- **A non-modal sync indicator** showing pending/offline state without blocking the screen.

## The rank system

Every lift gets a rank — nine tiers from Initiate to Apex, each split into divisions (more near
the bottom for frequent early rank-ups, down to a single division at Apex). Ranks are computed
from real strength standards where they exist (bodyweight-relative ratios for barbell classics)
and honest, clearly-marked estimates where they don't — an estimated number carries a small `≈`
so the app never claims more precision than it has.

- **Peak and current rank are separate.** Peak is a ratchet — once earned, it's never taken back,
  even if your bodyweight shifts or a standard gets recalibrated later. Current rank can soften
  after weeks away from an exercise (a 3-week grace period, then a gradual decay, always floored
  at the bottom of your peak's own tier — never below it), and climbs back with a session-by-
  session buffed recovery gain rather than resetting instantly.
- **Corroboration gate:** a new best result only becomes (or advances) your peak once it's been
  matched or beaten on a second, separate day — so one fluke set can't permanently define your
  rank for an exercise.
- **A plausibility gate** quietly discounts (never discards) a session's XP/rank contribution if
  it looks structurally implausible — an unrealistic sets-per-minute pace, an improbable same-
  session jump versus your stored peak, or a value beyond a sane ceiling. The exact thresholds
  aren't surfaced in the UI, only a general "this looked off" note when it fires.
- **Overall Rank** rolls your strongest, most-trusted lifts into one headline number, weighted
  toward real barbell numbers so a single obscure accessory exercise can't drag it around.
- Rank UI includes a **tier ladder** view (click-to-expand divisions), a **rank distribution
  donut**, a **progress chart**, and a **rank-up calendar** marking when and which rank-ups (and
  flagged/discounted sessions) happened.
- **Personal Records ledger** (`/records`) — a dedicated page tracking your best-ever numbers per
  exercise, linked from both the Ranks page and the Finish Sequence.

## XP, levels, and streaks

XP is deliberately "flavour on top" of rank, not a second competing progression system.

- **Levels** from a decelerating curve tuned so a single session can't skip several levels at
  once (day one pins to level 1; XP requirements grow non-linearly from there).
- **Consistency and variety bonuses** — one-time-per-session XP for showing up regularly and for
  training a muscle group you haven't hit recently, on top of per-set XP.
- **Streaks that forgive a missed day** rather than resetting to zero — the design goal is
  protecting motivation, not punishing a single skipped Tuesday.
- A discounted-XP path for plausibility-flagged sessions (see above), so implausible sessions
  still earn *something*, just progressively less, never zero.

## Recovery

The **Recovery Zone** looks at your recent training load and gives a plain green-light/rest-day
read for today — an explicit heuristic, not a claim to know your physiology, surfaced as an
`ErholungszoneCard` on the Overview page.

## Running

Runs are a first-class second discipline alongside lifting, with no third-party dependency\*:

- **GPX/FIT file import** from any watch or app you already own — explicitly chosen over a Strava
  API integration, which was evaluated and rejected to avoid a load-bearing dependency on a
  third party's rate limits, paywalls, or terms.
- **Health Connect import** on Android, checked opportunistically on app resume (no background
  service) via the `capacitor-health` plugin, to remove the manual GPX/FIT export ritual where
  Health Connect is available.
- **Run detail view** with a rendered route map and a **replay** of the run.
- **Manual run entry** as a fallback when there's no file/device data, with real inline
  validation errors instead of just disabling the save button.
- A combined **workout/runs switcher** so both disciplines live in one place in the UI.

\* With one opt-in exception: planned-route creation can call OpenRouteService for road-snapped
distance/elevation if you set `LIFTR_ORS_API_KEY` — unset by default, gracefully degrades to
straight-line distance, and self-hostable via `LIFTR_ORS_BASE_URL` to remove the third party
entirely. See [SECURITY.md](SECURITY.md#outbound-requests-openrouteservice) and
[ADR 0007](adr/0007-openrouteservice-external-routing-exception.md).

## Routines and planning

- **Routine builder wizard** with a guided path (pick exercises, arrange them, review) and a
  faster path for experienced users who don't need the guided flow.
- **Drag-to-reorder** exercises within a routine.
- **Equipment-substitution copy** that names the specific missing equipment rather than a generic
  "can't do this exercise" message, when your configured equipment doesn't cover a routine.
- **Mesocycle planning** — an optional multi-week (2-16 week) structured block you can attach to
  a routine from the not-started routine list, kept off the routine card itself so it doesn't add
  visual weight to the one-tap "start today's workout" path.
- **Custom exercises** — add your own exercise (with muscle tags) alongside the curated catalog,
  with correct name display and slug transliteration (including non-ASCII names).
- **Strecken planen** — Wegpunkte auf einer Karte setzen; die App berechnet automatisch Distanz und
  Höhenmeter (via OpenRouteService, optional) und merkt sich die Strecke zum späteren Start.

## Exercise catalog

A curated set of roughly 94 exercises (not an 800+-exercise dump) biased toward movements with
real or derivable strength standards, each with:

- A demo (photo where sourced, otherwise a graceful icon fallback) and an info panel covering
  target muscles, instructions, and stats.
- Muscle-group tagging feeding an interactive **muscle figure/diagram**.
- Full exercise history per exercise.
- An **attributions page** crediting every third-party photo source (free-exercise-db, wger)
  by license, since the catalog leans on openly-licensed images rather than original photography.

## Profile and settings

- **Onboarding** — a skippable, staged first-run flow covering welcome, experience level,
  training frequency, equipment (including bodyweight and dumbbell-handle weight), and available
  plates, so rank/warm-up/plate-math all have real numbers to work from from day one.
- **Bodyweight tracking** with a trend chart.
- **API token management** — view/reveal/copy the bearer token used to authenticate the client
  against the server (see `docs/adr/0002-single-bearer-token-auth.md`).
- **Data export** as CSV/ZIP, so your data is genuinely yours to take with you.
- **Light/dark theme**, defaulting from first-launch preference (no OS-preference auto-switching
  beyond that initial default).
- **Share cards** — a generated image summarizing a workout (muscle groups worked, exercises,
  tier badge) suitable for sharing outside the app.

## PWA / offline

- **Installable PWA** — "Add to Home Screen," no app store required, on top of a Vue 3 +
  Ionic/Capacitor client.
- **Offline-first logging.** Every mutation writes to IndexedDB first and queues in an outbox
  that flushes opportunistically (network reconnect, app focus/resume) — see
  `docs/adr/0003-offline-first-outbox-sync.md`. Logging a set never blocks on the network.
  Service-worker caching keeps the app shell, exercise catalog/images, and other API reads
  available offline too.
- **Self-hosted, single-user.** Runs on your own server, data lives in one SQLite file you can
  back up or move, no cloud account, no analytics, no third party in the loop\*\*.

\*\* With one opt-in exception: planned-route creation can call OpenRouteService for road-snapped
distance/elevation if you set `LIFTR_ORS_API_KEY` — unset by default, gracefully degrades to
straight-line distance, and self-hostable via `LIFTR_ORS_BASE_URL` to remove the third party
entirely. See [SECURITY.md](SECURITY.md#outbound-requests-openrouteservice) and
[ADR 0007](adr/0007-openrouteservice-external-routing-exception.md).

## Stack, for reference

Vue 3 + Ionic/Capacitor (client) · Fastify + SQLite/Drizzle (server) · TypeScript throughout in a
pnpm monorepo, with a shared, framework-free `@liftr/shared` package holding all the pure rank/
XP/recovery/plate math so client and server compute identical results.
