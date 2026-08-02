# Specify command, bulk, concurrency, and realtime contracts

- Status: closed
- Claimed by: Codex
- Type: research
- Blocked by: `003`, `004`, `005`
- Blocks: `007`, `008`

## Question

What single-item and bulk command contracts, transactions, idempotency, optimistic-concurrency rules, work deltas, launch SSE invalidation, and degraded polling fallback provide immediate safe UX under concurrent users and automation?

## Resolution

Resolved in [command-bulk-concurrency-and-realtime.md](../artifacts/command-bulk-concurrency-and-realtime.md).

Work Queue and Close V2 exposes domain-specific commands under the stable firm and Engagement context; it never exposes a generic Work status, completion, cancellation, or deletion command. Each command carries one logical `commandId` and the expected domain state. The command transaction reauthorizes, locks, validates, mutates domain truth, reconciles Work, records audit/outbox evidence, and commits before the SPA receives a server-confirmed result and optional authorized queue delta.

The launch scope does not require a generic command-receipt table. The SPA reuses `commandId` only for retries of the unchanged command; the server carries it through results and existing correlation infrastructure but stores no generic request hash or cached response and performs no same-ID/different-input detection. Convergent handlers, database constraints, expected versions/hashes, stable domain result identities, and explicit bulk manifests provide retry correctness. Independent bulk actions use bounded explicit manifests, one transaction per target, and partial results; Package and cascading-reopen commands remain atomic aggregate operations. Local commands return confirmed queue deltas, while one authorized firm-scoped SSE stream invalidates affected projections after changes committed elsewhere. Focus/reconnect refetches recover from gaps, and polling runs only while SSE is unavailable.

The design is grounded in Accountable Books' existing request/correlation context, advisory transaction locks, categorization and ledger uniqueness protections, audit facilities, and transactional outbox, while deliberately replacing the deprecated all-or-nothing generic batch pattern for independent bookkeeping work.

### Review amendment — command identity, not a generic idempotency receipt

Every command body carries one UUID `commandId`. The SPA creates it for one logical command and reuses it only for transport retries of that unchanged command. Each HTTP attempt has a separate server-generated `requestId`; there is no caller-facing `Idempotency-Key` or separate correlation header. The server propagates `commandId` through audit, activity, outbox metadata, logs, tracing, SSE origin, and results, mapping it into existing internal `correlation_id` columns where necessary.

V2 stores no generic normalized request hash or cached response, performs no same-ID/different-input detection, and exposes no `IDEMPOTENCY_KEY_REUSED` error. A retry returns the current canonical domain outcome, including `already_applied` when authoritative state proves it. Correctness comes from domain target/result identity, expected versions and facts hashes, locks, ledger/source uniqueness, database constraints, explicit bulk manifests, convergent commands, and idempotent Work reconciliation. External side effects that cannot converge solve idempotency within their own integration and do not create a generic receipt table.

### Review amendment — Package deadline commands

Package creation and every split/replacement require an explicit selected deadline. A deadline change is a distinct version-checked command restricted to the Client Lead or `manage_close_packages`, requires a nonblank reason, and atomically updates Package `due_at` plus all covered open Period Close/Work copies. Reassignment never changes the deadline implicitly. These commands return server-confirmed queue/close deltas or invalidations only after commit.

The current Client Lead receives Package-management authority inherently for that Engagement. `manage_close_packages` is only the explicit delegated exception for an otherwise authorized non-Lead and does not grant approval authority.

### Review amendment — Reopen Request commands

Create, approve, and reject use exact typed command bodies and a canonical result. Approval and rejection require the reviewed request version and impact hash; both recompute the complete current set of covered registered retroactive Findings. Approval performs the client-wide cascade atomically. Rejection requires a note, resolves only reviewer Work, and returns every still-unresolved covered Finding to its eligible bookkeeper. Stale impact, new locks, responsibility changes, or a changed Finding set commit nothing. The result and invalidations carry request/Work versions, affected periods, locks, approvals/reports, covered Findings, and cascade identities.
