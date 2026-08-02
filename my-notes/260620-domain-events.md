# Domain Events Inventory

_Generated 2026-06-20. Every entry cites the source file. Implemented only — no TODOs or commented-out code._

---

## Event Dispatch Architecture

The system uses an **outbox pattern** for all significant domain events. State changes write intents to `outbox_intents` table within the same DB transaction. The `outboxDispatch` BullMQ worker processes these intents asynchronously.

**Outbox intent types** (defined in `domains/work/work.types.ts`):

- `work_materialization_requested` — reconcile categorization work queue for a scope
- `activity_event_requested` — record audit/activity event
- `notification_requested` — create in-app notification
- `notification_comms_requested` — dispatch communication (email, etc.)

**Key patterns:**

- After-commit scheduling: balance recalc, enrichment, and outbox dispatch are scheduled via `runAfterTransactionCommit` to avoid notifying on uncommitted state
- Outbox deduplication: UNIQUE partial index on `(intent_type, scope_key) WHERE status='pending'` collapses multiple writes to same scope
- Idempotency: all outbox intents carry idempotency keys
- Advisory locks: work materialization uses PG advisory locks per scope to prevent concurrent reconciliation

---

## Bank Transaction Events

```
BankTransactionsImported
  Trigger: CSV/manual import via POST /:companyId/bank-accounts/transactions/import
  Entity: bank_transactions
  Layer: sync (request path) + async cascade
  Side effects:
    - Enqueue enrichment (bank-transactions-enrichment queue)
    - Trigger work materialization for affected bank accounts
    - Write activity event intent
  Source: domains/bankTransactions/bankTransactions.model.ts

BankTransactionsSynced
  Trigger:
    - Plaid webhook SYNC_UPDATES_AVAILABLE → transaction-sync queue
    - Daily scheduled sync scan
    - Manual sync via POST /api/banking/sync-transactions
  Entity: bank_transactions
  Layer: async-queue (transaction-sync worker)
  Side effects:
    - Insert new bank_transactions (deduplicated by external_id)
    - Enqueue enrichment for new transactions
    - Enqueue bank balance recalc
    - Trigger work materialization for affected bank accounts
    - Write activity event intent
  Source:
    - integrations/banking/jobs/transaction-sync.worker.ts (worker)
    - domains/banking/webhooks/plaid.webhook.ts (webhook entry)

BankTransactionsDeleted
  Trigger: POST /:companyId/bank-accounts/transactions/delete
  Entity: bank_transactions
  Layer: sync (request path)
  Side effects:
    - Soft-delete related ledger entries
    - Enqueue balance recalc (gl-balance + bank-balance)
    - Trigger work materialization
  Source: domains/bankTransactions/bankTransactions.model.ts

BankTransactionBatchReversed
  Trigger: POST /:companyId/bank-accounts/transactions/batches/:batchId/reverse
  Entity: bank_transaction_batches + bank_transactions
  Layer: sync (request path)
  Side effects:
    - Reverse all transactions in batch
    - Enqueue balance recalc
    - Trigger work materialization
  Source: domains/bankTransactions/bankTransactions.model.ts
```

---

## Categorization Events

```
BankTransactionEnrichmentRequested
  Trigger:
    - New bank transactions imported or synced
    - Scheduled after transaction commit
  Entity: enriched transaction features (internal)
  Layer: async-queue (bank-transactions-enrichment queue)
  Data: { companyId, bankAccountId, bankTransactionIds[], source }
  Priority: manual=1, ingestion=2, sync=3
  Side effects:
    - Generates enriched feature set (normalized description, payee, temporal features, COA context)
    - Enqueues rule-runner and ml-prediction jobs for matched transactions
  Source: domains/categorization/enrichment/enrichment.queue.ts

RuleRunnerExecutionRequested
  Trigger: Enrichment completes, or manual rule triggering
  Entity: categorization_candidates
  Layer: async-queue (rule-runner queue)
  Side effects:
    - Evaluates all active rules against transaction in priority order
    - Creates/updates categorization_candidates on match
    - Writes activity event (CategorizationSuggestionCreated or Replaced)
    - Triggers work materialization
  Source: domains/categorization/rules/rule-runner.queue.ts

MLPredictionRequested
  Trigger: Enrichment completes (for transactions not fully matched by rules)
  Entity: categorization_candidates
  Layer: async-queue (ml-prediction queue)
  Side effects:
    - Calls ML service (Python FastAPI) for top-5 COA predictions
    - Creates/updates categorization_candidates
    - If confidence >= threshold: enqueues delayed autopost
    - Writes activity event
    - Triggers work materialization
  Source: domains/categorization/ml/ml-prediction.queue.ts

CategorizationSuggestionCreated
  Trigger: ML prediction or rule engine produces a new suggestion
  Entity: categorization_candidates
  Layer: async-queue (via post-prediction service)
  Side effects:
    - Write activity event intent
    - Trigger work materialization
  Source: domains/categorization/post-prediction/post-prediction.service.ts

CategorizationSuggestionReplaced
  Trigger: New prediction/rule result overrides a prior suggestion
  Entity: categorization_candidates
  Layer: async-queue (via post-prediction service)
  Side effects:
    - Write activity event intent
    - Trigger work materialization
  Source: domains/categorization/post-prediction/post-prediction.service.ts

CategorizationCandidateRejected
  Trigger: User explicitly rejects a suggestion via POST /:companyId/categorization/intents
  Entity: categorization_candidates (status → rejected)
  Layer: sync (request path)
  Side effects:
    - Write activity event intent
    - Trigger work materialization for affected bank account
  Source: domains/categorization/categorization.model.ts

ManualCategorizationPosted
  Trigger: User manually categorizes and posts via POST /:companyId/categorization/intents
  Entity: categorization_candidates + ledger_entries
  Layer: sync (request path)
  Side effects:
    - Create ledger entries (ledger transaction + entries)
    - Enqueue GL balance recalc (after commit)
    - Trigger work materialization
    - Write activity event intent
  Source: domains/categorization/categorization.model.ts

CategorizationCandidateAutoposted
  Trigger: Delayed autopost job fires (delay period after high-confidence prediction)
  Entity: categorization_candidates + ledger_entries
  Layer: async-queue (categorization-autopost queue)
  Side effects:
    - Create ledger entries
    - Enqueue GL balance recalc
    - Trigger work materialization
    - Write activity event intent
  Source: domains/categorization/autopost/autopost.service.ts
```

---

## Journal Events

```
JournalCreated
  Trigger: POST /:companyId/journals (create journal batch)
  Entity: journal_batches + journal_entries
  Layer: sync (request path)
  Side effects:
    - If status=posted: create ledger entries, enqueue balance recalc
    - Write audit event (writeJournalCreateAudit)
    - Schedule outbox dispatch
  Source: domains/journals/journals.command.ts — postJournalRecord

JournalUpdated
  Trigger: PUT /:companyId/journals/:journalId (update draft)
  Entity: journal_batches + journal_entries
  Layer: sync (request path)
  Side effects:
    - Write audit event (writeJournalUpdateAudit)
    - Schedule outbox dispatch
  Source: domains/journals/journals.command.ts — updateDraftJournal

JournalPosted
  Trigger:
    - PATCH /:companyId/journals/:journalId/post (single)
    - PATCH /:companyId/journals/batch/post (batch)
  Entity: journal_batches (status: draft → posted)
  Layer: sync (request path)
  Side effects:
    - Create ledger entries
    - Enqueue GL balance recalc (after commit)
    - Write audit event (writeJournalPostAudit)
    - Schedule journal auto-reversal if autoReversalDate set
    - Trigger work materialization
    - Schedule outbox dispatch
  Source: domains/journals/journals.command.ts — postJournal

JournalVoided
  Trigger:
    - PATCH /:companyId/journals/:journalId/void (single)
    - PATCH /:companyId/journals/batch/void (batch)
  Entity: journal_batches (status: posted/draft → voided)
  Layer: sync (request path)
  Side effects:
    - Soft-delete or reverse ledger entries
    - Enqueue GL balance recalc (after commit)
    - Write audit event (writeJournalVoidAudit)
    - Schedule outbox dispatch
  Source: domains/journals/journals.command.ts — voidJournal

JournalReversed
  Trigger: PATCH /:companyId/journals/:journalId/reverse
  Entity: journal_batches (creates reversal journal)
  Layer: sync (request path)
  Side effects:
    - Create reversing journal entries
    - Enqueue balance recalc
    - Write audit event (writeJournalReverseAudit)
  Source: domains/journals/journals.command.ts — reverseJournal

JournalCopied
  Trigger: POST /:companyId/journals/:journalId/copy
  Entity: journal_batches (new draft from existing)
  Layer: sync (request path)
  Side effects:
    - Write audit event (writeJournalCopyAudit)
  Source: domains/journals/journals.command.ts
```

---

## Journal Scheduled Events

```
JournalAutoReversalScanRequested
  Trigger: Daily cron schedule
  Entity: journal_batches with autoReversalDate <= today
  Layer: cron → async-queue (journal-auto-reversal queue, job: scan-due)
  Side effects:
    - Finds eligible journals
    - Enqueues individual reversal jobs (reverse-one)
  Source: domains/journals/auto-reversal.queue.ts

JournalAutoReversalExecuted
  Trigger: Auto-reversal scan finds eligible journal
  Entity: journal_batches (creates reversal entries)
  Layer: async-queue (journal-auto-reversal queue, job: reverse-one)
  Side effects:
    - Create reversing journal entries
    - Enqueue balance recalc
    - Write audit event (writeJournalReverseAudit)
  Source: domains/journals/auto-reversal.worker.ts

RecurringTemplateExecutionScanRequested
  Trigger: Daily cron schedule
  Entity: recurring_journal_templates with auto_post=true
  Layer: cron → async-queue (recurring-journal-templates queue)
  Side effects:
    - Finds templates due for execution
    - Enqueues execution jobs
  Source: domains/journals/recurring-templates.queue.ts

RecurringTemplateExecuted
  Trigger: Template's next_run_date reached and fiscal period is open
  Entity: journal_batches (created from template)
  Layer: async-queue (recurring-journal-templates queue)
  Side effects:
    - Create posted journal batch from template
    - Enqueue balance recalc
    - Write activity events (JournalCreated + JournalPosted)
  Source: domains/journals/recurring-templates.worker.ts
```

---

## Ledger Events

```
LedgerEntryCreated
  Trigger:
    - Journal posted (JournalPosted)
    - Manual categorization posted (ManualCategorizationPosted)
    - Autopost fires (CategorizationCandidateAutoposted)
  Entity: ledger_transactions + ledger_entries
  Layer: sync (within the triggering transaction)
  Side effects:
    - Enqueue GL balance recalc (after commit, priority: ledger_entry=5)
    - Enqueue close signal evaluation (after commit)
    - Trigger work materialization (outbox intent)
    - Write audit log
  Source: domains/ledgers/ledgers.model.ts — createLedgerRecord

LedgerEntrySoftDeleted
  Trigger:
    - Journal voided (JournalVoided)
    - Bank transactions deleted (BankTransactionsDeleted)
  Entity: ledger_entries (soft delete)
  Layer: sync (within the triggering transaction)
  Side effects:
    - Enqueue GL balance recalc (priority: soft_delete=7)
    - Enqueue close signal evaluation
  Source: domains/ledgers/ledgers.model.ts
```

---

## Balance Events

```
GLBalanceRecalculationRequested
  Trigger:
    - Ledger entry created/deleted
    - Manual refresh via POST /:companyId/balances/trial-balance/refresh
  Entity: gl_daily_balance_snapshots, gl_period_balance, gl_current_balance
  Layer: async-queue (balance-recalc queue, job: gl-balance)
  Data: { type: 'gl-balance', companyId, coaId, recalcFrom, recalcTo, triggeredBy }
  Priority: manual=10, soft_delete=7, ledger_entry=5, backfill=2
  Side effects: Recalculates and updates GL balance snapshots
  Source: domains/balances/balances.model.ts

BankBalanceRecalculationRequested
  Trigger:
    - Bank transactions imported/synced
    - Opening balance set
    - Manual trigger
  Entity: bank_daily_balance_snapshots, bank_account_current_native_balances
  Layer: async-queue (balance-recalc queue, job: bank-balance)
  Data: { type: 'bank-balance', companyId, bankAccountId, recalcFrom, recalcTo, triggeredBy }
  Priority: manual=10, opening_balance=8, transaction=6, sync=5
  Side effects: Recalculates and updates bank balance snapshots
  Source: domains/balances/balances.model.ts
```

---

## Work Materialization Events

```
BankAccountWorkMaterialized
  Trigger:
    - Bank transaction added/deleted
    - Categorization candidate created/rejected/posted/autoposted
    - Ledger entry posted for bank account
  Entity: work_items (categorization queue)
  Layer: outbox-deferred (sync write to outbox → async dispatch by outbox worker)
  Scope key: bank_account:{clientCompanyId}:{bankAccountId}
  Side effects:
    - Reconciles work_items for bank account (creates/closes/updates items)
    - Uses PG advisory lock per scope to prevent races
    - May trigger notifications (work_assigned, work_overdue)
  Sources:
    - domains/bankTransactions/bankTransactions.model.ts
    - domains/categorization/categorization.model.ts
    - domains/categorization/post-prediction/post-prediction.service.ts
    - domains/categorization/autopost/autopost.service.ts
    - domains/work/work-materialization.ts — materializeWork()
```

---

## Reporting & Close Readiness Events

```
CloseSignalEvaluationRequested
  Trigger:
    - Ledger entries posted in a period
    - Fiscal period status changes
    - Manual recompute via POST /:companyId/close-readiness/signals/recompute
  Entity: close signals / period findings
  Layer: async-queue (close-signal-eval queue)
  Data: { clientCompanyId, periodType, fiscalYear, periodNumber }
  Side effects:
    - Evaluates all close readiness signals for period
    - Updates findings (uncategorized txns, unreviewed suggestions, balance issues)
    - May surface new recommendations
  Source: domains/reporting/close-readiness/signals/close-signal-eval.queue.ts

CloseDecisionRecorded
  Trigger: POST /:companyId/close-readiness/decisions
  Entity: close_decisions
  Layer: sync (request path)
  Side effects:
    - Write activity event intent
    - Potentially trigger notifications (close_approval_requested, close_approval_rejected)
  Source: domains/reporting/close-readiness/close-decisions.ts
```

---

## Fiscal Calendar Events

```
FiscalCalendarGenerationRequested
  Trigger: Company provisioning or manual request
  Entity: fiscal_periods
  Layer: async-queue (fiscal-calendar queue, job: generate-calendar)
  Side effects: Generates fiscal periods for specified year range
  Source: domains/reporting/fiscal-calendar/fiscal-calendar.queue.ts

FiscalCalendarAutoExtendRequested
  Trigger: Nightly cron schedule
  Entity: fiscal_periods
  Layer: cron → async-queue (fiscal-calendar queue, job: auto-extend)
  Side effects: Creates new periods as existing ones near end
  Source: domains/reporting/fiscal-calendar/fiscal-calendar.queue.ts

FiscalCalendarCoverageGapsFilled
  Trigger: Data import reveals gap in fiscal period coverage
  Entity: fiscal_periods
  Layer: async-queue (fiscal-calendar queue, job: fill-coverage-gaps)
  Side effects: Creates missing periods to fill gaps
  Source: domains/reporting/fiscal-calendar/fiscal-calendar.queue.ts
```

---

## Task Evaluation Events

```
TaskEvaluationSweepRequested
  Trigger: Periodic cron schedule
  Entity: tasks
  Layer: cron → async-queue (task-evaluation queue, job: sweep)
  Side effects:
    - Re-evaluates all task completion rules across companies
    - Updates task statuses (pending/completed)
    - May trigger notifications (task complete, parent task now ready)
  Source: domains/tasks/task-evaluation.queue.ts

ClientTaskEvaluationRequested
  Trigger: Upstream task completes, or company state changes
  Entity: tasks for specific company
  Layer: async-queue (task-evaluation queue, job: evaluate-client)
  Data: { clientCompanyId }
  Side effects: Evaluates all tasks for company, updates statuses
  Source: domains/tasks/task-evaluation.queue.ts
```

---

## Notification Events

All notification events flow through the outbox: sync write → outbox worker → notification handler → (optionally) comms dispatch.

```
NotificationRequested
  Trigger: Any domain event that warrants user attention
  Entity: notifications (in-app records)
  Layer: outbox-deferred (intent_type: notification_requested)
  Notification types (from notification-event-registry.ts):
    - WORK_ASSIGNED — new work item assigned to user
    - WORK_REASSIGNED — work item reassigned to different user
    - WORK_OVERDUE — work item past due date (priority: high, read policy: explicit)
    - BANK_RECONNECT_REQUIRED — bank connection needs re-authentication
    - CLIENT_QUERY_REQUIRES_RESPONSE — client has pending query
    - CLOSE_APPROVAL_REQUESTED — period close needs approval
    - CLOSE_APPROVAL_REJECTED — period close approval rejected
    - CLOSE_PACKAGE_STALE — close package data is outdated
    - REPORT_DELIVERY_FAILED — report delivery failed (priority: high, read policy: explicit)
    - SYNC_FAILURE_REQUIRES_ACTION — bank sync failure needs attention (priority: high, read policy: explicit)
    - USER_PROFILE_PICTURE_UPDATE_FAILED — profile picture update failed (scope: global, not company)
  Side effects:
    - Create in-app notification record
    - If user prefs allow: write notification_comms_requested intent → comms worker delivers
  Source:
    - domains/notifications/notification-event-registry.ts (definitions)
    - domains/notifications/notification-dispatcher.ts (dispatch logic)
    - domains/work/work-materialization.ts (work-related triggers)
```

---

## Communications Events

```
CommsDeliveryRequested
  Trigger: Notification with user preference for email/SMS/push
  Entity: comms_deliveries
  Layer: async-queue (comms-dispatch queue, job: delivery)
  Side effects:
    - Resolve delivery preferences
    - Send via selected channel
    - Record delivery status
  Source: features/comms/comms.queue.ts

CommsDueDeliveryScanRequested
  Trigger: Periodic schedule (every 30 seconds default)
  Entity: comms_deliveries (status: pending)
  Layer: cron → async-queue (comms-dispatch queue, job: scan_due_deliveries)
  Side effects: Finds pending deliveries, enqueues delivery jobs
  Source: features/comms/comms.queue.ts

CommsDeliveryPurgeRequested
  Trigger: Daily maintenance schedule
  Entity: comms_deliveries (old completed records)
  Layer: cron → async-queue (comms-dispatch queue, job: purge_old_deliveries)
  Side effects: Deletes processed deliveries older than retention period
  Source: features/comms/comms.queue.ts

VerificationEmailRequested
  Trigger: User signup or POST /auth/resend-verification
  Entity: email delivery (direct SMTP)
  Layer: async-queue (email queue, job: send_verification_email)
  Side effects: Sends verification email
  Source: features/communications/email/email.service.ts

UserInviteEmailRequested
  Trigger: Admin invites user to company
  Entity: email delivery (direct SMTP)
  Layer: async-queue (email queue, job: send_user_invite_email)
  Side effects: Sends invite email with join link
  Source: features/communications/email/email.service.ts
```

---

## Auth & User Events

```
UserSignedUp
  Trigger: POST /api/signup
  Entity: users + companies
  Layer: sync (request path)
  Side effects:
    - Create user + company in atomic transaction
    - Generate email verification token
    - Enqueue verification email (email queue)
    - Trigger company provisioning (COA, billing, settings, fiscal calendar, roles)
  Source: features/signup/signup.controller.ts — clientSignup

UserEmailVerified
  Trigger: POST /auth/verify-email
  Entity: users (email_verified_at set)
  Layer: sync (request path)
  Side effects:
    - Update onboarding state
  Source: features/auth/auth.controller.ts — verifyEmailController

UserLoggedIn
  Trigger: POST /auth/login
  Entity: user session (JWT + refresh token)
  Layer: sync (request path)
  Side effects:
    - Issue JWT access token (HTTP-only cookie)
    - Issue refresh token (Redis-backed)
    - Return CSRF token
    - Update last_active_company_id
  Source: features/auth/auth.controller.ts — loginController
```

---

## Webhook Entry Points

```
PlaidWebhook_SYNC_UPDATES_AVAILABLE
  Trigger: Plaid detects new transactions at bank
  Entity: bank_transactions (via transaction-sync queue)
  Layer: webhook → async-queue
  Side effects: Full transaction sync cascade (see BankTransactionsSynced)
  Source: domains/banking/webhooks/plaid.webhook.ts

PlaidWebhook_INITIAL_UPDATE
  Trigger: Initial transaction pull completes at Plaid
  Layer: webhook (logged, informational only)
  Source: domains/banking/webhooks/plaid.webhook.ts

PlaidWebhook_HISTORICAL_UPDATE
  Trigger: Historical transaction pull completes
  Layer: webhook (logged, informational only)
  Source: domains/banking/webhooks/plaid.webhook.ts

PlaidWebhook_TRANSACTIONS_REMOVED
  Trigger: Transactions removed at bank
  Layer: webhook (logged, implementation incomplete)
  Source: domains/banking/webhooks/plaid.webhook.ts
  Note: Handler exists but deletion cascade is not fully wired

PlaidWebhook_ITEM_ERROR
  Trigger: Bank item has error (auth issue, connection failed)
  Layer: webhook (logged only, no automated response)
  Source: domains/banking/webhooks/plaid.webhook.ts
  Note: Should trigger credential status update + user notification, but not yet implemented

PlaidWebhook_PENDING_EXPIRATION
  Trigger: Access token nearing expiration
  Layer: webhook (logged only)
  Source: domains/banking/webhooks/plaid.webhook.ts
  Note: Should trigger user re-authentication notification, not yet implemented

PlaidWebhook_USER_PERMISSION_REVOKED
  Trigger: User revoked permissions at bank
  Layer: webhook (logged only)
  Source: domains/banking/webhooks/plaid.webhook.ts
  Note: Should trigger credential status update, not yet implemented
```

---

## State Machines

### Journal Batch Status

```
draft → posted
  Condition: User posts journal, fiscal period is open
  Side effects: Create ledger entries, enqueue balance recalc, audit event
  Source: domains/journals/journals.command.ts — postJournal

draft → voided
  Condition: User voids draft
  Side effects: Mark voided (no ledger entries to delete), audit event
  Source: domains/journals/journals.command.ts — voidJournal

posted → voided
  Condition: User voids posted journal
  Side effects: Soft-delete/reverse ledger entries, enqueue balance recalc, audit event
  Source: domains/journals/journals.command.ts — voidJournal
```

### Categorization Candidate Status

```
pending → rejected
  Condition: User rejects suggestion
  Side effects: Remove from work queue, activity event
  Source: domains/categorization/categorization.model.ts

pending → posted
  Condition: User posts manually OR autopost job fires
  Side effects: Create ledger entries, enqueue balance recalc, work materialization
  Source: domains/categorization/categorization.model.ts (manual), autopost.service.ts (auto)
```

### Work Item Status

```
open → closed
  Condition: All categorization candidates handled (posted/rejected) AND no new transactions
  Side effects: Removes from work queue
  Source: domains/work/work-materialization.ts

closed → open
  Condition: New categorization candidate created for previously-closed item
  Side effects: Adds back to work queue
  Source: domains/work/work-materialization.ts
```

### Fiscal Period Status

```
future → open
  Condition: Period start date reached or manual open

open → closed
  Condition: Period end date reached or manual close
  Side effects: Prevents new posting, triggers close signal evaluation

closed → locked
  Condition: Manual lock after close review
  Side effects: Prevents any editing

Source: domains/reporting/fiscal-calendar/
```

---

## Event Flow Diagrams

### Bank Transaction → Ledger (full pipeline)

```
Plaid webhook (SYNC_UPDATES_AVAILABLE)
  → transaction-sync queue (async)
  → sync service: fetch + store bank_transactions
  → [after commit] enrichment queue (async)
  → enrichment worker: normalize, resolve payee, compute features
  → [parallel] rule-runner queue + ml-prediction queue
  → rule engine: evaluate rules → match? → create candidate
  → ML engine: TF-IDF predict → create candidate
  → [if high confidence] autopost queue (delayed, e.g. 7 days)
  → autopost worker: create ledger entries
  → [after commit] balance-recalc queue (gl-balance)
  → balance worker: update GL snapshots
  → [after commit] outbox intent (work_materialization_requested)
  → outbox worker: materialize work items
  → [if new/changed work] outbox intent (notification_requested)
  → outbox worker: create in-app notification
  → [if user prefs allow] outbox intent (notification_comms_requested)
  → comms worker: deliver email/SMS
```

### Journal → Ledger (manual path)

```
User creates journal (POST /:companyId/journals)
  → journal batch + entries created (draft or posted)
  → [if posted] ledger entries created in same transaction
  → [after commit] balance-recalc queue (gl-balance)
  → [after commit] close-signal-eval queue
  → [after commit] outbox intent (activity_event_requested)
  → audit event written
```

### Notification lifecycle

```
Domain event occurs (work materialization, close decision, sync failure, etc.)
  → writeNotificationRequestedIntent() — sync write to outbox_intents
  → [after commit] outbox worker picks up intent
  → notification dispatcher: resolve event definition from registry
  → create in-app notification record
  → check user notification preferences
  → [if prefs allow comms] writeNotificationCommsRequestedIntent()
  → outbox worker picks up comms intent
  → comms dispatcher: resolve delivery plan (channel, template)
  → comms_deliveries record created
  → comms worker: send via provider (email/SMS/push)
```
