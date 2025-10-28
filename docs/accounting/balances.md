Goals

- Fast reads for balances (“as of now”).
- Accurate historical balances (daily, monthly, quarterly, yearly).
- Support soft-deletes and backfills.
- Keep logic auditable and simple.

Tables
GL balances (authoritative)

- gl_current_balances (company_id, coa_id, as_of_time, reporting_currency_balance)
- gl_daily_balance_snapshots (company_id, coa_id, day, reporting_currency_balance)

PK = (company_id, coa_id, day). Reporting currency is implied by company.
Source of truth: ledger_entries JOIN coa JOIN companies WHERE ledger_entries.is_deleted=false. (We could also join ledger_transactions join companies instead... not sure which is better)
Notes: ledger_entries.amount is already stored in reporting currency; the worker only needs to roll sums forward.

Bank display balances (native, non-GL)

- bank_account_current_native_balances(company_id, bank_account_id, as_of_time, native_balance)
- bank_account_daily_native_snapshots(company_id, bank_account_id, day, native_balance)

PK = (company_id, bank_account_id, day). Native currency comes from bank_accounts.currency_id.
Source of truth: bank_transactions JOIN bank_accounts JOIN companies WHERE bank_transactions.is_deleted=false.
Notes: these rows remain in native currency; reporting-currency views convert on read using the snapshot day's FX rate. If GL needs the bank balance, use the COA linked to the bank account.

Fiscal period management

- fiscal_calendar (company_id, fiscal_year, period_number, period_type, start_date, end_date, status, closed_at, closed_by_id)
- gl_period_balances (company_id, coa_id, fiscal_year, fiscal_period, period_type, period_start_date, period_end_date, opening_balance, period_debits, period_credits, closing_balance, transaction_count)

PK = (company_id, fiscal_year, period_number, period_type) for fiscal_calendar.
PK = (company_id, coa_id, fiscal_year, fiscal_period, period_type) for gl_period_balances.
Notes: Period balances are automatically aggregated from daily snapshots during balance recalculation. Used for fast trial balance and financial statement generation.

Write Path

- Enqueue
  - On ingest, backfill, or soft-delete:
    - Resolve company context (company_id, default_timezone, reporting_currency_id).
      - GL: join ledger_entries → coa → companies; pull ledger_transactions.date for the affected ledger entries.
      - Bank: join bank_transactions → bank_accounts → companies (fall back to bank_transaction_batches for lookup as needed - this fallback should almost never be needed).
    - Derive earliest affected timestamps per key:
      - GL: t0_gl = MIN(ledger_transactions.date) for the (company_id, coa_id) set.
      - Bank: t0_bank = MIN(bank_transactions.txn_at) for each (company_id, bank_account_id).
    - Enqueue one job per key with recalc*from = t0*\* (earliest local day boundary).

- Worker (never fetches fx rates)
  - GL Pipeline
    - Start from the latest gl_daily_balance_snapshots row before t0_gl (or zero opening balance).
    - Scan ledger_entries joined to ledger_transactions for the (company_id, coa_id) pair in (t_snapshot, now], WHERE ledger_entries.is_deleted=false.
    - Order by (ledger_transactions.date, ledger_entries.created_at, ledger_entries.id).
    - Bucket days using (ledger_transactions.date AT TIME ZONE company.default_timezone)::date; roll balances forward in reporting currency.
    - Upsert:
      - gl_daily_balance_snapshots for each finished day.
      - gl_current_balances for the latest totals
    - Period Aggregation:
      - Ensure fiscal periods exist for affected months
      - Aggregate daily snapshots to gl_period_balances for each affected period
      - Calculate opening balance, period debits/credits, closing balance, and transaction count
  - Bank Pipeline (native, non-GL)
    - Start from the latest bank_daily_native_snapshots row before t0_bank (or zero opening balance).
    - Scan bank_transactions joined to bank_accounts for the (company_id, bank_account_id) pair in (t_snapshot, now], WHERE bank_transactions.is_deleted=false.
    - Order by (txn_at, bank_transactions.created_at, bank_transactions.id).
    - Bucket days using (txn_at AT TIME ZONE company.default_timezone)::date; roll native balances forward without FX conversion.
    - Upsert:
      - bank_daily_native_snapshots for each finished day
      - bank_current_native_balances for the latest totals

Read Path

- Financial statements read GL tables only.
- Bank balances are display/reconciliation only. If a reporting-currency figure is needed for UI, compute on read using the snapshot day's rate; do not persist it in GL.
- Period-based reports (trial balance, financial statements) use gl_period_balances for fast aggregation.
- Fiscal period management provides period status and audit trail for period closures.

End-of-Day Definition

- Day = company IANA timezone.
- GL: bucket by (ledger_transactions.date AT TIME ZONE company.default_timezone)::date.
- Bank: bucket by (bank_transactions.txn_at AT TIME ZONE company.default_timezone)::date.
- Deterministic ordering:
  - GL: (ledger_transactions.date, ledger_entries.created_at, ledger_entries.id)
  - Bank: (bank_transactions.txn_at, bank_transactions.created_at, bank_transactions.id)

Invariants

- No FX conversion inside the worker.
- Company context (company_id, default_timezone, reporting_currency_id) must always be resolved via joins before processing.
- GL snapshots always equal the sum of posted reporting-currency lines for that COA and period.
- Bank snapshots stay in native currency and never feed GL directly; use the linked COA for GL balances.
- Ensure queue deduplication

Indexes

- Use existing live indexes to drive the scans:
  - ledger_entries (is_deleted, coa_id, fs_date DESC)
  - bank_transactions (is_deleted, bank_account_id, date DESC)
- PKs on both snapshot tables as defined above.
- fiscal_calendar: (company_id, start_date, end_date) for date lookups
- gl_period_balances: (company_id, fiscal_year, fiscal_period, period_type) for period-based queries

---

## Complete Guide to Balances & Fiscal Calendar System

## The Problem We're Solving

Imagine you're running an accounting system with thousands of transactions. Every time someone asks "What's the balance of account X?", you could:

1. **Sum all transactions** - Slow, especially with millions of transactions
2. **Cache the balance** - Fast, but what happens when transactions change?
3. **Use snapshots** - Fast reads, but how do you keep them accurate?

Our system solves this with a hybrid approach: **live balances for speed** + **historical snapshots for accuracy** + **fiscal periods for reporting**.

## The Core Concept

We maintain **6 balance tables** that work together:

### Bank Account Balances (Bank Transactions & Display Only)

- `bank_account_current_native_balances` - Latest balance right now (in native currency like USD, NGN)
- `bank_account_daily_native_snapshots` - End-of-day balances for each day

### GL Account Balances (Authoritative, Actual Reporting Ledgers)

- `gl_current_balances` - Latest balance right now (in reporting currency)
- `gl_daily_balance_snapshots` - End-of-day balances for each day

### Fiscal Period Management

- `fiscal_calendar` - Defines accounting periods (monthly, quarterly, yearly)
- `gl_period_balances` - Aggregated balances by fiscal period for fast reporting

## How It All Works Together

### 1. When a Transaction Happens

```
New Transaction → Trigger Balance Recalc → Update All Tables
```

**Step-by-step:**

1. **Transaction Added**: Bank transaction or ledger entry is created
2. **Find Affected Accounts**: System identifies which accounts need recalculation
3. **Queue Job**: One recalculation job per account (with deduplication)
4. **Worker Processes**:
   - Recalculates daily snapshots from the earliest affected date
   - Updates current balances
   - Creates/updates fiscal periods
   - Aggregates daily snapshots to period balances

### 2. The Recalculation Process

**For GL Accounts:**

```
Start from last snapshot → Scan all transactions → Roll forward day by day → Update snapshots + current balance + period balances
```

**For Bank Accounts:**

```
Start from last snapshot → Scan all transactions → Roll forward day by day → Update snapshots + current balance
```

**Key Details:**

- **Timezone Handling**: All stored in UTC, but daily bucketing uses company's timezone
- **Deterministic Order**: Transactions processed in `(date, created_at, id)` order
- **Soft Deletes**: Only processes `is_deleted = false` transactions
- **Period Aggregation**: Daily snapshots automatically aggregated to period balances

### 3. Reading Balances

**Real-time Queries**: Read from `*_current_balances` tables
**Historical Reports**: Read from `*_daily_balance_snapshots` tables  
**Period Reports**: Read from `gl_period_balances` tables

## Fiscal Calendar System

### What Are Fiscal Periods?

Fiscal periods are accounting time periods (months, quarters, years) that provide structure for financial reporting. Think of them as "buckets" for organizing financial data.

### How Periods Work

**Automatic Creation:**

- Periods are created automatically during balance recalculation
- If a transaction falls in a month that doesn't have a period, one is created
- Periods are created with status "open" by default

**Period Status:**

- **Open**: Can receive new transactions
- **Closed**: Cannot receive new transactions (locked for reporting)
- **Locked**: Additional security layer (future feature)

**Period Management:**

- **Close Period**: Prevents new transactions, validates all data is complete
- **Reopen Period**: Allows new transactions, requires authorization and reason
- **Audit Trail**: All period changes are logged with user and timestamp

### Period Balance Aggregation

When daily snapshots are recalculated, they're automatically aggregated to period balances:

```
Daily Snapshots → Period Aggregation → Period Balances
```

**What Gets Aggregated:**

- Opening balance (first day of period)
- Period debits (sum of all debits in period)
- Period credits (sum of all credits in period)
- Closing balance (last day of period)
- Transaction count (total transactions in period)

## Currency & FX Handling

### GL Balances (Authoritative)

- Always stored in company's reporting currency (USD for US, NGN for Nigeria)
- No FX conversion in balance worker - amounts already in reporting currency
- Used for all financial statements and official reporting

### Bank Balances (Display Only)

- Stored in native currency (USD, NGN, etc.)
- FX conversion happens on-read when displaying in reporting currency
- Used for bank reconciliation and display purposes only
- If GL balance needed, use the COA account linked to the bank account

## Key Features & Why They Matter

### Deduplication

- Only one balance recalculation job per account at a time
- Jobs identified by `company_id + account_id` combination
- If new job queued while another running, merges with earlier `recalcFrom` date
- **Why**: Prevents duplicate work and ensures consistency

### Deterministic Ordering

- Transactions processed in consistent order: `(date, created_at, id)`
- Ensures identical results every time, even with concurrent updates
- **Why**: Guarantees reproducible results for audit purposes

### Soft Delete Support

- Only processes transactions where `is_deleted = false`
- Recalculation handles deleted transactions by excluding them
- **Why**: Maintains data integrity while allowing transaction corrections

### Period Balance Aggregation

- Daily snapshots automatically aggregated to period balances
- Includes opening balance, period debits/credits, closing balance, transaction count
- Supports monthly, quarterly, yearly period types
- **Why**: Fast trial balance and financial statement generation

### Fiscal Period Management

- Automatic period creation during balance recalculation
- Period status tracking with audit trail
- Period validation prevents closing with pending transactions
- Period reopening with proper authorization and reason tracking
- **Why**: Ensures proper accounting controls and audit compliance

## The Complete Data Flow

### From Transaction to Report

```
1. Transaction Created
   ↓
2. Balance Recalculation Triggered
   ↓
3. Job Queued (with deduplication)
   ↓
4. Worker Processes:
   - Updates daily snapshots
   - Updates current balances
   - Creates/updates fiscal periods
   - Aggregates to period balances
   ↓
5. Report Generation:
   - Real-time: Read current balances
   - Historical: Read daily snapshots
   - Period-based: Read period balances
```

### Error Handling & Recovery

**Job Failures:**

- Jobs can be retried automatically
- Failed jobs can be manually triggered
- System logs all failures for investigation

**Data Corruption:**

- Period balances can be recalculated from daily snapshots
- Daily snapshots can be recalculated from transactions
- Complete audit trail for all changes

**Period Issues:**

- Periods can be reopened with proper authorization
- All period changes are logged with user and reason
- Validation prevents invalid period operations

## API Endpoints

### Balance Operations

- `GET /api/balances/current` - Get current balances
- `GET /api/balances/historical` - Get historical balances
- `POST /api/balances/recalculate` - Trigger balance recalculation

### Fiscal Period Management

- `GET /api/balances/fiscal-periods` - List fiscal periods
- `POST /api/balances/fiscal-periods/close` - Close a fiscal period
- `POST /api/balances/fiscal-periods/reopen` - Reopen a closed period

### Reporting

- `GET /api/balances/trial-balance` - Get trial balance for period
- `GET /api/balances/period-balances` - Get period balances

## Performance & Scalability

### Why This Design Works

**Speed**: Reading from `*_current_balances` avoids scanning large transaction tables
**Accuracy**: Daily snapshots keep history exact and auditable
**Resilience**: When data changes, only recompute from earliest affected date
**Reporting-ready**: Financial statements query daily snapshots by period end
**Period Performance**: Period balances provide fast trial balance generation
**Audit Trail**: Fiscal period management provides complete audit trail
**Extensible**: Can add per-account timezones or more granular FX handling

### Database Indexes

**For Performance:**

- `ledger_entries (is_deleted, coa_id, fs_date DESC)` - Fast transaction scanning
- `bank_transactions (is_deleted, bank_account_id, date DESC)` - Fast transaction scanning
- `fiscal_calendar (company_id, start_date, end_date)` - Fast period lookups
- `gl_period_balances (company_id, fiscal_year, fiscal_period, period_type)` - Fast period queries

## Common Scenarios

### Scenario 1: New Transaction Added

1. Transaction created in database
2. System identifies affected accounts
3. Balance recalculation jobs queued
4. Workers recalculate balances from earliest affected date
5. Daily snapshots, current balances, and period balances updated
6. Reports can now read updated balances

### Scenario 2: Transaction Deleted (Soft Delete)

1. Transaction marked as `is_deleted = true`
2. System identifies affected accounts
3. Balance recalculation jobs queued
4. Workers recalculate balances, excluding deleted transaction
5. All balance tables updated to reflect deletion
6. Reports show corrected balances

### Scenario 3: Period Closing

1. User requests to close a fiscal period
2. System validates period can be closed (no pending transactions)
3. Period status changed to "closed"
4. New transactions cannot be added to closed period
5. Period can be reopened with proper authorization

### Scenario 4: Balance Recalculation

1. User triggers manual balance recalculation
2. System identifies all accounts needing recalculation
3. Jobs queued for each account
4. Workers process jobs, updating all balance tables
5. System ready for reporting with accurate balances

## Troubleshooting

### Common Issues

**Balance Discrepancies:**

- Check if transactions are properly posted
- Verify timezone settings for company
- Check for soft-deleted transactions
- Trigger manual balance recalculation

**Period Issues:**

- Verify period exists for transaction dates
- Check period status (open/closed)
- Validate period closing requirements
- Review audit trail for period changes

**Performance Issues:**

- Check database indexes
- Monitor job queue for bottlenecks
- Verify deduplication is working
- Check for long-running transactions

### Recovery Procedures

**Recalculate All Balances:**

- Trigger balance recalculation for all accounts
- Verify daily snapshots are accurate
- Check period balances are aggregated correctly
- Validate current balances match snapshots

**Fix Period Issues:**

- Recreate missing periods
- Correct period status if inconsistent
- Review audit trail for unauthorized changes
- Validate period closing requirements

## Key Takeaways

1. **Separation of Concerns**: Live balances for speed, snapshots for accuracy, periods for reporting
2. **Automatic Management**: System handles most complexity automatically
3. **Audit Trail**: Complete tracking of all changes and period management
4. **Performance**: Pre-aggregated data for fast reporting
5. **Flexibility**: Supports different currencies, timezones, and period types
6. **Reliability**: Handles failures gracefully with retry mechanisms

The system is designed for **accuracy**, **performance**, and **auditability**. Always consider these three aspects when making changes or additions.

Notes to self
GL balances write these tables - gl_current_balances, gl_daily_balance_snapshots, gl_period_balances, fiscal_calendar; queries - coa, ledger_transactions, ledger_entries.
We should only enqueue GL balance jobs from ledger models. No need for opening balance management for them (until we create conversion balance feature)
