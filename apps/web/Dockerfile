# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
# Copy workspace dependencies that web uses
COPY packages/api-types/package.json packages/api-types/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm fetch

COPY . .
RUN pnpm -w install --recursive --offline --filter @accountable-books/web...
# Build workspace dependencies first
RUN pnpm --filter @accountable-books/utils build || echo "No build script for utils"
RUN pnpm --filter @accountable-books/api-types build || echo "No build script for api-types"
# Build the web app
RUN pnpm --filter @accountable-books/web build

# ---- serve ----
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# optional: custom nginx config (single-page app)
COPY apps/web/nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
