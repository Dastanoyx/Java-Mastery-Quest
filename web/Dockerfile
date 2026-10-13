# Java Mastery Quest — web app (Next.js UI + HTTP API) and its one-shot "tools" image (migrate + seed).
#
# Build context MUST be the repository root, because the app needs ../content and ../db/migrations:
#   docker build -f web/Dockerfile --target runtime -t jmq-web .
#   docker build -f web/Dockerfile --target tools   -t jmq-web-tools .
# (compose.yaml does this for you.)
#
# The image mirrors the repository layout so the app's relative defaults keep working:
#   /app/web             application (WORKDIR, process cwd)
#   /app/content         curriculum content   (= ../content from /app/web; CONTENT_DIR is also set explicitly)
#   /app/db/migrations   SQL migrations       (= ../db/migrations; MIGRATIONS_DIR is also set explicitly)
#
# Stages: base → deps (all deps) → build (next build, output: "standalone")
#                → prod-deps (runtime deps only) → tools (migrate + seed job)
#                → runtime (default final stage: standalone server only)

# glibc (Debian) base: the Next.js/SWC native binaries and `pg` are built and tested against glibc; no musl
# compatibility shim needed. (docs/DECISIONS.md D-022)
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app/web

# ---------------------------------------------------------------------------------------------------------------
# All dependencies (dev deps are needed by `next build`: TypeScript, Tailwind/PostCSS).
FROM base AS deps
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------------------------------------------
# Production dependencies only (pg, yaml, zod, shiki, ...) for the migrate/seed tools image.
FROM base AS prod-deps
COPY web/package.json web/package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/web/node_modules ./node_modules
COPY web/ ./
# next.config.ts sets output: "standalone" → .next/standalone/server.js (+ traced node_modules).
# No database or runner is contacted at build time; every page is rendered on demand.
RUN npm run build

# ---------------------------------------------------------------------------------------------------------------
# One-shot job image: applies db/migrations then upserts /content into PostgreSQL. Used by the `migrate` service.
# seed.ts imports src/content/load.ts and src/server/highlight.ts, so src/ is shipped here (not in runtime).
FROM base AS tools
ENV NODE_ENV=production \
    CONTENT_DIR=/app/content \
    MIGRATIONS_DIR=/app/db/migrations
COPY --from=prod-deps /app/web/node_modules ./node_modules
COPY web/package.json web/tsconfig.json ./
COPY web/scripts ./scripts
COPY web/src ./src
COPY db/migrations /app/db/migrations
COPY content /app/content
USER node
CMD ["sh", "-c", "npm run migrate && npm run seed"]

# ---------------------------------------------------------------------------------------------------------------
# Runtime: standalone Next.js server, non-root, no build tooling, no dev dependencies.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CONTENT_DIR=/app/content
WORKDIR /app/web
# Application files stay root-owned (read-only for the `node` user); only .next/cache is writable.
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static
COPY --from=build /app/web/public ./public
# content/readiness.yaml is read at runtime (src/server/config.ts) via CONTENT_DIR.
COPY content /app/content
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
# Healthcheck lives in compose.yaml (node -e fetch …/api/health); Alpine ships no curl.
CMD ["node", "server.js"]
