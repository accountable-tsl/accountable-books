# Stage 1: Build
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:22
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "start"]