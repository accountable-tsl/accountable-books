# Work Producers and Reconciliation

## Decision

The launch scope has **eight Work Types** produced by seven small domain producer modules. Work is not created from a generic event bus, reconstructed from audit history, or normally materialized by an outbox worker. The domain command that changes an authoritative actionable condition calls one internal synchronization entry point before committing. If Work cannot be synchronized, the source-state mutation does not commit.

The outbox remains important for work that is genuinely asynchronous: ledger posting schedules accounting-policy evaluation; notification, activity, realtime invalidation, and recovery jobs run after commit. An accounting-finding evaluator writes the Finding and its Work Item atomically in the evaluator's own transaction.

Notification emission is provider-neutral. Producers and domain commands emit typed notification intents and attention identities through the transactional outbox; the existing notification policy/registry selects recipients, channel policy, and presentation, while provider adapters deliver them. Adding another provider must not require changes to Work predicates, Close commands, or notification lifecycle semantics.

### Launch notification catalogue

The queue remains the primary Work surface. Notifications are reserved for cross-person handoffs, important deadline transitions, client action, and material informational events:

| Notification code                | Recipient policy                                                        | Default delivery policy                                           |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `close.approval_requested`       | Current Client Lead                                                     | In-app plus immediate external delivery                           |
| `close.approval_rejected`        | Submitter and current Primary Bookkeeper, deduplicated                  | In-app plus immediate external delivery                           |
| `close.approval_stale`           | Current Primary Bookkeeper/preparer                                     | In-app plus immediate external delivery                           |
| `close.reopen_requested`         | Current Client Lead/reopen decision owner                               | In-app plus immediate external delivery                           |
| `close.reopen_decided`           | Requester and current Primary Bookkeeper, deduplicated                  | In-app plus immediate external delivery                           |
| `close.package_assigned`         | New Package assignee when another actor assigns/reassigns it            | In-app plus immediate external delivery                           |
| `close.package_deadline_changed` | Package assignee when another actor changes it                          | In-app plus immediate external delivery                           |
| `close.overdue`                  | Primary Bookkeeper while Preparing; Client Lead while Awaiting Approval | In-app plus one immediate external delivery per overdue episode   |
| `close.package_overdue`          | Package assignee and Client Lead, deduplicated                          | In-app plus one immediate external delivery per overdue episode   |
| `bank.reconnect_required`        | Eligible client contact                                                 | Persistent client action, in-app, and immediate external delivery |
| `bank.connection_disconnected`   | Current Primary Bookkeeper and Client Lead, deduplicated                | In-app plus immediate external delivery                           |
| `close.catchup_recommended`      | Current Client Lead and explicitly authorized oversight recipients      | In-app only, once per continuous eligibility episode              |

`external delivery` is a policy surface, not an email assumption. The initial provider may be email; later Slack, Teams, SMS, push, or another provider plugs into the same channel/provider adapter boundary and respects firm/user preferences. Event codes, attention identity, recipients, destinations, and domain payloads remain provider-independent.

One active attention row exists per recipient and obligation/episode. Routine updates reuse it; reassignment, a material decision change, or the first overdue transition may deliver again. Resolution ends the attention and archive ends the episode. Launch sends no daily reminders and no notification for ordinary Work creation/resolution, Preview opening, Preparing beginning, every individual overdue Work Item, successful approval as FYI, or automatic bank-sync retry. Those remain queue/activity facts.

Users never create, complete, cancel, or reopen Work Items. They invoke accounting, banking, journal, Finding, Confirmation, or close commands. Those commands change domain truth; the synchronizer makes Work match that truth.

Work Queue and Close V2 is built as a separate path beside the existing Accountable Books workflow/task experiments only during pre-launch development. Existing accounting, banking, ledger, Fiscal Period, audit, activity, notification, and outbox domains are integration evidence and reusable source truth; existing Work/task tables and services are neither foundations nor migration targets. V2 producers write only the new `work_items` model. The pre-launch replacement programme proves V2 before routing the frontend to it and deleting the superseded systems; it requires no data backfill, dual-writing, or customer rollout.

## 1. The three concepts

### Work Type registry

The deployed Work Type registry explains a persisted `work_type_code`: its target and root types, assignment fallback, access policy, close effect, primary surface, presentation functions, workspace DTO adapter, and permitted bulk command codes. It contains no mutable workflow state and no due-date calculator.

### Work producer

A producer is domain code that translates current authoritative source state into zero or one desired open Work occurrence per registered target. It owns:

- the exact outstanding predicate;
- fiscal-period derivation;
- concrete `due_at` policy;
- assignment overrides, if the registry fallback is insufficient;
- the end reason when the condition no longer applies;
- the source-command integration points and recovery scan.

A producer is not necessarily one file or service per Work Type. The bookkeeping producer owns both bank-transaction Work Types because it must transition between them atomically.

### Reconciler

The reconciler applies a producer's desired occurrence to `work_items` idempotently. It inserts missing Work, updates mutable routing/date fields, resolves or supersedes obsolete Work, and leaves an already-correct row alone. The same producer predicate is used inline and by recovery sweeps, so repair cannot invent a second interpretation of “outstanding.”

## 2. The prepared command-side integration

Every source-changing command that can affect Work uses one prepared consistency boundary inside the same database transaction. The caller supplies durable domain roots and the client company it expects those roots to belong to. It does not discover or assert the Engagement, Fiscal Period, Work Type, assignment, due date, close effect, or resulting Work transition.

```ts
type DomainRootRef =
  | { type: "bank_transaction"; id: string }
  | { type: "journal_batch"; id: string }
  | { type: "bank_connection"; id: string }
  | { type: "accounting_finding"; id: string }
  | { type: "period_reopen_request"; id: string }
  | { type: "close_confirmation"; id: string }
  | { type: "period_close_version"; id: string };

type WorkCommandContext = {
  actor: AuditActor;
  commandId: string;
};

type ExistingRootScope = {
  kind: "existing";
  roots: readonly DomainRootRef[];
  expectedClientCompanyId: string;
  // Required only when this command can move a root into another period.
  proposedEffectiveDates?: readonly LocalDate[];
};

type NewRootScope = {
  kind: "new";
  rootType: DomainRootRef["type"];
  clientCompanyId: string;
  effectiveDates: readonly LocalDate[];
};

type PreparedWorkSync = {
  synchronize(roots?: readonly DomainRootRef[]): Promise<WorkSyncResult>;
};

async function prepareAffectedWork(
  trx: Knex.Transaction,
  scope: ExistingRootScope | NewRootScope,
  context: WorkCommandContext,
): Promise<PreparedWorkSync>;
```

For the ordinary existing-record path, a durable root ID plus `expectedClientCompanyId` is sufficient. The company ID is a validation boundary and lookup hint, not authority: the adapter must prove the root belongs to that company and must resolve the applicable work-owning Engagement from current database relationships. The producer's registered service domain distinguishes bookkeeping from future tax or other engagements.

New roots are the necessary exception. Before an ID exists, the coordinator needs the client company and effective accounting dates so it can resolve and lock the affected Fiscal Periods. After `INSERT ... RETURNING id`, the caller passes the resulting roots to `synchronize`. A command that moves an existing root to another accounting date likewise supplies the proposed date so both old and new periods can be locked before mutation.

This finite root union is not another catalogue of event “kinds.” It is the set of durable root identities already declared by the Work Type registry. The function does not receive claims such as `candidate_created`, `transaction_categorized`, or `affects_work = false`; it reloads current rows and derives the answer. New future tax Work adds a root adapter only when it introduces a genuinely new durable domain root.

Preparation and synchronization are deliberately separated because the close invariants require period locks before target mutation:

1. de-duplicate and deterministically order the supplied roots and dates;
2. find registered producers interested in each root type;
3. load and validate existing root scope, or validate the proposed new-root scope;
4. resolve the Fiscal Period and exactly one applicable work-owning Engagement;
5. acquire period/producer advisory locks, then reload and lock existing targets in the required order;
6. allow the source command to insert or mutate authoritative domain state through the same `trx`;
7. reload current roots, derive desired occurrences, and reconcile `work_items`;
8. write correlated `audit_events` for material Work transitions;
9. write only after-commit projection, notification, asynchronous evaluation, and recovery intents to the outbox.

PostgreSQL reads a transaction's own writes, so synchronization can reliably load rows returned by an uncommitted insert. If preparation, source mutation, or Work synchronization fails, none of them commit.

### Performance and caching contract

Correctness never depends on Redis or a process-local Engagement cache at launch. Engagement ownership can change at a transfer boundary, so every Work write is authorized and resolved against indexed database state inside its transaction.

The fast path is:

- cache the immutable deployed Work Type/producer registry in process;
- cache resolved `(client company, service domain, Fiscal Period) -> Engagement` values only inside the prepared transaction;
- group roots by type and scope, batch-load targets, resolve each Engagement/Period once, load existing Work in one set-based query, and write only the diff;
- let each producer compute a small dependency fingerprint from the authoritative before/after state; when that fingerprint is unchanged, skip the Work query and writes;
- return immediately when no registered producer is interested in the root type.

The producer owns the conservative relevance decision. A caller cannot suppress reconciliation by claiming that a change is irrelevant: provably irrelevant changes skip; unknown or possibly relevant changes reconcile. Redis may later accelerate read projections or act as a version-checked lookup hint, but a cache hit can never authorize or determine an authoritative Work transition.

The result may contain changed Work IDs and queue-invalidation scopes for use by the outer command response, but callers never choose the Work transitions themselves. Expensive discovery may run asynchronously, but the worker that persists its authoritative Finding, candidate, or other durable result synchronizes the corresponding Work in that same transaction.

## 3. Idempotent occurrence algorithm

For each `(engagement_id, work_type_code, target_id)`:

- **Predicate false, no open row:** no-op.
- **Predicate false, open row:** end it as `resolved` with the producer's reason.
- **Predicate true, no open row:** insert a new open occurrence with required period, assignee, assignment basis, and due time.
- **Predicate true, matching open row:** update only a changed period, due time, assignee/basis, or producer-controlled semantic field; increment `version` and audit the change.
- **Predicate true after an earlier occurrence ended:** insert a new occurrence; never reopen the historical row.
- **Target replaced by a different target:** end the old occurrence as `superseded`, optionally link it to the replacement Work Item, and create the replacement occurrence.

The partial unique index on open `(engagement_id, work_type_code, target_id)` is the final race guard. A uniqueness conflict causes the reconciler to reload and converge, not create duplicates.

### Effective operational deadline

Every producer resolves the affected period's current operational deadline before inserting or re-evaluating Work:

1. when the period is covered by an active Catch-up/Reclose Package, use `close_packages.due_at`;
2. otherwise use the routine Period Close/domain deadline.

Package acceptance, split/replacement, transfer replacement, and authorized deadline change persist the Package deadline into every covered open `period_closes.due_at` and `work_items.due_at` in the same range-locked transaction. New Work created later inherits the same Package deadline. Recovery treats any mismatch as drift and repairs it through the same versioned/audited reconciliation path.

Consequently, a historical import outside an accepted Package may be immediately overdue when its routine deadline has passed. Work inside an active Package is overdue only after the Package deadline passes; old routine deadlines never inflate queue counts or copy for covered months. No producer or projection recomputes a hidden deadline override at read time.

## 4. Exact launch Work Type catalogue

### 4.1 `categorize_bank_transaction`

| Property        | Launch contract                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `bank_transaction` / `bank_transaction`                                                                                                                                                                                      |
| Outstanding     | Transaction is active, not deleted, not linked to a posted ledger transaction, has no active `pending_review` categorization candidate, and its bank date does not require the unresolved closed-period posting decision.    |
| Period          | Monthly Fiscal Period containing `transaction_date`.                                                                                                                                                                         |
| Due             | A covering active Package's deadline; otherwise that period's configured routine Close deadline. A historical import is immediately overdue only when it is outside an accepted Package and its routine deadline has passed. |
| Assignment      | Primary Bookkeeper, with the operating-model fallback only when required responsibility repair is in progress.                                                                                                               |
| Close effect    | Blocking Work.                                                                                                                                                                                                               |
| Primary surface | Ordinary queue; shared `categorization` workspace.                                                                                                                                                                           |
| Safe bulk       | None at launch; the user must supply or select accounting treatment.                                                                                                                                                         |
| Ends            | Posted, deleted/reversed at source, or superseded when a reviewable candidate becomes current.                                                                                                                               |

Insertion of bank transactions creates this Work in the same transaction only when the bank-date period is open. If that period is closed/locked, the producer suppresses ordinary categorization/candidate-review Work and synchronizes the `transaction_dated_in_closed_period` Finding instead. Rule/ML enrichment remains asynchronous, but candidate persistence synchronously transitions the Work for the affected bank transaction only after an eligible posting period exists.

### 4.2 `review_categorization_candidate`

| Property        | Launch contract                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `categorization_candidate` / `bank_transaction`                                                                                                                                                    |
| Outstanding     | Candidate is the one active `pending_review` candidate; source transaction is active and unposted; no unresolved closed-period posting decision currently prevents the proposed accounting action. |
| Period          | Monthly Fiscal Period containing the source transaction's `transaction_date`.                                                                                                                      |
| Due             | Same effective operational deadline as its source transaction.                                                                                                                                     |
| Assignment      | Primary Bookkeeper.                                                                                                                                                                                |
| Close effect    | Blocking Work.                                                                                                                                                                                     |
| Primary surface | Ordinary queue; the same `categorization` workspace as uncategorized transactions, but a separate group.                                                                                           |
| Safe bulk       | Bounded accept/post of current candidates; each target is revalidated and independently committed, with target-specific results.                                                                        |
| Ends            | Candidate accepted/autoposted, rejected, replaced, expired because the source posted, or source transaction deleted.                                                                               |

The database already enforces at most one active pending candidate per bank transaction. Persisting a replacement candidate closes the old candidate, supersedes its Work, and creates the new candidate Work in the same transaction. Rejecting a candidate resolves its Work and re-materializes `categorize_bank_transaction` for the still-unposted source.

### 4.3 `review_draft_journal`

| Property        | Launch contract                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `journal_batch` / `journal_batch`                                                                                                                                                                                                                 |
| Outstanding     | Journal is an active draft and either (a) `journal_source = generated_from_template`, or (b) its Period Close is Preparing or Awaiting Approval. A one-off manual draft is deliberately absent during ordinary in-period bookkeeping and Preview. |
| Period          | Monthly Fiscal Period containing the journal date.                                                                                                                                                                                                |
| Due             | Period Close's persisted effective operational deadline.                                                                                                                                                                                          |
| Assignment      | Primary Bookkeeper.                                                                                                                                                                                                                               |
| Close effect    | Blocking Work whenever materialized; all draft journals are also proven absent by close submission.                                                                                                                                               |
| Primary surface | Ordinary queue; once close is active, the same blocking Work is also reachable inside the Close workspace. Both paths open the journal workspace.                                                                                                 |
| Safe bulk       | Post or void selected valid drafts as independent transactional units, returning target-specific results.                                                                                                                                        |
| Ends            | Posted, voided, superseded, or deleted under the journal domain's valid terminal rules.                                                                                                                                                           |

The existing `journal_source` distinction is sufficient; no new origin field is required. When Period Close enters Preparing, the close command scans that one period's manual drafts and synchronizes them. A manual draft created during Preparing is materialized immediately. A manual draft created while approval is pending also stales the submitted Close Version and returns the close to Preparing in the same transaction.

### 4.4 `restore_bank_connection`

| Property        | Launch contract                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `bank_connection` / `bank_connection`                                                                                                                                                                                                                                 |
| Outstanding     | `bank_connections.authorization_status = 'requires_action'` and the connection still has at least one active feed for a non-deleted bank account. `active` remains system-managed; `revoked` is an intentional terminal disconnection. Neither qualifies.             |
| Period          | Earliest active Close Frontier that any active feed on the connection can affect; otherwise the current in-progress monthly period. Only one occurrence exists per connection even when it supplies several bank accounts, and it reanchors as the frontier advances. |
| Due             | Anchored period's persisted effective operational deadline.                                                                                                                                                                                                           |
| Assignment      | Eligible client contact by default because reauthorization commonly requires the account holder; fallback routing must produce one real assignee.                                                                                                                     |
| Close effect    | Blocking by default.                                                                                                                                                                                                                                                  |
| Primary surface | One persistent client action/banner for the connection, showing its affected bank accounts; visible as waiting work to the Primary Bookkeeper and Client Lead.                                                                                                        |
| Safe bulk       | None.                                                                                                                                                                                                                                                                 |
| Ends            | Connection returns to `active`, is deliberately `revoked`, no longer has an active relevant feed, or the Client Lead accepts evidenced alternative records/non-applicability for the anchored period.                                                                 |

A Bookkeeper does not silently “ignore” the condition. The first supported completion is verified provider reauthorization (or deliberate revocation/no active feed). An alternative-records path is blocked until a named Accounting Finding defines its exact evidence, decision authority, period anchoring, and resolution semantics. A Finding Resolution can never exist unattached to such a Finding.

An `active` connection whose transaction sync attempt failed does not create Work: the system records the attempt in `bank_transaction_sync_runs` and retries automatically, while current feed checkpoint/freshness remains on `bank_account_feeds`. Users cannot repair provider or application processing. A deliberately `revoked` connection stops its feeds and emits a disconnection notification to the relevant client/firm parties; it does not ask the client to reconnect. Any later accounting-completeness concern is evaluated from accounting facts and feed freshness, not inferred from revocation itself.

### 4.5 `resolve_accounting_finding`

| Property        | Launch contract                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `accounting_finding` / `accounting_finding`                                                                                                                                                 |
| Outstanding     | Finding is currently `detected` and has neither an evaluator-confirmed correction nor an effective accepted/not-applicable Resolution matching its exact definition version and facts hash. |
| Period          | Finding's required monthly Fiscal Period.                                                                                                                                                   |
| Due             | That period's persisted effective operational deadline.                                                                                                                                     |
| Assignment      | Primary Bookkeeper by default; the Finding definition may require Client Lead decision for a restricted professional exception.                                                             |
| Close effect    | Registry-defined: blocker, required review, or advisory. No mutable `blocks_close` value lives on Work.                                                                                     |
| Primary surface | Ordinary queue; when the affected close is active, the same Finding Work is also composed into the Close workspace.                                                                         |
| Safe bulk       | Only definition-approved homogeneous acknowledgement strategies; corrections remain target-specific domain commands.                                                                        |
| Ends            | Evaluator clears the predicate, or a currently matching authorized professional Resolution satisfies it.                                                                                    |

### 4.6 `respond_close_confirmation`

| Property        | Launch contract                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `close_confirmation` / `close_confirmation`                                                                                               |
| Outstanding     | Required Confirmation lacks a current satisfying Response for its exact definition version and context hash.                              |
| Period          | Confirmation's monthly Fiscal Period.                                                                                                     |
| Due             | Period Close's persisted effective operational deadline.                                                                                  |
| Assignment      | Primary Bookkeeper.                                                                                                                       |
| Close effect    | Close-domain state; a required unsatisfied Confirmation blocks submission.                                                                |
| Primary surface | Close workspace only; it contributes to the one Close cluster rather than a duplicate ordinary group.                                     |
| Safe bulk       | Allowed only where the Confirmation definition explicitly permits the same answer/evidence over selected independent monthly obligations. |
| Ends            | A current satisfying Response is recorded or the Confirmation is superseded/no longer applicable.                                         |

### 4.7 `approve_period_close`

| Property        | Launch contract                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Target / root   | `period_close_version` / `period_close_version`                                                                   |
| Outstanding     | Version is current, frozen/submitted, undecided, and its Period Close is Awaiting Approval.                       |
| Period          | Version's Period Close month.                                                                                     |
| Due             | Period Close's persisted effective operational deadline.                                                          |
| Assignment      | Current Client Lead; responsibility changes reroute the same Work occurrence.                                     |
| Close effect    | Close-domain state.                                                                                               |
| Primary surface | Approval queue and the one Close cluster.                                                                         |
| Safe bulk       | Package approval is the bounded all-or-nothing bulk command; unrelated monthly approvals remain independent.      |
| Ends            | Approved, rejected, made stale by material change, superseded by reopening, or superseded by engagement transfer. |

When one actor is both Primary Bookkeeper and Client Lead, `reviewAndClosePeriod` or `reviewAndClosePackage` submits and approves atomically and creates no self-addressed approval Work.

### 4.8 `review_period_reopen_request`

| Property        | Launch contract                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target / root   | `period_reopen_request` / `period_reopen_request`                                                                                                                                             |
| Outstanding     | Request is `pending`, still belongs to the current bookkeeping Engagement, and its affected period remains closed/unlocked and eligible for review.                                           |
| Period          | Request's earliest affected Fiscal Period. A closed anchor is valid because the action reviews/reopens rather than posts into it.                                                             |
| Due             | Current Close Frontier's persisted effective operational deadline. If it has passed, the review is overdue immediately. Without a frontier, use the current in-progress month's routine Close deadline. Widening may move the deadline earlier but never later. |
| Assignment      | Current Client Lead, even when another authorized Firm Admin/reopen-capable actor may decide it. Responsibility change reroutes Work; Engagement transfer supersedes the request.               |
| Close effect    | The underlying retroactive Finding blocks the current Close Frontier; this reviewer Work does not duplicate that blocker.                                                                     |
| Primary surface | The client's single Close row and dedicated Reopen Request workspace. It contributes to personal counts and the continuous stream, but never creates a duplicate ordinary Work Group.         |
| Safe bulk       | None. Each request may reopen a different client-wide sequence.                                                                                                                               |
| Ends            | Approved with a successful cascade, rejected with a required note, superseded by transfer/wider request/no-longer-applicable impact, or made obsolete because the period is no longer closed. |

Request creation does not resolve or replace any covered retroactive Finding Work. It makes those Findings waiting on the Client Lead. `trigger_accounting_finding_id` records initiating provenance only; the request's reviewed impact may contain several currently unresolved registered retroactive Findings across the cascade. Approval and rejection re-evaluate that complete current set. Rejection resolves only review Work and returns every still-open covered Finding Work to its current eligible bookkeeper with the reviewer note.

## 5. Producer modules and exact integration seams

| Producer module      | Work Types                                                       | Source-changing integration seams in Accountable Books                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bank bookkeeping     | `categorize_bank_transaction`, `review_categorization_candidate` | Bank transaction import/soft deletion/batch reversal; candidate insert/replace/reject; manual candidate post; autopost; ledger source linking; ledger reversal/supersession. The central ledger mutation service is the final common posting seam.                                                                                                                                                   |
| Journal              | `review_draft_journal`                                           | Create/copy/update/void/post draft; recurring-template occurrence generation; batch post/void; Period Close transition to Preparing; journal reversal only insofar as it creates a new draft or stales a close.                                                                                                                                                                                      |
| Bank connection      | `restore_bank_connection`                                        | `bank_connections` transition into or out of `requires_action`, connection reauthorization/replacement/revocation, active-feed replacement/retirement, and Lead alternative-record decision. Reconnect notifications project `requires_action`. A `revoked` transition resolves reconnect Work if present and separately projects a deliberate-disconnection notification; it does not produce Work. |
| Finding              | `resolve_accounting_finding`                                     | Async evaluation transaction, finding-resolution command, accounting corrections that change Finding facts, close submission full evaluation, reopen, and engagement transfer.                                                                                                                                                                                                                       |
| Confirmation         | `respond_close_confirmation`                                     | Begin close preparation, response command, context-changing accounting command, reopen, and transfer.                                                                                                                                                                                                                                                                                                |
| Close approval       | `approve_period_close`                                           | Submit, reject, stale, approve, review-and-close, package submit/approve/split, cascading reopen, responsibility replacement, and engagement transfer.                                                                                                                                                                                                                                               |
| Period reopen review | `review_period_reopen_request`                                   | Late-impact Finding request command, request impact refresh, Lead approve/reject, direct cascade, locked-period discovery, responsibility replacement, and Engagement transfer.                                                                                                                                                                                                                      |

Engagement-team and transfer commands are routing/lifecycle integrations, not additional producers. They reroute basis-assigned open Work or supersede/rematerialize it under the receiving Engagement without changing Work Type semantics.

## 6. Launch Accounting Finding evaluation catalogue

The old close-readiness catalogue is not adopted wholesale. It currently mixes source Work, system consistency barriers, confirmations, implemented evaluators, aspirational heuristics, and future subledger features. The exact launch catalogue contains only the twelve definitions that satisfy the authoritative-input, deterministic-evaluator, clear-reasoning, legitimate-resolution, lifecycle, and complete-vertical-slice admission rule in [Full Launch Scope and Evidence-Based Finding Catalogue](full-launch-scope-and-finding-catalogue.md).

### Bank-import finding, evaluated at transaction ingestion

| Finding code                         | Durable target   | Why it is a Finding                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction_dated_in_closed_period` | Bank transaction | The immutable bank date falls in a closed/locked month while the transaction remains unmatched/unposted. The correct treatment may be a non-mutating existing match, an open `fs_date`, or an authorized cascading reopen, so ordinary categorization Work is suppressed until that professional decision is resolved. |

The Finding is anchored to the affected historical month but is registered as a retroactive impact that also blocks the current Close Frontier. A safe match that changes no material ledger fact may clear it without reopening. Open-period treatment preserves bank date, validates the chosen `fs_date`, categorizes/matches, and audits both dates atomically. Reopen approval only opens the period sequence; it then allows ordinary categorization Work to materialize.

### Transaction/ledger findings, evaluated asynchronously after posting

| Finding code                                          | Durable target                        | Why it is a Finding                                                                                          |
| ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bank_offset_to_non_cash_account_review`              | Ledger transaction or offending entry | A posted bank movement appears to use an invalid destination; correction or supported treatment is required. |
| `bank_receipt_direct_to_revenue_review`               | Ledger transaction/entry              | Accrual-basis treatment may require receivable or deferred-revenue handling.                                 |
| `supplier_payment_direct_to_expense_review`           | Ledger transaction/entry              | Accrual-basis treatment may require payable/accrual handling.                                                |
| `suspense_activity_review`                            | Ledger entry                          | Suspense/fallback treatment must be corrected or accepted with evidence.                                     |
| `receivable_payable_missing_counterparty_review`      | Ledger entry                          | Counterparty-required account lacks a contact.                                                               |
| `missing_supporting_document_review`                  | Ledger transaction                    | Registered policy requires evidence for the posted journal/treatment.                                        |
| `journal_posted_to_bank_account_review`               | Ledger transaction/entry              | Direct manual-journal movement of a bank account needs correction or explicit treatment.                     |
| `accumulated_depreciation_unexpected_movement_review` | Ledger transaction                    | Accumulated-depreciation movement lacks the expected accounting pair.                                        |

These policies all run after ledger commit through a transactional outbox intent. The worker reads current ledger facts, applies the versioned Finding registry, and writes Findings plus Work atomically. This slight delay preserves posting responsiveness without weakening close correctness.

### Period findings, evaluated after period end and at close barriers

| Finding code                                   | Durable target | Launch timing                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixed_asset_depreciation_review`              | Fiscal Period  | Evaluate once the period has ended; resolution may create or link an appropriate monthly, recurring-with-end-date, annual, or Package-range journal, post another justified treatment, or record supported professional non-applicability. Catch-up evaluation considers the Package range so it does not nag for a monthly entry when appropriate range evidence exists. |
| `fx_revaluation_decision_review`               | Fiscal Period  | Evaluate after period end when open monetary positions exist and no current period revaluation is recorded; the correction path records the journal and FX position movement together.                                                                                                                                                                                    |
| `cash_fixed_asset_or_liability_pattern_review` | Fiscal Period  | For modified-cash books, require review only when posted activity uses relevant asset/liability accounts; evidence identifies the exact accounts and entries, and correction or a reasoned professional decision resolves it without asserting that the treatment is wrong.                                                                                               |

The evaluator may use per-ledger internal signals as inputs, but those signals are implementation details, not separate user-facing Work or another authoritative workflow table. A period Finding has one stable identity and versioned facts.

### Close invariants, not Findings or Work

- prior managed month must be closed;
- submitted Close Version must still match current accounting facts;
- required policy evaluation must be caught up to the ledger state;
- required connected-bank feed freshness/completeness must be current enough for the close policy;
- trial balance must balance;
- required GL balances must be current;
- Fiscal Period must be open and unlocked;
- ordinary blocking Work, Findings, and Confirmations must be satisfied.

These are command preconditions. A user cannot “acknowledge away” a broken system invariant.

An active bank feed that remains behind after automatic retries is exposed by readiness as `waiting_on_system`, not materialized as user Work or an Accounting Finding. The close command retries/rechecks current `bank_account_feeds` freshness and cannot submit while required feed freshness is unsatisfied. The precise freshness window and API copy belong to the queue/read and command-contract tickets; an individual failed sync run is never the invariant.

### Catalogue closure rule

There are no deferred launch Finding entries. A concept without authoritative inputs, deterministic evaluation, clear evidence, legitimate user resolution, and an end-to-end tested slice is absent from the catalogue rather than named or registered as future or dormant policy. Any later expansion starts as a new product decision and must pass the same admission rule.

## 7. Exact launch Close Confirmation catalogue

Confirmations materialize only when Period Close enters Preparing. They are human statements, not failed automated checks.

### Modified cash basis

1. `off_bank_activity_considered` — all material off-bank transactions have been considered.
2. `reports_ready_for_review` — the period reports are ready to submit/close.

### Modified accrual basis

1. `revenue_completeness_considered` — all material period revenue has been considered.
2. `expenses_and_liabilities_completeness_considered` — all material expenses and liabilities have been considered.
3. `external_documents_considered` — relevant invoices, bills, and documents outside the app have been considered.
4. `reports_ready_for_review` — the period reports are ready to submit/close.

Catch-up Packages still create one monthly Confirmation and Response identity per month. The workspace may batch compatible answers, but evidence remains monthly and submission revalidates every included period.

## 8. Evaluation freshness and close submission

Every ledger mutation records an asynchronous evaluation intent containing affected ledger transaction IDs and period scopes. Close submission does not trust the asynchronous queue to be caught up and therefore needs no separate evaluation-watermark table. It is the synchronous final consistency barrier:

1. locks the close and current draft Version;
2. runs every applicable current policy definition against the locked/current accounting snapshot;
3. persists the resulting Finding states and evidence;
4. reconciles period Findings and every unresolved registered retroactive-impact Finding from earlier client periods, plus their Work;
5. reconciles ordinary Work and Confirmations for the period;
6. rejects submission if any required evaluation is behind or any requirement remains unsatisfied;
7. freezes the exact definition versions, facts/context hashes, effective Resolution/Response IDs, and accounting snapshot/hash in the Close Version snapshot.

An evaluator never resurfaces a Finding merely because an earlier decision exists. It first evaluates the current predicate, then applies a Resolution only when definition version and facts hash still match. Correction resolves only after the predicate clears; accepted/not-applicable resolves while the matching facts remain unchanged.

## 9. Recovery reconciliation

Recovery is a safety net, not the normal creation path.

Each producer exposes a cursor-based scan of authoritative rows that could currently be outstanding:

- active unposted bank transactions and active pending candidates;
- qualifying draft journals;
- bank connections in `requires_action` that still have an active relevant feed;
- detected Findings lacking a current effective Resolution;
- required Confirmations lacking a current satisfying Response;
- current submitted undecided Close Versions.

Package recovery additionally scans active Package ranges for open Period Close/Work deadlines that differ from Package `due_at`. It repairs those copies under the Package/range locks, increments affected versions, audits the drift correction, and invalidates the relevant queue/close projections.

A second scan finds open Work whose source target no longer satisfies its predicate. Both paths invoke the same occurrence algorithm. Sweeps are bounded by firm/client/producer scope, use `FOR UPDATE SKIP LOCKED` or deterministic advisory locks, emit metrics for missing/orphaned/changed rows, and can run after deployment, on a schedule, or for an operator-requested scope. They never derive current state from `audit_events`, `activity_events`, notifications, or outbox history.

## 10. Source audit findings

The current Accountable Books code provides reliable source and integration seams for the new side-by-side system:

- immutable bank transaction insertion, soft deletion, batch reversal, and source-to-ledger linkage;
- provider-agnostic `bank_accounts` that survive feed replacement, authorization failure, and revocation;
- `bank_connections` as the owner of authorization lifecycle (`active`, `requires_action`, `revoked`) and one client reauthorization action across all of its feeds;
- `bank_account_feeds` as the owner of provider account identity, sync-from date, cursor, initial completion, last successful sync, replacement lineage, and current state version;
- `bank_transaction_sync_runs` as bounded structured attempt history containing outcome, timing, counts, retryability, failure classification, and sanitized diagnostics;
- at most one active pending categorization candidate per bank transaction;
- candidate replacement/rejection/autopost lifecycle;
- journal status and exact `one_off` versus `generated_from_template` origin;
- central ledger posting with source locks and after-commit processing;
- complete provider-page buffering followed by atomic transaction/feed-checkpoint application, so failed pages or application do not create partial feed coverage;
- automatic retry of failures while authorization remains active, with `requires_action` reserved for reauthorization;
- durable provider-removed, superseded, and replacement-unmatched banking facts that can become Accounting Findings when professional review is actually required;
- monthly Fiscal Period ownership and posting guards;
- per-ledger and period-level close-evaluation inputs;
- transactional audit, activity, notification, and outbox infrastructure.

The revised banking model removes the previously suspected need for any **Work Queue and Close V2-owned** sync-incident/coverage table. Transaction application and feed-checkpoint advancement are atomic; current completeness/freshness comes from `bank_account_feeds`; attempt diagnostics and failure history already belong to `bank_transaction_sync_runs`. A failed run produces no Work, and Work Queue and Close V2 adds no sync-failure fields.

Notifications and sync-run outcomes never become Work authority. If a sync exposes a durable accounting exception—such as a provider-removed transaction or an unmatched transaction after feed replacement—the relevant evaluator may materialize an Accounting Finding from that banking fact, and `resolve_accounting_finding` provides the user action. An optional historical-import offer remains a notification/offer rather than mandatory Work. Work Queue and Close V2 does not adapt or incrementally repair the legacy Work/task systems.

## 11. Acceptance tests

The producer layer is not complete until these pass:

1. Inserting 100 bank transactions creates exactly 100 categorization Work Items in the same commit; retry creates none.
2. Candidate promotion supersedes categorization Work and creates candidate-review Work atomically.
3. Candidate replacement leaves one open review Work; rejection returns the transaction to categorization Work.
4. Posting manually or by autopost leaves no categorization/review Work and schedules Finding evaluation once.
5. Deleting an unposted bank transaction resolves all related Work; posted transactions cannot be deleted through that path.
6. Manual one-off draft is quiet before Preparing; generated draft is immediate; Preparing materializes every still-open manual draft for that period.
7. Posting/voiding a journal resolves Work; a material journal command during approval stales the Version and resolves approval Work atomically.
8. Manual accounts and active connections create no reconnect Work; a failed sync run remains system-owned; `requires_action` creates exactly one client reconnect occurrence per connection even when it has several feeds; reauthorization resolves it; `revoked` creates no occurrence (and resolves an existing one) while emitting a disconnection notification; frontier advance reanchors only an outstanding connection occurrence.
9. Finding evaluator retry does not duplicate Findings or Work; a matching Resolution suppresses Work; changed facts invalidate that applicability.
10. Close submission refuses stale policy evaluation or insufficient required bank-feed freshness and succeeds only against fully current Work, Findings, Confirmations, and accounting state; a system-owned sync delay is reported as waiting on the system without user Work.
11. Submission creates one approval Work for the current Client Lead; responsibility replacement reroutes it; same-person close creates none.
12. Package submission creates one approval occurrence per included monthly Version and package approval resolves all in one transaction.
13. Engagement transfer ends old-firm open Work and materializes receiving-firm Work without rewriting history.
14. Recovery from deliberately deleted/missing Work rows converges exactly to source truth and reports every repair.
15. An existing-root command rejects a mismatched `expectedClientCompanyId`; the caller cannot use it to select another Engagement.
16. A new-root command locks the supplied effective periods before insertion, then sees `INSERT ... RETURNING` roots and creates Work in the same uncommitted transaction.
17. A period-moving command locks both old and proposed periods and reanchors or replaces Work without an unlocked interval.
18. A batch of roots in one company, service domain, and period resolves its Engagement once and reconciles Work with set-based reads and writes.
19. A source change whose producer dependency fingerprint is unchanged performs no Work read or write; an unknown change still reconciles.
20. A stale process or Redis cache can never route Work to a former Engagement because the write path validates indexed database truth.
21. Importing an unmatched transaction whose bank date is in a closed month creates no categorize/candidate Work and exactly one `transaction_dated_in_closed_period` Finding Work under the current Engagement.
22. A non-mutating match to an existing closed-period posting clears the Finding without reopening; an open-`fs_date` categorization preserves bank date and commits accounting/Finding/Work together.
23. A bookkeeper reopen request leaves the Finding unresolved, creates exactly one Client Lead review Work, and a required-note rejection returns the Finding Work to the bookkeeper.
24. Direct or approved reopening crosses predecessor Version attribution safely, rejects locked months atomically, and creates ordinary categorization Work only after the affected month is open.

## 12. Banking integration disposition

Work Queue and Close V2 adds no banking sync table and no sync-failure Work Type. The banking domain already owns the necessary identities: provider-agnostic accounts, authorization-scoped connections, per-account feeds/checkpoints, and structured sync-run history. `bank_connections.authorization_status = 'requires_action'` produces one `restore_bank_connection` occurrence per connection; active-connection failures retry automatically without user Work; `revoked` projects a deliberate-disconnection notification without reconnect Work. Close readiness may wait for required feed freshness, but it never converts a system-owned retry into a fictional user action.
