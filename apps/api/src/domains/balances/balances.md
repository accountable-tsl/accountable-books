# Balances System

## Overview

The balances system keeps account balances accurate, fast to read, and easy to maintain as transactions are added, backfilled, or soft-deleted. We achieve this by separating live balances (for instant reads) from historical snapshots (for reporting and audit).

## Core Tables

We use six balance tables, two for bank accounts, two for ledger (COA) accounts, and two for fiscal period management:

### Bank Account Balances

- **`bank_account_current_native_balances`** – one row per bank account showing the latest balance as of now (in native currency)
- **`bank_account_daily_native_snapshots`** – one row per bank account per day with end-of-day balances (used for historical views and bank reconciliation)

### GL Account Balances

- **`gl_current_balances`** – one row per ledger account (COA) showing the latest balance as of now (in reporting currency)
- **`gl_daily_balance_snapshots`** – one row per ledger account per day for financial reporting (trial balance, balance sheet, etc.)

### Fiscal Period Management

- **`fiscal_calendar`** – defines fiscal periods (monthly, quarterly, yearly) with open/closed status
- **`gl_period_balances`** – aggregated balances by fiscal period for fast period-based reporting

## How It Works

### 1. Timezone Handling

- All timestamps are stored in UTC
- Each company has a `default_timezone` that defines how "days" are determined locally (e.g., `Africa/Lagos` or `America/New_York`)
- Daily snapshots are bucketed using the company's timezone: `(transaction_date AT TIME ZONE company.default_timezone)::date`

### 2. Updating Balances

Whenever new transactions are ingested, backfilled, or soft-deleted:

1. **Find earliest affected time**: We determine the earliest affected date (t0) for each account
2. **Enqueue recalculation job**: One job per account (company + account type + account id) with deduplication
3. **Roll-forward calculation**: The job:
   - Starts from the latest snapshot before t0 (or zero if none exists)
   - Scans all transactions from t0 to "now"
   - Rolls balances forward day by day
   - Updates both current balance and daily snapshots

### 3. Reading Balances

- **Real-time queries**: Read directly from `*_current_balances` tables for instant results
- **Historical reports**: Use `*_daily_balance_snapshots` tables for financial statements and period-based reporting
- **Period-based reports**: Use `gl_period_balances` for fast trial balance and financial statements by fiscal period

### 4. Fiscal Period Management

The system automatically manages fiscal periods and aggregates daily snapshots:

1. **Period Creation**: Fiscal periods are automatically created when needed during balance recalculation
2. **Period Aggregation**: Daily snapshots are automatically aggregated to period balances during recalculation
3. **Period Closing**: Periods can be closed to prevent further transactions, with validation rules
4. **Period Reopening**: Closed periods can be reopened with proper authorization and reason tracking

## Currency & FX Handling

### GL Balances (Authoritative)

- Always stored in the company's reporting currency (USD for US companies, NGN for Nigerian companies)
- No FX conversion happens in the balance worker - amounts are already in reporting currency
- Used for all financial statements and official reporting

### Bank Balances (Display Only)

- Stored in native currency (USD, NGN, etc.)
- FX conversion happens on-read when displaying in reporting currency
- Used for bank reconciliation and display purposes only
- If GL balance is needed, use the COA account linked to the bank account

## Key Features

### Deduplication

- Only one balance recalculation job per account at a time
- Jobs are identified by `company_id + account_id` combination
- If a new job is queued while another is running, it merges with the earlier `recalcFrom` date

### Deterministic Ordering

- Transactions are processed in consistent order: `(date, created_at, id)`
- Ensures identical results every time, even with concurrent updates

### Soft Delete Support

- Only processes transactions where `is_deleted = false`
- Recalculation handles deleted transactions by excluding them from the roll-forward

### Period Balance Aggregation

- Daily snapshots are automatically aggregated to period balances during recalculation
- Period balances include opening balance, period debits/credits, closing balance, and transaction count
- Supports monthly, quarterly, and yearly period types
- Period balances are used for fast trial balance and financial statement generation

### Fiscal Period Management

- **Automatic Period Creation**: Periods are created on-demand during balance recalculation
- **Period Status Tracking**: Open, closed, and locked states with audit trail
- **Period Validation**: Business rules prevent closing periods with pending transactions
- **Period Reopening**: Closed periods can be reopened with proper authorization and reason tracking

## Why This Design

- **Speed**: Reading from `*_current_balances` avoids scanning large transaction tables
- **Accuracy**: Daily snapshots keep history exact and auditable
- **Resilience**: When data changes (deletes, backfills), we only recompute from the earliest affected date
- **Reporting-ready**: Financial statements simply query daily snapshots by period end—no heavy aggregation needed at runtime
- **Period Performance**: Period balances provide fast trial balance and financial statement generation without real-time aggregation
- **Audit Trail**: Fiscal period management provides complete audit trail for period closures and reopenings
- **Extensible**: Can add per-account timezones or more granular FX handling without rewriting history

## Related Documentation

- [Main balances documentation](../../../../../docs/accounting/balances.md) - Detailed technical specification
- [Posting logic](../../../../../docs/accounting/posting-logic.md) - How transactions flow into the system

## Touchpoints

- **Transaction Processing**: Balances are triggered when adding bank transactions or making ledger entries
- **Period Management**: Fiscal periods are automatically created during balance recalculation
- **Period Aggregation**: Daily snapshots are automatically aggregated to period balances during recalculation
- **Period Closing**: Periods can be manually closed through the API with validation
- **Period Reopening**: Closed periods can be reopened with proper authorization and reason tracking
