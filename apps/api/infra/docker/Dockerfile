# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm" 
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Accept pruned context produced by: turbo prune --scope=@accountable-books/api --docker --out-dir .pruned/api
ARG APP_DIR=.pruned/api

# ---- dependencies ----
FROM base AS deps
COPY ${APP_DIR}/package.json ${APP_DIR}/pnpm-lock.yaml ${APP_DIR}/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch


# ---- builder ----
FROM base AS builder
COPY --from=deps /app /app
COPY ${APP_DIR}/ ./
# Build workspace (utils, api-types, then api). Adjust if your build scripts already cascade.
RUN pnpm install --offline
RUN pnpm -w --filter @accountable-books/utils build || true
RUN pnpm -w --filter @accountable-books/api-types build || true
RUN pnpm -w --filter @accountable-books/api build

# ---- prod deps ----
FROM base AS prod-deps
COPY ${APP_DIR}/package.json ${APP_DIR}/pnpm-lock.yaml ${APP_DIR}/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS="--enable-source-maps"
RUN apk add --no-cache tini curl
# nonroot
RUN addgroup -S nodejs -g 1001 && adduser -S api -G nodejs -u 1001

# copy prod deps and build outputs from pruned context
COPY --from=prod-deps --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build     --chown=api:nodejs /app/packages/utils/dist ./packages/utils/dist
COPY --from=build     --chown=api:nodejs /app/packages/api-types/dist ./packages/api-types/dist

# migrations + knexfile
COPY --chown=api:nodejs ${APP_DIR}/apps/api/migrations ./apps/api/migrations
COPY --chown=api:nodejs ${APP_DIR}/apps/api/package.json ./apps/api/package.json

USER api
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5000/health || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","apps/api/dist/server.js"]
