# syntax=docker/dockerfile:1
# Build context is the repo root (pnpm monorepo). SQLite is node:sqlite (built-in), so there is
# no native module to compile — no python/make/g++ toolchain needed.

FROM node:26-bookworm-slim AS base
WORKDIR /repo
# Node 26 images no longer bundle corepack, so install pnpm directly, at the version pinned in
# package.json's `packageManager` (the single source for it).
COPY package.json ./
RUN npm install -g "pnpm@$(node -p 'require("./package.json").packageManager.split("@")[1]')"

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build
# Self-contained, prod-only deployment of the web app (bundles build/ + pruned node_modules).
# The ledger package is bundled into the server output (ssr.noExternal), and DB migrations are
# embedded as strings (Vite ?raw), so the runtime needs no source files or migration folder.
RUN pnpm --filter web deploy --prod --legacy /app

FROM node:26-bookworm-slim AS runner
ENV NODE_ENV=production
# Silence the node:sqlite experimental warning.
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
ENV DATABASE_PATH=/data/splitfree.db
WORKDIR /app
# Pruned prod node_modules + package.json from the deploy, plus the build output (deploy omits the
# gitignored build/ dir).
COPY --from=build /app /app
COPY --from=build /repo/apps/web/build /app/build
# Runtime wrapper around the build that sets allowedActionOrigins from WEBAUTHN_ORIGIN (see server.js).
COPY --from=build /repo/apps/web/server.js /app/server.js
RUN mkdir -p /data && chown -R node:node /data /app
# Runs unprivileged as the node user (uid 1000). NOTE: the /data BIND MOUNT must therefore be writable
# by uid 1000 on the host — `sudo chown -R 1000:1000 <DATA_DIR>` once per host.
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node_modules/.bin/react-router-serve", "./server.js"]
