<img src="docs/assets/banner.svg" alt="Liftr — log a set, watch your rank move" width="100%" />

<p align="center">
  <img alt="self-hosted" src="https://img.shields.io/badge/self--hosted-5ba0ff?style=flat-square" />
  <img alt="offline-first PWA" src="https://img.shields.io/badge/offline--first-PWA-1e5fd0?style=flat-square" />
  <img alt="no accounts (yet)" src="https://img.shields.io/badge/accounts-none-8fb4ff?style=flat-square" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vue%203%20%2B%20Fastify%20%2B%20SQLite-1c2233?style=flat-square" />
</p>

# Liftr

**Log a set. Watch your rank move.**

Nine tiers, real strength standards, and a number that goes up because you actually got stronger,
not because an app wanted you to open it today.

- <img src="docs/assets/icon-dumbbell.svg" width="16" height="16" align="absmiddle" alt="" /> **A rank for almost every lift**, not just squat/bench/deadlift
- <img src="docs/assets/icon-lock.svg" width="16" height="16" align="absmiddle" alt="" /> **Self-hosted, no account, no ads, no analytics** — your training data stays yours
- <img src="docs/assets/icon-offline.svg" width="16" height="16" align="absmiddle" alt="" /> **Installable PWA that works offline.** Log a set in a basement gym with zero signal, it syncs later
- <img src="docs/assets/icon-run.svg" width="16" height="16" align="absmiddle" alt="" /> **Runs count too** — import GPX/FIT from any watch, no Strava required
- <img src="docs/assets/icon-database.svg" width="16" height="16" align="absmiddle" alt="" /> **One SQLite file.** Back it up, move it, own it

Most workout apps either have a progression system worth caring about and are miserable to use, or
they're polished and forgettable. Liftr tries to be the first one without the second.

<p align="center"><sub>Free. Open source. Runs on hardware you already own.</sub></p>

## The core loop

<img src="docs/assets/loop.svg" alt="Log a set, rank moves, recover and repeat" width="100%" />

## What it feels like to use

Open the app mid-workout, not before it. Start a routine and the set you're about to do is already
on screen, last time's weight and reps right next to the input, so you never have to think "what
did I lift last week." Log it in one or two taps.

Every lift has a rank, based on real strength standards where they exist and honest estimates
where they don't (marked with a small `≈`, no pretending). Hit a rank once and it's locked in as
your peak for good, even if your bodyweight shifts. Your current rank can soften if you stop
training a lift for a while, then snaps right back the moment you log one real set again. No
re-climbing, just a reason to come back.

The Recovery Zone reads your recent training load and tells you plainly if today's a green light
or a rest day. Streaks survive a missed day, because the point is protecting motivation, not
punishing a Tuesday.

## The ladder

| Tier | What it means |
|---|---|
| Initiate | You showed up and logged real numbers. Everyone starts here. |
| Apprentice | Building a real base. |
| Trainee | Training with real weight, momentum building. |
| Athlete | Consistent, solid lifting — the floor most lifters live on. |
| Lifter | Visibly, genuinely strong. |
| Advanced | Strong relative to standard, the tier that starts turning heads. |
| Elite | Rare air. |
| Expert | The standards here assume years of dedicated training. |
| Apex | The top of the curve. One real milestone, not another grind — getting here on even one lift is a genuine feat. |

Nine tiers per exercise, each split into divisions — more of them near the bottom (Initiate has
five) so early rank-ups come often, tapering to a single division at Apex, plus one **Overall
Rank** that rolls your strongest lifts into a single headline number.

## Why it's built this way

Progression only stays motivating if it's honest. A rank that goes up for reasons you don't
understand, or vanishes for reasons outside your control, stops feeling like a game and starts
feeling like noise. Every design call in Liftr (the peak/current split, the trust markers on
estimated numbers, the streak forgiveness) exists to keep the numbers fair.

## Getting it running

Liftr is self-hosted — you run it on your own machine or home server, and it stays entirely on your network unless you choose to expose it.

```bash
pnpm install
pnpm dev
```

That starts the Fastify API and the Vue client together.

<details>
<summary><b>Deploying for real (production, behind your own reverse proxy)</b></summary>
<br>

Set a `LIFTR_TOKEN` (the single bearer token that gates access — there are no user accounts to manage) and point `LIFTR_DB_PATH` at where you want the SQLite file to live, then:

```bash
pnpm build
```

Install it to your phone's home screen from the browser's "Add to Home Screen" prompt — no app store required.

</details>

Tests live under `tests/`, mirroring the package layout (`tests/server/services/foo.test.ts` for
`packages/server/src/services/foo.ts`, and so on) — run them with `pnpm test`; see
`tests/README.md` for the conventions if you're adding to them.

See [`docs/`](docs/) for the full documentation suite — architecture, the HTTP API reference,
environment variables, and guides for local development, adding an exercise, and releasing —
if you're working on the codebase itself. (`audit/finished/liftr-audit.md` is the original,
point-in-time architecture audit `docs/ARCHITECTURE.md` builds on — still worth a read for the
full "why", but `docs/` is the maintained reference going forward.)

## Stack

Vue 3 + Ionic/Capacitor (installable PWA) · Fastify + SQLite/Drizzle · TypeScript throughout, in a pnpm monorepo.

---

<p align="center"><sub>One lifter's home gym, one server, no third parties in between.*</sub> <img src="docs/assets/icon-dumbbell.svg" width="14" height="14" align="absmiddle" alt="" /></p>

<sub>\* With one opt-in exception: planned-route creation can call OpenRouteService for road-snapped
distance/elevation if you set `LIFTR_ORS_API_KEY` — unset by default, gracefully degrades to
straight-line distance, and self-hostable via `LIFTR_ORS_BASE_URL` to remove the third party
entirely. See [docs/SECURITY.md](docs/SECURITY.md#outbound-requests-openrouteservice) and
[ADR 0007](docs/adr/0007-openrouteservice-external-routing-exception.md).</sub>
