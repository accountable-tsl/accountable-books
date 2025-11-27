# bank_transaction_contact_stats – Issues & Remediation Plan

Last updated: 2025-11-?? (backfill design review)

This note consolidates the problems we have uncovered in the current contact stats pipeline and outlines a remediation plan. File locations below refer to the API app unless otherwise stated.

---

## Confirmed Problems

### Problem 1 – Stats reference without snapshot

- **Source:** `enrichment.service.ts:247-256`
- **Issue:** `historical.bank_contact_stats` stores `{ id, version }` instead of the actual stats payload. The `id` is currently the company ID placeholder rather than the stats row. Because `bank_transaction_contact_stats` is mutable, the reference drifts and deterministic replay is lost.
- **Impact:** Replay, ML training, and audit trails cannot reconstruct the exact feature vector used during enrichment.
- **Fix outline:** Capture the numeric metrics (totals, rolling windows, last txn etc.) in the enriched payload itself. Store `stats_row_id`, `captured_at`, and `as_of_transaction_id` together with those values.

### Problem 2 – Circular dependency in rolling windows

- **Source:** `contactStats.service.ts:120-207`
- **Issue:** We fetch stats before persisting to `categorization_tasks`, but the rolling window recalculation happens after the upsert. Because the query reads from `categorization_tasks`, the transaction being processed appears in its own “history”.
- **Impact:** Off-by-one behaviour; features include information from the current transaction, inflating counts/totals and leaking future knowledge.
- **Fix outline:** Stop querying `categorization_tasks` for rolling windows. Either (a) compute deltas strictly from the stats contribution log (see Problem 9 fix), or (b) calculate windows from `bank_transactions` / contribution table within the same transaction using `bt.date < current_date` (plus tie breaker on ID) so the current row is excluded.

### Problem 3 – No idempotency guard on re-enrichment

- **Source:** `enrichment.worker.ts:232-268`
- **Issue:** We always overwrite `categorization_tasks` even if the checksum matches the existing payload and the stats snapshot is identical.
- **Impact:** Duplicate work, noisy audit history, and risk of unnecessary stats churn when the same job is retried.
- **Fix outline:** Persist a checksum column (already computed) and short-circuit when nothing changed. Pair with Problem 4’s transaction so that stats are not re-applied accidentally.

### Problem 4 – Stats update not atomic with enrichment

- **Source:** `enrichment.worker.ts:204-223` & `contactStats.service.ts`
- **Issue:** We upsert to `categorization_tasks`, then call `incrementContactStats` as a separate DB interaction. If either step fails, the other is committed.
- **Impact:** Orphaned snapshots or stats out of sync with persisted payloads.
- **Fix outline:** Wrap enrichment persistence, snapshot capture, stats increment, and checksum logic inside a single database transaction (`knex.transaction`). Roll back the entire unit on failure.

### Problem 5 – Rolling window query lacks upper bound

- **Source:** `contactStats.service.ts:276-296`
- **Issue:** `WHERE bt.date >= windowStart` without an `<= currentTransactionDate`. When backfilling older transactions the query includes future data.
- **Impact:** July transactions include November values; determinism breaks.
- **Fix outline:** Parameterise an `asOfDate` (and tie-breaker ID) and filter `windowStart <= bt.date < asOfDate` (or ≤ with ID guard).

### Problem 6 – No deterministic ordering inside a batch

- **Source:** `enrichment.worker.ts:164-205`
- **Issue:** The worker loops over `bankTransactionIds` in whatever order the job provides (usually insertion order). Stats updates occur after each transaction, so order affects results.
- **Impact:** Same batch replayed in different order yields different stats snapshots.
- **Fix outline:** Sort the batch before processing: first by `transaction_date`, then by `bank_transaction_id`. If we want to keep queue order for latency reasons, we must at least sort synchronously inside the job after fetching base data.

### Problem 7 – No “as-of” enrichment for historical data

- **Observation:** The pipeline assumes real-time ingestion. Backfilled July 2025 transactions read November 2025 stats because we have no way to roll the stats table back.
- **Impact:** Historical enrichment is non-deterministic; audit trails fail for replays/backfills.
- **Fix outline:** Introduce an “as-of replay” path: when inserting historical data, gather the earliest affected date per contact, rebuild stats and snapshots chronologically from that date forward, and swap the rebuilt aggregates back in atomically (see remediation plan).

### Problem 8 – Stats updates interleaved with batch enrichment

- **Observation:** Within the same job, stats are updated after each transaction, so later transactions see earlier ones within that batch even if they share the same `transaction_date`.
- **Impact:** Depending on deterministic ordering (Problem 6), stats vary within the batch. We need an explicit policy.
- **Fix outline:** Same as Problem 6—process in chronological order and document that “pre-update snapshot before current transaction” is the invariant. If we need slice-wide consistency, buffer updates and apply them after the batch (requires deeper redesign).

### Problem 9 – Rolling windows depend on enriched data

- **Source:** `contactStats.service.ts:276-296`
- **Issue:** Rolling window computation joins `categorization_tasks`, meaning we can’t compute stats until enrichment succeeded, and re-enrichment modifies the underlying data the stats depend on.
- **Impact:** Missing enrichment rows → missing stats; circular dependency with Problem 2; difficult to run stats in isolation.
- **Fix outline:** Track per-transaction contributions in a dedicated table (e.g. `bank_transaction_contact_stats_entries`) keyed by `transaction_id`. Rolling windows and totals should aggregate over that immutable log (filtered by `as_of`). Enrichment writes both the snapshot and the contribution in the same transaction.

### Problem 10 – No decrement logic on deletion

- **Source:** `contactStats.service.ts:224-255`
- **Issue:** `decrementContactStats` only logs; soft-deleting a transaction leaves stats inflated.
- **Impact:** Soft deletes, contact remaps, and replay truncations skew stats permanently.
- **Fix outline:** Implement true inverse operations. With the contribution table (Problem 9 fix) we can mark the entry as deleted and recompute aggregates in the same transaction. At minimum, mirror the increment logic with a subtraction and rolling-window recalculation.

---

## Additional Findings

1. **Incorrect `historical.bank_contact_stats.id`** – The enrichment service stores the company ID as the stat identifier (`enrichment.service.ts:248-255`) instead of the stats row ID. Even if we kept references, the wrong key would prevent lookups.
2. **Bad JSON path in rolling window query** – `ct.enriched_transaction->>'normalized'->>'contact_fingerprint'` (line 287) is invalid (`->>` returns text; chained `->>` fails). The query should use `ct.enriched_transaction->'normalized'->>'contact_fingerprint'`.
3. **`enrichment_version` column populated from undefined field** – `persistEnrichedTransaction` writes `enrichedTransaction.snapshot_version` (line 258) which doesn’t exist; the correct field is `enrichedTransaction.version`. Current rows likely store `NULL`.
4. **Stats fetch exposes mutable averages** – `getContactStats` returns averages/std-devs derived from mutable counts. Once we adopt snapshots, the caller should treat them as read-only and avoid recomputing derived metrics after mutation.

---

## Remediation Roadmap

The fixes above touch multiple components. We can stage the work to minimise risk.

### Phase 0 – Guardrails & Observability

1. **Telemetry:** Add structured logs around batch ordering, stats snapshots vs updates, and failures inside `incrementContactStats`.
2. **Feature flags:** Gate the new snapshot persistence behind an env flag so we can dual-write during migration.

### Phase 1 – Deterministic Snapshots & Ordering

1. **Sort batches by `(transaction_date, bank_transaction_id)` before enrichment (Problem 6 & 8).**
2. **Wrap enrichment + stats update inside a transaction with row-level locks (Problem 4).**
3. **Read stats row, clone the required fields, and embed them into `historical.bank_contact_stats_snapshot` before mutation (Problem 1).**
4. **Update persistence to use `enrichedTransaction.version` and store the checksum. Skip updates when the checksum hasn’t changed (Problem 3 & Additional 3).**

### Phase 2 – Contribution Log & Rolling Window Fixes

1. **Introduce `bank_transaction_contact_stats_entries`** (transaction_id, company_id, contact_fingerprint, contact_id, currency_code, amount_native_abs, amount_reporting_abs, transaction_date, is_deleted, created_at). Enrichment writes one entry per transaction inside the same DB transaction.
2. **Rewrite `incrementContactStats` to aggregate over the entries table with `WHERE transaction_date >= windowStart AND transaction_date < asOfDate` (Problem 2, 5, 9).**
3. **Fix the JSON path bug while migrating the query and ensure we add the missing upper bound (Additional 2).**
4. **Backfill entries for existing stats via a one-off script that replays transactions in chronological order per contact (prepares for Phase 3).**

### Phase 3 – Historical Backfill Support

1. **Implement “replay from date” helper** that, given `contact_id/fingerprint` and `start_date`, streams transactions in order, recalculates entries, stats, and snapshots, and swaps them in atomically (Problems 7 & 10).
2. **Wire deletion flow** to mark entries and recompute stats + snapshot within the same transaction (Problem 10).
3. **Augment lineage & notifications:**
   - Persist `stats_replay_seq`, `recomputed_at`, and `replay_reason` inside `categorization_tasks.metadata` (and optionally the snapshot block) so every transaction records how many times its context changed.
   - Emit `contact_stats_replays` (or similar) audit rows capturing `{contact_fingerprint, contact_id, start_date, end_date, triggered_by, old_snapshot_checksum, new_snapshot_checksum, completed_at}`.
   - Publish a `transaction.enriched.replayed` event (or reuse the existing event with `metadata.replay_seq > 0`) so downstream stages can invalidate or re-run categorization and alert users if ledger postings were based on stale stats.
4. **Document replay/backfill procedure** (trigger detection → isolate contact(s) → run replay helper → emit audit/event → resume enrichment).

### Phase 4 – Cleanup & Migration

1. **Deprecate the `{ id, version }` reference once everyone reads the inline snapshot.**
2. **Enable nightly reconciliation job (optional) that recomputes stats from entries to detect drift.**
3. **Update docs / runbooks** so the deterministic snapshot policy and historical replay flow are clear.

---

## Open Questions

1. **Snapshot payload scope:** Decide the minimal metric set we must persist (totals, rolling windows, std-devs, last transaction). Anything else can stay in the stats table to keep payload lean.
2. **Concurrency expectations:** If multiple enrichment workers can touch the same contact concurrently, we should acquire `FOR UPDATE` locks on the stats row when reading it for snapshotting.
3. **Deletion semantics:** Confirm whether soft-deleted transactions should disappear from history or remain marked but excluded from rolling windows (the latter keeps audit logs intact but avoids leaking amounts).

Answering these questions will let us finalise the schema changes and start implementation.
