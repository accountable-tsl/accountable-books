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
COPY apps/web/package.json apps/web/
COPY packages/api-types/package.json packages/api-types/
COPY packages/utils/package.json packages/utils/

# Install ALL dependencies (needed for building)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- builder ----
FROM base AS builder
WORKDIR /app

# Accept build arguments for environment-specific builds
ARG NODE_ENV=production
ARG VITE_BACKEND_URL=http://localhost:5000
ARG VITE_APP_NAME="Accountable Books"
ARG VITE_ENVIRONMENT=production

# Set environment for build
ENV NODE_ENV=${NODE_ENV}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_ENVIRONMENT=${VITE_ENVIRONMENT}

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/api-types/node_modules ./packages/api-types/node_modules
COPY --from=deps /app/packages/utils/node_modules ./packages/utils/node_modules

# Copy source code
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages

# Build packages first, then the web app
RUN pnpm --filter @accountable-books/utils build || true && \
    pnpm --filter @accountable-books/api-types build || true && \
    pnpm --filter @accountable-books/web build

# ---- runtime ----
FROM nginx:alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache curl

# Copy custom nginx config
COPY apps/web/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy built application from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Create non-root user for nginx
RUN addgroup -g 1001 -S nginx-group && \
    adduser -S webapp -u 1001 -G nginx-group && \
    chown -R webapp:nginx-group /usr/share/nginx/html && \
    chown -R webapp:nginx-group /var/cache/nginx && \
    chown -R webapp:nginx-group /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R webapp:nginx-group /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

USER webapp
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]