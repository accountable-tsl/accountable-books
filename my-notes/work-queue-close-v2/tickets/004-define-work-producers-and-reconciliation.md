# Define work producers and reconciliation

- Status: closed
- Claimed by: Codex
- Type: research
- Blocked by: `002`, `003`, `009`
- Blocks: `005`, `006`, `008`

## Question

How should bookkeeping, close, bank, journal, client-action, and future tax producers create, update, resolve, and repair atomic work idempotently while preserving synchronous consistency for user commands?

## Resolution

The corrected launch scope uses eight registered Work Types implemented by seven small domain producer modules. The added `review_period_reopen_request` Work targets the durable client-level request, routes its decision to the current Client Lead, and uses the current Close Frontier's effective deadline; every covered retroactive Finding remains unresolved while review is pending. The one Work occurrence contributes to counts/stream but is presented only through the client's Close row and request workspace. Source commands do not create or manage Work directly: they enter one prepared transaction boundary with durable domain root IDs plus expected client scope, while the coordinator resolves Engagement, Fiscal Period, producer, assignment, due date, and desired Work state from authoritative data. New roots additionally provide effective accounting dates before insertion so required period locks are acquired first. The idempotent reconciler then inserts, updates, resolves, or supersedes only the necessary `work_items` rows in the same transaction that makes the source predicate decidable.

The deployed Work Type registry contains stable semantics, access/routing defaults, presentation adapters, and permitted bulk command codes; producers own predicates, dates, assignment overrides, end reasons, integration seams, and recovery scans. Static registry data is cached in process, transaction-local scope resolution is reused and batched, PostgreSQL remains authoritative, and Redis is unnecessary for write correctness. Expensive discovery may run asynchronously, but the worker persists its authoritative Finding/candidate and corresponding Work atomically. Recovery invokes the same predicates rather than reconstructing truth from events or notifications.

An active Catch-up/Reclose Package supplies the effective operational deadline for every covered open Work occurrence. Package commands persist that deadline onto existing open Work and Period Close rows atomically; later materialization inherits it, and recovery repairs any drift. Historical imports outside an accepted Package may be immediately overdue, but Package-covered Work becomes overdue only when the Package deadline passes.

The exact catalogue covers bank-transaction categorization, categorization-candidate review, generated/close-relevant draft journals, client bank reauthorization, Accounting Findings, Close Confirmations, and close approval. Failed sync runs remain system-owned and automatically retried while authorization is active. `bank_connections.authorization_status = 'requires_action'` creates one reconnect occurrence per connection, even when several bank-account feeds are affected; deliberate `revoked` disconnection produces notification rather than reconnect Work. Existing `bank_account_feeds` and `bank_transaction_sync_runs` own feed freshness and attempt history, so Work Queue and Close V2 needs no banking sync table or extra Work state. Existing/legacy workflow and task services remain outside the greenfield V2 foundation.

The complete producer catalogue, prepared integration API, transaction/outbox boundary, evaluation policies, recovery design, current Accountable Books seams, and acceptance scenarios live in [Work Producers and Reconciliation](../artifacts/work-producers-and-reconciliation.md).

Notifications remain an after-commit, provider-neutral integration. Producers emit typed notification intents/attention identities; the notification registry owns recipient/channel policy and provider adapters own delivery. A later provider must not require changes to Work or Close domain logic.

The launch catalogue is intentionally bounded to close approval/rejection/staleness, reopen handoffs, Package assignment/deadline changes, one-time Close/Package overdue episodes, client bank reauthorization, deliberate bank disconnection, and contextual Catch-up recommendation. Ordinary Work changes, Preview/Preparing transitions, successful approval FYI, and automatic sync retry do not notify. External delivery is a provider-independent policy so email can be joined later by Slack, Teams, SMS, push, or another adapter without changing domain events.

### Review amendment — exact launch Finding catalogue

The external review confirmed that Findings must be admitted by evidence rather than scope convenience. [Full Launch Scope and Evidence-Based Finding Catalogue](../artifacts/full-launch-scope-and-finding-catalogue.md) fixes twelve launch definitions: one closed-period bank-ingestion decision, eight transaction/ledger reviews, and three period reviews. Every definition requires authoritative inputs, deterministic evaluation and facts hashing, clear evidence/reasoning, legitimate correction or authorized professional-decision paths, lifecycle/staleness correctness, Work/Close integration, UI, and tests. Unsupported ideas have no dormant or deferred Finding entries.
