import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = await buildApp();

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(() => app.log.info(`liftr server listening on :${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Docker sends SIGTERM on `docker compose down`/restart/`--build` redeploys — without this, that
// kills the process mid-request instead of draining it first. `close()` waits for in-flight
// requests to finish before exiting (better-sqlite3 is synchronous, so there's no separate async
// DB handle to close).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error(err);
        process.exit(1);
      },
    );
  });
}
