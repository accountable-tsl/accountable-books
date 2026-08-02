# Bank Connection and Sync Ownership — Implementation Plan

Status: foundation + Milestones 1–6 complete; M5b deferred; Milestone 7 remains

Last reviewed: 2026-07-18 (M6 complete — sync health + quarantine ops alert)

## Purpose

Separate the durable accounting account from provider authorization and the
provider-specific transaction stream without redesigning unrelated Work, Close,
notification, webhook, or outbox systems in the same change.

This replaces the previous broad plan. The earlier implementation is preserved
in `stash@{0}` as reference material, not as code to reapply wholesale.

`my-notes/bank-conn-plan-old.md` is historical reference only. It is not an
implementation checklist for this branch, and its broader Work, Close,
Finding, notification, webhook, and outbox changes must not be restored into
this ownership foundation without separate evidence and acceptance criteria.

## Implementation Status

Slices 1-5 below are implemented on the current branch as the ownership
foundation. They establish the target owners, migrate the existing connect and
per-account sync paths, preserve existing public projections, and remove the
superseded credential/account-sync storage model.

This status does not mean the complete bank connection and synchronization
system is finished, but the pre-release lifecycle and durable-sync blockers
through Milestone 4 are resolved, M5a exception review resolution is
complete, and Milestone 6 customer sync-health projections plus quarantine
ops alerting are in place. Milestone 5b (coverage Findings) is deferred until
stronger evidence exists. Remaining active roadmap work is launch verification
(Milestone 7).

### Progress since the foundation (reviewed 2026-07-17)

Work beyond Milestone 0 has landed against the roadmap:

- Milestone 1 (Reliable Sync Requests and Recovery) — **complete**. Sync
  execution is outbox-owned through a leased, out-of-transaction path; connect,
  manual, webhook, and scheduled producers all write or coalesce a durable
  request and return; the old BullMQ sync-execution path and its direct
  producers are removed (BullMQ only schedules the daily scan and expiry sweep,
  which write intents). Lease ownership is token-guarded so an expired claim is
  recoverable and an obsolete owner cannot apply or complete work; retryable
  failures use bounded backoff and terminal failures dead-letter and alert.
- Milestone 2 (Complete Connection Lifecycle) — **complete**. The establishment
  path classifies each Link result (first / same-item reauth / replacement /
  ambiguous-needs-confirmation) by provider item identity, never by mask. Reauth
  reuses the connection, rotates the secret, reactivates existing feeds, and
  resumes incrementally without a fresh initial sync or history offer;
  replacement creates new feeds with a durable replaces-link and retires the old
  connection with secret destruction; single-feed stop and whole-connection
  revocation are explicit idempotent commands that cancel only unleased pending
  sync intents so nothing resurrects a dead feed.
- Milestone 3 (Production-Grade Feed Synchronization) — **complete**. Provider
  pagination and date windows are adapter-owned, bounded, and applied atomically
  behind the feed apply-guard; feeds advance independently; stale, failed, and
  abandoned work cannot apply. Replacement-feed observations are reconciled
  against the predecessor feed within its coverage window: exact date+amount
  matches are adopted onto the existing canonical transaction (preserving
  categorization and ledger links), unmatched in-window observations import as
  new and raise a review signal, and a completion marker stops the predecessor
  scan on later syncs.
- Milestone 4 (Durable Provider Events) — **complete**. Plaid webhooks verify,
  then store a `bank_provider_webhook_events` row and a
  `PROVIDER_WEBHOOK_RECEIVED` outbox intent in one transaction before 200;
  ingest failure returns 500 so the provider retries. Dedupe is
  time-bucketed `sha256(rawBody)` (10-minute window) so at-least-once
  redeliveries collapse while identical steady-state `SYNC_UPDATES_AVAILABLE`
  payloads still nudge sync later. The fast-lane processor maps
  `SYNC_UPDATES_AVAILABLE` → coalesced sync request,
  `USER_PERMISSION_REVOKED` → M2 revoke, known no-ops → completed, unhandled →
  quarantine; missing connection retries via outbox then quarantines on
  dead-letter. Mono remains schedule/poll only — no Mono webhook inbox.
  Retention purge stays deferred to M7; quarantine ops alerts landed in M6.
- Milestone 5 (Accounting Exceptions) — **M5a complete; M5b deferred**.
  Superseded, provider-removed, and replacement-unmatched reviews have terminal
  bookkeeper resolve actions (attention-based). Coverage-evidence Findings and
  Work are **not** being built now: feed dates alone cannot prove real period
  incompleteness without false alarms (see M5b).
- Milestone 6 (Customer Health and Operations) — **complete**. Bank account
  APIs expose `syncHealth` separately from `bankConnectionStatus` (24h
  freshness; hide transient sync blips while last success is fresh). Inline
  webhook quarantine alerts ops post-commit; dead-lettered webhooks keep only
  the existing outbox alert.

Additional delivered behaviour not separately numbered: pre-connection history
is quarantined as candidates, promoted on an explicit bookkeeper date selection,
and expires on a fixed offer window with a reminder; and the bank-side recorded
balance is derived from a provider-reported anchor kept distinct from the
recalc-owned computed cache.

### Settled product decisions (2026-07-18)

- A successful reauthorization returns the new selected-account set. Existing
  returned accounts resume; existing omitted accounts are intentionally stopped;
  newly returned accounts are connected; and an empty returned set changes
  nothing. Reconnect attention clears for both resumed and intentionally stopped
  accounts.
- Pre-connection history collection does not block connection success. Only a
  firm/bookkeeping user chooses an earlier starting date. The UI shows the
  observed range, count, and fixed 30-day deadline; a later choice may extend
  the accepted range backwards but never remove already accepted transactions.
  Importing history recalculates the bank-side position and never posts to the
  ledger.
- Connection health and sync freshness remain separate. Manual sync is available
  to clients and bookkeepers on an active authorization, acknowledges whether
  work was newly requested or already under way, and never starts a competing
  download. No synthetic progress percentage is shown.
- Provider corrections/removals are automatic only before a transaction reaches
  the ledger. Ledger-linked exceptions require an explicit bookkeeper decision,
  record actor/time/outcome, and clear their review attention/count. Replacement
  unmatched review remains `genuine` versus `duplicate`.
- Incidental sync-data defaults: successful webhook payloads are cleared on
  completion; quarantined raw payloads live no longer than 14 days; webhook-event
  metadata lives about 90 days; successful Sync Runs live 30 days and failed Sync
  Runs live 90 days. Redaction tests cover stored diagnostics and captured logs.
  Accounting-record and company-deletion retention are deferred to a country-by-
  country compliance pass and are not set by this milestone.

Frontend placement and visual treatment remain separate implementation work. The
backend must expose truthful commands and projections before that UI work begins.

Next up is **Milestone 7 — Security and Launch Verification**. Milestone 6
(customer sync health + quarantine ops alert) is done. M5b stays parked
until stronger coverage evidence exists.

## Evidence From the Baseline Code

At the `ecbdc6c5` baseline, the implementation stored five concerns on
`bank_accounts`:

- accounting identity and presentation;
- provider authorization linkage;
- provider account identity;
- per-account sync checkpoint and timestamps;
- current connection and sync-error state.

The baseline sync service already synchronized one bank account at a time. The
smallest architectural correction is therefore to move the provider binding and
checkpoint behind a feed-owned interface while preserving that public command.

The baseline connection establishment committed credentials and accounts
together. The queue request happened after commit and remains unchanged until
the separate outbox milestone.

## In Scope

- remove plaintext account numbers and replace duplicate protection with a
  keyed fingerprint;
- represent provider authorization as `bank_connections`;
- isolate encrypted tokens in `bank_connection_secrets`;
- represent the provider-account binding and checkpoint as
  `bank_account_feeds`;
- record minimal synchronization attempt history in
  `bank_transaction_sync_runs`;
- make provider transaction identity feed-scoped through
  `bank_transaction_feed_entries`;
- preserve existing bank-account API projections while deriving connection
  facts from the new owners;
- migrate existing connection establishment and per-account sync behavior;
- prove the final schema by rebuilding the test database from zero.

## Explicitly Out of Scope

- new Work Items, engagement tasks, Findings, or Close blockers;
- new customer completeness policy;
- new notification or activity behavior;
- changing webhook authorization classification;
- provider-side revocation and secret-destruction orchestration;
- replacing BullMQ execution with the outbox;
- replacement-feed duplicate-review workflows;
- new customer-facing status vocabulary;
- retention, partitioning, or operational dashboards.

Those concerns require their own evidence and acceptance tests. The ownership
schema may support them later, but this implementation will not create placeholder
modules or parallel lifecycle writers for them.

## Core Model

```text
bank_account
  `-- bank_account_feed -------- provider account identity + checkpoint
        |-- bank_transaction_sync_run
        `-- bank_transaction_feed_entry -- provider transaction identity

bank_connection --------------- provider authorization
  |-- bank_connection_secret --- encrypted operational material
  `-- bank_account_feed (one or more)
```

Ownership rules:

- `bank_accounts` owns durable accounting identity and presentation only;
- `bank_connections` owns provider authorization state;
- `bank_connection_secrets` owns encrypted provider tokens;
- `bank_account_feeds` owns provider account id, sync cursor, and sync times;
- `bank_transaction_sync_runs` owns attempt outcome and structured failure;
- `bank_transaction_feed_entries` owns feed-scoped provider transaction id;
- `bank_transactions` owns accepted accounting transactions, not provider
  identity.

## Invariants

1. A bank account may exist without a feed.
2. A connection may serve several feeds.
3. A bank account has at most one active feed.
4. `(bank_connection_id, provider_account_id)` is unique for all feed history.
5. Account, connection, and feed belong to the same company.
6. Ordinary connection/account reads cannot select encrypted token columns.
7. A sync advances only its feed's checkpoint.
8. Applying a fetched update requires the same active connection, feed binding,
   starting checkpoint, and feed state version observed before the provider call.
9. Provider transaction identity is unique by
   `(bank_account_feed_id, provider_transaction_id)`.
10. Canonical transaction changes, feed-entry changes, run completion, and
    checkpoint advancement commit atomically.
11. Manual and provider account numbers use the same normalization and keyed
    fingerprint path when a full number is available.
12. A mask is presentation data and is never an identity key.

## Public Test Seams

Tests are written only through these boundaries:

- account creation and retrieval commands;
- connection creation and ordinary/provider-execution repositories;
- connection establishment service;
- `TransactionSyncService.syncBankAccount`;
- existing bank-account list/detail API projections;
- database migration and constraint behavior.

Provider SDK calls may be mocked. Internal repositories are exercised against
the test database rather than mocked.

## Slice 1 — Account Identity

Purpose: remove plaintext account numbers without changing account behavior.

Changes:

- introduce one account-number identity module;
- normalize NFKC input and remove defined presentation separators while
  preserving semantic leading zeros;
- compute an HMAC-SHA256 fingerprint with an explicit version;
- persist only fingerprint, fingerprint version, and display mask;
- enforce active uniqueness by company, bank, and fingerprint;
- use the same path for manual and provider full-number inputs;
- never match provider accounts by mask.

Acceptance:

- known normalization/fingerprint vectors are stable;
- equivalent formatted numbers conflict for the same company and bank;
- the same number may exist for another company or bank;
- no plaintext number is persisted or returned;
- mask-only provider input does not match an existing account.

## Slice 2 — Connection and Secret Ownership

Purpose: separate authorization facts from token storage.

Changes:

- reorder `bank_provider_mappings` before connections;
- replace the undeployed credentials migration with `bank_connections`;
- add one-to-one `bank_connection_secrets`;
- expose explicit ordinary connection reads with allowlisted columns;
- expose a provider-execution secret read that requires an active connection;
- adapt connection establishment to write connection and secret atomically.

Preserved behavior:

- existing provider token exchange and connection response;
- current authorization classification and webhook behavior;
- queueing still occurs after the connection transaction.

Acceptance:

- ordinary reads contain no secret material;
- secret reads are company-scoped and require an active connection;
- connection and secret creation roll back together;
- existing connection establishment tests remain green.

## Slice 3 — Feed-Owned Synchronization

Purpose: move provider account binding and sync progress off `bank_accounts`.

Changes:

- add `bank_account_feeds` with provider account id, cursor, sync start date,
  initial completion, last success, state version, and revocation timestamp;
- adapt connection establishment to create one feed per selected account;
- keep the public sync command bank-account-oriented and resolve its active feed
  internally;
- load provider tokens only through the secret repository;
- lock and revalidate the feed before applying a fetched update;
- move batch lineage from credential to feed.

Acceptance:

- a manual account has no feed and is not syncable;
- one connection can own several independently synchronized feeds;
- only the synchronized feed's checkpoint advances;
- concurrent checkpoint/state-version changes reject stale application;
- inactive connection or revoked feed cannot sync or apply.

## Slice 4 — Feed Transaction Identity and Sync Runs

Purpose: make retries observable and provider identity correctly feed-scoped.

Changes:

- add minimal `bank_transaction_sync_runs` rows for running, succeeded, failed,
  skipped, and stale outcomes;
- add `bank_transaction_feed_entries` with a unique feed/provider transaction
  key and optional canonical transaction reference;
- resolve modifications and removals through feed entries, not
  `bank_transactions.idempotency_key`;
- retain the canonical idempotency key only for non-feed imports;
- commit feed entries, canonical changes, run completion, and checkpoint in the
  existing apply transaction.

Acceptance:

- replaying the same provider transaction on one feed is idempotent;
- the same provider id may appear on a different feed;
- modifications/removals resolve through the original feed entry;
- failed or stale attempts do not advance the checkpoint;
- a successful empty update still completes its run and checkpoint.

## Slice 5 — Derived Reads and Legacy Removal

Purpose: remove old storage fields while preserving the current public API.

Changes:

- derive existing `connectionStatus`, provider, mask, and last-sync fields from
  connection/feed facts in one projection module;
- update the metrics view, account repositories, controller schemas, web types,
  seeds, fixtures, and generated database types;
- remove generic lifecycle writes from bank-account updates;
- remove obsolete credential/account sync modules and fields;
- use the shared contracts package as the source of API/web banking schemas
  where a contract crosses the application boundary.

Acceptance:

- existing account list/detail responses remain compatible;
- repository-wide search finds no runtime consumer of removed columns/tables;
- shared API and web types do not duplicate the banking contract;
- focused API and web tests remain green.

## Commit and Verification Rules

Each slice is one or more dependency-complete commits. Every commit must build
and should leave the relevant focused tests green. Temporary compatibility code
may exist between commits on this unreleased branch only when it has a named
removal commit in the same slice; no dual writes survive the final branch.

Before completion:

1. rebuild the test database from zero and migrate up;
2. run banking, transaction, projection, and contract tests;
3. run workspace typechecking;
4. run the full test suite;
5. search for legacy table and column consumers;
6. perform a Standards and Spec review against this document;
7. commit only after blocking findings are resolved.

Non-constraint indexes introduced by this foundation must map to a current
runtime query or to a concrete foreign-key/lineage operation. Indexes intended
only for deferred operational projections should be added with those queries,
not pre-created here.

## Outcome Roadmap

The ownership foundation above is Milestone 0. The remaining work is organized
by observable behaviour rather than by tables or by the historical plan's
implementation prescriptions. `my-notes/bank-conn-plan-old.md` remains a useful
acceptance-scenario catalogue, but it does not choose the implementation.

### Milestone 1 — Reliable Sync Requests and Recovery

Outcome: every committed initial, manual, scheduled, or webhook sync request is
durable until it succeeds or reaches an explicit terminal outcome. Duplicate
requests and worker crashes do not duplicate canonical transactions or lose
work, and every real execution attempt has a durable Sync Run.

Acceptance:

- connection establishment commits one durable initial-sync request per new
  feed in the same transaction as the connection graph;
- callers write or safely coalesce a request and return without waiting for the
  provider;
- one existing execution system owns claim, retry, recovery, and terminal
  completion; the outbox and BullMQ never compete to own the same effect;
- provider work does not hold a database transaction open across the network
  call;
- an expired execution claim is recoverable and an obsolete owner cannot apply
  or complete work;
- retryable failures preserve the last committed checkpoint and use bounded
  backoff; terminal failures remain visible and alert operations;
- direct transaction-sync queue producers and the competing worker path are
  removed after all producers use the durable request interface.

Design constraint: the repository's outbox invariant requires handlers to own
the effect rather than mark an intent complete after relaying it to a second
queue. Banking therefore needs a leased, out-of-transaction execution path
inside the outbox module (or an equivalently strong extension of that existing
module), not another authoritative banking queue. The final interface must hide
claim, heartbeat, retry, and completion mechanics from request producers.

### Milestone 2 — Complete Connection Lifecycle

Outcome: manual creation, first connection, same-item reauthorization,
replacement connection, single-feed stop, whole-connection revocation, and
secret cleanup have explicit idempotent commands. Checkpoints and accounting
history are preserved whenever the authorization changes.

The current establishment path treats every successful Link as a first
connection: it unconditionally inserts a new connection, secret, and feeds, and
commits a fresh initial-sync request. That is correct only for a genuinely new
item. The core of this milestone is to classify the establishment event and
route it to the right lifecycle command, so that re-authorizing an existing bank
does not restart history collection, orphan a checkpoint, or leave a stale
secret behind.

Lifecycle events and intended behaviour:

- First connection: unchanged from today — new connection, secret, and one feed
  per selected account, with a durable initial-sync request per feed.
- Same-item reauthorization (the provider returns the same item for an account
  we already feed): reuse the existing connection, rotate the secret in place,
  and keep each existing feed with its checkpoint, sync times, history-import
  state, and provider-reported anchor intact. Do not create new feeds and do not
  request an initial sync; return the connection to active and request a normal
  incremental sync so a lapsed feed simply resumes.
- Replacement connection (a new item now serves accounts an old item used to):
  create the new connection and feeds, mark the superseded feeds and connection
  inactive, and record which new feed replaces which old feed so Milestone 3 can
  reconcile provider observations across the boundary without duplicating or
  discarding accepted transactions. Accounting history on the old feed is
  retained, not deleted.
- Single-feed stop: deactivate one feed without touching its siblings on the
  same connection or any accepted transactions; the account keeps its history
  and becomes non-syncable until re-established.
- Whole-connection revocation: deactivate the connection and all its feeds in
  one command, stop all future sync, and schedule secret destruction; accepted
  accounting transactions and checkpoints are preserved for audit.
- Secret cleanup: when a secret is superseded (rotation) or a connection is
  revoked, the old encrypted material is destroyed on an explicit, idempotent
  path, and no ordinary read can ever observe it.

Acceptance:

- re-authorizing an existing item reuses the connection and feeds, rotates the
  secret, advances no checkpoint backward, and triggers incremental — not
  initial — sync; no new history-import offer is created and no duplicate feed
  appears;
- a replacement item creates new feeds, retires the old feeds and connection,
  and leaves a durable replaces-link between old and new feeds; the old feed's
  accepted transactions remain;
- stopping one feed leaves sibling feeds syncable and all accepted transactions
  intact;
- revoking a connection stops every feed under it, preserves accepted history,
  and results in the connection's secret being destroyed;
- every lifecycle command is idempotent: replaying it commits no second effect
  and returns the same terminal state;
- an ordinary connection or account read never selects secret material at any
  lifecycle stage;
- feed identity honours invariant 4 — `(bank_connection_id,
  provider_account_id)` stays unique across all feed history, so reuse and
  replacement never collide on that key.

Design constraints:

- Classification is by the provider item identity already captured on the
  connection (`provider_item_id`) plus company and provider, resolved against
  the active connection graph before any write. Mask or display fields must
  never drive this decision (invariant 12).
- Reauthorization and revocation interact with the Milestone 1 durable request
  interface, not with any provider queue directly: reuse emits an incremental
  request, replacement emits initial requests for new feeds only, and revocation
  emits no request and must not leave a pending one that could resurrect a dead
  feed.
- Secret rotation and destruction commit atomically with the authorization
  change they belong to; a partial rotation must never leave two live secrets or
  zero live secrets for an active connection.
- This milestone introduces the replacement-feed relationship but not its
  reconciliation semantics; the actual cross-feed observation matching is
  Milestone 3 and must not be pre-built here.

Open decisions to settle before implementation:

- whether a replacement is detected automatically from provider item/account
  identity or requires an explicit user "replace" action, given the risk of
  auto-retiring the wrong feed;
- how account selection during reauthorization is reconciled when the user
  re-links a subset (or superset) of the previously fed accounts;
- the destruction timing for revoked-connection secrets (immediate in-command
  versus a scheduled cleanup), balanced against provider-side de-authorization
  needs noted in the out-of-scope list.

### Milestone 3 — Production-Grade Feed Synchronization

Outcome: provider pagination and date windows are bounded and atomic; feeds
advance independently; stale, failed, and abandoned work cannot apply; and
replacement-feed observations are reconciled without silently duplicating or
discarding canonical transactions.

### Milestone 4 — Durable Provider Events

Outcome: authentic provider webhooks are durably stored before acknowledgement,
deduplicated, processed asynchronously, and either completed, pending, or
quarantined with visible diagnostics.

Today the Plaid webhook endpoint verifies the signature (when configured),
parses the body, routes inline — writing a durable sync request for transaction
events or invoking a Milestone 2 lifecycle command for item events — and returns
200. Its error path also returns 200, so a delivery that fails routing or
processing is acknowledged and lost, with only a log line behind it. Redelivered
webhooks are not deduplicated, several item events are still no-ops, and an
unroutable delivery (unknown item, unhandled type) leaves no durable record or
operator-visible diagnostic. This milestone makes the webhook itself a durable,
deduplicated, asynchronously-processed event rather than fire-and-forget request
handling.

Event lifecycle and intended behaviour:

- Authenticate first: only signature-verified deliveries are accepted for
  storage; an unverified delivery is rejected without creating an event.
- Store before acknowledging: an accepted delivery is written to a durable
  provider-webhook-event record — raw payload, provider, item identity, type,
  and receipt time — and committed before the endpoint returns 200. The endpoint
  performs no routing or side effects inline.
- Deduplicate: a redelivery of an already-stored event is recognised and creates
  neither a second record nor a second downstream effect.
- Process asynchronously: a durable processor claims the stored event outside
  the request, translates the native event into the existing generic actions
  (wake the pending sync intent, or invoke a Milestone 2 lifecycle command), and
  marks the event completed. Processing reuses the Milestone 1 leased execution
  and never holds a transaction open across a provider or network call.
- Pending when not yet actionable: an authentic event whose target cannot yet be
  resolved (for example an item whose connection is still committing) is kept
  and retried, not dropped.
- Quarantine with diagnostics: an event that cannot be routed or that repeatedly
  fails processing moves to a terminal quarantined state with a stored reason and
  operator visibility; it is never silently discarded.

Acceptance:

- a verified delivery is persisted and acknowledged even if downstream routing
  later fails; a crash after acknowledgement loses no event;
- an unverified or unauthentic delivery creates no event and is rejected;
- a duplicate redelivery produces exactly one event and at most one downstream
  effect;
- transaction events wake the correct feed's pending sync intent without
  claiming or duplicating it, and item events drive the matching lifecycle
  command;
- an event for an unknown item or unhandled type is quarantined with a readable
  reason rather than acknowledged-and-forgotten;
- an event whose target is momentarily unresolvable is retried and eventually
  completes or quarantines under a bounded policy;
- webhook processing owns its effect and never relays into a competing queue
  (the repository outbox invariant).

Design constraints:

- Storage-then-acknowledge is the ordering contract: no side effect precedes the
  committed event record, and the HTTP response reflects successful storage, not
  successful processing.
- Reuse the existing durable execution: the stored event is the source of truth,
  and its processing is driven through the leased outbox path, not a new
  authoritative webhook queue. The processor wakes sync intents through the
  existing guarded reset and revokes through Milestone 2 commands.
- Signature verification remains the sole authenticity gate and precedes
  storage; verification configuration and secrets are unchanged except where
  storage requires them.
- Event records, states, and the processor interface are provider-neutral: Plaid
  is the first implementer, but nothing may encode Plaid-only assumptions.

Open decisions to settle before implementation:

- the deduplication key, given Plaid transaction-sync webhooks carry no native
  delivery id — a payload/content hash within a receipt window versus relying on
  downstream sync-intent coalescing for idempotency;
- whether Mono (and future poll-only providers) participate in this event store
  or remain purely scheduled, and how the interface expresses "no webhooks";
- retention of completed webhook-event rows (audit window versus prompt purge),
  consistent with the Milestone 7 minimization and retention rules;
- the bounded retry-to-quarantine policy for pending/unresolvable events, and
  whether quarantine raises an operational alert now or defers to Milestone 6.

### Milestone 5 — Accounting Exceptions

Outcome: uncertain bank observations that already affect (or may affect) the
books have an explicit bookkeeper review path. Period incompleteness Findings /
Work are deferred until the system can prove gaps without crying wolf.

This milestone has two halves of very different weight. M5a (exception review
resolution) is complete and grounded in concrete provider apply events. M5b
(coverage incompleteness) remains the harder trust problem for close — but with
today's evidence we cannot implement it honestly, so it is deferred rather than
shipped as a false detector.

#### Already delivered (do not rebuild)

Milestone 3 and the sync apply paths already raise durable review attention for
three bank-side exceptions and never silently fold them into ledger truth:

- provider material correction → superseded transaction +
  `bank.transaction_superseded_review`;
- provider removal of a posted transaction →
  `bank.transaction_removed_review`;
- replacement-feed in-window observation without a confident match → import as
  new with `replacement_unmatched` + `bank.replacement_unmatched_review`.

The shared `notification_attention_resolved` outbox path resolves these
attentions via M5a bookkeeper commands (see below).

#### M5a — Exception review resolution (attention-based) — **complete**

Each of the three signals has a terminal bookkeeper action that records an
auditable decision and stops re-raising the same attention for the same target,
reusing the existing attention keys and the `notification_attention_resolved`
path — no parallel exception store, and no new Work type.

Resolving a `replacement_unmatched` row as a confirmed duplicate retires the
imported bank transaction. Superseded and removed reviews are
acknowledge-and-clear only; the ledger stays bookkeeper-driven and is never
auto-reconciled by the resolution.

M5a is not speculative: each signal is raised from a specific apply outcome
(correction, removal, unmatched reconnect import). That is categorically
different from inferring a missing stretch of calendar time.

#### M5b — Coverage-evidence Findings and Work — **deferred**

**Position (2026-07-18):** do not implement M5b Findings or Work now.

**Why:** the intended outcome — prove that an account-period's bank data is
incomplete for the books — cannot be established reliably from feed dates alone
(`sync_from_date` / `last_successful_sync_at`). Those fields describe our
collection window, not whether the bank had activity we should have. A detector
built on them would false-alarm on:

- quiet or low-activity accounts (zero transactions ≠ a gap);
- newly opened accounts still ramping up or replacing an old account;
- intentional mid-month connect starts without history promotion.

Connection revoked / needs-reauth is also not incompleteness evidence: auth
health and coverage are separate.

**What would make M5b worth building later:** stronger evidence than feed
timestamps, for example accepted statements for an account-period, explicit
close-scope membership ("this account is in scope for period P"), or other
bookkeeper-declared coverage bounds. Until then, shipping incompleteness
Findings would erode trust rather than protect close.

**Do not substitute:** a weaker "collection window incomplete" alarm is not the
same product outcome and must not be renamed into `bank_data_incomplete` /
coverage Findings without a separate decision. Prefer leaving the gap visible
in ops/health (Milestone 6) over inventing false accounting Findings.

**When revisiting:** rewrite the coverage policy against the new evidence types
first; then reopen Finding identity, Work materialization
(`review_period_findings` / close-readiness), and reevaluation triggers. The
empty `findings` / `finding_decisions` migrations remain unused no-ops — do not
fill them as a banking-local store.

#### Acceptance (M5a — done; M5b — not in scope until un-deferred)

- each existing review signal has a terminal bookkeeper action leaving an
  auditable outcome and stops re-raising the same attention while resolved;
- resolving a replacement-unmatched row as a duplicate retires the imported
  transaction; resolving it as genuine clears the flag with the row intact;
- M5b acceptance (proven coverage gap → Finding → Work → clear on evidence)
  remains parked until the deferral above is lifted.

#### Design constraints

- Connection lifecycle status is never coverage evidence.
- No resolution or evaluation auto-reconciles superseded, removed, or unmatched
  rows into the ledger.
- Reuse the Milestone 1 outbox and existing Work materialization for durable
  follow-up; add no competing banking exception queue.
- Customer-facing health vocabulary and operational alerting stay in Milestone 6.
- Do not implement M5b placeholder evaluators, Finding rows, or Work types while
  deferred.

### Milestone 6 — Customer Health and Operations

Outcome: stop conflating **reconnect the bank** with **data is late**. Connection
status and sync health are separate API projections; temporary sync blips stay
hidden from customers while last success is still fresh; ops gets one alert when
a provider webhook is quarantined.

#### Vocabulary

| Signal | Field | Values |
| --- | --- | --- |
| Connection | `bankConnectionStatus` | `not_connected` \| `connected` \| `error` \| `revoked` |
| Sync health | `syncHealth` | `pending` \| `healthy` \| `delayed` \| `action_required` \| `null` |

`null` sync health means no active feed — connection status is enough.

#### Sync-health rules (24h freshness)

Shared constant: `SYNC_HEALTH_FRESHNESS_MS` (24 hours) next to `projectSyncHealth`.

| Value | When (customer-visible) |
| --- | --- |
| `pending` | Active feed, auth OK, initial sync not done, within 24h of feed `connected_at` |
| `healthy` | Auth OK, initial sync done, `last_successful_sync_at` within 24h |
| `delayed` | Auth OK, but initial sync overdue (>24h) **or** last success older than 24h |
| `action_required` | Active feed whose connection needs repair (`requires_action` / projected `error`) |
| `null` | No active feed |

**Hide from customers:** in-flight retry / single failed sync while last success is
still fresh → still `healthy`. Ops already sees outbox dead-letters and sync-failure
admin paths.

#### Scenarios

- Fine / recently synced → `connected` + `healthy`
- Needs reconnect → `error` + `action_required` (not merely `delayed`)
- Stale last success → `connected` + `delayed`
- First sync within 24h → `connected` + `pending`
- Transient sync failure with fresh last success → still `healthy`
- Initial sync overdue (>24h since connect) → `connected` + `delayed`

#### Ops

Inline quarantine (`unhandled_webhook`, `unsupported_provider`,
`provider_key_mismatch`) fires a best-effort `alertAdmins` **after** the outbox
dispatch transaction commits (idempotent by event id). Dead-lettered webhook
intents already raise `alertOutboxDeadLetter` and do **not** also raise the
quarantine alert.

#### Acceptance

- API returns `bankConnectionStatus` and `syncHealth` independently for the
  scenarios above
- Temporary sync failure with fresh `last_successful_sync_at` → `healthy`
- Needs reconnect → `action_required`
- Quarantined webhook (inline, unroutable) → one admin alert post-commit;
  dead-letter path keeps only the existing outbox alert
- Projector + alert unit tests green; contracts include `syncHealth`
- Web UI surfacing deferred to TODOS.md (distinguish reconnect vs delayed)

#### Out of scope this pass

Frontend changes; provider-specific freshness; new Work types; quarantine
retention purge (M7); coverage Findings (deferred M5b); metrics warehouse.

### Milestone 7 — Security and Launch Verification

Outcome: provider snapshots, logs, secrets, webhook payloads, Sync Runs, and
transaction evidence have explicit minimization and retention rules; the full
system passes clean-database, provider-contract, concurrency, crash-recovery,
redaction, and end-to-end scenario verification with no legacy execution path.

This milestone hardens and proves what Milestones 1–6 built; it adds no feed or
lifecycle behaviour. It has two parts: (A) a written minimization and retention
rule for every place bank data is stored, with enforced purge where a store is
unbounded, and (B) a launch-verification pass that proves the whole system holds
under clean-database, concurrency, crash, and redaction conditions.

#### Current state (grounded)

- Minimization at write time already exists: `sanitizeProviderSnapshot` runs at
  connect, apply, and import, so `provider_snapshot` and feed-entry
  `provider_evidence` are sanitized rather than raw.
- Secrets are isolated in `bank_connection_secrets`, never selected by ordinary
  reads, and destroyed on rotation/revocation (Milestone 2).
- The outbox already purges terminal intents on a retention window
  (`purgeProcessedOutboxIntents` + scheduled purge scan).
- Gaps this milestone closes: raw `bank_provider_webhook_events.payload` has no
  retention (deferred here from Milestone 4); `bank_transaction_sync_runs`
  attempt history and diagnostic text grow unbounded; log redaction is not yet
  audited; and no single document states the retention rule per store.

#### Part A — Minimization and retention

Write the rule for each store and enforce it where unbounded:

- Webhook event payloads (`bank_provider_webhook_events.payload`): retain the raw
  body for a bounded audit window, then purge on a scheduled scan; confirm no
  provider secret ever lands in the stored body. This is the one deliberate raw
  store — everything else is sanitized at write time.
- Sync runs (`bank_transaction_sync_runs`): bound retention of attempt history
  and cap / scrub diagnostic and error text so no secret or full PII is
  persisted in a failure summary.
- Provider snapshots and feed-entry evidence: confirm sanitization drops tokens,
  full account numbers, and credentials; these are retained with their entity
  because feed-entry evidence is accounting record, not incidental log data.
- Secrets: verify they are never logged, never returned by an ordinary read, and
  destroyed on rotation and revocation.
- Logs: redaction rule — no access tokens, no full account numbers, and no raw
  PII in any banking log line.
- Outbox payloads: already purged on retention; confirm they carry only
  identifiers, not secrets.

#### Part B — Launch verification (the gate)

A verification pass, not new features:

- Clean database: drop, migrate from zero, bootstrap, and seed pass with no
  manual steps; the whole banking schema builds clean.
- Provider contract: Plaid and Mono adapter tests cover pagination, mutation
  restart, history status, balance mapping, and error classification against
  recorded fixtures.
- Concurrency: parallel syncs on sibling feeds, competing lease claims, a
  promotion-versus-sync race, and reconnect-during-sync resolve without
  duplication or lost work.
- Crash recovery: an expired lease re-offers work; a crash after webhook
  acknowledgement loses no event; outbox retry / dead-letter recovers; provider
  redelivery is idempotent.
- Redaction: a scan of logs, snapshots, evidence, sync-run diagnostics, and
  stored webhook payloads finds no secrets, tokens, or full account numbers.
- No legacy path: a repository-wide search confirms the old BullMQ
  sync-execution path and any dual writers are gone.
- End-to-end: one behavioural scenario runs the full lifecycle — connect →
  initial sync → webhook nudge → correction / removal review → reauth →
  replacement reconcile → revoke — as a single test.

#### Acceptance

- every sensitive store has a written retention rule, and every unbounded store
  has an enforced scheduled purge;
- no secret, token, or full account number appears in logs, snapshots, evidence,
  sync-run diagnostics, or stored webhook payloads, proven by a scan or test;
- clean-database rebuild plus full suite plus typecheck are green;
- concurrency and crash-recovery scenarios pass without duplication or lost work;
- a repository-wide search confirms no legacy execution path or dual writer
  remains;
- one end-to-end lifecycle scenario passes.

#### Design constraints

- Retention is enforced by a scheduled purge reusing the existing outbox / queue
  scheduler pattern, not ad-hoc scripts.
- Minimization happens at write time (sanitize before store); the stored raw
  webhook body is the one deliberate exception and is time-bounded.
- This milestone adds no feed, lifecycle, or exception behaviour — it hardens and
  verifies only.

#### Open decisions to settle before implementation

- the retention window per store (webhook payloads, sync runs) — a
  product / compliance call, written down before the purge jobs are built;
- whether a completed webhook payload is retained raw for its window or reduced
  to a redacted summary once processed;
- what the redaction scan runs against (the log sink, the database columns, or
  both) and whether it is a test fixture or a CI gate.

## Milestone Delivery Rules

- keep `546fccc5` as the frozen ownership-foundation checkpoint;
- implement the remaining roadmap on one integration branch based on that
  checkpoint;
- use one or more dependency-complete commits per milestone rather than forcing
  a large milestone into one commit;
- keep the relevant focused tests and typechecking green at every commit;
- finish each milestone with an end-to-end behavioural review against the
  applicable section 11 scenarios from the historical plan;
- do not begin a later milestone by adding placeholder tables or interfaces for
  behaviour that has not yet earned them.
