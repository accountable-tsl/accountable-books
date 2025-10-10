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
Notes: these rows remain in native currency; reporting-currency views convert on read using the snapshot day’s FX rate. If GL needs the bank balance, use the COA linked to the bank account.

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
- Bank balances are display/reconciliation only. If a reporting-currency figure is needed for UI, compute on read using the snapshot day’s rate; do not persist it in GL.

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
