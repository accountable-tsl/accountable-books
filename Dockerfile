# Stage 1: Build
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --platform=linux --arch=arm64
COPY . .
RUN npm run build -- --mode production

# Stage 2: Run
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]