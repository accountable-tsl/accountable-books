# Production-Grade Staging Environment

This document describes the production-grade staging environment for Accountable Books, featuring enterprise-level security, monitoring, and operational procedures.

## 🚀 Quick Start

### Basic Staging (Development-like)

```bash
# Quick development staging
# 1) Setup secrets first
./scripts/setup-secrets.sh setup

# 2) Ensure API env files are generated (not committed)
cd apps/api && pnpm run generate-env && cd -

# 3) Start services
./scripts/deploy-staging.sh
```

### Production-Grade Staging (Recommended)

```bash
# Setup secrets and deploy production-grade staging
./scripts/setup-secrets.sh setup
./scripts/deploy-production-grade.sh deploy
```

## 🌐 Service URLs

### Basic Staging

- Web App: http://localhost:3000
- API: http://localhost:5000
- ML Engine: http://localhost:8000
- Bull Board: http://localhost:5000/admin/queues

### Production-Grade Staging

- Web App: http://localhost (HTTP) / https://localhost (HTTPS)
- API: http://localhost/api
- ML Engine: http://localhost/ml
- Prometheus: http://localhost:9090 (with monitoring profile)
- Grafana: http://localhost:3001 (with monitoring profile)

## 🏗️ Architecture

### Production-Grade Features

#### 🔒 Security Hardening

- **Non-root containers**: All services run as non-privileged users
- **Security contexts**: `no-new-privileges`, capability dropping, read-only filesystems
- **Network segmentation**: Isolated networks for frontend, backend, and database tiers
- **Secrets management**: External secret files, never hardcoded credentials
- **SSL/TLS**: HTTPS termination with security headers and HSTS
- **Rate limiting**: API endpoint protection against abuse

#### 🔍 Monitoring & Observability

- **Structured logging**: Centralized logging with pino and log aggregation
- **Health checks**: Comprehensive service health monitoring
- **Metrics collection**: Prometheus integration for performance monitoring
- **Dashboards**: Grafana dashboards for operational visibility
- **Security scanning**: Automated vulnerability and security assessments

#### 🛡️ Operational Excellence

- **Backup automation**: Scheduled backups with retention policies
- **Disaster recovery**: Automated backup and restore procedures
- **Resource limits**: CPU and memory constraints for stability
- **Graceful shutdown**: Proper signal handling and cleanup
- **Rolling updates**: Zero-downtime deployment strategies

### Service Architecture

#### Core Services

- **nginx**: Production reverse proxy with SSL termination, load balancing, and security headers
- **api**: Node.js/Express API with structured logging and health checks
- **db**: PostgreSQL 17 with pgvector, pg_cron, pg_uuidv7 extensions
- **redis**: Redis 7 with persistence and authentication
- **ml**: Python/FastAPI ML engine with resource limits

#### Infrastructure Services

- **api-migrate**: Init container for reliable database migrations
- **prometheus**: Metrics collection and alerting (optional)
- **grafana**: Operational dashboards and visualization (optional)

### Network Architecture

- **Frontend Network** (172.20.0.0/24): Web traffic and reverse proxy
- **Backend Network** (172.21.0.0/24): API services and application logic
- **Database Network** (172.22.0.0/24): Database tier (isolated, internal-only)

### Data Persistence

- **postgres_data**: PostgreSQL data with backup automation
- **redis_data**: Redis persistence with disaster recovery
- **nginx_logs**: Access and error logs for analysis
- **app_logs**: Application logs for debugging and monitoring

## Configuration

### Environment Files

- `.env.staging` - Auto-generated from schema, contains non-sensitive config
- `.env.staging.secrets` - Manual file containing sensitive secrets (never commit)

### Security Features

- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Gzip compression for web assets
- Proper asset caching strategies
- Access restrictions for sensitive files

## Management Commands

```bash
# Deploy/redeploy staging
./scripts/deploy-staging.sh deploy

# Stop all services
./scripts/deploy-staging.sh stop

# View logs
./scripts/deploy-staging.sh logs [service]

# Check status
./scripts/deploy-staging.sh status

# Clean environment (removes volumes)
./scripts/deploy-staging.sh clean
```

## Database Management

```bash
# Access database shell
docker compose -f docker-compose.staging.yml exec db psql -U user -d accountable_books

# Run manual migrations
docker compose -f docker-compose.staging.yml exec api node dist/scripts/migrate-staging.js

# Backup database
docker compose -f docker-compose.staging.yml exec db pg_dump -U user accountable_books > backup.sql
```

## Troubleshooting

### Services won't start

1. Check logs: `./scripts/deploy-staging.sh logs`
2. Verify secrets file exists and has correct values
3. Ensure no port conflicts on host machine
4. Re-generate API env: `cd apps/api && pnpm run generate-env`
5. Verify frontend build uses correct backend URL (see apps/web/.env.production)

### Database connection issues

1. Check database health: `docker compose -f docker-compose.staging.yml ps`
2. Verify DATABASE_URL in .env.staging matches compose config
3. Check database logs: `./scripts/deploy-staging.sh logs db`

### API fails to start

1. Check migration logs: `./scripts/deploy-staging.sh logs api-migrate`
2. Verify all required environment variables are set
3. Check API logs: `./scripts/deploy-staging.sh logs api`
4. Ensure static assets path: API serves `./dist/public` (Docker) and `./public` (dev)

### Performance issues

1. Monitor resource usage: `docker stats`
2. Check for memory/CPU limits
3. Review nginx access logs for slow requests

## Production Considerations

When moving to production:

1. **Secrets Management**: Use proper secrets management (Docker secrets, external secret stores)
2. **SSL/TLS**: Add HTTPS termination (load balancer or reverse proxy)
3. **Monitoring**: Add application and infrastructure monitoring
4. **Backup**: Implement automated database backups
5. **Scaling**: Consider horizontal scaling for API and worker services
6. **Security**: Review and harden security configurations
7. **Logging**: Centralized logging with log aggregation
8. **Resource Limits**: Set proper CPU/memory limits for containers

## File Structure

```
.
├── docker-compose.staging.yml      # Main staging compose file
├── .env.staging.secrets           # Sensitive configuration (not committed)
├── scripts/deploy-staging.sh      # Deployment script
├── apps/api/.env.staging          # API configuration (auto-generated)
├── apps/web/nginx/nginx.conf      # Nginx configuration with security
└── apps/api/scripts/
    └── migrate-staging.ts         # Database migration script
```
