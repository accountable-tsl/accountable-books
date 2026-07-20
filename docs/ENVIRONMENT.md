# Environment Variables Guide

This guide explains all environment variables used in Accountable Books and how to configure them for different environments.

## Quick Start

For local development, generate service `.env.local` files from the env schemas:

```bash
make setup    # Runs pnpm generate-env (among other setup steps)
# or
make install  # Deps + generate-env only
# or
pnpm run generate-env
```

## Environment Files

- **API**: `apps/api/.env.local` (generated from `apps/api/config/env-schema.ts`)
- **Web**: `apps/web/.env.local` (generated from `apps/web/config/env-schema.ts`)

## API Environment Variables

### ✅ Required for Basic Development

These variables have working defaults but you may want to customize them:

| Variable        | Default                  | Description         |
| --------------- | ------------------------ | ------------------- |
| `NODE_ENV`      | `local`                  | Runtime environment |
| `PORT`          | `5000`                   | API server port     |
| `BACKEND_URL`   | `http://api.lvh.me:5000` | Full backend URL    |
| `FRONTEND_URL`  | `http://app.lvh.me:5173` | Full frontend URL   |
| `COOKIE_DOMAIN` | `.lvh.me`                | Cookie domain       |

### 🐳 Database Configuration

These match the Docker Compose setup and work out-of-the-box:

| Variable            | Default                                                       | Description                            |
| ------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `DB_HOST`           | `localhost`                                                   | Database host                          |
| `DB_PORT`           | `5433`                                                        | Database port (Docker exposes on 5433) |
| `POSTGRES_DB`       | `accountable_books`                                           | Database name                          |
| `POSTGRES_USER`     | `user`                                                        | Database user                          |
| `POSTGRES_PASSWORD` | `password`                                                    | Database password                      |
| `DATABASE_URL`      | `postgresql://user:password@localhost:5433/accountable_books` | Full connection string                 |
| `REDIS_URL`         | `redis://localhost:6380`                                      | Redis connection string                |

### 🔐 Security Configuration

These have development defaults but **must be changed for production**:

| Variable             | Default               | Production Requirement                       |
| -------------------- | --------------------- | -------------------------------------------- |
| `CSRF_SECRET`        | `dev-csrf-secret-...` | ⚠️ Generate secure random string             |
| `JWT_ACCESS_SECRET`  | `dev-jwt-access-...`  | ⚠️ Generate secure random string (32+ chars) |
| `JWT_REFRESH_SECRET` | `dev-jwt-refresh-...` | ⚠️ Generate secure random string (32+ chars) |

### 📧 Optional: Email Configuration

Leave empty for development (emails will be logged to console):

| Variable            | Default                      | Description                     |
| ------------------- | ---------------------------- | ------------------------------- |
| `EMAIL_PROVIDER`    | `dev`                        | Email service provider          |
| `POSTMARK_API_KEY`  | _(empty)_                    | Postmark API key for production |
| `EMAIL_FROM`        | `support@getaccountable.com` | From email address              |
| `ETHEREAL_EMAIL`    | _(empty)_                    | Ethereal test email username    |
| `ETHEREAL_PASSWORD` | _(empty)_                    | Ethereal test email password    |

### 📱 Optional: Slack Integration

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `SLACK_SIGNING_SECRET` | Slack app signing secret        |
| `SLACK_BOT_TOKEN`      | Slack bot token                 |
| `SLACK_CHANNEL`        | Slack channel for notifications |

### 📊 Optional: Analytics & Monitoring

| Variable          | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `POSTHOG_API_KEY` | PostHog server-side analytics (see `POSTHOG_ENABLED`, `TELEMETRY_ENABLED`) |
| `SENTRY_DSN`      | Sentry error monitoring DSN                                                |

### 🛠️ Development Features

| Variable             | Default  | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `SEED_DB`            | `false`  | Whether to seed database with demo data |
| `BULLBOARD_USER`     | `admin`  | Bull Board admin username               |
| `BULLBOARD_PASSWORD` | `secret` | Bull Board admin password               |

## Web App Environment Variables

### ✅ Required

| Variable           | Default                  | Description       |
| ------------------ | ------------------------ | ----------------- |
| `VITE_BACKEND_URL` | `http://api.lvh.me:5000` | API backend URL   |
| `VITE_BASE_DOMAIN` | `lvh.me`                 | Local base domain |

### 🔌 Optional: Third-party Integrations

| Variable               | Description                             |
| ---------------------- | --------------------------------------- |
| `VITE_MONO_PUBLIC_KEY` | Mono (Nigerian bank service) public key |

## Production Configuration

For production environments:

1. **Generate secure secrets**:

   ```bash
   # Generate secure random strings for JWT secrets
   openssl rand -base64 32
   ```

2. **Use environment-specific files**:
   - `.env.production` for production
   - `.env.staging` for staging

3. **Required production variables**:
   - Secure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
   - Valid `POSTMARK_API_KEY` for email
   - Production `DATABASE_URL` and `REDIS_URL`
   - `SENTRY_DSN` for error monitoring

## Common Issues

### Database Connection Issues

**Problem**: `ECONNREFUSED` errors when starting the API

**Solution**: Ensure Docker services are running:

```bash
make db-up
# Wait a few seconds for services to start
make db-ready
```

### Port Conflicts

**Problem**: Port 5433 or 6380 already in use

**Solution**: Check what's using the ports:

```bash
lsof -i :5433
lsof -i :6380
```

Stop conflicting services or change ports in `docker-compose.dev.yml`.

### JWT Token Issues

**Problem**: Authentication errors in development

**Solution**: Ensure JWT secrets are long enough (minimum 32 characters) and consistent between restarts.
