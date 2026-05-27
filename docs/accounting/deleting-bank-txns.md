Deleting a Batch of Bank Transactions

Principle: GL is immutable. “Delete batch” means post reversing journals that nullify the batch. We soft-delete bank rows. We never recalc FX inside balances. Snapshots only re-sum posted facts.

What “Delete Batch” Does

- Soft-deletes the batch’s bank transactions.
- Inserts a reversing ledger_transaction with opposite ledger_entries for everything that batch posted.
- Updates fx_positions for any monetary lines touched.
- Posts small adjusting month-end revaluation entries only if prior posted month-ends are impacted.
- Rebuilds snapshots from the earliest affected dates.

What It Never Does

- Never delete posted GL for revaluations or settlements.
- Never edit historical rates on posted lines.
- Never convert currency inside the balance worker.
- Never post into locked periods unless policy allows “earliest open period.”

Inputs Collected

- Batch ID
- Company timezone
- Lock map (which periods are closed)

Derived:

- bank_rows = all rows in bank_transactions for the batch
- ledgers = all ledger_entries created from that batch (store and use source_batch_id)
- lots = DISTINCT fx_transaction_id from ledgers where is_monetary=true
- Earliest dates
  - t0_bank = MIN(txn_at) in bank_rows
  - t0_gl = MIN(fs_date) in ledgers

Procedure

1. Guardrails
   - If any ledgers.fs_date is locked, either block or post reversals in the earliest open period with a memo.
   - Prior-period equity adjustments are a separate admin flow only.

2. Bank mirror
   Soft-delete all bank_rows for the batch.

3. GL reversals
   - Create one reversing ledger_transaction.
   - Insert ledger_entries that are equal-and-opposite of the originals.
   - Date: original fs_date if open, else earliest open period.
   - Copy fields on each line: is_monetary, fx_transaction_id, rate_source, system_exchange_rate, custom_exchange_rate.
   - Memo: Auto-reversal of bank batch <batch_id>.

4. FX Positions. Choose one method:
   - Fast path (delta): for each reversed monetary line
     ```
         open_fx_amount       -= line.foreign_amount // sign-aware
         carrying_base_amount -= line.amount         // reporting currency
         if open_fx_amount == 0 => state='closed'
     ```
   - Safe path (rebuild): queue rebuild_fx_positions(company_id, from=t0_gl)

5. Month-end FX adjustments
   - If any posted month-end after t0_gl touched lots:
     - Compute carrying “as if the batch never existed.”
     - delta = should_be − posted
     - If delta ≠ 0: post a small adjusting revaluation dated at that month-end
     - If locked, use earliest open period with memo Prior-period FX true-up for <date>

6. Snapshots
   - Bank native (non-GL): rebuild bank_daily_native_snapshots from t0_bank. Recompute bank_current_native_balances from latest snapshot + today’s tail.
   - Ledger (GL): rebuild ledger_daily_balance_snapshots for all affected COAs from t0_gl. Recompute ledger_current_balances.

Day Boundaries and Ordering

- Day = company IANA timezone.
- Group by (fs_timestamp AT TIME ZONE company_tz)::date.
- Deterministic roll-forward order: (fs_timestamp, created_at, id).
  Cases are automatic:

Locked Period Policy

- Default: do not post into locked periods or past financial years unless explicitly asked to overwrite.
- Option: allow reversal in the earliest open period with a clear memo.
- Equity “opening balance” adjustments require explicit admin flow. Not default.

Audit Record
Who, when, batch id, count of bank rows soft-deleted, reversing ledger_transaction_id, count of reversed lines, lots touched, any reval adjustments, snapshot ranges rebuilt.

Result
Bank is corrected, GL is neutralized by reversals, FX positions are consistent, and balances align after snapshot rebuilds - without rewriting history.
