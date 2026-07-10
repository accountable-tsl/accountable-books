# Transaction Flow To Work Queue Build Map

> **Status:** Draft implementation map (Phases 0–4 implemented; Phase 5 partial)
> **Owner:** Product + Engineering
> **Purpose:** Source transactions → ledger → close checks → queue → activity → notifications.

This document is the implementable companion to [Transaction Work Story](./transaction-work-story.md) and [Work Items and Transaction Lifecycle](./work-items-and-transaction-lifecycle.md).

It is not only a work-items plan. It is the launch map from source transactions, to ledger facts, to close checks, to queue work, to activity history, to notifications.

The target state is written as a product/architecture invariant: this is how the system must behave before launch. Current reality is tagged explicitly so readers can tell what exists today, what is missing, and what is structurally risky.

## Scope

In scope:

- how bank transactions enter the system
- how journals enter the system
- how both sources create `ledger_transactions` and `ledger_entries`
- when categorization automation runs
- when close checks run
- when activity is recorded
- when notifications are created or delivered
- when work enters, changes, or leaves the firm queue

Out of scope:

- provider auth, link-token UX, and bank-connection setup details
- provider-specific transaction normalization internals
- the rule DSL and ML scoring internals
- tax, invoicing, payroll, and future module workflows
- detailed frontend layout for each workspace
- detailed notification template copy and marketing/email design

Those systems matter, but this document only describes their hand-off into transaction, ledger, close, activity, notification, and queue flows.

## Status Markers

- **Built today:** code or tables already exist.
- **Partial:** some durable foundation exists, but the full target behavior is not launch-complete.
- **TODO:** behavior we must add or change.
- **Gap:** expected target behavior does not exist yet.
- **Smell:** current behavior works but has architectural or product risk.
- **Risk:** current behavior can create stale data, duplicated truth, bad UX, or difficult debugging.
- **Decision:** product or architecture choice still needs an explicit owner.
- **Boundary:** a related system is referenced but deliberately not specified here.
- **End state:** target invariant for the flow; it is not proof that the behavior exists today.
- **Done:** behavior already changed during this launch-foundation work and remains in the register for traceability.

## Launch V1 Bar

The build phases later in this document are implementation order, not release cuts. The product should not launch until the transaction-to-work loop is complete enough that a firm can trust it daily.

Launch V1 must include:

- Work queue: grouped actionable rows, exact subjects underneath, assignment/visibility, action contract, and immediate removal when work is solved.
- Product activity: append-only user-meaningful activity events for imports, suggestions, postings, autoposts, journals, close decisions, approval, and close.
- Notifications: in-app and email-capable notification delivery for work that needs attention, assignment/reassignment, client/bank blockers, close approval, stale packages, and overdue/escalated work.
- Delivery backbone: transactional outbox for work materialization, activity, important notifications, and initial sync hand-off; after-commit helpers or outbox-backed helpers for derived rebuildable jobs.
- Categorization outcomes: candidate dispositions and fair comparison to final ledger facts.
- Bank transaction lifecycle: import/sync, enrichment/rules/ML hand-off, manual posting, autopost, late automation, provider modified/removed handling, and balance recalculation.
- Journal lifecycle: draft work, posting, reversal/void behavior, activity, and convergence into ledger/close checks.
- Close work: shared close finding projection, readiness consuming the same projection, queue work for actionable findings, close decisions, positive ready-to-close receipt, and stale-on-change approval flow.
- Manager/admin oversight: staff, manager, and owner views are projections over the same work subjects, not separate task systems.
- Recovery: sweeps/backstops that can repair missed derived work, stale queue state, and failed delivery attempts without asking users to repeat accounting actions.

Anything outside this list can still be high value, but it is not required for this launch story unless it becomes necessary to make one of the listed systems trustworthy.

## Known Gaps And Smells

This register is deliberately uncomfortable. It names the known issues exposed by the transaction-to-queue flow so we do not hide complexity inside optimistic prose.

| ID  | Marker   | Area                          | Current reality                                                                                                                                                                                                                                                                                                            | Target                                                                                                                                                                               |
| --- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Done     | Work queue                    | Phase 1 has `work_items` and `work_item_subjects` for grouped `categorize_transactions` work, with exact active subjects underneath each queue row.                                                                                                                                                                        | Queue audit events and additional work types can be added after the core projection works.                                                                                           |
| G2  | Done     | Materialization               | `materializeWork(scope)` exists for Phase 1 `bank_account` scopes and fails loudly for reserved future scopes until handlers ship.                                                                                                                                                                                         | Every source/candidate/ledger/close mutation reconciles work after commit as later phases add handlers.                                                                              |
| G3  | Smell    | Legacy tasks                  | Older task/workflow concepts still exist beside the target work-item model.                                                                                                                                                                                                                                                | One vocabulary and one materialized queue model own firm work.                                                                                                                       |
| G4  | Done     | Queue removal                 | Posting through `processCategorizationIntent()` writes a durable `work_materialization_requested` intent in the ledger transaction and runs fast materialization after commit, so solved `categorize` subjects leave the queue immediately.                                                                                | Every solving mutation reconciles its scope after commit as later phases add producers.                                                                                              |
| G5  | Done     | Activity                      | Phase 4 has append-only `activity_events` plus a durable `activity_event_requested` outbox intent for product-significant history.                                                                                                                                                                                         | Future wraps for bookkeepers, managers, and firm owners can read from product activity instead of the action queue.                                                                  |
| G6  | Done     | Import transaction            | `addNewBankTransactions()` now schedules balance recalculation and enrichment through after-commit helpers.                                                                                                                                                                                                                | Jobs that depend on committed facts stay outside the uncommitted save transaction.                                                                                                   |
| G7  | Smell    | Balance recalculation         | Bank balance recalculation is queued from `addNewBankTransactions()` and also from provider sync after successful sync. Queue dedupe/merge masks the ownership ambiguity.                                                                                                                                                  | One layer owns each balance recalc trigger; duplicates are still safe, but not relied on for correctness.                                                                            |
| G8  | Decision | Contact resolution            | Contact resolution currently runs inside the bank transaction save transaction and failures are swallowed/logged.                                                                                                                                                                                                          | We explicitly keep it synchronous or move it to an async contact-resolution job with clear failure handling.                                                                         |
| G9  | Gap      | Provider changes              | Provider `modified` and `removed` transactions do not trigger work materialization.                                                                                                                                                                                                                                        | Modified/removed source facts reconcile affected work, balances, and close/readiness state.                                                                                          |
| G10 | Done     | Candidate lifecycle           | Phase 3 records candidate lifecycle in append-only `categorization_candidate_dispositions`; `categorization_candidates.review_state` is only the narrow current-state switch (`pending_review`/`closed`).                                                                                                                  | Candidate dispositions become durable facts used by queue, learning, and audit.                                                                                                      |
| G11 | Done     | Suggestion outcomes           | Phase 3 records `categorization_candidate_outcomes` by comparing accounting-significant suggested facts to final ledger facts after manual post, supersede, autopost, and fair late-candidate cases.                                                                                                                       | We can answer whether the user accepted, edited, rejected, or independently matched our suggestion.                                                                                  |
| G12 | Done     | Late automation               | Phase 3 expires candidates whose source bank transaction is already posted, records disposition/outcome when comparable, and materializes from current facts so solved work is not recreated.                                                                                                                              | Late candidates never recreate solved work. Candidates produced after posting are expired with reason `source_already_posted`; comparison is stored only when it is fair.            |
| G13 | Done     | Autopost activity             | Autopost success now records `categorization_candidate_autoposted` activity through the transactional outbox.                                                                                                                                                                                                              | Autopost success is informational activity, not queue work, unless firm policy requires review.                                                                                      |
| G14 | Gap      | Candidate blockers            | Candidate validation failures do not have a crisp user-fixable vs system/operator-fixable path.                                                                                                                                                                                                                            | User-fixable candidate issues become `resolve_categorization_blocker`; system failures stay out of the bookkeeper queue.                                                             |
| G15 | Gap      | Queue actions                 | Queue-originated actions are not wired yet, so subject freshness is not yet used to distinguish stale UI projection from authoritative domain-state validation.                                                                                                                                                            | Domain facts and domain locks prevent invalid mutations; subject freshness is a UX stale-state guard that returns refetch/review prompts, not the source of correctness.             |
| G16 | Done     | Categorization mutation       | `processCategorizationIntent()` now records candidate rejection/manual post activity, candidate dispositions/outcomes, and queue materialization hand-offs in the same domain transaction.                                                                                                                                 | Manual/user categorization updates activity, outcomes, and queue state after commit.                                                                                                 |
| G17 | Gap      | Ledger write                  | `createLedgerRecord()` schedules balances and close signal eval, but does not record product activity or trigger work materialization.                                                                                                                                                                                     | Ledger writes update activity and reconcile source/period work after commit.                                                                                                         |
| G18 | Gap      | Close signal sync             | `syncLedgerTransactionSignals()` reconciles `close_review_signals` but does not trigger queue materialization.                                                                                                                                                                                                             | Signal changes reconcile close work for the affected period.                                                                                                                         |
| G19 | Gap      | Close projection              | Close rollups/native findings exist, but there is no named `closeFindingProjection(scope)` consumed by both readiness and queue.                                                                                                                                                                                           | Readiness and queue consume the same projection and cannot drift.                                                                                                                    |
| G20 | Smell    | Readiness vs queue            | Readiness/task code can represent close blockers separately from the target queue model.                                                                                                                                                                                                                                   | Readiness summarizes the same open-subject set; queue owns assignable work rows.                                                                                                     |
| G21 | Gap      | Draft journals                | Draft journal conditions exist in older task/readiness code, but not as exact work subjects.                                                                                                                                                                                                                               | Draft journals materialize `review_draft_journal:journal_batch:{id}`.                                                                                                                |
| G22 | Done     | Journal activity              | Journal create/update/void/post writes product activity through `activity_event_requested`.                                                                                                                                                                                                                                | Journal activity is recorded in `activity_events`.                                                                                                                                   |
| G23 | Gap      | Journal queue removal         | Posting/voiding/updating a draft journal does not reconcile firm queue work.                                                                                                                                                                                                                                               | Journal mutations trigger materialization for draft and period scopes.                                                                                                               |
| G24 | Done     | Manager/admin views           | The Phase 1 queue API projects staff, manager, and admin views from the same materialized `work_item_subjects`: staff see assigned/unassigned work, manager/admin see all open firm work.                                                                                                                                  | Later views keep using the same subjects as more work types land.                                                                                                                    |
| G25 | Done     | Transactional outbox/backstop | The durable transactional outbox handles `work_materialization_requested`, `activity_event_requested`, `notification_requested`, `notification_attention_resolved`, and `notification_comms_requested` intents. Bank import source rows and follow-up intents are written in the same transaction and kicked after commit. | Initial sync hand-off can reuse the same durable outbox pattern in a later phase.                                                                                                    |
| G26 | Gap      | Frontend queue                | Firm dashboard queue is still mock-oriented.                                                                                                                                                                                                                                                                               | Queue UI reads materialized work and routes users to exact destinations.                                                                                                             |
| G27 | Smell    | Sync schedule timezone        | `transactionSyncDailyScan` declares `tz: UTC` in the schedule registry, but `scheduleDailySyncScan()` currently receives only the cron pattern.                                                                                                                                                                            | The scheduler passes timezone explicitly, or the schedule docs stop claiming timezone behavior beyond the cron expression.                                                           |
| G28 | Smell    | Initial sync hand-off         | `connectBankAccounts()` queues initial transaction sync inside the bank-connection database transaction body.                                                                                                                                                                                                              | Initial sync is queued after commit or through an outbox so it cannot run for rolled-back connection facts.                                                                          |
| G29 | Done     | Materializer concurrency      | Materialization is serialized per `scope_key` with a DB advisory lock, outbox intents are debounced by scope, and subject ending/count/close operations happen in the same locked transaction.                                                                                                                             | Later phase handlers must use the same lock and count/close contract.                                                                                                                |
| G30 | Decision | Outbox vs BullMQ ownership    | Existing BullMQ queues already execute balance, enrichment, rules, ML, close signal, and sync jobs. A new outbox could accidentally create dual ownership if it directly overlaps those queues.                                                                                                                            | BullMQ remains the execution engine. The transactional outbox is the durable hand-off for effects that must survive process crashes. Each effect has one owner per path.             |
| G31 | Done     | Bank save after-commit        | `addNewBankTransactions()` schedules balance recalculation, enrichment, and the outbox dispatch kick through the shared after-commit helper, so rolled-back imports do not enqueue follow-up jobs.                                                                                                                         | Later decide whether any recoverable derived jobs need to graduate to durable outbox.                                                                                                |
| G32 | Partial  | Notifications                 | Phase 5 has in-app notification records, preferences, idempotency keys, notification outbox intents, comms delivery hand-off, and assigned-work notification/resolution from materialized work transitions. Broader launch notification producers are not wired yet.                                                       | Notification rules consume activity and work transitions, create in-app notifications and email deliveries where interruption is warranted, and stay separate from activity/history. |

## Primary Ledger Sources

There are two primary source families for ledger transactions in this app:

1. **Bank transactions**
   - Source tables: `bank_transaction_batches`, `bank_transactions`.
   - Categorization tables: `categorization_tasks`, `categorization_task_events`, `categorization_predictions`, `categorization_prediction_lines`, `categorization_candidates`, `categorization_candidate_lines`.
   - Ledger output: `ledger_transactions`, `ledger_entries`.

2. **Journals**
   - Source tables: `journal_batches`, `journal_entries`.
   - Ledger output: `ledger_transactions`, `ledger_entries`.
   - Opening balances, recurring journals, auto-reversals, and future plugin-generated adjustments must use the journal path when they create accounting entries.

All queue work must be derived from source facts, candidate facts, journal facts, ledger facts, close findings, connection facts, or period workflow facts. Queue rows must not become their own source of accounting truth.

## Global Rule

No user action directly completes a queue row.

The user changes the owning domain fact first. Then `materializeWork(scope)` reconciles the queue. If the fact no longer requires action, the work subject leaves the queue.

Examples:

- bank transaction posted -> `categorize:bank_transaction:{id}` ends
- candidate rejected -> `review_suggestion:categorization_candidate:{id}` ends; if the bank transaction is still unposted, `categorize:bank_transaction:{id}` is created
- draft journal posted -> `review_draft_journal:journal_batch:{id}` ends
- close decision recorded -> matching close finding subject ends while facts hash remains valid
- ledger facts changed -> close finding projection changes; old close work ends or new work appears

## Target Delivery Pattern

The target backbone is **domain facts + transactional outbox + targeted immediate materialization**.

Domain services own product meaning. They write the business fact and semantic follow-up intents in the same database transaction. Outbox workers process those intents only after commit.

The database owns invariants and safety:

- foreign keys
- uniqueness and idempotency constraints
- active `canonical_subject_key` uniqueness
- append-only guarantees for audit/activity/outbox tables
- basic timestamp/version maintenance

The database must not be the primary author of product activity or queue work. Product activity such as `bank_transaction_autoposted`, `journal_posted`, or `close_decision_recorded` needs domain context that row-level triggers do not naturally have.

Existing BullMQ queues remain the execution engine for background work. The transactional outbox is the durable hand-off for effects that cannot be lost between DB commit and queue enqueue.

Delivery spectrum:

| Effect                                                          | Target hand-off                                                                     | Why                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `work_materialization_requested`                                | Durable outbox required                                                             | Queue correctness and immediate UX depend on it.                                                  |
| `activity_event_requested`                                      | Durable outbox required                                                             | Product history and future wraps must not silently lose user-meaningful facts.                    |
| `transaction_sync_requested` after bank connection/reconnection | Durable outbox required                                                             | User just connected a bank; losing initial sync is visible and confusing.                         |
| `notification_requested`                                        | Durable outbox required for launch-critical notifications                           | Notification delivery needs retry and delivery status separate from activity.                     |
| `close_signal_eval_requested`                                   | Durable outbox or after-commit helper plus sweep                                    | Close findings are derived, but stale close work is user-visible.                                 |
| `bank_balance_recalc_requested` / `gl_balance_recalc_requested` | Existing after-commit BullMQ is acceptable; outbox optional for stricter durability | Balances are derived caches and can be refreshed by backfill/sweep.                               |
| `transaction_enrichment_requested`                              | Existing after-commit BullMQ is acceptable; outbox optional                         | Missed enrichment leaves manual categorization work visible and can be retried by sweep/backfill. |

Migration rule:

- Do not run direct enqueue and outbox enqueue for the same effect on the same path.
- During migration, each source path must declare its current owner: direct queue, after-commit helper, or durable outbox.
- Outbox processors can enqueue BullMQ jobs or execute small idempotent work directly.

For user-facing mutations where the queue must update immediately, the request path runs fast materialization after commit before returning. The outbox row still exists as a durable fallback if inline materialization fails or a later worker needs to retry.

Outbox processors must be idempotent. Duplicate, delayed, or retried intents must reconcile from current domain facts rather than replay assumptions from the original request.

End state:

- No queue job runs against rolled-back facts.
- Product activity is semantic, not a noisy table-change log.
- Solved work disappears quickly for the user.
- Failed follow-up work can retry without asking the user to repeat the action.
- Duplicate outbox intents do not create duplicate queue work or duplicate user-facing activity.
- A periodic sweep catches stale/open scopes if an outbox worker fails permanently.

## Materializer Concurrency Model

The materializer must be idempotent and serialized per scope.

Scope key examples:

- `company_period:{clientCompanyId}:{periodType}:{fiscalYear}:{periodNumber}`
- `bank_account:{clientCompanyId}:{bankAccountId}`
- `company:{clientCompanyId}`
- `firm:{firmCompanyId}`

Required concurrency rules:

1. Every `work_materialization_requested` intent carries a stable `scope_key`.
2. Pending outbox intents are debounced by `(intent_type, scope_key)`. A 100-transaction sync should coalesce into a small number of scope recomputes, not 100 independent materializer runs.
3. Before computing desired work, `materializeWork(scope)` acquires a DB advisory lock for `scope_key`.
4. The desired set is computed after the lock is acquired, from current domain facts.
5. Upsert desired subjects using the active unique constraint on `canonical_subject_key`.
6. End active subjects in the same scope that are no longer desired.
7. Recompute grouped work item counts from `work_item_subjects` inside the same transaction.
8. Close a grouped `work_item` only with a conditional update that confirms no active subjects remain.
9. If a new domain mutation lands while materialization is running, it writes another debounced intent and the scope is reconciled again after the current run.

Inline fast materialization and the outbox worker use the same lock. If an inline request cannot acquire the lock quickly, it returns success with a refetch/refresh hint and lets the outbox worker finish reconciliation.

### Materializer Concurrency Contract (Implemented — Phases 0/1)

This subsection records the contract as actually shipped in Phases 0 and 1, so later phases extend it rather than re-deriving it.

- **scope_key format.** Built by `buildScopeKey(scope)` in `apps/api/src/domains/work/work.types.ts`. The scope is a discriminated union (`bank_account` | `company_period` | `company` | `firm`); Phase 1 only emits/handles `bank_account:{clientCompanyId}:{bankAccountId}`. The other formats are reserved exactly as listed above so future producers reuse the same keys.
- **Debounce rule.** Pending intents are deduplicated by a partial unique index `outbox_intents_pending_scope_unique` on `app.outbox_intents (intent_type, scope_key) WHERE status = 'pending'`. `writeOutboxIntent()` upserts onto that pending row (latest payload wins; earliest `available_at` preserved), so a burst (e.g. a 100-transaction sync into one account) collapses to a single pending scope recompute. Once a row is no longer pending, a new pending row can be created for the next change.
- **Advisory-lock-per-scope rule.** Before computing desired work, `materializeWork(scope, trx)` takes a transaction-level advisory lock on `lockKeyMaterializerScope(scope_key)` (`materializer:{scope_key}`) via `tryAcquireAdvisoryXactLockWithBackoff` (bounded attempts, non-blocking). If it cannot acquire the lock it returns `{ status: 'deferred', refetch: true }` and does **not** touch the work tables; the outbox dispatcher leaves the intent pending (short backoff) so the in-flight holder's run plus a later retry fully reconcile the scope. The inline path and the outbox worker contend on the same lock.
- **Sibling-scope serialization.** Because Phase 1 groups subjects by `(client_company_id, effective_owner, destination_workspace)` — not by account — two different `bank_account` scopes of the same client map to the same `work_items.group_key`. The reconcile additionally find-or-creates that open row with `INSERT … ON CONFLICT (group_key) WHERE status='open' DO UPDATE … RETURNING id`, which row-locks the shared work item for the transaction, serializing sibling-account reconciles at the work-item grain even though they hold different advisory scope locks.
- **Grouped-row close-only-when-zero rule.** Subjects are ended per-account (a subject ends when its bank transaction is posted — `ledger_transaction_id IS NOT NULL` — or soft-deleted), the grouped `active_subject_count` is recomputed from `work_item_subjects` inside the locked transaction, and the row is closed only by a conditional `UPDATE … WHERE id=? AND status='open' AND active_subject_count=0`. A sibling account that still has unposted transactions keeps the shared row open.
- **Subject soft-delete semantics.** Active subject reads, active subject counts, and the canonical uniqueness check all ignore soft-deleted rows. The active uniqueness predicate is `WHERE status='active' AND is_deleted=false`, so a soft-deleted active-looking row does not appear in the queue and does not block recreation.
- **Idempotency.** Desired subjects are upserted on the active `work_item_subjects (canonical_subject_key) WHERE status='active' AND is_deleted=false` unique index, so re-running the materializer from the same domain facts produces the same active queue and never duplicates subjects. Correctness reads domain facts (`bank_transactions`) + domain locks only; the queue tables are never the source of accounting truth.
- **Unsupported scopes fail visibly.** Phase 1 keeps the reserved `scope_key` formats for `company_period`, `company`, and `firm`, but `materializeWork()` only handles `bank_account`. If a future producer emits one of those scopes before its handler ships, dispatch records a failed outbox attempt instead of marking the intent processed.
- **Queue visibility.** `GET /api/:companyId/work-queue` is gated by the existing `checkCompanyId` firm-workspace access check. Firm `admin` and `manager` viewers see all open firm work; firm `staff` viewers see rows assigned to them plus unassigned rows. `required_capabilities` remain response metadata until a real capability enforcement layer exists.

### Manual-Post Loop Contract (Implemented — Phase 2)

This subsection records the manual-categorization loop as shipped in Phase 2.

- **Shared intent helper.** Bank import and manual posting both write the bank-account materialization intent through `writeBankAccountWorkMaterializationIntent(trx, { clientCompanyId, bankAccountId, change? })` in `apps/api/src/domains/work/work-materialization-intent.ts`, so scope/payload construction cannot drift across producers.
- **Manual post.** `processCategorizationIntent()` writes one durable intent per affected bank account — only for newly-created postings (the `created` operation), since a metadata-only edit or supersession of an already-posted transaction changes no queue state, and a no-op post writes none — inside the same transaction as the ledger facts, and schedules the outbox dispatch kick after commit. On the model-owned-commit path it then runs `fastMaterializeBankAccountScopes()` after commit and returns `workMaterialization: { scopes: [{ scopeKey, status, refetch }] }`. Fast materialization never throws and never rolls back posted facts; a deferred/failed scope is surfaced as `refetch: true` and reconciled by the durable outbox worker. When a caller passes its own `trx`, only the durable intent + after-commit kick run (the inline pass needs committed facts).
- **Single owner per path (G30).** This is the manual-post materialization owner for now. When Phase D1 makes `createLedgerRecord` the materialization owner for all ledger writes, the categorization-side intent block must be removed so the effect is not double-owned.
- **Deep-link contract.** `GET /api/:companyId/categorization/transactions?workItemId=...` constrains the result to the work item's active, non-deleted subjects and ignores normal list filters, date range, and pagination. `getActiveWorkItemBankTransactionIds()` returns source bank transaction ids only when the work item exists, belongs to the requesting client company, is open, and is not soft-deleted; any mismatch returns empty (no cross-client leak). Solved subjects are already ended, so the page returns exactly the still-actionable set. This is routing/filtering only — posting correctness still validates domain facts under advisory locks, never queue subjects (G15).

### Candidate Review Work Contract (Implemented — Phase 3)

This subsection records the candidate-review model shipped in Phase 3.

- **Suggestion snapshot.** `categorization_candidates` and `categorization_candidate_lines` remain the immutable-ish suggestion snapshot: what the system suggested. The only current-state field on the candidate row is `review_state` (`pending_review` or `closed`).
- **Lifecycle history.** `categorization_candidate_dispositions` is append-only lifecycle history for created, ignored, replaced, rejected, posted, and source-already-posted expiry events.
- **Outcome comparison.** `categorization_candidate_outcomes` compares accounting-significant suggested facts to final ledger facts. It records accepted-as-suggested, posted-with-edits, independently-matched, different, or not-comparable outcomes.
- **Queue work.** A pending-review candidate changes the desired subject from `categorize:bank_transaction:{id}` to `review_suggestion:categorization_candidate:{id}`. Closing/rejecting the candidate ends review work; if the bank transaction remains unposted, plain categorize work is restored. Posting or autoposting the source leaves no work.
- **Single user action route.** User rejection and posting both go through `POST /api/:companyId/categorization/intents`. Rejection uses `action: 'reject_suggestion'`; posting keeps the ledger posting intent shape. The backend validates domain facts under bank-transaction locks and materializes from facts after the mutation.
- **Late/no-work behavior.** Candidates produced after the source bank transaction is already posted are closed with `expired_source_posted`, compared to the existing ledger facts when fair, and never recreate queue work.
- **Deep-link contract update.** The durable URL filter remains `workItemId`. Queue subjects now include optional `candidateId` metadata, while `getActiveWorkItemBankTransactionIds()` resolves both bank-transaction and candidate subjects to the source bank transaction ids for the categorization workspace.

### Notification Attention Contract (Partially Implemented — Phase 5)

This subsection records the notification foundation shipped in Phase 5 and the remaining boundary.

- **Attention state.** `notifications` stores the in-app feed/read/seen/resolved state. `notification_idempotency_keys` records one lifecycle effect per recipient/idempotency key so retries and duplicate outbox dispatches do not create duplicate user-facing notifications. `notification_preferences` stores user and company overrides; code owns launch defaults.
- **External delivery boundary.** `comms_deliveries` is the comms-owned delivery audit log for email and future channels. It is correlated to notifications by typed correlation (`{ source: 'notification', id }`) rather than a notification-shaped foreign key, so notification attention state and provider delivery attempts do not become the same table.
- **Outbox intents.** `notification_requested` creates or updates attention; `notification_attention_resolved` resolves active attention; `notification_comms_requested` hands external delivery to comms. All three are dispatched through the shared transactional outbox.
- **Work producers.** `materializeWork()` writes notification requests for newly assigned work, reassigned work, and material updates to assigned work. When assigned work closes, the materializer writes a notification-resolution intent so the user is routed to current state instead of stale attention.
- **Activity separation.** Normal product activity such as import counts and autopost success does not notify by default. Future notification rules may consume activity where attention is warranted, but activity remains history and notification remains interruption/attention management.
- **Remaining launch producers.** Bank reconnect/client action, client query response, close approval/rejection, stale approval package, overdue/escalated work, report failure/action-needed, and user-fixable sync/import failures still need explicit producers/rules.

## Canonical Subject Key

```ts
canonical_subject_key = `${required_action_intent}:${target_type}:${target_id}`;
```

The action intent is part of the key. One physical row can support more than one active subject only when the required action is genuinely different.

Examples:

- `categorize:bank_transaction:{bankTransactionId}`
- `review_suggestion:categorization_candidate:{candidateId}`
- `review_draft_journal:journal_batch:{journalBatchId}`
- `review_close_finding:period_finding:{fingerprint}`
- `close_ready_receipt:fiscal_period:{periodId}`

## A. Bank Transaction Entry

### A0. Bank Connection Hand-Off

Built today:

- Bank connection/reconnection is handled outside this document.
- `connectBankAccounts()` in `connect-accounts.service.ts` schedules an initial transaction sync through `scheduleTransactionSync()` when the provider supports transaction sync.
- Initial sync is queued as a `sync-transactions` job with a 5 second delay.
- The initial sync queue call currently happens inside the bank-connection database transaction body.
- Ongoing sync is handled by the daily scan, not by per-credential repeatable jobs.

Boundary:

- Provider connection setup and credential storage are not specified here.
- This document starts when a connected credential is ready to sync transactions.

TODO:

- Move initial sync scheduling behind transaction commit by writing a `transaction_sync_requested` outbox intent in the bank-connection transaction.

End state:

- A connected credential that supports transaction sync must have an initial sync job queued.

### A1. Provider Sync Finds Transactions

Built today:

- Schedule key: `transactionSyncDailyScan`.
- Default cron expression: `0 2 * * *`, configurable by `TRANSACTION_SYNC_CRON`.
- Schedule registry declares this scan as UTC, but the current `scheduleDailySyncScan()` hand-off only passes the cron expression.
- Scheduler: `scheduleDailySyncScan()` in `transaction-sync.queue.ts`.
- Worker: `transaction-sync.worker.ts`.
- Daily scan job: `daily-sync-scan`.
- The scan loads active credentials with `getAllActiveCredentials()` and enqueues one `sync-transactions` job per credential.
- Single credential sync calls `transactionSyncService.syncTransactionsForCredential()`.
- The sync service fetches provider transactions, processes `added`, `modified`, and `removed`, and updates credential sync cursor/timestamps only when the sync is safe to advance.

Built today for added transactions:

- `processAddedTransactions()` groups transactions by mapped bank account.
- Each account batch calls `addNewBankTransactions()`.

Built today for modified/removed transactions:

- Modified and removed provider transactions are processed by the sync service.
- Affected account date ranges are tracked for balance recalculation.

TODO:

- Provider `modified` and `removed` transactions must write `work_materialization_requested` for affected bank transactions/accounts/periods.
- Sync failures create operational telemetry and later admin-facing notification, not bookkeeper queue work unless the bookkeeper can fix the issue.
- Pass the schedule timezone through to BullMQ if the intended runtime invariant is "daily at 02:00 UTC."

End state:

- Added provider transactions are handed to the same save flow as manual imports.
- Modified/removed provider changes update derived balances and work state for affected scopes.

### A2. Manual Import Adds Transactions

Built today:

- Route: `POST /api/:companyId/bank-accounts/transactions/import`.
- Router/controller: `bankTransactions.routes.ts` and `bankTransactions.controller.ts`.
- Handler: `handleTransactionImport()`.
- Model function: `addNewBankTransactions()`.

End state:

- Manual imports and provider-added transactions converge at `addNewBankTransactions()`.

### A3. Save Batch And Source Rows

Built today:

- `addNewBankTransactions()` validates the request.
- It creates a `bank_transaction_batches` row.
- It inserts actual rows into `bank_transactions`.
- Transactions are batched so imports/syncs have a durable batch identity for audit, reversal, deletion, duplicate handling, and user-facing import history.
- Idempotency prevents duplicate transaction rows from being inserted.

Built today:

- Contact resolution is attempted through `createBankTransactionContactResolutions()`.
- Contact resolution writes `bank_transaction_contact_resolutions`.
- Bank balance recalculation is scheduled after commit with `scheduleBankBalanceAfterCommit()`.
- Categorization enrichment is scheduled after commit with `scheduleTransactionEnrichmentAfterCommit()`.
- A `work_materialization_requested` intent is written in the same save transaction as inserted bank transactions, with scope `{ type: 'bank_account', clientCompanyId, bankAccountId }`.
- The outbox dispatch kick is scheduled after commit, without a static BullMQ job id, so each committed import can wake the dispatcher while DB-level outbox debounce still coalesces pending work per scope.
- An `activity_event_requested` intent is written for `bank_transactions_imported` or `bank_transactions_synced` in the same save transaction.

TODO:

- Keep each follow-up effect on its launch owner:
  - `bank_balance_recalc_requested`: existing after-commit BullMQ helper is enough for launch
  - `transaction_enrichment_requested`: existing after-commit BullMQ helper is enough for launch
  - `work_materialization_requested` and `activity_event_requested`: durable outbox
- Keep contact resolution in the save transaction unless we deliberately move it to an asynchronous contact-resolution job.
- Decide final ownership of bank balance recalculation triggers. Today, `addNewBankTransactions()` queues bank balance recalculation, and provider sync also queues account-level recalculation after successful sync. The queue dedupes/merges by company and bank account, but the ownership must be explicit.

End state:

- Source rows exist in `bank_transactions`.
- Contact resolution facts exist when resolvable.
- Bank balance recalculation is scheduled after commit, with durable outbox optional if we later decide missed balance jobs need stronger guarantees than sweep/backfill gives.
- Enrichment is scheduled after commit, with durable outbox optional because missed enrichment is recoverable by sweep/backfill and leaves visible manual work rather than corrupt accounting truth.
- Activity records that transactions arrived.
- Queue materialization creates or updates categorization work for transactions that still need user action.

## B. Bank Transaction Work After Save

### B1. Uncategorized Work

Built today:

- `getCategorizationTransactions()` reads `categorization_engine_view`.
- The view can show raw bank transactions, candidates, and posted ledger-backed rows.
- `work_items` and `work_item_subjects` exist for Phase 1 queue materialization.
- `materializeWork({ type: 'bank_account', clientCompanyId, bankAccountId })` creates `categorize:bank_transaction:{id}` subjects for unposted, non-deleted bank transactions that have no pending-review candidate.
- If an unposted transaction has a pending-review candidate, the materializer creates `review_suggestion:categorization_candidate:{id}` instead.
- The Phase 1 group key is `(client_company_id, effective_owner, destination_workspace)`, materialized as `categorize_transactions:{clientCompanyId}:{effectiveOwnerUserId | unassigned}:categorization`.
- The materialized `assigned_user_id` is the effective owner: the oldest active `firm_user_client_assignments` row for the client, or `NULL` when unassigned.
- The queue API returns grouped `categorize_transactions` rows with exact active subject ids and categorization destination filters.
- Staff queue reads show assigned/unassigned work; manager/admin reads show all open firm work.

TODO:

- done: materialization reruns after categorization posts (durable intent in the ledger transaction + fast materialization after commit), so solved transaction subjects disappear immediately.
- done: candidate-aware queue rules from Phase 3 replace plain categorize work with review-suggestion work while a candidate is pending review.
- Fiscal-period grouping remains deferred.

End state:

- A bookkeeper sees `Categorize 5 transactions`, not five unrelated queue rows.
- A manager or firm owner sees the same underlying subjects rolled up by client, assignee, team, and firm.

### B2. Enrichment

Built today:

- `enqueueTransactionEnrichment()` queues `bank-transactions-enrichment`.
- It batches by company and deduplicates transaction ids inside the job payload.
- `enrichment.worker.ts` persists enrichment results.
- After enrichment commits, the worker calls `emitTxnEnrichedEvent()`.
- `emitTxnEnrichedEvent()` enqueues the rule runner.
- `categorization_tasks` and `categorization_task_events` capture internal processing history.

TODO:

- Keep `categorization_in_progress` out of the user queue.
- Record operational telemetry for enrichment failures.
- Record product activity only when there is a user-meaningful outcome, such as a suggestion becoming available or a transaction being posted.

End state:

- Enriched facts exist for automation.
- No user queue row is created merely because enrichment is running.

### B3. Rule Runner

Built today:

- Queue: `rule-runner`.
- Worker: `rule-runner.worker.ts`.
- Service: `runRulesForEnrichedTransaction()`.
- The rule runner logs task events, runs the rules engine, calls `handlePostPrediction()`, and then enqueues ML if rules did not produce a sufficient result.

Boundary:

- Rule definition, compilation, and matching behavior are not specified here.

End state:

- A rule result either becomes a prediction/candidate path or the transaction continues toward ML/no-suggestion handling.

### B4. ML Prediction

Built today:

- Queue: `ml-prediction`.
- Worker: `ml-prediction.worker.ts`.
- Service: `processMLPrediction()`.
- The ML service calls the ML engine, validates output, logs task events, and calls `handlePostPrediction()`.

Boundary:

- ML model internals, ranking, scoring, and training are not specified here.

End state:

- An ML result either becomes a prediction/candidate path or leaves the bank transaction needing manual categorization.

### B5. Prediction, Candidate, And Autopost

Built today:

- `handlePostPrediction()` persists `categorization_predictions` and `categorization_prediction_lines`.
- Candidate validation builds postable lines and persists `categorization_candidates` and `categorization_candidate_lines`.
- `persistCategorizationCandidate()` can keep, replace, or ignore competing candidates and logs `candidate_created`, `candidate_replaced`, or `candidate_ignored`.
- `checkAutopostEligibility()` evaluates autopost policy.
- `postCandidateToLedger()` posts eligible candidates through `createLedgerRecord()`.
- Autopost checks whether the bank transaction is already linked to a ledger transaction before posting.
- Candidate created/replaced/ignored/rejected/posted/source-already-posted lifecycle is recorded in `categorization_candidate_dispositions`.
- Candidate outcomes compare accounting-significant suggested facts to final ledger facts when comparison is fair.
- Candidate creation/replacement/rejection/autopost paths write `work_materialization_requested` and `activity_event_requested` outbox intents as needed.
- A pending-review candidate creates `review_suggestion:categorization_candidate:{id}` instead of plain categorize work.
- Autopost success records activity and leaves no queue work unless a future firm policy explicitly requires human review.

TODO:

- If autopost fails because of system/internal reasons, record operational telemetry, not bookkeeper work.
- If candidate validation fails and the user can fix the proposed posting, create `resolve_categorization_blocker`; otherwise treat it as system/operator work.

End states:

- **No suggestion:** bank transaction remains categorization work.
- **Suggestion needs approval:** candidate review work appears.
- **Autopost success:** source work ends, activity is recorded, ledger flow begins.
- **Autopost skipped because already posted:** no user work appears; candidate disposition records that final ledger facts already exist.
- **System failure:** operational telemetry/notification path, not bookkeeper queue work.

### B6. User Beats Automation

Built today:

- `processCategorizationIntent()` takes advisory locks per bank transaction before posting.
- `postCandidateToLedger()` skips if `bank_transactions.ledger_transaction_id` already exists.
- Candidate materialization reads current domain facts and ignores already-posted bank transactions.
- Late candidates for already-posted bank transactions are closed with `expired_source_posted`, compared to final ledger facts when fair, and do not recreate work.
- Posting correctness checks domain facts such as `bank_transactions.ledger_transaction_id`, not `work_items`.

TODO:

- Future candidate blocker work must preserve the same no-work-for-solved-sources rule.

End state:

- A user who manually categorizes before rules/ML finish does not see solved work come back tomorrow.

## C. User Categorizes A Bank Transaction

### C1. Queue Opens The Workspace

Built today:

- The categorization workspace can fetch transaction state through `getCategorizationTransactions()`.
- The queue API returns grouped work item rows with exact active subjects, target ids, destination workspace data, destination filters, and available actions for the viewer.
- The categorization workspace supports the durable `workItemId` query filter and constrains the read to the exact active subject set.
- Current firm queue UI is still mock-oriented.

TODO:

- Replace the firm dashboard's mock queue with the real materialized work queue when the frontend queue migration is in scope.

End state:

- Grouping keeps the queue simple without hiding the individual transactions that need fixing.

### C2. User Posts, Edits, Or Rejects

Built today:

- Route: `POST /categorization/intents`.
- Controller calls `processCategorizationIntent()`.
- `processCategorizationIntent()` validates intents, groups by bank transaction, locks current rows, reads `categorization_engine_view`, builds ledger input, and calls `updateOrCreateLedger()`.
- `updateOrCreateLedger()` creates, updates metadata, or supersedes ledger facts.
- Candidate rejection records disposition/activity, writes materialization intent, and restores categorize work when the source remains unposted.
- Manual posting records candidate disposition/outcome when applicable, writes product activity, writes materialization intent, and runs fast materialization after commit on the model-owned commit path.
- Mutation correctness is validated against authoritative domain facts under bank-transaction locks.

TODO:

- Add explicit queue-originated action metadata and subject freshness checks as a UX stale-state guard. Domain locks remain the correctness boundary.

End state:

- Posting 2 of 5 grouped uncategorized transactions shrinks the queue row to 3.
- Posting all 5 closes the grouped work item.
- Rejection ends suggestion-review work and returns the transaction to manual categorization if it is still unposted.

## D. Common Ledger Write Flow

### D1. Ledger Creation

Built today:

- Core function: `createLedgerRecord()` in `ledgers.model.ts`.
- It creates `ledger_transactions`.
- It creates `ledger_entries`.
- It validates company, source, contacts, projects, FX, bank-leg constraints, and balance.
- It schedules GL balance recalculation through `scheduleGLBalanceAfterCommit()`.
- It schedules close signal evaluation through `scheduleCloseSignalEvalAfterCommit()`.
- It writes ledger audit logs through `logLedgerEvent()`.
- It links `bank_transactions.ledger_transaction_id` or `journal_batches.ledger_transaction_id`.

TODO:

- Keep GL balance recalculation on the existing after-commit helper unless we later decide derived balance refreshes need durable queue hand-off beyond sweep/backfill.
- Keep close signal evaluation on the existing after-commit helper in the near term, with either an outbox-backed helper or a sweep as the durability backstop.
- Write product activity and work-materialization outbox intents for posted bank transactions and posted journals.
- After commit, process fast materialization for user-facing mutations where the queue response must update immediately.
- Keep ledger audit logs as accounting audit. Project them into product activity only when the event is useful to users.

End state:

- Ledger facts are the source of truth for posted accounting activity.
- Source work is eligible to leave the queue.
- Close checks are scheduled.

### D2. GL Balance Recalculation

Built today:

- Queue: `balance-recalc`.
- GL jobs are keyed by company and COA.
- Bank balance jobs are keyed by company and bank account.
- Waiting/delayed jobs merge date ranges.
- Active jobs can create follow-up jobs when the new range expands coverage.

TODO:

- Keep balance recalculation as derived-cache maintenance, not user queue work.
- Record operational telemetry if recalculation fails repeatedly.

End state:

- Balances eventually reflect ledger and bank transaction source changes.

## E. Close Signals And Close Work

### E1. Ledger-Level Signals

Built today:

- Queue: `close-signal-eval`.
- Worker: `close-signal-eval.worker.ts`.
- Sync function: `syncLedgerTransactionSignals()`.
- The sync loads a ledger transaction, evaluates close signals, upserts current `close_review_signals`, and deletes vanished signals for that ledger transaction.

TODO:

- When signal sync changes the signal set, write `work_materialization_requested` for the affected fiscal period.
- Record activity only when the event is user-meaningful. Do not create activity for every internal signal recomputation.

End state:

- Posted ledger facts have current close-review signals.

### E2. Period Finding Projection

Built today:

- `open-signal-findings.ts` computes signal rollups.
- `period-findings.ts` computes native period findings and decision-eligible findings.
- `recordCloseReviewDecision()` writes `close_review_decisions` with `facts_hash`.

TODO:

- Wrap these into one `closeFindingProjection(scope)`.
- Readiness must consume `closeFindingProjection(scope)`.
- `materializeWork(scope)` must consume `closeFindingProjection(scope)`.
- Objective blockers become fix-only work.
- Decision-eligible advisories allow decisions such as acknowledge or not applicable.

End state:

- Readiness and queue cannot compute competing versions of the same close finding.
- A finding leaves the queue when facts change or when a still-valid decision suppresses it.

## F. Journals

### F1. Draft Journals

Built today:

- Journal creation/posting lives in `journals.command.ts`.
- `postJournalRecord()` can create draft journals and posted journals.
- Draft journal detection already exists in older task/readiness code.
- Draft journals are stored in `journal_batches` and `journal_entries`.

TODO:

- Materialize `review_draft_journal:journal_batch:{id}` for draft journals that require action.
- After draft create/update/void/post, write activity and materialization outbox intents.
- Optional pre-post journal advice can run against draft lines, but it remains advisory until ledger facts exist.

End state:

- Draft journal work appears before ledger posting.
- Draft advice does not masquerade as close truth.

### F2. Posted Journals

Built today:

- Posting a draft journal validates the persisted draft.
- It builds a `manual_journal` ledger payload.
- It calls `createLedgerRecord()`.
- It updates `journal_batches.status`, sequence/reference fields, and `ledger_transaction_id`.
- It links `journal_entries.ledger_entry_id`.
- Posted journals flow into GL balance recalculation and close signal evaluation through the common ledger path.

TODO:

- Posting a draft journal must end `review_draft_journal`.
- Posted journal activity is recorded in `activity_events`.
- Close findings from posted journal facts must materialize through `closeFindingProjection(scope)`, not a journal-specific close system.

End state:

- Journals use their own draft/review flow before posting, then share the same ledger and close-review path as bank transactions.

## G. Activity Events

Built today:

- Ledger audit logs exist.
- Categorization task events exist.
- Journal audit events exist.
- Normal application logs exist.
- Phase 4 adds append-only `activity_events`.
- Phase 4 adds the durable `activity_event_requested` outbox intent and dispatcher handler.
- `activity_events` records:
  - firm company id
  - client company id
  - actor user id or system actor
  - source entity type/id
  - ledger transaction id when present
  - fiscal period when known
  - work type when related
  - event type
  - counts/amounts where useful
  - metadata
- Phase 4 emits activity for:
  - bank transactions imported/synced
  - categorization suggestion created/replaced
  - candidate rejected
  - manual categorization posted
  - autopost success
  - journal created/updated/voided/posted
  - close decision recorded

TODO:

- Emit activity for:
  - period sent for approval
  - period closed

End state:

- Users can see what happened without turning the queue into a log.
- Future wraps for bookkeepers, managers, and firm owners can be built from product activity.

## H. Notifications

Built today:

- Phase 5 adds `notifications` for in-app attention/feed state:
  - recipient user id
  - firm company id
  - client company id when relevant
  - policy owner company id
  - event type
  - source entity type/id/key
  - related activity event id when applicable
  - related work item id or subject id when applicable
  - destination/action data
  - read/seen/resolved/archive state
  - priority/read policy
  - occurred/created/updated timestamps
- Phase 5 adds `notification_idempotency_keys` so repeated work/activity transitions and outbox retries do not duplicate attention.
- Phase 5 adds `notification_preferences` for user and company overrides; safe launch defaults live in code.
- Phase 5 adds `notification_requested`, `notification_attention_resolved`, and `notification_comms_requested` outbox intents.
- Phase 5 adds `comms_deliveries` as the comms-owned delivery audit log for email and future channels:
  - channel
  - delivery status
  - attempt count
  - provider key/message id/error/response
  - queued/sent/delivered/failed/next-attempt timestamps
  - typed correlation such as `{ source: 'notification', id }`
- Notification feed, unread count, mark-viewed/read, mark-all-read, and user preference API endpoints exist.
- Email-capable delivery exists through the comms provider boundary.
- `materializeWork()` creates notification requests for newly assigned work, reassigned work, and material updates to assigned work.
- `materializeWork()` resolves assigned-work notification attention when assigned work closes.

TODO:

- Add producers/rules for the remaining launch notification events below.
- Add overdue/escalation scanning for assigned work.
- Add rules that consume product activity where interruption is warranted, without notifying for every import, autopost, or internal signal recompute.
- Add close/approval/staleness notification producers when the close package phases ship.
- Add client/bank blocker notification producers when those blocker facts are modeled.

Launch notification events:

- done: work assigned or reassigned to a user
- TODO: assigned work becomes overdue or escalated
- TODO: bank reconnect requires client/user action
- TODO: client query requires a response
- TODO: close package sent for approval
- TODO: close package approved/rejected
- TODO: review package becomes stale after material change
- TODO: reports ready/sent/failed where user action is needed
- TODO: sync/import failure only when a normal user can fix the condition

End state:

- Users are interrupted only when attention is warranted.
- Notifications point back to the exact queue row, subject, client, or period workspace.
- Activity remains the history stream; notifications are delivery and attention management.

## I. Work Materialization

Built today:

- The old task/workflow system exists.
- The firm dashboard UI is mock-oriented.
- Phase 1 `work_items` and `work_item_subjects` exist for grouped `categorize_transactions` work.
- `materializeWork(scope)` handles `bank_account` scopes for unposted bank transactions.
- Active canonical subject uniqueness is enforced on `canonical_subject_key` for `status='active' AND is_deleted=false`.
- Launch audience/action fields exist on `work_items` for Phase 1:
  - firm company id
  - client company id
  - assigned user id
  - required capabilities
  - available actions
  - destination data
- The queue API returns `effectiveOwnerUserId` as a read field, using materialized `assigned_user_id` first and falling back to the active client assignment when needed.
- The materializer creates desired active subjects from current domain facts, ends active subjects no longer desired, and closes grouped work items with zero active subjects.

TODO:

- Defer `work_item_events`, `team_id`, `watcher_user_ids`, and broad `visibility_scope` until queue audit, team, watcher, or pool features require them.
- Add later materializer handlers for `company_period`, `company`, and `firm` scopes when their phases ship.
- Keep future work types on the same subject/count/close contract.

End state:

- Queue rows are projections of domain truth.
- Re-running materialization is safe and idempotent.
- Managers and firm owners see rollups over the same subjects bookkeepers work.

## J. Immediate Queue Removal Contract

Every mutation that can solve work must follow this sequence:

1. Validate viewer capability.
2. Check subject freshness only as a stale-UI guard.
3. Validate mutation correctness against authoritative domain facts under domain locks.
4. Write the owning domain fact.
5. Write semantic outbox intents in the same transaction.
6. Commit.
7. For queue-originated user actions, run fast materialization after commit before returning.
8. End active subjects no longer desired.
9. Close grouped work items with no active subjects.
10. Return updated workspace/queue data or force immediate refetch.

The outbox worker remains the durable fallback. The frontend only optimistically hides solved subjects after mutation success.

## K. Real Multi-Transaction Result

If 100 transactions sync, 2 autopost by rules, 55 get suggestions needing approval, 33 get no suggestion, and the user manually posts 10 while jobs are still running:

- Activity records the sync/import count.
- Activity records the 2 autoposted transactions.
- Activity records the 10 manual posts.
- Queue shows review work only for suggestions still unposted and approval-required.
- Queue shows categorization work only for transactions still unposted with no active reviewable candidate.
- Queue does not show autoposted transactions as work unless firm policy explicitly requires review.
- Late jobs cannot recreate work for transactions already posted.

## L. Build Phases

### Phase 0: Decoupled Correctness Wins

Build:

- done: after-commit helper for bank balance recalculation from `addNewBankTransactions()`
- done: after-commit helper for transaction enrichment from `addNewBankTransactions()`
- done: materializer concurrency design: `scope_key`, advisory lock, debounce rule, grouped-row close rule

Acceptance test:

- A rolled-back bank import does not enqueue balance/enrichment jobs.
- A committed bank import still queues balance/enrichment jobs.
- Two materializer calls for the same scope cannot run their reconcile transaction concurrently.

### Phase 1: Materializer Backbone

Build:

- done: transactional outbox table and worker for `work_materialization_requested`
- done: `work_items`
- done: `work_item_subjects`
- done: canonical subject uniqueness, including soft-delete-aware active uniqueness
- done: effective owner assignment materialized into `work_items.assigned_user_id`
- done: `materializeWork()` for unposted bank transactions only
- done: outbox intent after `addNewBankTransactions()`
- done: materializer advisory lock and debounced outbox intents
- done: queue API for grouped `categorize_transactions`, with staff/manager/admin visibility rules

Acceptance test:

- Import 5 bank transactions.
- Queue API shows `Categorize 5 transactions`.
- Re-running materialization does not duplicate subjects.
- Concurrent materializer attempts for the same scope serialize safely.

### Phase 2: First User Loop

Build:

- done: outbox intent plus fast materialization after `processCategorizationIntent()`
- done: categorization workspace deep-link with subject filters via the `workItemId` query param on the categorization read and cat-engine request path; firm dashboard mock queue migration remains deferred (G26)

Acceptance test:

- Import 5 bank transactions.
- Queue shows `Categorize 5 transactions`.
- Post 2.
- Queue shows `Categorize 3 transactions`.
- Post the remaining 3.
- The row disappears.

### Phase 3: Candidate Review Work

Build:

- done: candidate dispositions
- done: suggestion outcome comparison against final ledger facts
- done: outbox-backed materialization after candidate created/replaced/ignored/rejected/autoposted
- done: `review_suggestion` work
- done: no-work behavior for autopost success
- done: no-work behavior for already-posted late candidates

Acceptance test:

- A pending candidate creates `Review 1 suggestion`, not plain categorize work.
- Rejecting the candidate through the categorization intent route closes review work and restores categorize work if the source remains unposted.
- Posting an accepted candidate records a posted disposition plus outcome comparison and leaves no queue work.
- Re-running materialization does not recreate work for posted/autoposted/expired candidates.

### Phase 4: Activity Stream

Built:

- `activity_events`
- `activity_event_requested` outbox intent
- source-save activity
- manual post activity
- suggestion activity
- rejection activity
- autopost activity
- journal activity
- close decision activity

Acceptance test:

- Activity intents are written atomically with the source transaction and disappear on rollback.
- Dispatching `activity_event_requested` inserts append-only activity events idempotently by event idempotency key.
- Bank import/save, manual categorization post, candidate rejection, autopost success, journal create/update/void/post, and close decision flows write product activity intents.

### Phase 5: Notifications

Built:

- done: in-app notifications
- done: comms-owned delivery records for email/future channels
- done: notification preferences with code-owned launch defaults and user/company overrides
- done: `notification_requested`, `notification_attention_resolved`, and `notification_comms_requested` outbox intents
- done: assigned-work notification rules for newly assigned, reassigned, materially updated, and resolved work
- done: idempotency keys for repeated notification lifecycle transitions

Remaining build:

- notification rules/producers for user-fixable blockers, close approval/rejection, stale packages, overdue/escalated work, report failure/action-needed, bank reconnect/client action, and user-fixable sync/import failures
- activity-consuming notification rules where interruption is warranted

Acceptance test:

- done: A new assigned work item creates one notification for the assignee.
- done: Re-running materialization does not duplicate the notification.
- done: Solving the work resolves active notification attention so the user is routed to updated state instead of dead attention.
- done for current rules: A normal import/autopost activity event does not notify unless a future policy says user attention is required.

### Phase 6: Close Work

Build:

- `closeFindingProjection(scope)`
- readiness reads projection
- materializer reads projection
- materialization after close signal sync
- materialization after close decision
- close work actions and blocker/advisory behavior

### Phase 7: Journals

Build:

- draft journal work
- materialization after draft create/update/void/post
- posted journal activity
- shared close materialization for posted journal facts

### Phase 8: Approval And Receipt

Build:

- `ready_to_close_period`
- final confirmation action flow
- send-for-approval package
- package stale-on-material-change behavior
- manager/admin approval visibility

## Whole-System Acceptance Criteria

- Every queue row is actionable, approvable, or a deliberate ready/receipt state.
- Informational history lives in activity, not the primary action queue.
- Product-significant activity is recorded even when no queue item is created.
- Notifications exist for work and blockers that deserve attention, and they route to the exact action surface.
- Notifications are idempotent and do not fire for every informational event.
- Every queue row has exact subjects underneath.
- Solved subjects leave the queue through materialization.
- Staff, manager, and firm owner views are projections over the same underlying subjects and activity.
- Grouped rows close when active subject count reaches zero.
- Stale actions cannot silently mutate old work.
- Readiness and queue consume the same close finding projection.
- Journals and bank transactions share the same ledger and close-review path after posting.
- Re-running the materializer produces the same active queue from the same domain facts.
