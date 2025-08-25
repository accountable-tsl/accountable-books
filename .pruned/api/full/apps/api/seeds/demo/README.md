# Demo Seeds

Deterministic, idempotent, and reversible demo seeding for six companies with clear steps, targeting, and progress reporting.

- Countries: US and NG
- Types per country: individual, business, accounting_firm
- All scenarios are data-driven (JSON) and extensible

Key features:

- apply/add/purge/list/status commands
- Step-based seeds (base → contacts → projects → bank-accounts → bank-transactions [stub])
- Artifact tracking via `seed_runs`/`seed_artifacts`
- Targeting by country, type, company, or step
- Progress reporting with per-step counters

## Quick Start

From repo root (executed with tsx):

```
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --all

# or target subsets
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --country US
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --country NG --type business
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts apply --company firmDemoUS

# add an extra step across targets (e.g., bank accounts)
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts add --step bank-accounts --all

# purge artifacts (reversible)
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts purge --company indDemoNG
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts purge --country US --type accounting_firm
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts purge --all

# inspect
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts list
pnpm --filter @accountable-books/api exec tsx apps/api/seeds/demo/cli.ts status --company bizDemoUS
```

### Advanced

- Parallel runs: add `--parallel`
- Stop on first error: add `--bail`
- Custom scenarios file: `--config apps/api/seeds/demo/config/scenarios.json`
- Include transactions step (stub only): `--step bank-transactions` (requires future implementation)

### Help

Run without arguments or with an invalid command to see usage, or open this file for detailed examples.

## Concepts

- Scenario: a concrete demo company configuration (user + company metadata), parameterized by country and type.
- Step: an idempotent seed unit (base, contacts, projects, bank-accounts). Each step records artifacts to enable precise purge.
- Tags: every seed run records tags like `demo`, `tenant`, `country:US`, `type:business`, `company:bizDemoUS`, `step:contacts`.

## How It Works

1. `apply` resolves target scenarios and executes steps in order. Each step uses `withSeedRun` with checksum `{name, version, ctx}` to ensure idempotency.
2. `add` executes just the selected step for targets; re-runnable.
3. `purge` looks up `seed_runs` by filters and deletes rows listed in `seed_artifacts` (reverse chronological, constraints deferred).

## Upsert Keys (Conventions)

- companies: `short_code`
- users: `email`
- contacts: `(company_id, normalized_name)` (enforced by schema)
- projects: `(company_id, code)` when code is present, otherwise `(company_id, name)`
- bank_accounts: conventional tuple `(company_id, bank_id, display_name)` for idempotent behavior within this toolkit

Note: bank account model enforces uniqueness by `(company_id, bank_id, account_number)`; our step keeps account numbers deterministic per run to avoid duplications.

## Files

- `engine/helpers.ts` – checksum, seed run, artifact marking, purge helpers.
- `engine/registry.ts` – step registry, resolvers, target filtering.
- `engine/runner.ts` – apply/add/purge/list/status orchestration.
- `config/scenarios.json`: data-driven scenarios (extend without code changes).
- `scenarios/index.ts`: loads and builds scenarios from JSON using country/currency utilities.
- `steps/*.ts` – seed steps: base, contacts, projects, bank-accounts.
- `cli.ts` – thin CLI wrapper using the runner.

## Versioning

- Each step has an integer `version`. The checksum includes `{name, version, ctx}`. Bump version when behavior or data shapes change.

## Notes

- This module does not modify migrations or existing seeds. It relies on existing reference data (countries, currencies, banks, COA templates).
- Execute only after running DB migrations.

## Extending

- Add a new country/type/company by appending to `config/scenarios.json`.
- Add a new data domain by adding a new step file, registering it in `engine/runner.ts`, and rerunning `add --step <new-step>`.
- For realistic bank transactions, implement `steps/040_bank_transactions.ts` to generate and insert partition-aware rows.

## Progress Reporting

- The CLI prints a concise progress line per step: `✓ <step> [done/total]`.
- It also prints a scenario header and an overall target summary.

## Typing & Safety

- Stronger typing for seed context (country, type, companyShortCode, userEmail, IDs).
- Steps consume a typed context to reduce `any` usage and improve readability.

## Troubleshooting

- “Company or user not found” on contacts/projects: ensure the base step ran (apply or add --step base) and migrations are up to date.
- “No banks found for country”: verify `migrations/data/banks.json` contains banks for the scenario’s country.
- Purge didn’t remove everything: purge is artifact-driven; ensure operations were applied via this toolkit.
