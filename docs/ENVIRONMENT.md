# Environment Variables Guide

This guide explains all environment variables used in Accountable Books and how to configure them for different environments.

## Quick Start

For local development, the default `.env.example` files work out-of-the-box:

```bash
make setup  # Automatically copies .env.example files and sets up environment
```

## Environment Files

- **API**: `apps/api/.env.local` (copied from `apps/api/.env.example`)
- **Web**: `apps/web/.env.local` (copied from `apps/web/.env.example`)

## API Environment Variables

### ✅ Required for Basic Development

These variables have working defaults but you may want to customize them:

| Variable       | Default                 | Description         |
| -------------- | ----------------------- | ------------------- |
| `NODE_ENV`     | `local`                 | Runtime environment |
| `PORT`         | `5000`                  | API server port     |
| `BACKEND_URL`  | `http://localhost:5000` | Full backend URL    |
| `FRONTEND_URL` | `http://localhost:5173` | Full frontend URL   |

### 🐳 Database Configuration

These match the Docker Compose setup and work out-of-the-box:

| Variable       | Default                                                     | Description                            |
| -------------- | ----------------------------------------------------------- | -------------------------------------- |
| `DB_HOST`      | `localhost`                                                 | Database host                          |
| `DB_PORT`      | `5433`                                                      | Database port (Docker exposes on 5433) |
| `DB_NAME`      | `accountable_books`                                         | Database name                          |
| `DB_USER`      | `user`                                                      | Database user                          |
| `DB_PASSWORD`  | `password`                                                  | Database password                      |
| `DATABASE_URL` | `postgres://user:password@localhost:5433/accountable_books` | Full connection string                 |
| `REDIS_URL`    | `redis://localhost:6380`                                    | Redis connection string                |

### 🔐 Security Configuration

These have development defaults but **must be changed for production**:

| Variable             | Default               | Production Requirement                       |
| -------------------- | --------------------- | -------------------------------------------- |
| `CSRF_SECRET`        | `dev-csrf-secret-...` | ⚠️ Generate secure random string             |
| `JWT_ACCESS_SECRET`  | `dev-jwt-access-...`  | ⚠️ Generate secure random string (32+ chars) |
| `JWT_REFRESH_SECRET` | `dev-jwt-refresh-...` | ⚠️ Generate secure random string (32+ chars) |

### 📧 Optional: Email Configuration

Leave empty for development (emails will be logged to console):

| Variable            | Default         | Description                     |
| ------------------- | --------------- | ------------------------------- |
| `EMAIL_PROVIDER`    | `postmark`      | Email service provider          |
| `POSTMARK_API_KEY`  | _(empty)_       | Postmark API key for production |
| `EMAIL_FROM`        | `mail@mail.com` | From email address              |
| `ETHEREAL_EMAIL`    | _(empty)_       | Ethereal test email username    |
| `ETHEREAL_PASSWORD` | _(empty)_       | Ethereal test email password    |

### 📱 Optional: Slack Integration

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `SLACK_SIGNING_SECRET` | Slack app signing secret        |
| `SLACK_BOT_TOKEN`      | Slack bot token                 |
| `SLACK_CHANNEL`        | Slack channel for notifications |

### 📊 Optional: Analytics & Monitoring

| Variable         | Description                 |
| ---------------- | --------------------------- |
| `MIXPANEL_TOKEN` | Mixpanel analytics token    |
| `SENTRY_DSN`     | Sentry error monitoring DSN |

### 🛠️ Development Features

| Variable             | Default  | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `SEED_DB`            | `false`  | Whether to seed database with demo data |
| `BULLBOARD_USER`     | `admin`  | Bull Board admin username               |
| `BULLBOARD_PASSWORD` | `secret` | Bull Board admin password               |

## Web App Environment Variables

### ✅ Required

| Variable           | Default                 | Description     |
| ------------------ | ----------------------- | --------------- |
| `VITE_BACKEND_URL` | `http://localhost:5000` | API backend URL |

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
make db-migrate
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
