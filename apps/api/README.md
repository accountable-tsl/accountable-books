# Accountable Books API

Node.js/Express/TypeScript backend — Knex, PostgreSQL, Redis, BullMQ.

## Run

From repo root:

```bash
make api-dev
# or: make setup && make dev
```

From this directory:

```bash
pnpm dev           # http://api.lvh.me:5000
pnpm test
pnpm migrate:local
```

### Test isolation

Vitest runs files across four workers by default. Global setup migrates and
bootstraps `<POSTGRES_DB>_test`, then clones one PostgreSQL database and selects
one Redis logical database per worker. Set `API_TEST_WORKERS` to 1–8 to tune
local concurrency; the test connection pool is capped separately.

Worker databases are temporary and are removed after the suite. Because their
names are stable, only one API test command can run at a time. CI also runs
`pnpm test:parallel-isolation` to verify that two files reach distinct databases.

See [docs/local-dev.md](../../docs/local-dev.md) and [root README](../../README.md).

## Ports & URLs

- API: http://api.lvh.me:5000 (or http://localhost:5000)
- Swagger: http://api.lvh.me:5000/docs
- Bull Board: http://api.lvh.me:5000/admin/queues

## Environment

`apps/api/.env.local` (created by `make setup` / `make install` via `pnpm run generate-env`):

- `DATABASE_URL` / `DB_*` — PostgreSQL (local: port 5433)
- `REDIS_URL` — Redis (local: port 6380)
- `ML_ENGINE_URL` — default `http://localhost:8000`
- `JWT_ACCESS_SECRET`, `PORT` (default 5000)

Full reference: [docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md).

## Structure

```
src/
├── domains/     # Domain modules (categorization, billing, …)
├── features/    # Cross-cutting features (auth, comms, …)
├── jobs/        # BullMQ workers — see src/jobs/README.md
├── migrations/
└── seeds/demo/  # Demo data — see seeds/demo/README.md
```

## Database

```bash
make db-up
make db-migrate
make db-rollback
make db-seed
make db-shell
make db-logs
```

## Related Docs

- [Demo seeds](seeds/demo/README.md)
- [Jobs & workers](src/jobs/README.md)
- [Categorization pipeline](src/domains/categorization/README.md)
- [Contracts](../../packages/contracts/README.md)
