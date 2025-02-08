# Stage 1: Build
FROM node:22-alpine AS build

# Install build dependencies for native module compilation (if needed)
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files and Prisma schema (to leverage Docker layer caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (using npm ci for reproducible installs)
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# (Optional) Compile TypeScript if needed
RUN npm run build

# Stage 2: Run
FROM node:22-alpine

# Create a non-root user for enhanced security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy node_modules and application code with proper ownership
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app .

# Switch to non-root user
USER appuser

# Healthcheck to ensure the app is running
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Run Prisma migrations and start the application
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]