# Fly.io Deployment Guide

This guide covers deploying the Accountable Books API to Fly.io for staging and production environments.

## 🚀 Quick Start

### Prerequisites

1. **Install Fly CLI**:

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly.io**:

   ```bash
   fly auth login
   ```

3. **Ensure environment files exist**:
   ```bash
   cd apps/api && pnpm run generate-env && cd -
   ```

### Staging Deployment

```bash
# Deploy to staging
./scripts/deploy-fly-staging.sh deploy

# Or manually:
fly deploy --config fly.staging.toml

# Check status
./scripts/deploy-fly-staging.sh status

# View logs
./scripts/deploy-fly-staging.sh logs
```

## 📋 Configuration Files

### `fly.staging.toml` (Staging)

- **App Name**: `accountable-books-api-staging`
- **Region**: `iad` (Washington DC)
- **Port**: `8080` (Fly.io standard)
- **Resources**: 1 CPU, 1GB RAM
- **Health Check**: `/health/ready` (readiness) and `/health/live` (liveness)

### `fly.production.toml` (Production)

- **App Name**: `accountable-books-api`
- **Region**: `iad` (Washington DC)
- **Port**: `8080` (Fly.io standard)
- **Resources**: 2 CPU, 2GB RAM
- **Min Instances**: 2 (high availability)

## 🔐 Environment Variables & Secrets

### Environment Variables (Non-sensitive)

These are set from `apps/api/.env.staging`:

- `NODE_ENV`
- `PORT`
- `BASE_DOMAIN`
- `BACKEND_URL`
- `FRONTEND_URL`
- `COOKIE_DOMAIN`
- `DB_HOST`
- `DB_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `SLACK_CHANNEL`
- `SENTRY_RELEASE`
- `PLATFORM_COMPANY_*`
- `TEST_ADMIN_*`
- `SEED_DB`
- `BULLBOARD_USER`

### Secrets (Sensitive)

These are set from `apps/api/.env.secrets.staging`:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `REDIS_URL`
- `REDIS_PASSWORD`
- `CSRF_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `POSTMARK_API_KEY`
- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `POSTHOG_API_KEY` (with `POSTHOG_ENABLED`, `TELEMETRY_ENABLED`)
- `SENTRY_DSN`
- `R2_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `BULLBOARD_PASSWORD`
- `MONO_SECRET_KEY`

## 🏗️ Architecture

### Staging Environment

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Fly.io API    │    │   Neon DB       │    │   Redis (TBD)   │
│   (Staging)     │◄──►│   (Staging)     │    │   (Staging)     │
│   Port: 8080    │    │   External      │    │   External      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Production Environment

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Fly.io API    │    │   Neon DB       │    │   Redis (TBD)   │
│   (Production)  │◄──►│   (Production)  │    │   (Production)  │
│   Port: 8080    │    │   External      │    │   External      │
│   Min: 2 inst   │    │   High Avail    │    │   High Avail    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Deployment Scripts

### Available Commands

```bash
# Full deployment
./scripts/deploy-fly-staging.sh deploy

# Individual operations
./scripts/deploy-fly-staging.sh create    # Create Fly app
./scripts/deploy-fly-staging.sh secrets   # Set secrets only
./scripts/deploy-fly-staging.sh env       # Set env vars only
./scripts/deploy-fly-staging.sh status    # Check status
./scripts/deploy-fly-staging.sh logs      # View logs
./scripts/deploy-fly-staging.sh scale N   # Scale to N instances
./scripts/deploy-fly-staging.sh destroy   # Destroy app
```

### Manual Fly CLI Commands

```bash
# Create app
fly apps create accountable-books-api-staging --org accountable-books

# Set secrets
fly secrets set JWT_ACCESS_SECRET=your-secret --app accountable-books-api-staging

# Deploy
fly deploy --config fly.staging.toml

# Check status
fly status --app accountable-books-api-staging

# View logs
fly logs --app accountable-books-api-staging

# Scale
fly scale count 2 --app accountable-books-api-staging
```

## 🌐 URLs

### Staging

- **API**: https://accountable-books-api-staging.fly.dev
- **Health Check**: https://accountable-books-api-staging.fly.dev/health/ready
- **Bull Board**: https://accountable-books-api-staging.fly.dev/admin/queues

### Production (Future)

- **API**: https://accountable-books-api.fly.dev
- **Health Check**: https://accountable-books-api.fly.dev/health/ready
- **Bull Board**: https://accountable-books-api.fly.dev/admin/queues

## 🔍 Monitoring & Debugging

### Health Checks

The API exposes two health endpoints:

- `GET /health/live` — always returns `{ "status": "alive" }` if the process is running; used for Fly liveness probes
- `GET /health/ready` — checks Postgres and Redis connectivity; returns `{ "status": "ready", "checks": { "postgres": "ok", "redis": "ok" } }` or 503 if a dependency is down; used by the Fly load balancer

```json
{ "status": "ready", "checks": { "postgres": "ok", "redis": "ok" } }
```

### Logs

```bash
# View recent logs
fly logs --app accountable-books-api-staging

# Follow logs in real-time
fly logs --app accountable-books-api-staging --follow

# Filter logs
fly logs --app accountable-books-api-staging | grep ERROR
```

### Metrics

- **Port**: 9091
- **Path**: `/metrics`
- **Format**: Prometheus metrics

## 🔄 Database Migrations

### Automatic Migrations

Migrations run automatically on startup via the `env-loader.ts` file.

### Manual Migrations

```bash
# Connect to the deployed app
fly ssh console --app accountable-books-api-staging

# Run migrations manually
cd /app/apps/api
npx knex migrate:latest --env staging
```

## 🛡️ Security

### HTTPS

- **Automatic**: Fly.io provides automatic HTTPS
- **Force HTTPS**: Enabled in `fly.toml`
- **HSTS**: Automatic security headers

### Secrets Management

- **Fly Secrets**: Sensitive data stored securely
- **No Build-time Secrets**: Secrets not baked into images
- **Runtime Injection**: Secrets injected at runtime

### Network Security

- **Internal Port**: 8080 (not exposed externally)
- **External Access**: Via Fly.io proxy
- **Health Checks**: Regular endpoint monitoring

## 📊 Resource Management

### Staging Resources

- **CPU**: 1 shared CPU
- **Memory**: 1GB RAM
- **Auto-stop**: Enabled (cost optimization)
- **Min Instances**: 1

### Production Resources

- **CPU**: 2 shared CPUs
- **Memory**: 2GB RAM
- **Auto-stop**: Disabled (high availability)
- **Min Instances**: 2

## 🔧 Troubleshooting

### Common Issues

#### 1. Build Failures

```bash
# Check build logs
fly logs --app accountable-books-api-staging

# Verify Dockerfile
docker build -f apps/api/infra/docker/Dockerfile.staging .
```

#### 2. Environment Variables

```bash
# Check current env vars
fly config show --app accountable-books-api-staging

# Set missing variables
fly secrets set VARIABLE_NAME=value --app accountable-books-api-staging
```

#### 3. Database Connection

```bash
# Check database connectivity
fly ssh console --app accountable-books-api-staging
curl -s http://localhost:8080/health/ready

# Verify DATABASE_URL secret
fly secrets list --app accountable-books-api-staging
```

#### 4. Memory Issues

```bash
# Check resource usage
fly status --app accountable-books-api-staging

# Scale up if needed
fly scale memory 2048 --app accountable-books-api-staging
```

### Debug Commands

```bash
# SSH into the app
fly ssh console --app accountable-books-api-staging

# Check environment
env | grep -E "(NODE_ENV|PORT|DATABASE)"

# Check logs
tail -f /var/log/app.log

# Check disk space
df -h

# Check memory usage
free -h
```

## 🚀 Production Deployment

### Preparation

1. **Update Environment Schema**: Add production values to `env-schema.ts`
2. **Generate Production Files**: `cd apps/api && pnpm run generate-env`
3. **Set Production Secrets**: Use `fly.production.toml`
4. **Database Setup**: Ensure production Neon database is ready
5. **Domain Configuration**: Set up custom domain if needed

### Deployment Steps

```bash
# Use production config
fly deploy --config fly.production.toml

# Set production secrets
fly secrets set PROD_SECRET=value --app accountable-books-api

# Scale for production
fly scale count 2 --app accountable-books-api
fly scale memory 2048 --app accountable-books-api
```

## 📝 Best Practices

1. **Environment Separation**: Keep staging and production configs separate
2. **Secret Management**: Never commit secrets to version control
3. **Health Checks**: Implement comprehensive health checks
4. **Logging**: Use structured logging for better debugging
5. **Monitoring**: Set up alerts for critical metrics
6. **Backup Strategy**: Ensure database backups are configured
7. **Rollback Plan**: Test rollback procedures regularly
8. **Security Scanning**: Regular security assessments

## 🔗 Related Documentation

- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io CLI Reference](https://fly.io/docs/flyctl/)
- [Neon Database Documentation](https://neon.tech/docs)
- [Accountable Books Architecture](./ARCHITECTURE.md)
- [Staging Environment](./STAGING.md)
