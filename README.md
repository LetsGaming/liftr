<img src="docs/assets/banner.svg" alt="Liftr — log a set, watch your rank move" width="100%" />

<p align="center">
  <img alt="self-hosted" src="https://img.shields.io/badge/self--hosted-yours%2C%20forever-5ba0ff?style=flat-square" />
  <img alt="offline-first" src="https://img.shields.io/badge/offline--first-PWA-1e5fd0?style=flat-square" />
  <img alt="no accounts" src="https://img.shields.io/badge/accounts-none%2C%20ever-8fb4ff?style=flat-square" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vue%203%20%2B%20Fastify%20%2B%20SQLite-1c2233?style=flat-square" />
</p>

# Liftr

Log a set. Watch your rank move. That's the whole loop — and it's designed to stay that fast forever.

Liftr is a self-hosted strength and running tracker built on a simple bet: most workout apps either have a progression system worth caring about but are miserable to actually use, or they're feature-complete and totally forgettable. Liftr tries to be the first thing without becoming the second — a private, ad-free, no-account app that turns "did I get stronger" into something you can *see*, one set at a time.

> *"The rank system is the retention mechanism, and everything else exists to support logging sets fast enough that using it doesn't feel like a chore."* — Liftr's one design rule, applied to every screen.

## The core loop

<img src="docs/assets/loop.svg" alt="Log a set, rank moves, recover and repeat" width="100%" />

## What it feels like to use

Open the app mid-workout, not before it. Start a routine and the set you're about to do is already on screen, last time's weight and reps sitting right next to the input, so you never have to think "what did I lift last week." Log it in one or two taps. That's the whole interaction the app is built around, and nothing gets added on top of it that would slow that down.

Every lift has a rank — Bronze through Diamond, with divisions inside each tier, based on real strength standards where they exist (bodyweight-relative lifts, barbell classics) and honest estimates where they don't. When an estimate is doing the guessing, the app marks it with a small `≈` instead of pretending to a precision it doesn't have.

Once you hit a rank, it's locked in as your peak. The app won't quietly take it back from you, even if your bodyweight shifts or an old standard turns out to have been miscalibrated. Your *current* rank is a separate number: it softens a little if you stop training a lift for a few weeks — three weeks off costs you a division, not the whole tier — and it snaps straight back the moment you log one real set. No re-climbing, no second grind, just a reason to come back.

Beyond the roughly 15 individual lift ranks, Liftr rolls your strongest, most-trusted lifts into a single Overall Rank, weighted toward your real barbell numbers so one obscure accessory exercise can't drag it around.

The Recovery Zone looks at your recent training load and tells you plainly whether today is a green light or a rest day — a heuristic, not a claim to know your physiology better than you do. Streaks work on the same logic: miss a day and the streak survives, because the point is protecting motivation, not punishing a Tuesday.

Runs count too. Import GPX or FIT files from any watch or app you already have — no Strava account, no third-party API required.

None of it leaves your hands, either. No cloud account, no analytics, no feed to perform for. Liftr runs on your own server, keeps its data in a single SQLite file you can back up or take with you, and works offline as an installable PWA — log a set with zero signal in a basement gym and it syncs once you're back online.

## The ladder

| Tier | What it means |
|---|---|
| 🥉 Bronze | You showed up and logged real numbers. Everyone starts here. |
| 🛡️ Silver | Consistent, solid lifting — the floor most lifters live on. |
| 🏅 Gold | Strong relative to standard, the tier that starts turning heads. |
| 💎 Platinum | Rare air — the standards here assume years of dedicated training. |
| 👑 Diamond | The top of the curve. Getting here on even one lift is a real feat. |

Five tiers, three divisions each, per exercise — plus one **Overall Rank** that rolls your strongest lifts into a single headline number.

## Why it's built this way

Progression only stays motivating if it's *honest*. A rank that goes up for reasons you don't understand, or that can vanish for reasons outside your control (a bodyweight fluctuation shouldn't cost you a rank you legitimately earned), stops feeling like a game and starts feeling like noise. Every mechanic in Liftr — the peak/current split, the trust markers on estimated numbers, the streak forgiveness — exists to keep the rank system feeling *fair*, because fair is what makes it worth checking again tomorrow.

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

See `liftr-audit.md` for the full architecture reference, environment variables, and development workflow if you're working on the codebase itself.

## Stack

Vue 3 + Ionic/Capacitor (installable PWA) · Fastify + SQLite/Drizzle · TypeScript throughout, in a pnpm monorepo.

---

<p align="center"><sub>One lifter's home gym, one server, no third parties in between. 🏋️</sub></p>
