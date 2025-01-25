# Stage 1: Build
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --platform=linux --arch=arm64
COPY . .
RUN npx prisma generate

# Stage 2: Run
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
EXPOSE 5000
CMD ["npm", "start", "--", "--host", "0.0.0.0"]
