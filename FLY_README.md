# Fly.io Deployment Guide

This guide covers deploying Accountable Books services to Fly.io for staging and production environments.

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

# Check status
./scripts/deploy-fly-staging.sh status

# View logs
./scripts/deploy-fly-staging.sh logs
```

## 📋 Configuration Files

### Current Deployments

| Service | Environment | Config File           | App Name                        | URL                                           |
| ------- | ----------- | --------------------- | ------------------------------- | --------------------------------------------- |
| API     | Staging     | `fly.staging.toml`    | `accountable-books-api-staging` | https://accountable-books-api-staging.fly.dev |
| API     | Production  | `fly.production.toml` | `accountable-books-api`         | https://accountable-books-api.fly.dev         |

### File Structure

```
/
├── fly.staging.toml           # API staging deployment
├── fly.production.toml        # API production deployment
├── scripts/
│   └── deploy-fly-staging.sh  # Deployment automation
└── docs/
    └── FLY_DEPLOYMENT.md      # Detailed deployment guide
```

## 🏗️ Architecture

### Why Root Level Configuration?

Fly.io requires `fly.toml` files to be in the build context root because:

1. **Monorepo Dependencies**: Services depend on packages in `/packages/`
2. **Build Context**: Fly.io uses the entire directory as Docker build context
3. **Dockerfile Path**: References `apps/api/infra/docker/Dockerfile.staging`
4. **Fly.io Standard**: This is the expected location for `fly.toml`

### Alternative Approaches Considered

#### ❌ Service-Specific (apps/api/fly.toml)

```
apps/api/fly.toml  # Won't work - no access to packages/
```

**Problems:**

- Build fails due to missing monorepo dependencies
- Can't access shared packages
- Fly.io can't resolve workspace dependencies

#### ❌ Infra Directory (infra/fly/fly.toml)

```
infra/fly/fly.toml  # Requires custom build context
```

**Problems:**

- Requires complex build context configuration
- Not standard Fly.io practice
- More complex deployment setup

#### ✅ Root Level (Current)

```
/fly.staging.toml  # Standard practice, works with monorepo
```

**Benefits:**

- Fly.io standard practice
- Full monorepo context available
- Simple deployment process
- Works with existing Dockerfile

## 🔐 Environment Variables & Secrets

### Environment Variables (Non-sensitive)

These are set from `apps/api/.env.staging` via the deployment script:

- `NODE_ENV`, `PORT`, `BASE_DOMAIN`
- `BACKEND_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN`
- `DB_HOST`, `DB_PORT`, `POSTGRES_DB`, `POSTGRES_USER`
- `EMAIL_PROVIDER`, `EMAIL_FROM`, `SLACK_CHANNEL`
- `SENTRY_RELEASE`, `PLATFORM_COMPANY_*`, `TEST_ADMIN_*`
- `SEED_DB`, `BULLBOARD_USER`

**Note:** Values in `fly.staging.toml` override values from `.env.staging`

### Environment Variable Precedence

1. **`fly.staging.toml`** (highest priority - overrides everything)
2. **`.env.staging`** (set via deployment script)
3. **Default values** (lowest priority)

This allows you to:

- Keep `fly.staging.toml` clean with only essential overrides
- Use `.env.staging` for most configuration
- Override specific values when needed in `fly.staging.toml`

### Secrets (Sensitive)

These are set from `apps/api/.env.secrets.staging`:

- `POSTGRES_PASSWORD`, `DATABASE_URL`, `DATABASE_URL_NOPOOL`
- `REDIS_URL`, `REDIS_PASSWORD`, `CSRF_SECRET`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `POSTMARK_API_KEY`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`
- `MIXPANEL_TOKEN`, `SENTRY_DSN`
- `R2_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
- `BULLBOARD_PASSWORD`, `MONO_SECRET_KEY`

## 🌐 Custom Domain Configuration

### DNS Setup Required

To use the custom domain `api-staging.getaccountable.com`, you need to:

1. **Add DNS Record**: Add a CNAME record in your DNS provider:

   ```
   api-staging.getaccountable.com → accountable-books-api-staging.fly.dev
   ```

2. **Configure SSL Certificate**: The deployment script will automatically request an SSL certificate:

   ```bash
   ./scripts/deploy-fly-staging.sh domain
   ```

3. **Verify Configuration**: Check the certificate status:
   ```bash
   fly certs show api-staging.getaccountable.com --app accountable-books-api-staging
   ```

### Environment Variables

The following environment variables are automatically set for the custom domain:

- `BASE_DOMAIN = "getaccountable.com"`
- `BACKEND_URL = "https://api-staging.getaccountable.com"`
- `FRONTEND_URL = "https://app-staging.getaccountable.com"`
- `COOKIE_DOMAIN = ".getaccountable.com"`

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
# Deploy staging
fly deploy --config fly.staging.toml

# Deploy production
fly deploy --config fly.production.toml

# Check status
fly status --app accountable-books-api-staging

# View logs
fly logs --app accountable-books-api-staging

# Set secrets
fly secrets set JWT_ACCESS_SECRET=your-secret --app accountable-books-api-staging
```

## 🌐 URLs

### Staging

- **API**: https://accountable-books-api-staging.fly.dev
- **Custom Domain**: https://api-staging.getaccountable.com
- **Health Check**: https://accountable-books-api-staging.fly.dev/health
- **Bull Board**: https://accountable-books-api-staging.fly.dev/admin/queues

### Production (Future)

- **API**: https://accountable-books-api.fly.dev
- **Health Check**: https://accountable-books-api.fly.dev/health
- **Bull Board**: https://accountable-books-api.fly.dev/admin/queues

## 🔍 Monitoring & Debugging

### Health Checks

The API exposes a `/health` endpoint that returns:

```json
{
  "ok": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
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

- **Port**: 9091 (internal only)
- **Path**: `/metrics`
- **Format**: Prometheus metrics
- **Access**: Internal only (not exposed externally)
- **Purpose**: Application performance and health monitoring

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
- **Force HTTPS**: Enabled in `fly.staging.toml`
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

### VM Configuration

The `[[vm]]` section in `fly.staging.toml` defines compute resources:

```toml
[[vm]]
  cpu_kind = "shared"    # shared (cheaper) vs performance (dedicated)
  cpus = 1              # Number of CPU cores
  memory_mb = 1024      # Memory in MB (1GB)
```

**CPU Options:**

- `"shared"` - Cheaper, shared with other apps
- `"performance"` - Dedicated CPU (more expensive)

**Memory Options:** 256, 512, 1024, 2048, 4096, 8192 MB

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

### Metrics Configuration

The `[metrics]` section enables Prometheus metrics:

```toml
[metrics]
  port = 9091    # Internal port (not exposed externally)
  path = "/metrics"  # URL path for metrics endpoint
```

**Purpose:**

- Application performance monitoring
- Health metrics collection
- Business metrics tracking
- **Internal access only** - not exposed to the internet

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
curl -s http://localhost:8080/health

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

## 🔮 Future Services

When adding more services, we'll create additional config files:

```
/
├── fly.staging.toml           # API staging
├── fly.production.toml        # API production
├── fly-web.staging.toml       # Web app staging (future)
├── fly-web.production.toml    # Web app production (future)
├── fly-ml.staging.toml        # ML engine staging (future)
└── fly-ml.production.toml     # ML engine production (future)
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

- [Detailed Deployment Guide](docs/FLY_DEPLOYMENT.md)
- [Staging Environment](STAGING.md)
- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io CLI Reference](https://fly.io/docs/flyctl/)
- [Neon Database Documentation](https://neon.tech/docs)
