# Build from pruned context:
# pnpm dlx turbo prune --scope=@accountable-books/api --docker --out-dir .pruned/api
ARG APP_DIR=.pruned/api

FROM node:20-alpine AS build
ARG APP_DIR=.pruned/api
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
# deps (cacheable)
COPY ${APP_DIR}/full/package.json ${APP_DIR}/pnpm-lock.yaml ${APP_DIR}/full/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
# source
COPY ${APP_DIR}/full/ ./
# Copy tsconfig.base.json which is needed for TypeScript builds
COPY tsconfig.base.json ./
# Install dependencies first
RUN pnpm install --offline
# Build dependencies first (contracts, utils, api-types)
RUN cd packages/contracts && pnpm run bundle-contracts
RUN cd packages/utils && pnpm run build
RUN cd packages/api-types && pnpm run codegen
RUN cd packages/api-types && pnpm run build
# Now build the API (which depends on the above)
RUN cd apps/api && pnpm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS="--enable-source-maps"
RUN apk add --no-cache tini curl
# Install pnpm for runtime commands (migrations, etc.)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
# nonroot
RUN addgroup -S nodejs -g 1001 && adduser -S api -G nodejs -u 1001

# copy prod deps and build outputs from pruned context
COPY --from=build --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=api:nodejs /app/packages/utils/dist ./packages/utils/dist
COPY --from=build --chown=api:nodejs /app/packages/api-types/dist ./packages/api-types/dist

# migrations + knexfile
ARG APP_DIR=.pruned/api
COPY --chown=api:nodejs ${APP_DIR}/full/apps/api/migrations ./apps/api/migrations
COPY --chown=api:nodejs ${APP_DIR}/full/apps/api/package.json ./apps/api/package.json

USER api
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5000/health || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","apps/api/dist/server.js"]
