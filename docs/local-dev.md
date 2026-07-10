# Local Development Setup

Hybrid development: **infrastructure in Docker** (PostgreSQL + Redis), **applications on the host** via Turbo.

## Prerequisites

- Node.js >= 24.16.0
- pnpm >= 11
- Docker & Docker Compose
- Make
- [mise](https://mise.jdx.dev/) — runtime version manager (required by `make setup`)
- [uv](https://docs.astral.sh/uv/) — Python package manager for the ML engine

## First-Time Setup

```bash
make setup    # Infra + deps + generate-env + migrate + demo data
# or
make install  # Deps + generate-env only — then run db-up / db-migrate yourself
```

`make setup` and `make install` both run `pnpm run generate-env`, which creates `apps/api/.env.local` and `apps/web/.env.local` from the env schemas.

Start developing:

```bash
make dev      # Core apps: api, web, ml-engine (excludes web-payroll)
```

To also start web-payroll: `make dev-full` or `pnpm dev`.

## Hosts / URLs

**lvh.me (recommended)** — add to `/etc/hosts`:

```
127.0.0.1 app.lvh.me
127.0.0.1 api.lvh.me
```

| Service   | lvh.me                              | localhost                          |
| --------- | ----------------------------------- | ---------------------------------- |
| Web       | http://app.lvh.me:5173              | http://localhost:5173              |
| API       | http://api.lvh.me:5000              | http://localhost:5000              |
| ML Engine | http://localhost:8000               | http://localhost:8000              |
| API docs  | http://api.lvh.me:5000/docs         | http://localhost:5000/docs         |
| Admin     | http://api.lvh.me:5000/admin/queues | http://localhost:5000/admin/queues |

**localhost option:** after `make setup`, update `apps/api/.env.local` (`BACKEND_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN`) and `apps/web/.env.local` (`VITE_BACKEND_URL`). See [ENVIRONMENT.md](ENVIRONMENT.md).

## Demo Credentials

- `demo.us@example.com` / `StrongDemoPass!`
- `demo.ng@example.com` / `StrongDemoPass!`
- Admin: `support@getaccountable.com` / `StrongAdminPass!`

## Individual Services

After `make setup` (or `make install` + `make db-up` + `make db-migrate`):

```bash
make api-dev      # API only
make web-dev      # Web only
make ml-only      # ML engine only

# Or via pnpm
pnpm -F @accountable-books/api dev
pnpm -F @accountable-books/web dev
pnpm -F @accountable-books/ml-engine dev
```

## Database

```bash
make db-up          # Start DB + Redis
make db-down        # Stop infrastructure
make db-migrate     # Run migrations
make db-rollback    # Roll back last migration
make db-seed        # Apply demo data
make db-shell       # psql shell
make db-logs        # View logs
make db-reset       # Reset local DB, then migrate and seed
```

## Demo Data

```bash
make demo              # Apply all demo data
make demo-basic        # Without bank transactions (faster)
make demo-status       # Current state
make demo-reverse      # Remove demo data

# With filters (pnpm)
pnpm -F @accountable-books/api run demo -- apply --country US
pnpm -F @accountable-books/api run demo -- reset --type business
```

CLI reference: [apps/api/seeds/demo/README.md](../apps/api/seeds/demo/README.md) and `pnpm -F @accountable-books/api run demo -- --help`.

## Environment Files

Created by `make setup` / `make install` via `pnpm run generate-env`:

- `apps/api/.env.local`
- `apps/web/.env.local`

Key local defaults: `DB_HOST=localhost`, `DB_PORT=5433`, `REDIS_HOST=localhost`, `REDIS_PORT=6380`.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Quick checks:

1. Infrastructure running: `docker compose -f docker-compose.dev.yml ps`
2. Migrations applied: `make db-migrate`
3. Port conflicts: `make db-down`, stop running apps (Ctrl+C), restart

Nuclear reset: `make clean-all` (from repo root).

## Staging (local)

Production-like Docker environment: `make staging-up`, `make staging-down`, `make staging-health`. See `make help-advanced`.

## Production Guard

Destructive `make` targets refuse to run in production-like contexts (`APP_ENV=production`, `FLY_APP_NAME`, etc.). Use `APP_ENV=local` locally. Details in [ENVIRONMENT.md](ENVIRONMENT.md).
