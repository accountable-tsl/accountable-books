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
COPY apps/web/package.json apps/web/
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
COPY apps/web ./apps/web
COPY packages ./packages

# Build args for environment variables
ARG VITE_BACKEND_URL
ARG VITE_APP_NAME
ARG VITE_ENVIRONMENT
ARG VITE_API_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL 
ENV VITE_APP_NAME=$VITE_APP_NAME 
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT 
ENV VITE_API_URL=$VITE_API_URL

# Build packages and application
RUN pnpm --filter @accountable-books/utils build || true && \
    pnpm --filter @accountable-books/web build

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime
# Copy nginx conf from repo
COPY apps/web/infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
# Copy built SPA
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost/ || exit 1