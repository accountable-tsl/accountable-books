# Accountable Books Web

React/TypeScript frontend (Vite, TanStack Query, Tailwind, Shadcn/UI).

## Run

From repo root:

```bash
make web-dev    # or: make setup && make dev
```

From this directory:

```bash
pnpm dev        # http://app.lvh.me:5173 (lvh.me recommended)
pnpm test
pnpm build
```

See [docs/local-dev.md](../../docs/local-dev.md) for hosts setup and [root README](../../README.md) for monorepo commands.

## Environment

`apps/web/.env.local` (created by `make setup` / `make install` via `pnpm run generate-env`):

- `VITE_BACKEND_URL` — API URL (default: `http://api.lvh.me:5000`)
- `VITE_AI_ENABLED` — enable AI command bar
- `VITE_MONO_PUBLIC_KEY` — Mono integration (optional)

Full reference: [docs/ENVIRONMENT.md](../../docs/ENVIRONMENT.md).

## Layout

```
src/
├── components/              # Shared UI (incl. data-table, ai)
├── features/                # Feature modules (cat-engine, journals, …)
├── modules/                 # Cross-cutting modules (e.g. ai runtime)
├── domains-pending-migration/  # Legacy paths being migrated
├── shared/                  # Hooks, services, constants
└── layouts/
```

## Related Docs

- [AI registration pattern](src/modules/ai/README.md)
- [DataTable usage](src/components/data-table/docs/README.md)
- [API](../api/README.md) · [Contracts](../../packages/contracts/README.md)
