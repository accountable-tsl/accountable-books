# ---- build ----
FROM node:24-alpine3.21 AS build
WORKDIR /app
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable

# Copy entire workspace for proper dependency resolution
COPY . .

# Install all dependencies (this handles workspace deps correctly)
RUN pnpm install --frozen-lockfile

# Build workspace dependencies first
RUN pnpm --filter @accountable-books/utils build || echo "No build script for utils"
RUN pnpm --filter @accountable-books/api-types build || echo "No build script for api-types"

# Build the API application
RUN pnpm --filter @accountable-books/api build

# ---- runtime ----
FROM node:24-alpine3.21 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies
RUN apk add --no-cache tini curl wget

# Install production dependencies only
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/api-types/package.json packages/api-types/package.json
COPY packages/utils/package.json packages/utils/package.json

ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
RUN corepack enable && \
    pnpm install --frozen-lockfile --prod --ignore-scripts && \
    pnpm store prune

# Copy built application
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
COPY --from=build /app/apps/api/scripts ./scripts
COPY --from=build /app/apps/api/knexfile.ts ./knexfile.ts

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S api -u 1001 -G nodejs && \
    chown -R api:nodejs /app

USER api
EXPOSE 5000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
