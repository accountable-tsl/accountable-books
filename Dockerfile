FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY apps/api-books ./apps/api-books

WORKDIR /app/apps/api-books

CMD ["pnpm", "run", "dev:local"]
