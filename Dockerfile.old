# Stage 1: Build the frontend
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Use `npm ci` for reproducible installs
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Build the production assets using Vite
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.25-alpine

# Remove the default Nginx configuration file
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY --chown=nginx:nginx nginx/nginx.conf /etc/nginx/conf.d/app.conf

# Copy built assets from the build stage
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Set non-root user for security
USER nginx

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]