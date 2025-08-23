# Production-grade nginx reverse proxy
FROM nginx:1.27-alpine

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    curl \
    openssl \
    certbot \
    certbot-nginx && \
    rm -rf /var/cache/apk/*

# Create required directories (nginx user already exists in base image)
RUN mkdir -p /var/log/nginx /var/cache/nginx /etc/ssl/certs /etc/ssl/private && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx

# Copy nginx configuration
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/conf.d/ /etc/nginx/conf.d/

# Generate self-signed SSL certificate for staging (replace with real certs in production)
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/staging.key \
    -out /etc/ssl/certs/staging.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=staging.accountable.local"

# Set proper permissions
RUN chown -R nginx:nginx /etc/ssl/private && \
    chmod 600 /etc/ssl/private/staging.key && \
    chmod 644 /etc/ssl/certs/staging.crt

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Use nginx user
USER nginx

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]