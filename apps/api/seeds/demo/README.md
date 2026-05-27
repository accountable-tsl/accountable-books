# Demo Seeds

Idempotent demo seeding system for 6 companies (3 US, 3 Nigeria) with comprehensive test coverage.

## Overview

- **Countries**: US and Nigeria
- **Company Types**: Individual, Business, Accounting Firm (per country)
- **Demo Companies**: bizDemoUS, firmDemoUS, indDemoUS, bizDemoNG, firmDemoNG, indDemoNG
- **Steps**: User → Companies → Chart-of-Accounts → Contacts → Projects → Bank Accounts → Bank Transactions → Journals

## Quick Start

From API directory:

```bash
# Create all demo data
tsx seeds/demo/cli.ts apply

# Target specific countries or types
tsx seeds/demo/cli.ts apply --country US
tsx seeds/demo/cli.ts apply --type business
tsx seeds/demo/cli.ts apply --company bizDemoUS

# Apply without bank transactions (faster setup)
tsx seeds/demo/cli.ts apply --exclude bank-transactions

# Delete demo data
tsx seeds/demo/cli.ts reverse --country NG
tsx seeds/demo/cli.ts reverse --all

# Reset (delete + recreate)
tsx seeds/demo/cli.ts reset --type individual

# Show current status
tsx seeds/demo/cli.ts status
```

### Queue Operations During Seeding

By default, queue operations (balance recalculation, enrichment, ML prediction, etc.) are **disabled** during seeding to:

- Speed up seed execution
- Prevent unnecessary async processing
- Avoid Redis clutter

To enable queues during seeding:

```bash
DISABLE_QUEUES=false tsx seeds/demo/cli.ts apply
```

Queue operations will be logged when skipped (you'll see a warning message).

### Workspace Commands (from project root)

```bash
pnpm demo:apply --all
pnpm demo:apply --country US
pnpm demo:apply:basic              # Apply without bank transactions
pnpm demo:reverse --company bizDemoUS
pnpm demo:reset --type business
pnpm demo:status
```

Or use Makefile targets:

```bash
make demo              # Apply all demo data
make demo-basic        # Apply without bank transactions
make demo-status       # Show status
make demo-reverse      # Remove demo data
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
7. **`016_bank_transactions`** - Synthetic bank transactions per company/account
8. **`020_journals`** - Manual journal batches + recurring templates (seeded via domain commands)

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
tsx seeds/demo/cli.ts apply [--country US,NG] [--type business,individual,accounting_firm] [--company shortCode] [--exclude step1,step2] [--steps step1,step2]
```

**Options:**

- `--country`: Filter by country codes (US, NG)
- `--type`: Filter by company types
- `--company`: Filter by company short codes
- `--steps`: Only run specific steps (e.g., `--steps user,companies`)
- `--exclude`: Exclude specific steps from execution (e.g., `--exclude bank-transactions`)
- `--parallel`: Run steps in parallel (dangerous, may break dependencies)
- `--dry-run`: Show what would happen without executing

**Examples:**

```bash
# Apply all demo data
tsx seeds/demo/cli.ts apply

# Apply without bank transactions (faster)
tsx seeds/demo/cli.ts apply --exclude bank-transactions

# Apply only specific steps
tsx seeds/demo/cli.ts apply --steps user,companies,contacts

# Combine filters and exclusions
tsx seeds/demo/cli.ts apply --country US --exclude bank-transactions
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

## Convenience Scripts

For faster setup when bank transactions aren't needed, use these convenience scripts:

**From API directory:**

```bash
pnpm demo:apply:basic              # Apply all seeds except bank-transactions (local)
pnpm demo:apply:no-transactions    # Same as above
pnpm demo:apply:no-transactions:test  # Apply without transactions (test env)
```

**From project root:**

```bash
pnpm demo:apply:basic              # Apply without transactions
make demo-basic                    # Same as above via Makefile
```

These scripts are useful when:

- Testing UI features that don't require transaction data
- Faster seed application during development
- Setting up demo environments for non-transaction features

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
