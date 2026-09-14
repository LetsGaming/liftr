#!/bin/sh
set -e

echo "[entrypoint] running catalog bootstrap (no-op if already seeded)..."
node packages/ingest/dist/bootstrap.js

echo "[entrypoint] starting server..."
exec node packages/server/dist/index.js
