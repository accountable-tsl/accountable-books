# Fly.io Deployment Guide

Deploy the Accountable Books API to Fly.io (staging today; production later).

## Quick Start

### Prerequisites

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Generate env files from the repo root:

   ```bash
   pnpm -F @accountable-books/utils run build
   pnpm -F @accountable-books/api run generate-env
   ```

### Staging Deployment

```bash
./scripts/deploy-fly-staging.sh deploy

# Or manually:
fly deploy --config fly.staging.toml

./scripts/deploy-fly-staging.sh status
./scripts/deploy-fly-staging.sh logs
```

## Configuration

### `fly.staging.toml`

| Setting       | Value                                                    |
| ------------- | -------------------------------------------------------- |
| App           | `accountable-books-api-staging`                          |
| Region        | `iad`                                                    |
| Internal port | **5001** (matches `PORT` / `http_service.internal_port`) |
| Health        | `/health/ready`, `/health/live`                          |
| Processes     | `web`, `worker`, `scheduler`                             |

### Staging URLs

| Surface     | URL                                                 |
| ----------- | --------------------------------------------------- |
| Web         | https://staging.getaccountable.com                  |
| API         | https://api-staging.getaccountable.com              |
| Fly default | https://accountable-books-api-staging.fly.dev       |
| Health      | https://api-staging.getaccountable.com/health/ready |
| Bull Board  | https://api-staging.getaccountable.com/admin/queues |

Env overrides in `fly.staging.toml`:

```toml
BASE_DOMAIN = "getaccountable.com"
BACKEND_URL = "https://api-staging.getaccountable.com"
FRONTEND_URL = "https://staging.getaccountable.com"
COOKIE_DOMAIN = ".getaccountable.com"
PORT = "5001"
```

## Custom Domain (API staging)

### 1. Deploy

```bash
./scripts/deploy-fly-staging.sh deploy
```

### 2. DNS

Add a CNAME:

```
Type: CNAME
Name: api-staging
Value: accountable-books-api-staging.fly.dev
```

### 3. Certificate

```bash
./scripts/deploy-fly-staging.sh domain
# or: fly certs add api-staging.getaccountable.com --app accountable-books-api-staging
fly certs show api-staging.getaccountable.com --app accountable-books-api-staging
curl -I https://api-staging.getaccountable.com/health/ready
```

If the cert is pending: verify DNS (`dig api-staging.getaccountable.com`), wait for propagation, re-run the domain command.

## Environment Variables & Secrets

Non-sensitive values come from `apps/api/.env.staging` (and Fly `[env]` overrides). Secrets come from `apps/api/.env.secrets.staging` via:

```bash
./scripts/deploy-fly-staging.sh secrets
# or: fly secrets set KEY=value --app accountable-books-api-staging
```

Typical secrets: `DATABASE_URL`, `REDIS_URL`, JWT secrets, Postmark, Sentry, R2, Mono, Bull Board password.

## Deployment Scripts

```bash
./scripts/deploy-fly-staging.sh deploy
./scripts/deploy-fly-staging.sh create
./scripts/deploy-fly-staging.sh secrets
./scripts/deploy-fly-staging.sh validate
./scripts/deploy-fly-staging.sh status
./scripts/deploy-fly-staging.sh logs
./scripts/deploy-fly-staging.sh scale N
./scripts/deploy-fly-staging.sh domain
./scripts/deploy-fly-staging.sh destroy
```

## Health Checks

- `GET /health/live` — process alive
- `GET /health/ready` — Postgres + Redis ready (or 503)

Inside the machine, probe the **internal** port:

```bash
fly ssh console --app accountable-books-api-staging
curl -s http://localhost:5001/health/ready
```

Metrics: port `9091`, path `/metrics`.

## Database Migrations

Migrations run on startup. Manual:

```bash
fly ssh console --app accountable-books-api-staging
cd /app/apps/api
npx knex migrate:latest --env staging
```

## Troubleshooting

| Issue           | Check                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Build failure   | `fly logs --app accountable-books-api-staging`; rebuild Dockerfile.staging locally |
| Missing env     | `fly config show` / `fly secrets list`                                             |
| DB connectivity | SSH + `curl localhost:5001/health/ready`                                           |
| Memory          | `fly scale memory 2048 --app accountable-books-api-staging`                        |

## Production (future)

1. Add production values to `env-schema.ts` and run `pnpm run generate-env`
2. Use `fly.production.toml` when ready
3. Same custom-domain flow for production hostnames

## Related

- [Fly.io docs](https://fly.io/docs/)
- [Custom domains](https://fly.io/docs/networking/custom-domains/)
- [Environment variables](ENVIRONMENT.md)
- [Docs index](README.md)
