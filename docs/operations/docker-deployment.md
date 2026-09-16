# Deploying Liftr with Docker

Runs the backend and the built web client (PWA) as one container — the server already serves the
client's built assets as a static origin in production (see `docs/reference/environment-variables.md`'s
`LIFTR_CLIENT_DIST`), so there's no separate web container. This guide assumes you already have
Docker and Docker Compose installed, and — per `docs/reference/environment-variables.md`'s note on
`LIFTR_ALLOWED_ORIGINS` — a reverse proxy of your own in front of this for TLS/domain routing; the
container itself only publishes plain HTTP.

## 1. Configure `.env`

```bash
cp .env.example .env
```

There's nothing required to set — every variable in `.env.example` is optional (see the comments
there for what each one does). On first launch you'll set the owner's password directly in the
app; there's no `LIFTR_TOKEN` or other secret to configure beforehand.

## 2. Start it

```bash
docker compose up --build -d
```

First run: watch `docker compose logs -f liftr` for a `bootstrap: no exercises found — running
full ingest...` line — this seeds the exercise catalog into the persistent volume and only ever
runs once (guarded on the catalog table being empty; every later start logs `bootstrap: catalog
already ingested, skipping.` instead and starts in under a second).

Once it's up, `curl http://localhost:3001/api/health` should return `{"ok":true}` (this endpoint
is public, no token needed), and the web UI is reachable at `http://localhost:3001/` (or through
your reverse proxy, wherever you've pointed it) — first visit prompts the owner to set a password.

## 3. Back up your data

Everything that matters — the SQLite database and the mirrored exercise-catalog images — lives in
the `liftr-data` named volume. Back it up with:

```bash
docker run --rm -v liftr-data:/data -v "$PWD":/backup alpine tar czf /backup/liftr-data.tgz /data
```

Restore onto a fresh volume the same way, in reverse (`tar xzf` into a mounted `/data`).

To run this automatically instead of remembering to do it by hand, add it to the host's own
crontab (`crontab -e`) — no extra container needed, this runs the same one-liner above on a
schedule:

```cron
# Daily at 03:00, keeping the last 14 days
0 3 * * * docker run --rm -v liftr-data:/data -v /home/you/liftr-backups:/backup alpine \
  sh -c 'tar czf /backup/liftr-data-$(date +\%Y-\%m-\%d).tgz /data && \
  find /backup -name "liftr-data-*.tgz" -mtime +14 -delete'
```

Periodically verify a backup actually restores — an untested backup is not a real backup — by
extracting one onto a scratch volume and checking the app boots against it.

## 4. Update

```bash
git pull
docker compose up -d --build
```

The bootstrap step is idempotent, so this is safe to run on every update — it won't re-seed or
re-fetch anything that's already there.

## Diagnosing problems

Two ways to see what's gone wrong without needing a live terminal on the box every time, neither
requiring a cloud account or a second service to run:

- **In the app itself**: the owner account's Profil page has a "Diagnose" panel showing the last
  100 unexpected server errors (`GET /api/diagnostics/errors`, owner-only).
- **On disk**: the same errors, one JSON line each, at `liftr-data/logs/errors.log` inside the
  volume — survives restarts, gets swept up for free by the `tar`-the-whole-volume backup above,
  and is `grep`-able (`docker run --rm -v liftr-data:/data alpine tail -50 /data/logs/errors.log`).
- For routine request logging (not just unexpected errors), `docker compose logs -f liftr` remains
  the way to watch what the server is doing live.

If this instance ever justifies self-hosting a Sentry-compatible service (e.g. GlitchTip) — worth
considering only if other projects on the same box would use it too, since running one more
service is a real cost — see the doc comment on
[`packages/server/src/lib/errorReporting.ts`](../../packages/server/src/lib/errorReporting.ts) for
the adapter seam that plugs it in without touching how errors are caught.

## If the container won't start

Check `docker compose logs liftr` first for the actual error — there's no required env var left
that would cause a deliberate startup refusal, so a failure here is a real misconfiguration
(a bad `LIFTR_DB_PATH`/volume mount, a port conflict, etc.), not a missing secret.
