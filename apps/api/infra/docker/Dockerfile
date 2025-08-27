# ---- base ----
  FROM node:24-alpine AS base
  WORKDIR /app
  ENV PNPM_HOME="/pnpm" 
  ENV PATH="$PNPM_HOME:$PATH"
  RUN corepack enable
  
  
  # ---- dependencies ----
  FROM base AS deps
  # Copy workspace config and lockfile
  COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
  
  # Copy all package.json files to maintain workspace structure
  COPY apps/api/package.json apps/api/
  COPY packages/api-types/package.json packages/api-types/
  COPY packages/contracts/package.json packages/contracts/
  COPY packages/utils/package.json packages/utils/
  
  
  # Install ALL dependencies (including devDependencies for building)
  RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
  
  # ---- builder ----
  FROM base AS builder
  WORKDIR /app
  
  # Copy installed dependencies
  COPY --from=deps /app/node_modules ./node_modules
  
  # Copy source code
  COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
  COPY apps/api ./apps/api
  COPY packages ./packages
  
  # Build packages and application
  RUN pnpm --filter @accountable-books/contracts build || true && \
      pnpm --filter @accountable-books/utils build || true && \
      pnpm --filter @accountable-books/api-types build || true && \
      pnpm --filter @accountable-books/api build
  
  # ---- production dependencies ----
  FROM base AS prod-deps
  # Copy workspace config
  COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
  COPY apps/api/package.json apps/api/
  COPY packages/api-types/package.json packages/api-types/
  COPY packages/contracts/package.json packages/contracts/
  COPY packages/utils/package.json packages/utils/
  
  # Install production dependencies only
  RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts
  
  # ---- runtime ----
  FROM node:24-alpine AS runtime
  WORKDIR /app
  
  # Enable pnpm for runtime
  ENV PNPM_HOME="/pnpm"
  ENV PATH="$PNPM_HOME:$PATH"
  RUN corepack enable
  
  # Install runtime dependencies
  RUN apk add --no-cache tini curl && \
      addgroup -g 1001 -S nodejs && \
      adduser -S api -u 1001 -G nodejs
  
  # Copy production dependencies
  COPY --from=prod-deps --chown=api:nodejs /app/node_modules ./node_modules
  
  # Copy built application and necessary files
  COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
  COPY --from=builder --chown=api:nodejs /app/packages/utils/dist ./packages/utils/dist
  COPY --from=builder --chown=api:nodejs /app/packages/api-types/dist ./packages/api-types/dist
  
  # Copy migration files and scripts
  COPY --chown=api:nodejs apps/api/migrations ./apps/api/migrations
  COPY --chown=api:nodejs apps/api/scripts ./apps/api/scripts
  COPY --chown=api:nodejs apps/api/knexfile.ts ./apps/api/knexfile.ts
  COPY --chown=api:nodejs apps/api/package.json ./apps/api/package.json
  
  # Set environment
  ENV NODE_ENV=production
  ENV NODE_OPTIONS="--enable-source-maps"
  
  USER api
  EXPOSE 5000
  
  # Health check
  HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:5000/health || exit 1
  
  ENTRYPOINT ["/sbin/tini", "--"]
  CMD ["node", "apps/api/dist/server.js"]
  