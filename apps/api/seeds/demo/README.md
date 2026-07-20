# Demo Seeds

Idempotent demo seeding for 6 companies (3 US, 3 Nigeria).

## Overview

- **Countries:** US, Nigeria
- **Types:** individual, business, accounting_firm (per country)
- **Short codes:** `bizDemoUS`, `firmDemoUS`, `indDemoUS`, `bizDemoNG`, `firmDemoNG`, `indDemoNG`
- **Steps:** users → companies → COA → contacts → projects → bank accounts → bank transactions → journals

## Commands

**Makefile (repo root):**

```bash
make demo              # Apply all demo data (local + test)
make demo-basic        # Without bank transactions (local + test)
make demo-status       # Show status (local)
make demo-reverse      # Remove demo data (local + test)
make db-seed           # Same as make demo
```

**pnpm (repo root or API package):**

```bash
pnpm -F @accountable-books/api run demo apply
pnpm -F @accountable-books/api run demo apply --exclude bank-transactions
pnpm -F @accountable-books/api run demo status
pnpm -F @accountable-books/api run demo reverse
pnpm -F @accountable-books/api run demo reset --country US
```

**CLI (from `apps/api`):**

```bash
tsx seeds/demo/cli.ts apply
tsx seeds/demo/cli.ts apply --country US --type business
tsx seeds/demo/cli.ts apply --exclude bank-transactions
tsx seeds/demo/cli.ts reverse
tsx seeds/demo/cli.ts reset --company bizDemoUS
tsx seeds/demo/cli.ts status
tsx seeds/demo/cli.ts help
```

Queues are disabled during seeding by default (faster, less Redis noise). Override: `DISABLE_QUEUES=false tsx seeds/demo/cli.ts apply`.

## Step Order

1. `001_users` — demo users
2. `002_companies` — company records
3. `003_coa` — chart of accounts
4. `010_contacts` — customers, vendors, employees
5. `012_projects` — sample projects
6. `015_bank_accounts` — bank accounts + COA links
7. `016_bank_transactions` — synthetic transactions
8. `020_journals` — manual batches + recurring templates

Steps are idempotent and run in dependency order inside transactions.

## Architecture

| Path                 | Role                             |
| -------------------- | -------------------------------- |
| `cli.ts`             | CLI entry                        |
| `engine/runner.ts`   | apply / reverse / reset / status |
| `engine/registry.ts` | Step registry + ordering         |
| `config/`            | Per-step seed modules            |
| `shared/`            | Config, caching, utilities       |

## Demo Companies

| Short code | Country | Type            |
| ---------- | ------- | --------------- |
| bizDemoUS  | US      | business        |
| firmDemoUS | US      | accounting_firm |
| indDemoUS  | US      | individual      |
| bizDemoNG  | NG      | business        |
| firmDemoNG | NG      | accounting_firm |
| indDemoNG  | NG      | individual      |

## Adding a Step

1. Create `config/0XX_stepname/` with create/delete functions
2. Register in `engine/registry.ts`
3. Add tests alongside the step module

## Troubleshooting

- **Demo user not found** — re-run from `users` step or full `apply`
- **Foreign key violations** — use `apply` (handles ordering); avoid `--parallel`
- **Company already exists** — expected idempotent behavior
