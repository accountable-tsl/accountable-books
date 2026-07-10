# Payroll module (`apps/web-payroll/src/payroll`)

Nigeria payroll computation (PAYE, statutory deductions, scheduled deductions).

## Key files

| File                        | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `compute/compute-run.ts`    | Main computation entry — orchestrates a payroll run |
| `compute/compute-paye.ts`   | PAYE logic (cumulative/annualised method)           |
| `domain/payroll.schemas.ts` | Zod schemas and domain types                        |

Supporting compute helpers: `compute/resolve-settings.ts`, `compute/payroll-utils.ts`, `compute/extract-ytd.ts`.

## Domain terms

See [payroll glossary](../../docs/payroll-glossary.md) for bucket definitions (statutory, deductions, employer contributions).

## Run / test

From `apps/web-payroll`:

```bash
pnpm dev
pnpm test
```

Monorepo setup: [docs/local-dev.md](../../../../docs/local-dev.md).
