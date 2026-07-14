# Accountable Books

> AI-native accounting platform for accounting firms

Accountable Books ingests bank data via Plaid (US) and Mono (Nigeria), auto-categorizes transactions with ML, drafts journals and financials, and provides human review workflows for exceptions.

## Quick Start

```bash
make setup   # First time: infra + deps + env + local/test DBs + demo
make dev     # Start core apps (api, web, ml-engine)
```

**Prerequisites:** Node.js >= 24.16.0, pnpm >= 11, Docker, Make, [mise](https://mise.jdx.dev/), [uv](https://docs.astral.sh/uv/).

Full setup: [docs/local-dev.md](docs/local-dev.md) · Docs index: [docs/README.md](docs/README.md)

## Services & Ports

| Service    | URL (lvh.me)           | Port |
| ---------- | ---------------------- | ---- |
| Web        | http://app.lvh.me:5173 | 5173 |
| API        | http://api.lvh.me:5000 | 5000 |
| ML Engine  | http://localhost:8000  | 8000 |
| PostgreSQL | localhost              | 5433 |
| Redis      | localhost              | 6380 |

- API docs: http://api.lvh.me:5000/docs
- Admin queues: http://api.lvh.me:5000/admin/queues

For multi-tenant cookie sharing, use **lvh.me** — add `127.0.0.1 app.lvh.me api.lvh.me` to `/etc/hosts`. Localhost alternative: [docs/local-dev.md](docs/local-dev.md).

## Common Commands

```bash
make install      # Deps + generate env files (no infra/migrate)
make dev-full     # Start infra + all Turbo apps (includes web-payroll)
make api-dev      # API only
make web-dev      # Web only
make ml-only      # ML engine only

make db-up        # Start DB + Redis
make db-ready     # Migrate + bootstrap local and test
make db-seed      # Apply demo data to local and test
make demo-status  # Check demo data (local)

make test         # All tests
make check        # Read-only lint + typecheck + format check
make fix          # Format + safe lint fixes
make clean-all    # Nuclear reset — see troubleshooting
```

Demo data: `make demo`, `make demo-basic`, `make demo-reverse`. Details: [apps/api/seeds/demo/README.md](apps/api/seeds/demo/README.md).

## Project Structure

```
apps/
├── api/           # Node.js/Express backend
├── web/           # React frontend
├── web-payroll/   # Payroll tool (standalone; not in `make dev`)
└── ml-engine/     # Python/FastAPI categorization service

packages/
├── contracts/     # Shared API contracts (Zod → TS + Pydantic)
└── utils/         # Shared utilities

docs/              # Setup, env, deployment, architecture — see docs/README.md
infra/             # Docker, Make targets, PostgreSQL extensions
```

## Documentation

- [Docs index](docs/README.md)
- [Local development](docs/local-dev.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [API](apps/api/README.md) · [Web](apps/web/README.md) · [ML Engine](apps/ml-engine/README.md) · [Contracts](packages/contracts/README.md)
- [Fly deployment](docs/fly-deployment.md)

## Stack

Node.js/Express + Knex + PostgreSQL · React/Vite · Python/FastAPI · Redis · BullMQ · Turbo monorepo

## Git Hooks

Pre-commit runs lint-staged (ESLint + Prettier), typecheck, and affected tests via Husky. Pre-push runs typecheck, tests, and build. See `.husky/`.

## Contributing

1. `make setup` → create a branch → `make dev`
2. Follow existing patterns; TypeScript strict mode
3. Update docs for significant changes

## License

Proprietary — Accountable Techserve Inc.
