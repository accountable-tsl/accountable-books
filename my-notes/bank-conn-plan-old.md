# Bank Connection and Transaction Sync: Phased Implementation Plan

Status: Banking architecture settled; phased implementation pending

Last reviewed: 2026-07-15

This note records the model we intend to build and the order in which we intend
to build it. It is not a claim that every item below is already implemented.

We should update the progress tracker and decision log as the work advances so
that this remains the canonical reference for the project.

## 1. Why We Are Doing This

Per-bank-account transaction cursors now exist, but the surrounding storage
model still combines several different concepts in `bank_accounts`:

- the durable accounting account;
- the provider authorization or connection;
- the provider's account identity;
- transaction synchronization state;
- connection health and synchronization failure state.

That makes ordinary account updates responsible for provider lifecycle rules,
causes authorization state to be repeated across every account in a connection,
and leaves revocation, reauthorization, retries, and operational history harder
to model correctly.

The goal is not to reduce lines of code for its own sake. The goal is to give
each important fact one owner, make invalid states difficult to represent, and
keep provider calls and background processing reliable under retries, crashes,
duplicate webhooks, and concurrent work.

## 2. Delivery Rule

We will move in phases. Each phase should:

1. have a single architectural purpose;
2. be split into small, reviewable commits;
3. end with a freshly migrated database and a green relevant test suite;
4. remove superseded paths instead of preserving permanent compatibility code;
5. update this document before the next phase begins.

We will not start the next phase merely because most of the current phase is
done. Its exit criteria must be satisfied or explicitly revised here.

## 3. Pre-Deployment Migration Policy

The product has not been deployed anywhere. Therefore the current migration
history is still design material, not a public compatibility contract.

We will:

- correct existing migration files in place;
- rename migration files and tables when that produces the right dependency
  order and terminology;
- rebuild local and test databases from zero after schema changes;
- update bootstrap data, generated database types, models, and tests in the
  same phase as a migration change;
- add a new migration only when it creates a genuinely new target table or
  improves the final migration dependency graph.

We will not:

- add compatibility migrations solely to transform an undeployed schema;
- create production backfills for data that cannot exist in production yet;
- maintain dual reads or dual writes between old and new table shapes;
- retain obsolete fields because an earlier local migration once created them.

Before any deployment, the only migration path that must be proven is a clean
`up` from an empty database and a clean `down`/rebuild path used by the project.

## 4. Canonical Domain Language

These names should be used consistently in migrations, TypeScript, tests,
events, API projections, and product copy.

### Bank

The canonical financial institution known to Accountable Books.

### Bank Account

The durable accounting account linked to a company's chart of accounts. It
continues to exist when a provider connection fails, requires action, or is
revoked. Manual accounts are also bank accounts.

### Bank Connection

One authorization relationship between a company and a bank-feed provider. A
Plaid item is an example. One connection may expose several bank accounts.

### Bank Feed

The link between one bank account and one bank connection. It owns the
provider's account identifier and that account's synchronization checkpoint.

### Sync Run

One attempt to synchronize one bank feed. It records trigger, outcome, counts,
timing, and a structured failure classification.

### Bank Transaction Feed Entry

One provider-observed transaction identity within one bank feed. It is unique
by feed and provider transaction id and either resolves to a canonical bank
transaction or remains quarantined for review.

### Reauthorization Required

The connection cannot operate until the client takes action, for example after
expired consent or an authentication challenge. This is not revocation.

### Revocation

An intentional termination of a bank feed or bank connection, initiated by the
client or reported by the provider. It is a valid terminal state, not an error.

### Sync Failure

A provider, network, internal, or data-processing failure during a sync run. A
sync failure does not by itself change the authorization state.

## 5. Target Ownership Model

```text
bank
  `-- bank_provider_mapping

company
  |-- bank_account -------------------- durable accounting identity
  |     `-- bank_account_feed -------- provider account + sync checkpoint
  |            |-- bank_transaction_sync_run
  |            |-- bank_transaction_batch
  |            `-- bank_transaction_feed_entry
  |                   `-- bank_transaction (canonical fact)
  |
  `-- bank_connection ---------------- provider authorization/item
        |-- bank_connection_secret
        `-- bank_account_feed (one or more)

bank_provider_webhook_event ---------- durable provider input
outbox ------------------------------- durable internal/external handoff
```

The important separation is:

```text
authorization health belongs to bank_connection
account/provider binding belongs to bank_account_feed
sync progress belongs to bank_account_feed
sync attempts and failures belong to bank_transaction_sync_run
accounting identity belongs to bank_account
```

## 6. Non-Negotiable Invariants

1. A bank account can exist without ever having a bank feed.
2. A bank connection can serve more than one bank feed.
3. At most one active feed may exist for a bank account at a time.
4. A provider account identifier is unique within a bank connection.
5. A feed, connection, and account must belong to the same company.
6. A sync job advances only the checkpoint of the feed it synchronized.
7. A sync checkpoint advances in the same database transaction as the
   transactions and batch records produced by the provider-defined complete
   update unit: for example a complete cursor loop or a stable date window.
8. An incomplete update unit never advances its checkpoint. A run containing
   several stable units may finish as failed after earlier units committed;
   retry resumes from the last committed stable checkpoint.
9. A revoked feed is not scheduled and cannot commit in-flight results.
10. A connection that requires client action is not scheduled.
11. A transient sync failure does not invalidate an otherwise active
    connection.
12. Revocation preserves imported transactions, batches, and balances.
13. Provider secrets are not returned by ordinary connection queries.
14. Provider payloads are sanitized, schema-versioned, and never used as the
    sole source of correctness state.
15. Initial sync requests and webhook events survive a process crash after the
    originating database transaction commits.
16. Connection lifecycle transitions occur through explicit commands, not a
    generic account update endpoint.
17. Any connection authorization transition or secret rotation increments every
    affected active feed's state version before the new state is usable.
18. One execution-request attempt owns at most one Sync Run, and a lost executor
    lease transitions its running attempt to `abandoned` before retry; an
    abandoned attempt has no apply rights.
19. Every provider transaction represented in a successfully completed update
    unit is retained as feed evidence, even when policy does not permit it to
    create a canonical transaction.
20. Logical revocation immediately removes secrets from sync/normal provider
    execution, while a narrowly authorized revocation executor may retain access
    only until provider revocation reaches its terminal policy.

## 7. Final Table Responsibilities

### Tables that have earned their place

| Table                                   | Responsibility                                                                | Recommendation                               |
| --------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `banks`                                 | Canonical institution identity                                                | Keep                                         |
| `bank_feed_providers`                   | Provider catalog and capabilities                                             | Keep                                         |
| `bank_feed_provider_countries`          | Provider availability by country                                              | Keep                                         |
| `bank_provider_mappings`                | Provider institution to canonical bank mapping                                | Keep and sanitize its snapshot               |
| `bank_accounts`                         | Durable company/COA bank account                                              | Keep, but make it provider-agnostic          |
| `bank_connections`                      | Provider authorization/item lifecycle                                         | Rename and reshape current credentials table |
| `bank_connection_secrets`               | Restricted encrypted provider tokens                                          | Add as a one-to-one secret store             |
| `bank_account_feeds`                    | Account-to-connection binding and per-feed checkpoint                         | Add                                          |
| `bank_transaction_sync_runs`            | Durable sync attempt and failure history                                      | Add                                          |
| `bank_provider_webhook_events`          | Verified, deduplicated webhook inbox                                          | Add                                          |
| `bank_transaction_batches`              | Immutable ingestion grouping and lineage                                      | Keep and link to feed/run                    |
| `bank_transactions`                     | Canonical imported transaction facts and non-feed import idempotency          | Keep                                         |
| `bank_transaction_feed_entries`         | Feed-scoped provider identities, cross-feed lineage, and duplicate quarantine | Add                                          |
| Bank balance tables                     | Opening, current, and daily accounting/bank balances                          | Keep                                         |
| `outbox`                                | Reliable asynchronous handoff                                                 | Keep and extend                              |
| Activity/audit/notification/work tables | User history, evidence, and action routing                                    | Keep; consume lifecycle events               |

### `bank_accounts`

Target fields:

- accounting identity: `id`, `company_id`, `coa_id`, `bank_id`, `currency_id`;
- presentation: `display_name`, `official_name`;
- classification: `account_type`, `business_or_personal`;
- safe identity aids: `account_number_mask`, an HMAC-based
  `account_number_fingerprint`, and its normalization/fingerprint version;
- normal creation, update, and soft-deletion audit fields.

Fields to remove or move:

- plaintext `account_number`;
- `provider_id`;
- `provider_bank_account_id`;
- `connection_credential_id`;
- `connection_status`;
- `transaction_sync_cursor`;
- `last_sync_at`;
- `initial_transaction_sync_completed_at`;
- `sync_error`;
- `account_metadata` after its useful contents have been deliberately moved;
- `notes` unless a real product workflow is defined for it.

The account-number fingerprint must use a server-held HMAC key, not an ordinary
hash of a predictable account number. Full account numbers should not be kept
unless a concrete product requirement earns that risk; if one appears later,
the encrypted value should live in a restricted store rather than on ordinary
account rows.

#### Settled account uniqueness rule

Dropping plaintext account numbers must preserve the duplicate protection that
currently exists.

- Manual account creation continues to require the full account number as
  write-only input.
- The server normalizes it, computes the fingerprint, derives the display mask,
  and discards the plaintext before persistence.
- A partial unique index on
  `(company_id, bank_id, account_number_fingerprint)` for non-deleted rows
  enforces the same company-plus-bank identity rule as today whenever a stable
  account number is available.
- `account_number_fingerprint` is mandatory in the manual-account command and
  optional at the table level only because some providers expose a mask but no
  full account number.
- A provider account with a full number uses the same normalization and
  fingerprint path, allowing it to match an existing manual account.
- Without a full number, `(bank_connection_id, provider_account_id)` prevents
  duplicate feeds inside that connection. A new connection cannot be silently
  matched or auto-created from a mask; the user must explicitly match it to an
  existing account or confirm creation of a new one.
- A mask is presentation data and is never a uniqueness key.

The normalization algorithm and HMAC input/version are part of the identity
module's interface and need fixed test vectors. The blind-index key must be a
durable backed-up secret; rotating it requires a deliberate identity migration,
not an ordinary token/key rotation, because plaintext account numbers will not
be available for automatic recomputation.

### `bank_connections`

This replaces the misleadingly named `bank_account_credentials` table. It
represents the connection, not merely its token.

Target fields include:

- company and provider identity;
- provider item/connection identifier;
- canonical `bank_provider_mapping_id` where resolved;
- `authorization_status`: `active`, `requires_action`, or `revoked`;
- structured authorization reason code and relevant timestamps;
- `connected_at`, `connected_by_id`;
- `requires_action_at` when applicable;
- `revoked_at`, `revoked_by_id`, `revocation_origin`, and revocation reason;
- provider expiry time where known;
- sanitized, versioned connection/institution snapshot if it adds diagnostic
  value;
- normal update audit fields.

Database checks should keep status and lifecycle timestamps consistent. Token
expiry is a reason for `requires_action`; it should not be a competing top-level
connection status.

### `bank_connection_secrets`

This one-to-one table contains only sensitive operational material:

- `bank_connection_id`;
- encrypted access token;
- encrypted refresh token where applicable;
- encryption key version;
- token update/rotation timestamp;
- `pending_destruction_at` when normal provider use has been disabled but remote
  revocation may still require the token;
- destruction timestamp where applicable.

Only the provider execution boundary should load this row. Ordinary connection
repositories, controllers, logs, and serializers must not select it. The secret
repository must expose different capabilities for normal provider execution and
revocation cleanup:

- normal sync/provider execution may load only an active connection whose secret
  is not pending destruction;
- the revocation executor may load a pending-destruction secret only for the
  matching leased revocation intent;
- no caller may load destroyed secret material.

This is a security lifecycle, not a second connection-status model. Logical
revocation and `pending_destruction_at` are written atomically; terminal provider
revocation then destroys the encrypted material and records `destroyed_at`.

### `bank_account_feeds`

Target fields include:

- `company_id`, `bank_account_id`, and `bank_connection_id`;
- `provider_account_id`;
- sanitized, versioned provider account snapshot and capture time;
- `sync_from_date`;
- provider sync cursor or checkpoint;
- `initial_sync_completed_at`;
- `last_successful_sync_at`;
- `state_version` for compare-and-swap protection;
- connected and revoked audit fields, including revocation origin/reason;
- normal creation/update timestamps.

Active feed state should be derived from `revoked_at IS NULL`; a second string
status would duplicate the same fact. Use partial unique indexes for one active
feed per account and provider-account uniqueness within a connection.

We do not need a separate one-to-one "transaction stream" table at this stage.
The feed is already the owner of per-account sync identity and checkpoint. A
separate table would add a join without creating a meaningful abstraction.

`initial_sync_completed_at` and `last_successful_sync_at` are different current
facts. The first is set once, only after the terminal page/window of the first
complete initial synchronization. The second advances after every later
complete synchronization. A same-item reauthorization preserves both; a new
feed starts with both null.

### `bank_transaction_sync_runs`

Each attempt should record:

- feed, company, trigger, execution request id, attempt number, and
  trace/correlation id;
- sync mode such as `initial` or `incremental`;
- started and completed times;
- outcome such as `running`, `succeeded`, `failed`, `skipped`, `superseded`, or
  `abandoned`;
- retryability and structured failure classification/provider code;
- a sanitized diagnostic summary;
- page and added/modified/removed transaction counts;
- the feed state version observed at start.

Enforce uniqueness on `(execution_request_id, attempt_number)`. The outbox
lease-recovery path marks an expired `running` run `abandoned` with a
`worker_lost` classification, then starts a new attempt/run; it must never reuse
or leave the old run permanently running.

This table replaces `bank_accounts.sync_error`. The latest failure is a query
over runs, while `initial_sync_completed_at` and `last_successful_sync_at`
remain efficient current facts on the feed. Run history explains how those
facts were reached, but they do not depend on retaining run history forever.
Define retention or partitioning before volume makes this an unbounded
operational log.

### Bounded pagination buffer

Some providers define an update as a complete pagination loop rather than one
page. Plaid explicitly says all available update pages must be retrieved before
the transaction changes are persisted, and a mutation-during-pagination error
must restart from the original cursor
([Plaid transaction sync guidance](https://plaid.com/docs/transactions/sync-migration/)).

For the first production version, normalize and sanitize each page, then hold
the complete update in memory. The fetcher already measures transaction count
and approximate serialized bytes and warns at 5,000 changes or 25 MB. Add a
hard per-run cap derived from worker memory, concurrency, and a safety factor.
If the cap is crossed:

- persist no canonical transaction changes;
- leave the feed checkpoint unchanged;
- finish the run with a non-retryable `sync_payload_limit_exceeded`
  classification;
- alert internal operations with counts/bytes but no sensitive payload;
- keep the customer status pending/healthy until the material-delay threshold
  is crossed.

This is intentionally simpler than a staging table. Staging would not avoid a
provider re-fetch after a worker crash and would add writes, merge logic,
cleanup, retention, and recovery machinery solely to reduce memory. Revisit
durable staging only when load fixtures or production percentiles show that
legitimate accounts approach the cap. Provider correctness must remain the
same whichever storage strategy is used.

### `bank_provider_webhook_events`

Each verified provider event should record a provider and deduplication key,
connection/item reference where resolvable, a sanitized payload, receipt time,
processing state, attempts, and structured processing failure data.

The HTTP endpoint should verify, store, commit, and acknowledge. Processing and
sync scheduling then happen asynchronously and idempotently.

### `bank_transaction_batches`

Keep batches as immutable ingestion records. Add `bank_account_feed_id` and,
where useful, `bank_transaction_sync_run_id`. Remove direct credential lineage
because feed to connection already provides it. File import and manual-entry
batches remain valid without a feed.

### `bank_transaction_feed_entries` and replacement-feed handover

The current account-level uniqueness on provider transaction id is insufficient
when a genuinely new provider item/feed returns the same real transaction under
a different provider id. The provider observation and the canonical accounting
transaction need separate identities.

Each feed entry should contain:

- `bank_account_feed_id` and `provider_transaction_id`;
- optional resolved `bank_transaction_id`;
- observation type/state such as added, modified, removed, or pending;
- a deterministic economic match fingerprint and match basis;
- resolution state such as `resolved`, `possible_duplicate`,
  `outside_auto_import_window`, or `rejected_invalid`;
- resolution reason/evidence and actor/timestamps where a human or policy made
  the decision;
- sanitized, versioned provider transaction evidence and timestamps.

Enforce uniqueness on `(bank_account_feed_id, provider_transaction_id)`. A
canonical bank transaction may have references from an old and replacement
feed, preserving lineage without importing it twice.

When creating a replacement feed for the same durable bank account:

1. Record `predecessor_feed_id` on the replacement feed.
2. Give the replacement its own null provider checkpoint; never copy the old
   item's cursor.
3. Derive `sync_from_date` from the later of the user's history floor and the
   greater of the predecessor's last-success date and latest canonical
   transaction date, minus a provider-specific overlap window.
4. Fetch the provider's required complete update even if the provider cannot
   honor that date. Once the update unit completes successfully, persist a feed
   entry for every represented provider transaction. Outside the handover
   window, do not automatically create a canonical transaction unless the user
   explicitly requested a historical rebuild. An authoritative stable identity
   may still link the observation to an existing canonical transaction.
5. Resolve an entry directly when its provider identity is stable under that
   provider contract or one unambiguous high-confidence economic match exists.
6. If the economic match is uncertain, store the feed entry as
   `possible_duplicate`; do not expose it to categorization, balances, or
   posting until reviewed.
7. Reconcile one `review_possible_bank_transaction_duplicate` Work Item per
   unresolved duplicate feed entry through the authoritative central Work
   producer. Account and feed shape the opened review workspace; they do not
   create additional Work Groups. This is transaction-review Work, not
   connection-restoration Work.

The duplicate-review Work contract is:

- `work_type_code`: `review_possible_bank_transaction_duplicate`;
- registry `targetType` and `rootType`: `bank_transaction_feed_entry`; the
  persisted `target_id` is the feed-entry id;
- `fiscal_period_id`: derived from the observed transaction date through the
  company's fiscal calendar;
- outstanding predicate: `resolution_state = 'possible_duplicate'`;
- registry `closeRequirement`: `blocking_work` for the affected period until
  resolved;
- permitted domain commands: link to an existing canonical transaction; confirm
  a new transaction and create the canonical transaction; or reject an invalid
  provider observation with a required reason and retained evidence.

Queue grouping uses the authoritative central Work projection; account and feed
only structure the opened workspace.

V1 should include this quarantine path. Silently importing a duplicate can
double the books, while silently dropping one can omit a real transaction. A
short review queue is safer for users than choosing either error automatically.
Provider modifications/removals may affect an older canonical transaction only
after the new feed entry has been resolved to it.

The V1 default overlap is 14 days unless a provider contract requires more.
Automatic cross-feed linking requires either an identifier the provider
explicitly guarantees is stable across connection items, or exactly one match
on account, currency, signed amount, booking timestamp, and a non-empty stable
provider reference. Date/amount/payee similarity alone is never sufficient for
automatic linking; such candidates are quarantined.

The starting provider assumption is conservative. Plaid documents
`transaction_id` as unique, but its cross-Item `persistent_account_id` is an
account identifier available only for specified tokenized-account institutions
([Plaid duplicate Item guidance](https://plaid.com/docs/link/duplicate-items/)).
Mono documents a transaction `_id` tied to a transaction within an account but
does not document it as stable across a new enrolment
([Mono transaction guidance](https://docs.mono.co/docs/financial-data/transactions)).
Therefore transaction ids are feed-local unless the owning provider contract
records a stronger documented guarantee.

Observations outside the automatic handover window are never silently dropped.
They remain feed evidence in `outside_auto_import_window`. They create no
canonical transaction by default, but may link automatically under authoritative
identity. If policy indicates a material, apparently unrecorded historical
transaction, route it to transaction-review Work rather than ignoring it. If
the observed date belongs to a closed period, confirming it as new must follow
the central `closed_period_impact` decision for the Client Lead; it must not
silently reopen a period or bypass closed-book guards.

## 8. Decision on `account_metadata`

We should remove `bank_accounts.account_metadata`, but not because every value
inside it is already stored elsewhere and not because provider account details
are inherently useless.

The current field mixes different categories:

- provider account response data that can be useful for diagnostics and future
  mapping;
- `connection_source`, which is derivable from whether an active/historical feed
  exists;
- manual-opening-balance notes, which duplicate structured opening-balance
  records;
- potentially sensitive routing, account-number, IBAN, or other provider data
  that should not be copied into a broadly read account row.

The final treatment is:

1. Drop derivable and duplicate values.
2. Allowlist the provider account attributes with demonstrated diagnostic or
   integration value.
3. Redact account numbers, routing values, IBANs, tokens, and similar secrets.
4. Store the sanitized account snapshot on `bank_account_feeds`, because that is
   the provider-account relationship it describes.
5. Give the snapshot a schema version, capture timestamp, and retention policy.
6. Promote any value needed for correctness or querying into a typed column;
   never make application logic depend on an opaque JSON payload.

The same taxonomy applies elsewhere:

| Snapshot                                 | Correct owner                   |
| ---------------------------------------- | ------------------------------- |
| Provider institution data                | `bank_provider_mappings`        |
| Provider connection/item data            | `bank_connections`              |
| Provider account data                    | `bank_account_feeds`            |
| Import/sync batch context                | `bank_transaction_batches`      |
| Provider transaction observation/payload | `bank_transaction_feed_entries` |
| Canonical normalized transaction fact    | `bank_transactions`             |

Every raw or semi-raw payload needs explicit sanitization and retention rules.

## 9. Public Status Projections

The UI/API may continue to expose a convenient account-level connection status,
but it should be a read projection, not mutable storage on `bank_accounts`.

| Underlying facts                                                      | Account connection projection |
| --------------------------------------------------------------------- | ----------------------------- |
| No feed has ever existed                                              | `not_connected`               |
| Latest feed was intentionally revoked and no newer active feed exists | `revoked`                     |
| Active feed, connection is `requires_action`                          | `error`                       |
| Active feed, connection is `active`                                   | `connected`                   |

Customer-visible synchronization health is separate:

- `pending`: the initial synchronization has not completed and remains within
  its expected completion window;
- `healthy`: the connection is active and the last completed synchronization
  is within the expected freshness window; an isolated retryable failure stays
  invisible while automatic retries are working;
- `delayed`: initial completion or the last successful synchronization has
  crossed the configured freshness/service threshold;
- `action_required`: synchronization is blocked until the client repairs the
  connection authorization.

Fine-grained states such as `queued`, `running`, `retrying`, `failed`,
`dead_lettered`, and `stuck` are internal operational states, not customer
account statuses. They drive logs, metrics, alerts, and support tooling.

The exact initial-completion and freshness thresholds belong in operational
policy, not in the account row. The metrics view must not use `updated_at` as a
fake last-sync timestamp.

### Work, notification, and close integration

The central Work architecture owns Work Item fields, the Work Type registry,
assignment and visibility, fiscal-period anchoring, close requirements, and
Work Group projection. Banking owns connection/feed/transaction facts and the
banking predicates and domain commands consumed by its Work producers. This
plan uses the central names `work_type_code`, `target_id`, and
`fiscal_period_id` and must not duplicate the Work Group key or projection
algorithm.

Known handoff to the central Work programme, which this banking plan does not
edit directly:

- update the `restore_bank_connection` registry definition and producer from a
  `bank_account` target and legacy account status predicate to a
  `bank_connection` target with the `requires_action` predicate below;
- add `bank_connection` to the prepared Work synchronization root union and
  integrate explicit authorization lifecycle commands rather than generic
  account-status mutation;
- set that Work Type's close requirement to `none`; period anchoring, due date,
  assignment, visibility, and presentation remain central Work concerns;
- register the rare `review_possible_bank_transaction_duplicate` Work Type and
  its `bank_transaction_feed_entry` target adapter when Phase 5 implements the
  quarantine path;
- add the `bank_data_incomplete` Finding definition/evaluator rather than
  treating connection state as completeness truth.

The connection lifecycle creates user work only when the client can and must
repair authorization.

- The canonical `work_type_code` is `restore_bank_connection`, replacing the
  current account-scoped `reconnect_bank` terminology.
- Its registry `targetType` and `rootType` are `bank_connection`, not
  `bank_account` or feed; persisted `target_id` is the connection id.
- One connection in `requires_action` produces one active restore obligation,
  even when several feeds/accounts depend on it.
- Returning the connection to `active`, or intentionally revoking it, resolves
  that obligation and its customer reconnect notification.
- Ordinary retryable/non-retryable sync failures do not create user Work. They
  create Sync Run evidence, internal alerts/incidents, and eventually a
  customer-visible `delayed` projection if freshness crosses policy.
- A revoked connection or feed creates no restore Work.

Restore Work presentation is also connection-scoped:

- its default assignment basis is `client_contact`, resolved to a client user
  eligible to reauthorize that connection rather than an arbitrary account
  viewer;
- the client sees a persistent reconnect banner while the obligation remains;
- the authoritative firm projection presents the same obligation as waiting on
  the client, not as actionable bookkeeping Work;
- the Primary Bookkeeper and Client Lead have persistent visibility through the
  central Work projection; the banking model must not invent observer fields or
  duplicate role columns.

The `restore_bank_connection` Work Type has `closeRequirement = 'none'`.
Connection authorization alone is not a close blocker. Close readiness evaluates
whether each bank account has complete enough data for the period.

Actual incompleteness is represented separately as an Accounting Finding:

- `finding_code`: `bank_data_incomplete`;
- target: the affected `bank_account`;
- `fiscal_period_id`: the affected monthly period;
- detected only when the completeness evaluator proves a policy-relevant
  coverage gap after the applicable import/retry/freshness window and finds no
  accepted statement, manual import, or other completeness evidence;
- resolved when the missing coverage arrives or an authorized evidenced
  alternative satisfies the Finding policy.

That Finding produces the central `resolve_accounting_finding` Work Type. A
provider error, isolated failed attempt, stale authorization, or reconnect banner
does not by itself create the Finding. This keeps operational noise out of Work
and prevents close from being blocked merely because an integration is
unhealthy.

### Exceptional banking Work should be rare

`bank_data_incomplete` and `review_possible_bank_transaction_duplicate` are
safety mechanisms, not expected happy-path queue volume. We cannot promise that
real provider gaps or ambiguous replacement history will never occur, but we can
make their materialization conservative and deterministic:

- ordinary same-feed transaction retries converge through feed-scoped provider
  identity and never create duplicate-review Work;
- replacement-feed observations auto-link only through documented authoritative
  identity or the plan's exact unambiguous high-confidence rule;
- duplicate-review Work appears only after a complete update commits its
  evidence and the ambiguity remains unresolved;
- the central Work reconciler and open-occurrence uniqueness guarantee at most
  one open Work Item for the same engagement, Work Type, and feed-entry target;
- `bank_data_incomplete` appears only from the account-period completeness
  evaluator after retry/freshness policy and alternative evidence have been
  considered;
- provider incidents, transient sync failures, dead letters, and suspicious
  volume first route to internal operations unless a user has a concrete action
  or the accounting period is demonstrably incomplete.

The desired production outcome is therefore that almost all customers see
neither exception. Their existence is what prevents a rare bad provider case
from silently duplicating or omitting accounting data.

## 10. Revocation Model

Revocation must be an explicit lifecycle command. Remove `connectionStatus` from
generic bank-account updates.

We need two distinct operations:

### Stop one bank account feed

`stopBankAccountFeed(feedId)` revokes only the feed link. It immediately
stops scheduling that account. It does not revoke a shared provider item used by
other accounts. An account-oriented endpoint may resolve its current active feed
before invoking this command.

If that was the connection's final active feed, the same transaction also
logically revokes the now-unused connection and requests provider revocation
and secret destruction. A feed replacement must activate its successor in the
same transaction if the connection should remain active.

### Revoke a bank connection

`revokeBankConnection(bankConnectionId)` revokes the authorization and every
active feed attached to it.

The connection-level command should, in one database transaction:

1. lock the connection and active feeds;
2. mark them revoked with actor, origin, reason, and timestamp;
3. increment feed state versions so in-flight syncs cannot commit;
4. resolve the connection's restore Work and customer reconnect notifications;
   sync-failure incidents are internal operational records, not user Work;
5. write the audit event;
6. write outbox intents for provider-side revocation, secret cleanup, and any
   required activity/notification delivery.

After commit:

- scheduling stops immediately;
- an in-flight executor must fail its final state-version/status check and avoid
  applying data;
- provider revocation runs asynchronously and idempotently;
- secrets become unavailable to sync and ordinary provider execution
  immediately, while the matching leased revocation executor retains narrowly
  scoped access;
- the secret is destroyed after provider revocation succeeds, is authoritatively
  already absent/revoked, or reaches the explicitly defined terminal security
  policy; it must not remain indefinitely pending destruction;
- previously imported transactions, batches, balances, and accounting records
  remain untouched.

Provider-originated `USER_PERMISSION_REVOKED` events use the same connection
revocation path with a provider origin. Expired consent or login-required events
move the connection to `requires_action`. Provider/internal sync failures record
a failed run and leave the connection active.

Reauthorization of the same provider item should rotate secrets and preserve
feed checkpoints. A genuinely new provider item/account binding creates a new
feed identity and starts with a new checkpoint.

## 11. Typical Flows in Plain Language

This section describes the final system after every phase in this plan is
complete. It does not describe every part of today's implementation.

### The records involved

- `bank_accounts` stores the accounting account. It remains after a connection
  is stopped or broken.
- `bank_connections` stores one provider authorization. One connection may
  cover several bank accounts.
- `bank_connection_secrets` stores the encrypted token for that connection.
- `bank_account_feeds` links one bank account to one connection and stores that
  account's sync position.
- `bank_transaction_sync_runs` records each attempt to sync one feed.
- `bank_transaction_feed_entries` stores what the provider said about each
  transaction on one feed.
- `bank_transactions` stores the accepted transaction used by the accounting
  product.
- `bank_transaction_batches` records the accepted import that introduced or
  changed transactions.
- `bank_provider_webhook_events` stores provider notifications before they are
  processed.
- `outbox` is the database-backed list of work that must happen reliably after a
  transaction commits.
- The central Work and Close tables store user actions and proven accounting
  concerns. Banking does not maintain a separate queue model.

The normal path is:

```text
connect bank
  -> create one feed for each selected account
  -> write one initial-sync request for each feed
  -> run each feed independently
  -> store provider observations
  -> create or update accepted bank transactions
  -> advance only that feed's sync position
```

### 11.1 Creating a manual bank account

1. The user enters the bank, account number, currency, and account details.
2. The server normalizes the account number, creates its secure fingerprint and display mask, and then discards the plaintext number.
3. The server inserts `bank_accounts` and writes the normal audit record.
4. No connection, secret, feed, sync request, or Sync Run is created.

The account is shown as `not_connected`. The client can maintain it through
manual imports and opening-balance records.

Tables changed: `bank_accounts` and `audit_events`; balance/import tables only
when the user also supplies those separate facts.

### 11.2 Connecting a bank for the first time

After the client completes the provider's connection screen, the backend does
the following in one database transaction:

1. It resolves the provider institution to the appropriate `banks` and
   `bank_provider_mappings` records.
2. It inserts `bank_connections` with `authorization_status = 'active'`.
3. It inserts the encrypted token in `bank_connection_secrets`.
4. For each selected provider account, it either reuses an explicitly matched
   `bank_accounts` row or creates a new one. A mask alone is never used to guess
   that two accounts are the same.
5. It inserts one `bank_account_feeds` row for each selected account. Each new
   feed starts with no checkpoint, no initial-completion time, and no last-success
   time.
6. It writes one `outbox` initial-sync request for each new feed.
7. It writes the required `audit_events` row and any `outbox` intent needed to
   produce user-facing activity or notification later.

All seven steps commit together. If any required step fails, none of the new
connection graph commits. A committed connection can therefore never be left
without a durable initial-sync request for each new feed.

Immediately after commit, the connection is `connected` and each new feed's
sync health is `pending`. No transaction history has been accepted yet.

Tables changed: `bank_connections`, `bank_connection_secrets`, `bank_accounts`
when a new accounting account is needed, `bank_account_feeds`, `outbox`,
`audit_events`. Relevant `activity_events` or notification rows are produced
later from the durable `outbox` intents. `banks` and `bank_provider_mappings`
are normally read; their sanitized mapping snapshot is updated only when the
mapping process has new accepted information.

### 11.3 Requesting a sync

A new sync may be requested after a connection, by a verified webhook, by the
scheduler, or by an allowed manual-sync command. An automatic retry reuses the
existing logical request; it does not create an unrelated second request.

1. The requester verifies that the feed is active and its connection is
   `active`.
2. It writes or safely coalesces an `outbox` request for that feed. It does not
   call the provider inside the user request or webhook request.
3. A manual request returns after the durable request commits. It does not wait
   for the bank.

There is one logical sync request per feed. If one connection has three active
feeds, it can produce three independent provider calls and three independent
results.

Tables changed: `outbox`. No Sync Run or transaction row is written until a
worker actually starts an attempt.

### 11.4 Starting a Sync Run

1. A worker takes temporary ownership of one due `outbox` request. That
   ownership expires if the worker disappears.
2. It inserts one `bank_transaction_sync_runs` row with outcome `running`, the
   feed id, request id, attempt number, trigger, start time, and current feed
   state version.
3. It reads the feed, its active connection, and the encrypted secret through
   the restricted secret repository.
4. It remembers the feed's current checkpoint and state version.
5. It asks the provider for the complete set of pages or complete stable date
   window required by that provider.

The provider call happens outside a long database transaction. At this point no
new provider transaction has been accepted and the feed checkpoint has not
moved.

Tables changed: `outbox` is moved to its temporary owned state and
`bank_transaction_sync_runs` gets the running attempt.

### 11.5 When a sync succeeds

Before accepting the result, the worker checks again that:

- it still owns the request;
- the connection is still `active`;
- the feed has not been stopped;
- the feed's state version, provider binding, and starting checkpoint have not
  changed.

If any check fails, the result is stale and is not applied.

If the checks pass, one database transaction:

1. Creates or updates `bank_transaction_feed_entries` for every provider
   transaction represented in the completed update.
2. Creates an immutable `bank_transaction_batches` record when transaction
   changes were accepted.
3. Creates, updates, links, or marks provider-removed the corresponding
   `bank_transactions` rows, but only after each feed entry has been safely
   resolved. Provider removal never erases posted ledger history.
4. Reconciles affected central Work, such as categorization Work for a newly
   accepted transaction. An ambiguous replacement-feed observation is kept out
   of `bank_transactions` and handled by the duplicate-review flow below.
5. Updates only this `bank_account_feeds` row with the completed checkpoint and
   `last_successful_sync_at`.
6. Sets `initial_sync_completed_at` if this was the feed's first fully completed
   initial sync. Later successful syncs never reset it.
7. Marks the `bank_transaction_sync_runs` row `succeeded` with its counts and
   completion time.
8. Writes any required `outbox` follow-up, such as balance recalculation,
   activity, or queue invalidation.

Only after that transaction commits is the original sync request marked
complete in `outbox`. If the process dies between the successful apply and that
final acknowledgement, the durable result makes the retry safe.

An update containing no transaction changes is still a successful Sync Run. It
updates the final checkpoint and last-success time where appropriate, but does
not invent a batch, transaction, feed entry, or user activity row.

Tables changed: `bank_transaction_feed_entries`, `bank_transaction_batches`
when changes exist, `bank_transactions` when canonical facts change,
`bank_account_feeds`, `bank_transaction_sync_runs`, `outbox`, affected central
Work, and `audit_events` when a meaningful audited transition occurs. Balance,
activity, and notification tables are updated later only when their committed
outbox intents require it.

### 11.6 Initial sync versus later syncs

The first successful complete sync for a feed sets both
`initial_sync_completed_at` and `last_successful_sync_at`. The customer sync
health moves from `pending` to `healthy`.

A later sync starts from that feed's own checkpoint. It updates
`last_successful_sync_at` and the checkpoint, but preserves
`initial_sync_completed_at`.

Each feed under a shared connection has its own checkpoint, timestamps, outbox
requests, and Sync Runs. One account's success or failure does not advance,
delay, or erase another account's progress.

### 11.7 When a retryable sync fails

Examples include a temporary provider outage, network timeout, or provider rate
limit.

1. The unfinished provider update is not applied.
2. The feed checkpoint does not advance past the last fully committed update
   unit. Any earlier stable date windows that already committed remain valid.
3. The Sync Run is marked `failed` with a safe structured reason and
   `retryable = true`.
4. The `outbox` request is scheduled again using provider-aware backoff.
5. `bank_connections.authorization_status` remains `active`.
6. No `restore_bank_connection` Work or `bank_data_incomplete` Finding is
   created merely because this attempt failed.

The customer continues to see `healthy` while the previous success is still
fresh and retries are working. The customer sees `delayed` only after the
freshness threshold is crossed. Repeated failures, old pending work, or retry
exhaustion alert internal operations.

Failure handling changes `bank_transaction_sync_runs` and `outbox`. It makes no
additional feed-checkpoint, canonical-transaction, connection-authorization, or
user-Work change. If this run had already committed earlier stable date windows,
those earlier changes remain and the retry resumes after their checkpoint.

### 11.8 When a sync cannot be retried automatically

Examples include an invalid provider response, a payload above the safe memory
limit, or an internal data rule that cannot safely accept the update.

1. No unfinished update, canonical transaction change, or checkpoint is
   committed.
2. The Sync Run records a non-retryable failure classification.
3. The `outbox` request reaches its terminal failed state after the applicable
   execution policy.
4. Internal operations receives an alert with safe diagnostic information.
5. The connection remains `active` unless the provider specifically reported an
   authorization problem.

The customer sees `delayed` only when freshness policy says the data is
materially late. The system does not ask the client to reconnect for an internal
or provider-processing problem.

Tables changed: `bank_transaction_sync_runs`, `outbox`, and internal alert
records. No canonical transaction or feed checkpoint changes.

### 11.9 When the client must reauthorize the connection

Examples include expired consent or a provider login-required response.

In one database transaction, the system:

1. Marks the current Sync Run failed with an authorization classification.
2. Updates `bank_connections.authorization_status` to `requires_action` and
   records the provider reason and time.
3. Increments `state_version` on every active `bank_account_feeds` row attached
   to that connection. This prevents older in-flight work from committing.
4. Reconciles one central `restore_bank_connection` Work Item whose target is
   the connection, even if several feeds depend on it.
5. Writes the audit event and durable `outbox` activity/notification follow-ups.
6. Ends the current sync request as an action-required outcome instead of
   retrying it indefinitely.

The scheduler stops requesting syncs for that connection. The client sees the
connection as `error` and sync health as `action_required`. The client sees one
persistent reconnect action; the Primary Bookkeeper and Client Lead can see that
it is waiting on the client.

This transition does not create `bank_data_incomplete`. That Finding can appear
later only if the separate completeness evaluator proves that an affected
period actually lacks required data.

Tables changed: `bank_transaction_sync_runs`, `bank_connections`, affected
`bank_account_feeds`, central `work_items`, `outbox`, and `audit_events`.
Relevant activity/notification records are produced later from the outbox.
Existing transactions and checkpoints are preserved.

### 11.10 Reauthorizing the same provider connection

When the client repairs the same provider item:

1. `bank_connections.authorization_status` returns to `active` and the old
   action-required reason is cleared or closed with its audit history retained.
2. `bank_connection_secrets` receives the rotated encrypted token.
3. Every affected active feed's `state_version` increments, so work fetched with
   the old token cannot commit.
4. Existing feed checkpoints, `initial_sync_completed_at`, and
   `last_successful_sync_at` are preserved.
5. The central `restore_bank_connection` Work Item and reconnect notification
   resolve.
6. One new `outbox` sync request is written for each affected feed.

Tables changed: `bank_connections`, `bank_connection_secrets`, affected
`bank_account_feeds`, central `work_items`, `outbox`, and `audit_events`.
Relevant activity/notification records are produced later from the outbox.

### 11.11 Reconnecting through a genuinely new provider connection

A new provider item is not treated as the old feed with a reset cursor.

1. The system creates a new `bank_connections` row and
   `bank_connection_secrets` row.
2. The user or strong account identity selects the existing durable
   `bank_accounts` row. A mask alone cannot make this choice.
3. The old `bank_account_feeds` row is stopped and a new feed is created with
   `predecessor_feed_id` pointing to it.
4. The new feed starts with a null checkpoint and null sync-completion times.
5. Its `sync_from_date` includes the approved historical-overlap window.
6. One initial-sync `outbox` request is written for the new feed.
7. If the old connection now has no active feeds, it enters the normal
   connection-revocation and secret-destruction flow.

When the new feed syncs, provider observations are compared with the old
canonical history. Strong matches link to existing `bank_transactions`; they do
not create copies. Uncertain cases enter the duplicate-review flow.

Tables changed: new `bank_connections` and `bank_connection_secrets`, the old
and new `bank_account_feeds`, `outbox`, `audit_events`, and possibly the old
connection/secret when it becomes unused. Activity/notification rows follow
from committed outbox intents where required.

### 11.12 Reviewing a possible duplicate transaction

This flow should occur only for an uncertain observation from a replacement
feed.

1. The completed sync stores the observation in
   `bank_transaction_feed_entries` with
   `resolution_state = 'possible_duplicate'`.
2. It does not create or change a canonical `bank_transactions` row for that
   observation.
3. It reconciles one central
   `review_possible_bank_transaction_duplicate` Work Item for the feed entry.
4. Account and feed information organize the opened review workspace; they do
   not create extra Work Groups.

The reviewer has exactly three domain choices:

- Link it to an existing transaction: update the feed entry with that
  `bank_transaction_id`, mark it resolved, and resolve the Work Item.
- Confirm it is new: insert `bank_transactions`, link and resolve the feed entry,
  resolve duplicate-review Work, and create ordinary categorization Work where
  applicable.
- Reject invalid provider evidence: mark the feed entry `rejected_invalid` with
  the required reason/evidence and resolve the Work Item.

Each choice commits its feed-entry change, canonical transaction change if any,
and Work reconciliation together. If confirming a new transaction affects a
closed period, the central Close model creates the `closed_period_impact`
decision; it does not silently reopen or alter closed books.

Tables changed: `bank_transaction_feed_entries`, central `work_items`, and
possibly `bank_transactions`, categorization Work, `accounting_findings`,
`finding_resolutions`, `audit_events`, and `outbox` depending on the chosen
resolution and period state. Activity/notification rows follow from the outbox.

### 11.13 When bank data is genuinely incomplete

Connection status is not the test for completeness.

For each relevant account and Fiscal Period, the completeness evaluator uses
the settled coverage policy, successful feed coverage, accepted statements,
manual imports, and other permitted evidence. It waits for the applicable
import/retry/freshness grace policy before calling the data incomplete.

For manual and file batches, `start_date` and `end_date` remain the extrema of
the transactions imported. They do not prove statement coverage. Phase 1 uses
the explicit `coverage_start_date` and `coverage_end_date` fields for a source
that declares the period it covered. A zero-transaction statement cannot be
represented by a transaction batch yet; the future completeness-evidence model
must add a statement/evidence record for that case.

- If the evidence is sufficient, it writes no Finding even when the connection
  currently needs reauthorization.
- If the evaluator proves a policy-relevant gap and finds no accepted
  alternative evidence, it creates or updates one `accounting_findings` row with
  `finding_code = 'bank_data_incomplete'` for that bank account and period.
- The central Work producer reconciles the corresponding
  `resolve_accounting_finding` Work Item.
- When missing coverage later arrives, reevaluation clears the condition and
  resolves the Work Item.
- When policy permits a professional alternative, the authorized decision is
  stored in `finding_resolutions`; it is not represented by hiding or manually
  completing Work.

Tables changed when a real gap exists: `accounting_findings`, central
`work_items`, `audit_events`, and `outbox` where a visible transition requires
them. `finding_resolutions` changes only for an authorized evidenced decision.
A connection or Sync Run row does not change merely because the evaluator found
incomplete accounting evidence.

Phase 1 integration note: the authoritative Work/Close write model above is
being designed in `work-queue-close-v2` and is deliberately not implemented by
the banking pass. Phase 1 computes the live Close finding from durable banking
facts and exposes a typed `reconcileBankDataIncompleteFinding` stub. The central
Work/Close programme will replace that stub with the `accounting_findings`,
resolution, audit, outbox, and Work reconciliation transaction at cutover. The
stub does not create a second temporary Finding table or treat a read-time
Close result as durable authority.

### 11.14 Receiving a provider webhook

1. The webhook endpoint verifies the provider signature or equivalent proof.
2. It inserts or deduplicates a sanitized `bank_provider_webhook_events` row and
   commits before returning success to the provider.
3. A background processor resolves the event to its connection and feeds.
4. For an update notification, it writes or coalesces one `outbox` sync request
   for each affected active feed.
5. It marks the webhook event processed only after the required internal requests
   are durable.

A duplicate webhook does not create a second logical effect. An event for an
unknown connection/account is retained with a safe failure/quarantine state and
alerts operations; it is not silently discarded.

Tables changed: `bank_provider_webhook_events`, then `outbox`. The webhook HTTP
request does not write transactions or run a bank sync.

### 11.15 Stopping one feed or revoking a whole connection

To stop one account feed, `stopBankAccountFeed(feedId)`:

1. Marks that `bank_account_feeds` row revoked and increments its
   `state_version`.
2. Stops future sync requests and prevents in-flight results from committing.
3. Leaves sibling feeds and the shared connection active.
4. If it was the final active feed, it also starts the whole-connection
   revocation flow below.

To revoke the whole connection, `revokeBankConnection(bankConnectionId)` does
the following in one database transaction:

1. Marks `bank_connections` revoked.
2. Marks every active `bank_account_feeds` row revoked and increments each state
   version.
3. Marks `bank_connection_secrets.pending_destruction_at` so normal sync code can
   no longer load the token.
4. Resolves any `restore_bank_connection` Work and reconnect notification.
5. Writes the audit event and `outbox` requests for provider revocation and any
   required activity/notification delivery.

After commit, only the worker that owns that revocation request may read the
pending-destruction token. It asks the provider to revoke access. On success,
an authoritative already-revoked response, or the defined terminal security
policy, it destroys the encrypted token and sets `destroyed_at`. Failures retry
and alert according to the outbox policy. Phase 4 must set the maximum retry/time
limit and the exact critical-alert/manual-follow-up outcome before this flow is
implemented.

No imported transaction, batch, balance, ledger entry, or accounting history is
deleted by either operation.

Tables changed: `bank_account_feeds`; and for a whole connection,
`bank_connections`, `bank_connection_secrets`, central `work_items`, `outbox`,
`audit_events`. Relevant activity/notification records are produced later from
the outbox.

### 11.16 Worker crashes, duplicate requests, and concurrent syncs

- If a worker disappears, its `outbox` ownership expires. Its running Sync Run
  becomes `abandoned`, and a new attempt receives a new attempt number.
- A worker whose ownership expired cannot apply results.
- Duplicate webhook, scheduler, or manual requests are coalesced by the logical
  effect key where safe.
- If two attempts reach the same feed, locking and the final checkpoint/state
  checks allow at most one to apply. The other records a skipped or superseded
  result and changes no transaction or checkpoint.
- If revocation, reauthorization, or feed replacement happens during a provider
  call, the changed state version makes the old result stale.

Tables changed during recovery: `outbox` and
`bank_transaction_sync_runs`. Canonical transaction and feed state change only
for the one attempt that still has valid apply rights.

### 11.17 What the customer-facing statuses mean

These statuses are calculated from current records; they are not separately
stored on `bank_accounts`.

- `not_connected`: the account has never had a feed.
- `connected`: an active feed uses an active connection.
- `error`: the active connection is `requires_action`.
- `revoked`: the latest feed was intentionally stopped and no replacement feed
  is active.
- `pending`: the feed's first sync has not finished but is still within the
  expected time.
- `healthy`: the last successful sync is fresh. An isolated retryable failure is
  not shown.
- `delayed`: initial or later successful data is older than the permitted
  freshness threshold.
- `action_required`: sync cannot continue until the client reauthorizes.

Reading these projections changes no table. Connection status comes from
`bank_connections` and `bank_account_feeds`; sync health comes from feed
timestamps, current execution state, and `bank_transaction_sync_runs`.

## 12. Phased Implementation Sequence

### Progress tracker

- [x] Phase 0: Review the existing system and settle the target model
- [x] Phase 1: Establish schema ownership and migrate all old-column consumers
- [ ] Phase 2: Make the outbox the banking execution owner
- [ ] Phase 3: Rebuild connection establishment and reauthorization
- [ ] Phase 4: Implement revocation and authorization lifecycle commands
- [ ] Phase 5: Harden per-feed transaction sync and sync runs
- [ ] Phase 6: Make webhook ingestion and sync requests durable
- [ ] Phase 7: Refine projection quality and operational metrics
- [ ] Phase 8: Minimize sensitive data and define retention
- [ ] Phase 9: Remove legacy code and perform final fresh-database verification

### Phase 0: Review and settle the model

Goal:

- establish one shared vocabulary, ownership model, and implementation sequence
  before changing more code.

Completed work:

- reviewed the bank, provider, connection, account, transaction, batch, balance,
  webhook, queue, outbox, notification, activity, audit, task, and work paths;
- separated connection authorization from synchronization health;
- decided to keep useful provider account data only as a sanitized feed
  snapshot;
- decided that intentional revocation is terminal but not erroneous;
- recorded the target tables and invariants in this document.

Exit criteria:

- this document is accepted as the working reference;
- later changes to a settled decision are recorded in the decision log.

### Phase 1: Establish schema ownership and migrate all consumers

Goal:

- make the database express bank account, connection, secret, and feed as
  different concepts and migrate existing behavior without keeping dual truth.

Migration work:

- move the `bank_provider_mappings` migration before connection creation so the
  foreign-key dependency is honest;
- replace/rename `20250404023212_bank_account_credentials.ts` so it creates
  `bank_connections` with the target authorization lifecycle;
- create `bank_connection_secrets` immediately after connections;
- slim `20250404023218_bank_accounts.ts` to accounting-account fields;
- replace the plaintext-number unique index with the partial active-account
  unique index on company, bank, and account-number fingerprint;
- create `bank_account_feeds` after accounts and connections;
- create `bank_transaction_sync_runs` so `sync_error` has a durable structured
  replacement in the same phase that removes it;
- update batch and transaction migrations for final lineage and constraints;
- create `bank_transaction_feed_entries` after canonical bank transactions;
- remove the old bank-account stream-reset trigger because feed identity and
  state version now own that rule;
- do not recreate
  `20260703120000_bank_account_transaction_sync_state.ts`; the target sync
  fields belong in the new feed migration, and that standalone compatibility
  migration is already absent from the repository.

The intended dependency order is:

```text
banks / bank_feed_providers
  -> bank_provider_mappings
  -> bank_connections
  -> bank_connection_secrets
  -> bank_accounts
  -> bank_account_feeds
  -> bank_transaction_sync_runs
  -> bank_transaction_batches
  -> bank_transactions
  -> bank_transaction_feed_entries
```

Provider-country/catalog and balance migrations should be placed around that
chain according to their real foreign-key dependencies. We should change their
undeployed timestamps where necessary rather than weakening constraints.

Code work:

- introduce connection, secret, and feed types/repositories with narrow selects;
- introduce one account-identity module that normalizes write-only account
  numbers, computes the blind index and mask, and owns duplicate lookup;
- prevent normal connection reads from loading secret columns;
- centralize account connection and sync-health projection functions;
- adapt the existing sync path to read and advance feed checkpoints, keeping it
  as a thin behavior-preserving bridge until Phase 5 hardens the orchestration;
- give that bridge the minimum final apply guard required by the invariants from
  day one: lock the feed and require unchanged checkpoint/provider binding,
  `revoked_at IS NULL`, active connection authorization, and the same observed
  feed `state_version` before applying canonical changes or advancing the
  checkpoint;
- write minimal structured sync-run success/failure records so removing
  `sync_error` does not create an observability gap;
- move feed provider-transaction identity/idempotency into feed entries while
  retaining canonical transaction identity on `bank_transactions`; every bridge
  import must write the feed entry and its canonical create/link/update in the
  same transaction from this phase onward;
- adapt existing connection creation enough to create the new graph without
  retaining an old-schema write path;
- migrate every consumer of `connection_status`, `sync_error`, and moved sync
  fields in this phase. This includes account models/controllers/contracts, the
  bank metrics view, sync eligibility, reconnect notifications, task condition
  checks, close readiness, work materialization, demo seeds/fixtures, API docs,
  web schemas, and bank-account UI reads;
- integrate the central Work producer/registry with one connection-scoped
  `restore_bank_connection` occurrence whose `target_id` is the
  `bank_connection` id and whose predicate is only
  `authorization_status = 'requires_action'`; the central Work catalogue change
  is owned by the Work programme, not by a parallel banking Work model;
- preserve `connectionStatus` as an external read field where useful, but derive
  it from connection/feed facts rather than storing it on `bank_accounts`;
- delete `connectionStatus` from generic account-update API/web schemas and
  remove the model/controller branch that writes it;
- rewrite the metrics view against feed facts and remove its `updated_at`
  fallback in this phase;
- update database type generation and model fixtures;
- preserve existing externally visible behavior while reads move to the new
  ownership model.

Tests:

- clean migration from an empty database;
- tenant and foreign-key constraints;
- one active feed per account;
- provider-account uniqueness within a connection;
- provider transaction uniqueness within a feed;
- bridge imports retain every provider observation as a feed entry and apply its
  canonical effect atomically;
- revocation or state-version change between bridge fetch and apply rejects the
  stale apply without changing canonical transactions or the checkpoint;
- normalized duplicate manual accounts hit the fingerprint uniqueness rule;
- provider/full-number matching uses the same fingerprint as manual creation;
- a mask-only provider account is never auto-matched by mask;
- multiple affected feeds produce one restore-connection obligation;
- sync failure and intentional revocation produce no restore-connection Work;
- connection authorization alone does not hard-block close when account-period
  completeness is otherwise established;
- a failed sync or `requires_action` transition alone creates no
  `bank_data_incomplete` Finding;
- a proven account-period coverage gap without accepted alternative evidence
  creates one `bank_data_incomplete` Finding, and importing the missing coverage
  or accepting permitted evidence clears it;
- connection lifecycle check constraints;
- secret queries are opt-in and absent from ordinary reads.

Exit criteria:

- an empty database produces only the target schema;
- account, connection, and feed repositories compile and pass integration tests;
- no provider secret is selected through an ordinary connection/account path;
- no provider identity, authorization, or sync state remains on
  `bank_accounts`;
- repository-wide search finds no consumer of the removed account columns;
- generic account updates reject lifecycle fields;
- the existing sync behavior runs from feed-owned checkpoints and cannot commit
  after feed revocation or authorization generation change.

Phase 1 is deliberately the largest cross-cutting phase. Deleting the old
columns and migrating their readers are one atomic model change; deferring the
readers would either leave the code broken or require temporary dual truth.
Intentional disconnect is deliberately unavailable after this phase until the
explicit commands land in Phase 4. Because the product is undeployed, Phases
1–3 must not be released as a partial product milestone, and no generic status
write may be retained as a temporary disconnect path.

Implementation sub-checklist for this deliberately broad phase:

1. Rewrite and order the migrations, final constraints, and generated database
   types.
2. Add account-identity, connection, secret, feed, feed-entry, and Sync Run
   repositories with narrow interfaces.
3. Move connection establishment and the behavior-preserving sync bridge onto
   those repositories, including feed-entry writes and the minimum final apply
   guard.
4. Migrate account/API/view/web readers and all sync eligibility/projection
   consumers in dependency order.
5. Migrate Work, notification, task-condition, and Close semantics.
6. Delete the old lifecycle write/reset surfaces, run the repository-wide legacy
   search, and verify a fresh database plus the relevant integration suites.

Each item should be delivered in the smallest dependency-complete commits that
keep the tree buildable. Phase 1 is complete only when the old columns and all
their consumers are gone; the checklist is sequencing, not permission for dual
truth.

### Phase 2: Make the outbox the banking execution owner

Goal:

- make the outbox guarantee execution of banking effects, not merely durable
  insertion of an intent or durable relay into another queue.

Current prerequisite gap:

- the outbox dispatcher has execution-aware handlers for existing intent types,
  including GL recalculation and close-signal evaluation, but it has no banking
  intent types or handlers;
- writing a banking row to the outbox is therefore only durable enqueue until
  the banking execution contract is implemented;
- the current uniqueness rule covers only `pending` rows, so `(intent_type,
scope_key)` is a debounce key rather than a complete logical-effect
  idempotency guarantee;
- a handler must never mark an intent processed merely because it submitted a
  BullMQ job.

Settled ownership:

```text
database transaction -> outbox intent -> leased outbox executor -> effect
```

The outbox owns banking execution, retries, leases, dead letters, and terminal
completion. BullMQ may wake an outbox drain or run a periodic scanner that
writes intents, but it does not receive a second authoritative banking job and
does not own completion. This follows the execution model already established
for GL recalculation and close-signal evaluation and removes split-brain retry
semantics.

Build:

- add typed banking intents and payload schemas for transaction sync requests,
  provider-side connection revocation, and any separately justified secret
  cleanup effect;
- route slow banking work through an appropriate outbox lane;
- execute remote banking work through a durable leased outbox state machine
  whose recovery scanner guarantees completion. Its explicit contract is:
  - one durable unique effect/idempotency key for each logical effect
    generation;
  - atomic claim and transition to `leased` using `FOR UPDATE SKIP LOCKED` or
    an equivalent database primitive;
  - lease owner, expiry, and owner-checked renewable heartbeat;
  - a monotonic attempt number incremented at claim;
  - provider-aware `available_at` retry timing;
  - terminal dead-letter state with safe diagnostics and an internal alert;
  - lane/concurrency isolation so slow banking effects cannot starve unrelated
    work;
- add claim/lease recovery for provider calls so the dispatcher does not hold a
  database transaction open across a long network request;
- make provider-side effects idempotent so a crash after the provider accepts a
  request but before local completion is safe to retry;
- mark processed only after the effect succeeds or its terminal provider/local
  outcome has been durably recorded;
- include banking dead letters, expired leases, and oldest-pending age in outbox
  health alerts;
- retire the separate transaction-sync BullMQ execution path once all banking
  request producers write the outbox intent.

Tests:

- an intent remains recoverable after a crash immediately after claim;
- an intent remains recoverable after a provider effect but before local
  completion;
- two executors cannot hold a valid lease for the same effect, and only the
  current lease owner can renew or complete it;
- the logical effect key prevents duplicate intent rows even when enqueue is
  retried after the first intent leaves `pending`;
- duplicate execution is idempotent;
- a mere queue submission cannot mark a banking intent processed;
- each executor attempt has one corresponding Sync Run;
- retry exhaustion dead-letters and alerts with safe diagnostic data;
- lane isolation prevents slow provider calls from blocking notifications.

Exit criteria:

- banking intent types have registered execution-aware handlers;
- each banking outbox row is pending/leased, durably completed, or durably
  failed with an alert;
- no BullMQ job and outbox row compete to own the same banking effect;
- Phases 3, 4, and 6 may rely on the outbox as an execution guarantee.

### Phase 3: Rebuild connection establishment and reauthorization

Goal:

- make a successful provider connection create the right connection, secret,
  account, and feed records atomically.

Build:

- adapt provider discovery results into explicit institution, connection, and
  account snapshots;
- sanitize snapshots before persistence;
- resolve canonical bank/provider mappings;
- create or update the bank connection;
- write/rotate secrets only through the restricted secret repository;
- create durable bank accounts and their feeds;
- distinguish same-item reauthorization from a genuinely new connection;
- for a genuinely new replacement feed, record its predecessor and derive the
  handover `sync_from_date`/overlap without copying the old cursor;
- increment `state_version` on every active feed affected by reauthorization or
  secret rotation so work fetched under the old authorization cannot commit;
- write one initial transaction-sync request per newly active feed to the outbox
  in the same database transaction rather than enqueueing only after commit;
- write audit events and durable outbox intents for any connect/reconnect
  activity or notification.

Tests:

- one connection with multiple accounts creates multiple feeds;
- same-item reconnect rotates tokens without resetting checkpoints;
- a new item creates new feed identity/checkpoint state;
- a replacement feed records the predecessor and safe history/overlap floor;
- transaction rollback leaves no partial connection/account/feed graph;
- provider payload secrets do not reach snapshots or logs;
- committed connections leave one durable initial-sync intent for every newly
  active feed.

Exit criteria:

- connection establishment uses only the new model;
- there is no crash window between committed connection data and initial-sync
  scheduling;
- old credential/account metadata write paths are gone.

### Phase 4: Implement revocation and authorization lifecycle commands

Goal:

- make disconnect, provider revocation, expired consent, and authentication
  failure produce distinct and correct state transitions.

Build:

- add explicit `stopBankAccountFeed(feedId)` and
  `revokeBankConnection(bankConnectionId)` commands;
- make an account-oriented controller resolve and pass the active feed id, while
  keeping the lifecycle command itself unambiguous in the presence of
  historical feeds;
- add the provider revoke/disconnect capability to the provider boundary;
- implement idempotent provider-side revocation through the outbox;
- atomically mark connection secrets pending destruction, exclude them from
  normal provider execution, and allow only the leased revocation executor to
  load them until terminal cleanup;
- implement `requires_action` transition and same-item reauthorization;
- increment all affected active feed state versions for every authorization
  transition or secret rotation;
- make schedulers/executors enforce connection/feed lifecycle state;
- update restore-connection work, notifications, activity, and audit behavior;
- treat provider-originated permission revocation as the same domain command;
- after stopping a feed, lock/count the connection's remaining active feeds. If
  none remain, logically revoke the unused connection in the same transaction
  and schedule provider revocation/secret destruction. A replacement operation
  must activate its successor feed in the same transaction to avoid that
  cascade.

Tests:

- local feed stop leaves sibling feeds and shared connection active;
- stopping the final active feed revokes the now-unused connection;
- connection revoke stops all attached feeds;
- repeated revocation is idempotent;
- in-flight sync cannot commit after revocation or secret rotation;
- a revoked secret is unavailable to sync but remains available to only the
  matching revocation executor until remote cleanup reaches a terminal outcome;
- successful/already-absent provider revocation destroys secret material, and
  exhausted cleanup follows the documented terminal security/alert policy;
- expired consent creates exactly one connection-targeted
  `restore_bank_connection` Work Item;
- intentional revocation resolves obsolete restore work and creates no
  reconnect blocker;
- historical transactions and balances remain unchanged.

Exit criteria:

- revocation is reachable only through explicit lifecycle commands;
- `revoked` is never treated as a sync error or reconnect-required state;
- provider and application revocation eventually converge under retries;
- no active provider secret remains indefinitely for a connection with no
  active feeds.

### Phase 5: Harden per-feed transaction sync and sync runs

Goal:

- turn the Phase 1 feed-based bridge into a bounded, observable synchronization
  module in which each attempt leaves durable, queryable evidence.

Build:

- make execution identity and locking feed-based;
- load connection secrets only inside provider execution;
- create/transition a sync run before provider work begins;
- normalize/sanitize each fetched page and enforce the concurrency-budgeted
  in-memory cap while assembling a complete provider update;
- define the provider's complete update unit in the provider adapter contract;
- for Plaid-style cursor providers, preserve the original cursor across the
  complete pagination loop, restart that loop on a mutation-during-pagination
  error, and persist canonical changes plus the final cursor only after the
  complete loop succeeds;
- for providers with unstable page numbers, process bounded stable date
  windows and advance only the completed date-window checkpoint; never persist
  an unstable page number as the feed checkpoint;
- set `initial_sync_completed_at` only when the terminal initial page/window
  succeeds, and set `last_successful_sync_at` only when the logical run reaches
  successful completion;
- extend the Phase 1 final authorization/feed-active/state-version apply guard
  with Sync Run status and executor-lease ownership compare-and-swap checks;
- record successful, failed, skipped, superseded, and abandoned runs;
- remove any remaining legacy `sync_error` behavior while retaining
  feed-owned `initial_sync_completed_at`;
- retain provider-specific cursor and date-overlap strategies behind the same
  feed-oriented interface;
- settle and encode a provider-specific handover identity contract: identifiers
  documented as stable across new connections, economic-fingerprint fields and
  normalization/test vectors, and the validated overlap-window duration. An
  undocumented provider transaction id is feed-local only;
- resolve each provider observation through its feed entry before creating,
  modifying, or removing a canonical bank transaction;
- quarantine uncertain cross-feed overlap matches and reconcile one review Work
  Item per candidate through the central Work producer; queue grouping remains
  the central Work projection's concern;
- retain observations outside the automatic overlap window without creating
  canonical transactions by default, escalating only material apparently
  unrecorded history and routing confirmed closed-period impact through the
  central decision policy.

Tests:

- independent accounts under one connection advance independent checkpoints;
- a failed account does not block or alter another account;
- duplicate/retried execution attempts remain idempotent;
- a replacement feed with changed provider transaction ids does not silently
  duplicate or silently discard overlapping canonical transactions;
- same-feed retries and authoritatively auto-linked replacement observations
  create no duplicate-review Work;
- retrying reconciliation for one ambiguous feed entry retains exactly one open
  `review_possible_bank_transaction_duplicate` Work Item;
- provider-specific handover tests cover stable-id matching, high-confidence
  matching, ambiguous quarantine, and transactions outside the overlap;
- ambiguous identical-looking transactions remain outside balances,
  categorization, and posting until reviewed;
- a failed Plaid-style cursor loop leaves the feed cursor unchanged and retries
  from the original cursor;
- a failed unstable-pagination window does not advance its stable date
  checkpoint;
- exceeding the buffer cap writes no canonical changes or checkpoint and raises
  one internal operational alert;
- revocation or rebinding during fetch prevents stale apply;
- large initial history cannot exceed the configured per-run memory budget;
- transient, authorization, and non-retryable failures are classified correctly;
- an expired executor lease abandons the old running run and creates a distinct
  attempt without overlapping apply rights.

Exit criteria:

- `transaction-sync.service.ts` orchestrates a small number of deep modules
  rather than owning provider fetch, locking, apply, and failure policy itself;
- no provider lifecycle or synchronization behavior remains in the bank-account
  module;
- operations can answer when and why each feed last succeeded or failed.

### Phase 6: Make webhook ingestion and sync requests durable

Goal:

- ensure a valid webhook or committed domain change cannot be lost because the
  process crashes or an executor wake-up fails.

Build:

- add the webhook inbox table and repository;
- verify provider authenticity before accepting an event;
- deduplicate provider deliveries;
- acknowledge only after durable storage commits;
- process stored events asynchronously and idempotently;
- coalesce repeated update events per connection/feed where safe;
- use outbox intents for internal sync requests;
- retain N per-feed provider sync streams where the provider cursor semantics
  require it, while instrumenting the resulting call fan-out.

Tests:

- duplicate delivery produces one logical effect;
- crash after inbox commit is recoverable;
- processing failure is retried and visible;
- unknown item/account events are quarantined rather than silently accepted;
- repeated update events do not create an unbounded job storm.

Exit criteria:

- the webhook endpoint performs no long-running transaction synchronization;
- every accepted event is processed, pending, or durably failed;
- queue submission is no longer the durability boundary.

### Phase 7: Refine projection quality and operational metrics

Goal:

- calibrate the canonical projections introduced in Phase 1 so customers see
  actionable state while operations retain detailed failure visibility.

Build:

- define provider-aware initial-completion and freshness thresholds;
- expose last success, delayed, and action-required information;
- keep isolated retryable failures invisible to customers while the last success
  remains fresh and automatic retry is active;
- calibrate manual-sync eligibility and scheduler policy against the canonical
  lifecycle and freshness projections already adopted in Phase 1;
- add operational alerts for stale feeds, repeated retryable failures, terminal
  sync failures, stuck runs, and webhook backlog;
- update API docs and frontend copy to distinguish connection from sync health.

Tests:

- all combinations in the status projection table;
- manual accounts remain `not_connected`;
- revoked historical feed projects `revoked` until a new active feed exists;
- transient failure with a fresh last success remains connected plus healthy;
- stale initial or incremental synchronization projects delayed;
- action-required projects error/action-required without losing history.

Exit criteria:

- customer status changes only when action or a material delay exists;
- internal operations can still distinguish queued, running, retrying, failed,
  dead-lettered, and stuck work;
- account, close-readiness, task, and work surfaces agree because they use the
  same projection module.

### Phase 8: Minimize sensitive data and define retention

Goal:

- keep only provider data that has earned its operational value and bound its
  security/volume cost.

Build:

- verify that every account-identity path uses only the mask and keyed
  fingerprint introduced in Phase 1;
- implement explicit snapshot allowlists and redaction tests for each provider;
- define retention for webhook payloads, sync runs, connection/account
  snapshots, batch metadata, and transaction source payloads;
- ensure logs and error summaries never include tokens or bank identifiers that
  exceed the approved display mask;
- restrict secret-table access at both application and database roles where the
  deployment model permits;
- add cleanup/archive jobs only for policies that require them.

Exit criteria:

- every semi-raw provider field has an owner, purpose, sanitizer, schema version,
  and retention decision;
- ordinary database reads and logs cannot expose connection tokens or full
  account/routing numbers.

### Phase 9: Remove legacy code and perform final verification

Goal:

- leave one implementation of each rule and prove the entire model from a clean
  database.

Remove:

- old credential naming and adapters;
- bank-account provider/sync fields and reset guards/triggers;
- duplicate status helpers and compatibility projections;
- superseded queue-after-commit paths;
- redundant tests that assert the same behavior below and above the same seam;
- unused fixtures, exports, comments, and legacy provider interfaces.

Verify:

- full migration up/down/rebuild from an empty database;
- full API lint, typecheck, and test suite;
- provider contract tests for Plaid and Mono;
- concurrency, idempotency, revocation, retry, and data-redaction tests;
- no remaining references to removed tables/columns or old terminology;
- explain query/index plans for scheduler, account projection, latest-run, and
  webhook-backlog queries.

Exit criteria:

- the clean schema and code contain no transitional model;
- one documented path owns each lifecycle transition;
- test coverage concentrates on invariants and module interfaces instead of
  repeating implementation details;
- this document is updated from "working" to "implemented" with final links.

## 13. Testing Principle

We should not keep tests merely because they already exist, and we should not
target an arbitrary line-count reduction.

Keep tests that protect:

- domain state transitions;
- database constraints and transactional boundaries;
- provider adapter contracts;
- execution-request idempotency, concurrency, and retry behavior;
- public API/read projections;
- security redaction and tenant isolation.

Prefer one strong test at the deepest stable interface over several tests that
mock and restate the same implementation. When a phase replaces a seam, replace
its superseded tests in that phase rather than layering a second suite on top.

## 14. Implementation Parameters Still to Quantify

The architecture is settled above. These operational values or algorithms must
be made concrete and recorded before their owning phase exits.

| Parameter                                                    | Recommended starting point                                                                                                                                                                                                      | Settle by |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Account identifier normalization and blind-index key custody | Preserve semantic leading zeros; remove only defined presentation separators; fixed cross-provider test vectors; durable non-routine-rotation key                                                                               | Phase 1   |
| Bank-data completeness evidence and grace policy             | Define required account-period coverage, accepted statement/manual-import evidence, and the applicable retry/freshness grace window; connection status alone never proves incompleteness                                        | Phase 1   |
| Banking outbox lease and retry policy                        | Short renewable lease, expired-lease recovery, provider-aware backoff                                                                                                                                                           | Phase 2   |
| Provider revocation and secret-destruction terminal policy   | Define authoritative already-revoked responses, maximum retry/time limit, local destruction point, and critical operational follow-up when remote revocation cannot be confirmed                                                | Phase 4   |
| Replacement-feed identity and overlap policy                 | Record each provider's documented cross-connection stable identifiers; settle normalized economic-fingerprint fields/test vectors; validate the 14-day starting overlap against fixtures and expected provider history behavior | Phase 5   |
| Sync-run retention and pagination buffer cap                 | Keep detailed recent runs, then aggregate/delete by policy; derive the cap from worker memory, concurrency, and measured object overhead                                                                                        | Phase 5   |
| Webhook payload retention                                    | Short, sanitized operational window                                                                                                                                                                                             | Phase 6   |
| Initial-sync and freshness thresholds                        | Provider-aware thresholds with no customer noise for isolated retries                                                                                                                                                           | Phase 7   |
| Transaction source-payload retention                         | Retain only what supports audit/disputes; redact sensitive fields                                                                                                                                                               | Phase 8   |

## 15. Decision Log

| Date       | Decision                                                                                                                 | Reason                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-15 | Treat bank account, bank connection, and bank feed as separate concepts                                                  | They have different identities and lifecycles                                                                                              |
| 2026-07-15 | Store per-account checkpoints on the feed                                                                                | The provider account binding owns the transaction stream                                                                                   |
| 2026-07-15 | Require a keyed account-number fingerprint for manual accounts and enforce active uniqueness by company/bank/fingerprint | Dropping plaintext must not drop existing duplicate protection                                                                             |
| 2026-07-15 | Keep `initial_sync_completed_at` as a current feed fact                                                                  | Initial completion is queried independently of last success and must survive run-history retention                                         |
| 2026-07-15 | Advance checkpoints by provider-defined complete update unit                                                             | Plaid cursor loops and unstable date pagination have different atomicity requirements                                                      |
| 2026-07-15 | Use a measured, hard-capped in-memory pagination buffer in V1                                                            | Current code already measures size; a staging lifecycle is not justified without evidence that legitimate accounts exceed the cap          |
| 2026-07-15 | Replace `sync_error` with durable structured sync runs                                                                   | A free-text current error loses attempt history and retry semantics                                                                        |
| 2026-07-15 | Treat revocation as a valid terminal state                                                                               | Intentional disconnect is not a system failure                                                                                             |
| 2026-07-15 | Remove the generic lifecycle write in Phase 1 and restore disconnect only through explicit commands in Phase 4           | A temporary arbitrary status mutation would preserve the invalid model; the undeployed phases will not be released separately              |
| 2026-07-15 | Revoke an unused connection after its final active feed is stopped                                                       | User disconnect intent and secret minimization outweigh retaining an authorization with no consumer                                        |
| 2026-07-15 | Hide isolated retryable failures from customer sync health                                                               | Operations need attempt detail; customers need only material delay or required action                                                      |
| 2026-07-15 | Make the leased outbox executor the sole owner of banking completion                                                     | Outbox-to-BullMQ relay would create two retry/completion authorities                                                                       |
| 2026-07-15 | Create one `restore_bank_connection` obligation per connection only for `requires_action`                                | Authorization repair is connection-scoped; sync failures and revocation are not client repair work                                         |
| 2026-07-15 | Base close blocking on account-period data completeness, not connection status alone                                     | Manual statements or other evidence can make the books complete despite a broken integration                                               |
| 2026-07-15 | Resolve replacement-feed observations through feed entries and quarantine uncertain duplicates in V1                     | Cross-item provider ids can change, and neither silent duplication nor silent dropping is acceptable accounting behavior                   |
| 2026-07-15 | Retain observations outside the replacement-feed auto-import window                                                      | Evidence must not disappear merely because policy refuses to mutate historical canonical data automatically                                |
| 2026-07-15 | Keep transaction extrema separate from declared alternative-evidence coverage bounds                                     | Rows present in a batch do not prove the source covered every day in the period; zero-transaction statements need a future evidence record |
| 2026-07-15 | Consume the authoritative central Work Group projection without restating its key                                        | Account/feed belong inside the review workspace, and the banking plan must not drift when the central projection changes                   |
| 2026-07-15 | Use central Work vocabulary and ownership for banking Work                                                               | `work_type_code`, `target_id`, and `fiscal_period_id` are owned by Work; banking supplies domain facts, predicates, and commands           |
| 2026-07-15 | Keep `restore_bank_connection` non-blocking and represent proven period gaps as `bank_data_incomplete` Findings          | Authorization health alone does not prove missing accounting data; close should block only on evidenced incompleteness                     |
| 2026-07-15 | Enforce the minimum stale-apply guard in the Phase 1 sync bridge                                                         | Revocation and state-version invariants must be true before Phase 5 adds full Sync Run and lease ownership checks                          |
| 2026-07-15 | Restrict pending-destruction secrets to the leased revocation executor                                                   | Logical revocation must stop sync immediately without making remote token revocation impossible                                            |
| 2026-07-15 | Uniquely identify Sync Runs by execution request and attempt, abandoning expired running attempts                        | Retries need distinct evidence and stale workers must lose apply rights                                                                    |
| 2026-07-15 | Move useful `account_metadata` to a sanitized feed snapshot                                                              | Provider account data has value but does not belong on the accounting account                                                              |
| 2026-07-15 | Separate provider secrets from ordinary connection rows                                                                  | Minimize accidental selection, serialization, and logging                                                                                  |
| 2026-07-15 | Rewrite undeployed migrations in place                                                                                   | There is no production history or compatibility requirement to preserve                                                                    |
| 2026-07-15 | Keep `accounting_findings` persistence as a typed Phase 1 integration stub                                               | The authoritative Work/Close write model is still being designed; banking must not create a competing temporary findings system            |

## 16. How We Will Use This Document

At the start of a phase:

1. confirm its scope and deferred decisions;
2. mark it in progress in the tracker;
3. turn its build/test bullets into small commits;
4. record any changed architectural decision before implementing it.

At the end of a phase:

1. verify every exit criterion;
2. record the final important file/table names;
3. mark the phase complete;
4. note any deliberately deferred work under the phase that now owns it.

This prevents the implementation from drifting while still allowing the model
to improve when code or provider behavior gives us new evidence.
