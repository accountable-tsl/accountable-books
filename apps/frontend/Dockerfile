FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY apps/web-books ./apps/web-books

WORKDIR /app/apps/web-books

CMD ["pnpm", "run", "dev"]
