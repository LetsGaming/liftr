# syntax=docker/dockerfile:1

FROM node:25-slim AS deps
RUN corepack enable
# better-sqlite3's `install` script compiles a native addon via node-gyp, which needs Python + a
# C++ toolchain — node:22-slim has neither by default, so `pnpm install` below would otherwise
# fail with "Could not find any Python installation to use".
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/client/package.json packages/client/package.json
# pnpm-lock.yaml's patchedDependencies (capacitor-health, see docs/ARCHITECTURE.md) needs the
# actual patch file present before install applies it — without this, `pnpm install` fails with
# "Failed to read patch file /app/patches/capacitor-health.patch: No such file or directory".
COPY patches patches
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @liftr/shared build \
 && pnpm --filter @liftr/db build \
 && pnpm --filter @liftr/server build \
 && pnpm --filter @liftr/ingest build \
 && pnpm --filter @liftr/client build

FROM node:25-slim AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/client/package.json packages/client/package.json
# Same node-gyp/Python need as the `deps` stage above, but this one *is* the shipped image, so
# the toolchain is removed again in this same layer right after use — better-sqlite3's compiled
# .node binary doesn't need it at runtime, only the compile step does.
COPY patches patches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && pnpm install --prod --frozen-lockfile \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/drizzle packages/db/drizzle
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/ingest/dist packages/ingest/dist
COPY --from=build /app/packages/client/dist packages/client/dist
COPY --from=build /app/tools/catalog/curated.yaml tools/catalog/curated.yaml
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh

ENV LIFTR_DB_PATH=/data/liftr.db \
    LIFTR_IMAGES_DIR=/data/images \
    LIFTR_CLIENT_DIST=/app/packages/client/dist \
    PORT=3001

# node:*-slim images ship a non-root `node` user (uid/gid 1000) — run as that instead of root.
# /data is a named volume mounted at runtime, so it inherits root ownership from Docker unless
# chown'd here up front.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker/entrypoint.sh"]
