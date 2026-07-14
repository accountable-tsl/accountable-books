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
make setup    # Infra + deps + generate-env + local/test migrate+bootstrap + demo
# or
make install  # Deps + generate-env only — then run db-up / db-ready / db-seed yourself
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

After `make setup` (or `make install` + `make db-up` + `make db-ready` + `make db-seed`):

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

Happy-path Make targets prepare **both** the local app DB and the test DB (migrations use the same Postgres instance; catalogs + demo are applied to each).

```bash
make db-up          # Start DB + Redis (creates local + test databases)
make db-down        # Stop infrastructure
make db-ready       # Migrate + bootstrap local and test
make db-migrate     # Alias for db-ready
make db-seed        # Apply demo data to local and test
make db-reset       # Reset, migrate, bootstrap, seed local and test
make db-shell       # psql shell (local)
make db-logs        # View logs
make db-rollback    # Roll back last local migration
```

Single-env escape hatches: `db-migrate-local` / `db-migrate-test`, `db-seed-local` / `db-seed-test`, `db-reset-local` / `db-reset-test`.

## Demo Data

```bash
make demo              # Apply demo data (local + test)
make demo-basic        # Without bank transactions (local + test)
make demo-status       # Current state (local)
make demo-reverse      # Remove demo data (local + test)

# With filters (pnpm primitives — env-specific)
pnpm -F @accountable-books/api run demo apply --country US
NODE_ENV=test pnpm -F @accountable-books/api run demo apply --country US
```

CLI reference: [apps/api/seeds/demo/README.md](../apps/api/seeds/demo/README.md) and `pnpm -F @accountable-books/api run demo help`.

## Environment Files

Created by `make setup` / `make install` via `pnpm run generate-env`:

- `apps/api/.env.local`
- `apps/web/.env.local`

Key local defaults: `DB_HOST=localhost`, `DB_PORT=5433`, `REDIS_HOST=localhost`, `REDIS_PORT=6380`.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Quick checks:

1. Infrastructure running: `docker compose -f docker-compose.dev.yml ps`
2. Databases ready: `make db-ready` (and `make db-seed` if you need demo companies)
3. Port conflicts: `make db-down`, stop running apps (Ctrl+C), restart

Nuclear reset: `make clean-all` (from repo root).

## Staging (local)

Production-like Docker environment: `make staging-up`, `make staging-down`, `make staging-health`. See `make help-advanced`.

## Production Guard

Destructive `make` targets refuse to run in production-like contexts (`APP_ENV=production`, `FLY_APP_NAME`, etc.). Use `APP_ENV=local` locally. Details in [ENVIRONMENT.md](ENVIRONMENT.md).
