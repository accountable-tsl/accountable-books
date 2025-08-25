# Build from pruned context:
# pnpm dlx turbo prune --scope=@accountable-books/web --docker --out-dir .pruned/web
ARG APP_DIR=.pruned/web

FROM node:20-alpine AS build
ARG APP_DIR=.pruned/web
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
# non-secret build-time vars
ARG VITE_BACKEND_URL VITE_APP_NAME VITE_ENVIRONMENT VITE_API_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL VITE_APP_NAME=$VITE_APP_NAME VITE_ENVIRONMENT=$VITE_ENVIRONMENT VITE_API_URL=$VITE_API_URL
# Now build the web app (which depends on the above)
RUN cd apps/web && pnpm run build

FROM nginx:1.27-alpine AS runtime
# copy nginx conf from repo
COPY apps/web/infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
# copy built SPA
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost/ || exit 1