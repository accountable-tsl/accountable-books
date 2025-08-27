# Demo Seeds

Idempotent demo seeding system for 6 companies (3 US, 3 Nigeria) with comprehensive test coverage.

## Overview

- **Countries**: US and Nigeria
- **Company Types**: Individual, Business, Accounting Firm (per country)
- **Demo Companies**: bizDemoUS, firmDemoUS, indDemoUS, bizDemoNG, firmDemoNG, indDemoNG
- **Steps**: User → Companies → Chart-of-Accounts → Contacts → Projects → Bank Accounts

## Quick Start

From API directory:

```bash
# Create all demo data
tsx seeds/demo/cli.ts apply

# Target specific countries or types
tsx seeds/demo/cli.ts apply --country US
tsx seeds/demo/cli.ts apply --type business
tsx seeds/demo/cli.ts apply --company bizDemoUS

# Delete demo data
tsx seeds/demo/cli.ts reverse --country NG
tsx seeds/demo/cli.ts reverse --all

# Reset (delete + recreate)
tsx seeds/demo/cli.ts reset --type individual

# Show current status
tsx seeds/demo/cli.ts status
```

### Workspace Commands (from project root)

```bash
pnpm demo:apply --all
pnpm demo:apply --country US
pnpm demo:reverse --company bizDemoUS
pnpm demo:reset --type business
pnpm demo:status
```

## System Architecture

### Core Files

- **`cli.ts`** - Command-line interface with argument parsing
- **`engine/runner.ts`** - Orchestrates seed execution (apply/reverse/reset/status)
- **`engine/registry.ts`** - Step registry with dependency ordering
- **`shared/`** - Utilities, configuration, and caching
- **`config/`** - Individual seed modules (6 steps)

### Step Execution Order

1. **`001_users`** - Demo users for each company
2. **`002_companies`** - Company records with proper country/currency setup
3. **`003_coa`** - Chart of accounts for each company
4. **`010_contacts`** - Business contacts (customers, vendors, employees)
5. **`012_projects`** - Sample projects (business/firm specific)
6. **`015_bank_accounts`** - Bank accounts with linked COA entries

### Key Features

- **Idempotent** - Safe to re-run, checks for existing data
- **Transaction Safe** - All operations wrapped in database transactions
- **Filtered** - Target by country, company type, or specific companies
- **Reversible** - Clean deletion in proper dependency order
- **Tested** - 250+ tests across unit, integration, and functionality

## Configuration

### Demo Companies

| Company                 | Country | Type            | Short Code | Currency |
| ----------------------- | ------- | --------------- | ---------- | -------- |
| US Business Demo        | US      | business        | bizDemoUS  | USD      |
| US Accounting Firm Demo | US      | accounting_firm | firmDemoUS | USD      |
| US Individual Demo      | US      | individual      | indDemoUS  | USD      |
| NG Business Demo        | NG      | business        | bizDemoNG  | NGN      |
| NG Accounting Firm Demo | NG      | accounting_firm | firmDemoNG | NGN      |
| NG Individual Demo      | NG      | individual      | indDemoNG  | NGN      |

### Data Characteristics

- **Contacts**: Realistic contact data from JSON files (US/NG specific)
- **Projects**: Business vs Accounting Firm specific projects
- **Bank Accounts**: Country-specific banks, proper account number formats
- **COA**: Standard chart of accounts for each company type

## CLI Commands

### apply

Creates demo data for specified targets.

```bash
tsx seeds/demo/cli.ts apply [--country US,NG] [--type business,individual,accounting_firm] [--company shortCode]
```

### reverse

Deletes demo data in reverse dependency order.

```bash
tsx seeds/demo/cli.ts reverse [filters...]
```

### reset

Combines reverse + apply for clean recreation.

```bash
tsx seeds/demo/cli.ts reset [filters...]
```

### status

Shows current demo data counts.

```bash
tsx seeds/demo/cli.ts status
```

## Development

### Adding New Steps

1. Create new config directory: `config/0XX_stepname/`
2. Implement: `stepname.fn.ts` (create/delete functions)
3. Add to registry: `engine/registry.ts`
4. Create tests: `stepname.test.ts`

### Test Coverage

- **253+ tests** across all modules
- **Unit tests** for each seed function (87 tests)
- **Integration tests** for orchestration (30+ tests)
- **Shared utility tests** (114+ tests)
- **100% pass rate** with comprehensive mocking

### Running Tests

```bash
# All demo seed tests
pnpm test seeds/demo/

# Specific modules
pnpm test seeds/demo/config/001_users/
pnpm test seeds/demo/engine/runner.test.ts
```

## Database Safety

- All operations use transactions with automatic rollback on error
- Idempotent operations check for existing data before insertion
- Proper foreign key dependency ordering for creation/deletion
- No data pollution between test runs

## Troubleshooting

- **"Demo user not found"**: Ensure users step completed successfully
- **Foreign key violations**: Run steps in order (apply handles this automatically)
- **"Company already exists"**: Normal idempotent behavior, data is not duplicated
- **Bank/currency not found**: Verify migrations have populated reference data

This system provides a solid foundation for demo environments with realistic, consistent data across both US and Nigerian markets.
