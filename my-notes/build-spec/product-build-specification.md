# Accountable Books - Product Build Specification

Version 1.0.
Date: 2026-07-25.
Audience: the engineering team contracted to build this product.

## 0. How to read this document

This is a greenfield specification.
Assume no code exists.

It describes **what must exist and to what standard**, not how to write it line by line.
Section 3 (engineering principles) and section 7 (definition of done) are as binding as the feature list.
A feature delivered in violation of section 3 is not delivered.

We are not optimising for delivery speed or cost.
We are optimising for correctness, simplicity, robustness, scalability, and long-term maintainability, in that order.
Where a cheaper approach and a more durable approach diverge, take the durable one and tell us why.

Where this document is ambiguous, ask.
Do not resolve an accounting ambiguity by guessing, and never resolve it in the UI layer.

---

## 1. What we are building

Accountable Books is an AI-native bookkeeping and close platform **for accounting firms that manage client companies**.

The firm is the customer.
The client company is the workspace where the books live.
A client's own staff may be given access to their own books, but the product is designed around the firm's daily work.

**Markets at launch:** Nigeria and the United States.
Both are first-class: two bank-feed providers, two currencies as functional currency, two reporting frameworks (IFRS and US GAAP), two sets of fiscal-year conventions.
Nothing may be built as "the US way, with Nigeria bolted on" or vice versa.

**The core promise:** a firm's bookkeepers see one honest queue of work the system derived from the books themselves, they clear it, and each month closes with an auditable record of who prepared it, what was found, how it was resolved, and who approved it.

**What the product is not:** it is not a self-serve small-business accounting app, not a tax filing product, not a payroll product, and not a general workflow engine.

### 1.1 The three surfaces

| Surface | Who uses it | What it is for |
| --- | --- | --- |
| Firm workspace | Firm owners, managers, bookkeepers | The queue, the client roster, close management, oversight |
| Client books workspace | Firm staff working a client, plus authorised client users | Categorisation, journals, chart of accounts, reports for one company |
| Client portal view | The client company's own people | Their numbers, their outstanding requests, nothing operational |

A fourth internal surface (back-office admin) is specified in area 18.

---

## 2. Ubiquitous language

These terms are binding.
Use them in code, database, API, and UI.
Where a term has an "avoid" note, that alternative must not appear in the codebase.

### 2.1 Firm and responsibility

**Firm-Client Engagement** - the effective-dated agreement under which one firm serves one client for a service domain.
It is the responsibility and authorisation boundary for firm-routed work and for attributing who prepared a close.
It does **not** own the client's books, fiscal periods, or closes.
*Avoid: client assignment, permanent firm link.*

**Client Lead** - the firm member accountable for the client relationship and for close approval.
Every active engagement has exactly one.

**Primary Bookkeeper** - the firm member accountable for routine bookkeeping and close preparation.
Every active engagement has exactly one.
It may be the same person as the Client Lead.

**Contributor** - a firm member granted continuing access to help on one engagement without being its Lead or Bookkeeper.

**Accounting Conversion Date** - the client-owned date at which its accounting history begins in this product.
It may fall inside a month, and it survives a change of firm.
*Avoid: firm cutover date.*

**First Managed Period** - the earliest monthly fiscal period whose close an engagement has accepted responsibility for.

### 2.2 Work

**Work Item** - one system-detected, independently finishable accounting action against one target.
Users resolve the underlying condition; they never manually tick off the work item.
*Avoid: task, user-created work.*

**Work Type** - the stable definition of what must be done, what target it concerns, how it routes, and how it presents.

**Work Target** - the underlying accounting record whose condition requires attention.

**Work Group** - a display-only collection of open work items of one type for one engagement.
It has no lifecycle and no authority.
*Avoid: persisted group.*

**Assignee** - the one person currently accountable for moving a work item forward.
Others may still act.
Assignment does not grant permission.

**Domain Command** - an authorised request to change an accounting, banking, engagement, or close fact.
Work changes only as a consequence of the resulting domain state.
*Avoid: "complete task".*

**Independent Bulk Action** - one convenience that attempts the same domain command against an explicit bounded set of independently valid targets, with partial success.
*Avoid: one transaction spanning unrelated targets.*

### 2.3 Close

**Fiscal Period** - one monthly accounting period for a client.
Monthly is the invariant even when several months are prepared together.

**Period Close** - the client-owned process of establishing that one monthly period is complete, reviewed, and approved.
The same period close continues across firm changes and reopen cycles.
Closing and locking are separate decisions.

**Period Close Version** - one numbered preparation of a period close performed under a particular engagement.
It freezes permanently when submitted or superseded and receives at most one approval decision.

**Close Approval** - the Client Lead's decision on one submitted version.
It has no independent lifecycle.

**Close Frontier** - the earliest period close that currently requires action for a client.
Only one is actionable at a time.

**Accounting Finding** - a system-detected accounting concern anchored to its affected fiscal period, resolved by correction or by an evidenced professional decision.
*Avoid: generic anomaly, checklist item.*

**Finding Resolution** - an immutable result addressing one exact material-facts version of a finding.
It ceases to apply when those facts or the finding definition change.
*Avoid: dismissal, mutable status.*

**Close Confirmation** - a monthly human-confirmation obligation required by policy even when nothing anomalous was detected.
Presented to users as "Final checks".

**Catch-up Package** - a bounded container for preparing several contiguous historical monthly closes together, no more than twelve months, while preserving monthly truth.
While active it owns the operational deadline for the closes and work it covers.

**Period Reopen Request** - a durable request for the current Client Lead to decide whether a closed period and its later closed sequence should reopen.

**Operational Deadline** - the deadline used for queue ordering, overdue attention, and user-facing copy.
Routine close policy supplies it unless an active package owns it.

### 2.4 Accounting

**Ledger Transaction** - one balanced double-entry posting composed of two or more ledger entries.
**Ledger Entry** - one debit or credit against one account, for one date, in one currency, with its reporting-currency amount.
**Posted** - written to the ledger and immutable.
**Draft Journal** - an unposted journal. A *manual* draft is deliberately saved by a user; a *generated* draft is produced by a schedule or import.
**Bank Transaction** - an immutable record of a movement reported by a bank feed or statement import, distinct from the ledger posting that may result from it.

---

## 3. Non-negotiable engineering principles

These are acceptance criteria, not advice.

1. **One canonical path per responsibility.**
   If two code paths can produce the same fact, one of them is deleted.
   No parallel implementations, no "legacy" fallbacks, no dual-write.

2. **Contract-first.**
   Every API request and response shape is defined once in a shared schema package, validated at the server boundary on the way in and on the way out, and consumed as generated types by every client (TypeScript web, Python ML service).
   The contract is law: if a backend wants a different shape, it changes the contract and every consumer in the same change.

3. **Accounting facts are append-only.**
   Posted ledger transactions, entries, close versions, finding resolutions, confirmation responses, and audit events are never updated or deleted.
   Corrections happen by reversal and re-posting, and the history remains visible.
   Enforce this in the database, not only in the service layer.

4. **Money is exact.**
   Integer minor units plus an ISO 4217 currency code, or Postgres `numeric`.
   Never a float, never a JavaScript `number` for an amount that crosses a boundary.
   Exchange rates are `numeric` with an explicitly documented direction convention, applied in one place.

5. **Every mutation is a domain command.**
   One command carries: a client-supplied `commandId` (UUID), the expected domain state it was issued against, and its payload.
   In one database transaction it must: authorise, mutate domain state, write the audit event, reconcile affected work items, and enqueue outbox intents.
   Retrying the same `commandId` converges rather than duplicating.

6. **Transactional outbox for everything that leaves the transaction.**
   Emails, provider calls, notifications, ML calls, projections, and webhooks are never fired inline.
   The outbox guarantees execution, not merely enqueue: leases, retry budgets, dead-letter, and alerting are part of the outbox feature, not an afterthought.

7. **Tenancy is enforced at the data layer.**
   Every company-scoped query is scoped by a tenant context that a developer cannot forget to apply.
   Add Postgres row-level security as defence in depth.
   Middleware-only tenant checks are rejected at review.

8. **Authorisation is capability-based and resolved on the server.**
   The client never derives permission, priority, close readiness, or grouping.
   The server returns what this actor may see and do.
   Every authorisation rule has an adversarial test that attempts the forged version of the request.

9. **Dates are accounting facts, not timestamps.**
   Accounting dates are plain calendar dates.
   Period and deadline boundaries are computed in the client company's timezone.
   Everything else stores UTC.
   No implicit conversion anywhere.

10. **Deep modules with narrow interfaces.**
    Each domain owns its invariants behind a small interface.
    Controllers and React components hold no domain logic.
    A rule of thumb we will apply at review: if understanding a change requires reading three layers, the boundary is in the wrong place.

11. **Migrations are explicit and reviewable.**
    Every field is defined inline in the migration, no imports from application models, schema declared explicitly.
    Before launch the migration history may be rewritten to produce a clean schema from empty.
    After launch, forward-only and additive; renames and drops require a two-step expand/contract.

12. **Tests run against real infrastructure.**
    Integration tests use a real Postgres and a real Redis.
    Do not mock the database.
    Double-entry invariants, tenancy isolation, idempotency, and concurrency get property-based or adversarial tests, not just examples.

13. **No tenant feature flags.**
    A development switch to integrate an unfinished surface is acceptable and must be removed before launch.
    Per-customer behaviour divergence is not.

14. **Honest surfaces.**
    No screen ships with fabricated data, a fake badge, a spinner that never resolves, or a link to a page that does not exist.
    If a capability is not built, its entry point is not rendered.

15. **Observability is part of the feature.**
    Every command emits a structured log line with `commandId`, actor, tenant, and outcome.
    Every background process reports health.
    A feature with no way to answer "is it working right now" is incomplete.

---

## 4. Architecture shape

We are prescribing the shape, not the file names.

### 4.1 Runtime components

| Component | Responsibility |
| --- | --- |
| API service | HTTP API, domain commands, queries, authorisation |
| Worker | Outbox drain, bank sync execution, email delivery, ML calls, reconciliation |
| Scheduler | Time-driven sweeps: sync scans, close lifecycle, expiries, retention |
| Realtime service | Firm-scoped SSE stream for projection invalidation (may live in the API process, must be independently scalable) |
| ML service | Categorisation scoring and training, isolated from the transactional core |
| Web app | The three product surfaces |
| Admin app | Internal back office (area 18) |
| Marketing site | Public pages, legal, pricing |

### 4.2 Data

Single authoritative Postgres.
Redis for queues, leases, and rate limiting only, never as a source of accounting truth.
Object storage for documents, private by default, access only through signed URLs the API issues after an authorisation check.

No read replicas or caches for accounting numbers at launch.
Compute reports from the ledger and its derived balances.
Introduce caching only against a measured, named performance budget (section 6.2).

### 4.3 Domain boundaries

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Identity | Users, sessions, credentials, MFA | Company authorisation policy |
| Access | Capabilities, grants, scopes, support access | Domain semantics |
| Firm and Engagement | Firms, engagements, responsibilities, defaults, transfers | Accounting permissions globally, queue presentation |
| Company | Company identity, settings, fiscal calendar, conversion boundary | Ledger truth |
| Chart of accounts | Accounts and their taxonomy | Posting rules |
| Banking | Providers, connections, accounts, sync, bank transactions | Ledger truth, categorisation policy |
| Categorisation | Rules, suggestions, candidates, matching | Ledger posting mechanics |
| Ledger | Posting, balance, period control, reversal | Business meaning of a category |
| Reporting | Statement assembly from ledger facts | Any mutation |
| Work kernel | Work type registry, target adapters, reconciliation, occurrence lifecycle | Accounting mutations, work groups as rows |
| Findings | Registered evaluators, materialised findings, immutable resolutions | Generic workflow configuration |
| Close | Period closes, versions, packages, frontier, approval, reopen | Ledger truth |
| Queue query | Authorised scopes, groups, facets, DTO assembly | State transitions |
| Notifications | Catalogue, recipients, preferences, channel delivery | Work or close authority |
| Billing | Plans, subscriptions, payments, entitlements | Accounting access control |

---

## 5. Feature list

Legend for the **Must** column: **L** = required before first external launch, **L+** = required and additionally gated by a real-world verification (a real bank, a real charge, a restore drill), **P** = post-launch, listed here so the design does not preclude it.

### Area 1 - Platform foundations (PF)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| PF-01 | Shared contract package | Single source of API request/response schemas, validated both directions at the server boundary, generating TypeScript and Python types | L |
| PF-02 | Tenant context | A request-scoped tenant identity that every company-scoped data access requires; impossible to query company data without it | L |
| PF-03 | Row-level security | Postgres RLS policies on every company-scoped table as defence in depth | L |
| PF-04 | Domain command framework | `commandId`, expected-state check, authorisation, transactional mutation, audit, work reconciliation, outbox emission, convergent retry | L |
| PF-05 | Transactional outbox | Store-then-execute with leases, ordered per aggregate where required, retry budgets, exponential backoff, dead-letter queue | L |
| PF-06 | Outbox operations | Health snapshot, backlog and stall detection, dead-letter alerting to an operator, manual retry with audit | L |
| PF-07 | Advisory locking | Named, timeout-bounded locks for per-aggregate serialisation; no unbounded lock waits | L |
| PF-08 | Audit log | Append-only record of every domain command: actor, tenant, entity, before/after material facts, `commandId`, correlation | L |
| PF-09 | Activity feed | Curated, user-facing subset of audit events, per company and per entity | L |
| PF-10 | Background job platform | Durable queues, scheduled sweeps, concurrency control, per-job observability, dashboard behind auth | L |
| PF-11 | Idempotent ingestion | Every external input (provider transaction, webhook event, uploaded file, import row) carries a natural key that makes replay a no-op | L |
| PF-12 | Structured logging and tracing | Correlated request, command, job, and outbox execution; trace IDs propagate to the ML service | L |
| PF-13 | Error reporting | Unhandled exceptions from web, API, worker, and scheduler reach one place with tenant and command context, PII scrubbed | L |
| PF-14 | Sequence and reference numbering | Gapless, tenant-scoped, concurrency-safe numbering for journals, invoices, close versions | L |
| PF-15 | Document store | Private object storage, signed upload and download, content-type and size limits, checksum, virus scan, tenant-scoped dedupe, orphan cleanup | L |
| PF-16 | Reference data | Countries, currencies (full ISO 4217), timezones, bank institutions, versioned and seeded from checked-in catalogues | L |
| PF-17 | Environment configuration | Typed, validated at boot, fails fast on a missing or malformed value, one generator for all environments | L |
| PF-18 | Seed and demo data | Deterministic seed producing a realistic multi-client firm for development, testing, and sales demos, never runnable against production | L |

### Area 2 - Identity and access (IA)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| IA-01 | User account | Email identity, name, profile, lifecycle states | L |
| IA-02 | Signup | Firm signup and client-user signup, both landing in a usable state, both idempotent under retry | L |
| IA-03 | Email verification | Signed, expiring token, resend with rate limit, clear expired-token recovery | L |
| IA-04 | Login and session | Server-side session, secure cookie, refresh, CSRF protection, session revocation | L |
| IA-05 | **Password reset** | Request, expiring single-use token, set new password, invalidate all sessions, notify the account owner | L |
| IA-06 | Password policy | Length and breach-list checks, modern hashing, no composition rules that push users to weak patterns | L |
| IA-07 | Multi-factor authentication | TOTP enrolment, recovery codes, enforced for all firm staff; this product holds bank data and client financials | L |
| IA-08 | Active sessions view | List of active sessions with device and last-used, revoke individually or all | L |
| IA-09 | Rate limiting | On authentication, password reset, invitation, upload, and all expensive query endpoints; per IP and per account | L |
| IA-10 | Capability model | Named capabilities, not role strings scattered through code; roles are named bundles of capabilities; one resolver | L |
| IA-11 | Company access grants | Grant, list, change, and revoke a user's role on a company, with audit and notification | L |
| IA-12 | Access scopes | `my_work`, `portfolio`, and capability-gated `firm_oversight` resolved server-side for every query | L |
| IA-13 | Workspace switching | Fast switching between accessible companies with correct context, deep-link safe | L |
| IA-14 | Support access | Time-boxed, reason-required, customer-visible support grants; break-glass sessions with elevated audit and automatic expiry | L |
| IA-15 | Account deactivation and deletion | User deactivation, and personal data deletion honouring accounting retention duties | L |

### Area 3 - Firm and engagement (FE)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| FE-01 | Firm entity | Firm identity, branding, slug, contact, verification state | L |
| FE-02 | Firm verification | A firm may not take on clients until verified; manual review at launch with an admin decision and audit | L |
| FE-03 | Firm membership | Invite, accept, list, change role, deactivate firm staff | L |
| FE-04 | Firm defaults | Default Client Lead, default Primary Bookkeeper, close policy defaults, fallback-to-admin rule | L |
| FE-05 | **Firm creates a client company** | Provision a complete, usable client workspace with no participation from the client | L |
| FE-06 | Engagement activation contract | One contract that every intake path must satisfy: client identity, country, currency, timezone, fiscal year end, accounting basis, reporting framework, service domain, conversion date, first managed period, Client Lead, Primary Bookkeeper, catch-up decision and accepted range | L |
| FE-07 | Atomic activation | Activation establishes engagement, responsibilities, and any accepted catch-up packages in one transaction, or rejects the whole thing; no partially activated client | L |
| FE-08 | Effective-dated responsibilities | Client Lead, Primary Bookkeeper, and Contributors change over time without rewriting history | L |
| FE-09 | Intake: firm invitation | Invite a client user by email, durable pending object, expiry, resend, revoke, accept | L |
| FE-10 | Intake: firm-branded signup | A client signs up through a firm's branded link and lands with that firm | L |
| FE-11 | Intake: direct signup with placement | A company signs up directly and is placed with a designated firm | L |
| FE-12 | Intake: referral | A referral is proposed, reviewed, accepted or rejected, with platform fallback on rejection | L |
| FE-13 | Intake: transfer between firms | Cutover date, predecessor engagement, receiving Lead and Bookkeeper, accepted historical responsibility, without rewriting the predecessor's close versions | L |
| FE-14 | One intake validation path | Wizard, direct signup, and any future bulk or assisted intake share one validation and domain path | L |
| FE-15 | Intake review screen | A final screen making firm, responsibilities, accounting boundary, first managed month, and catch-up commitment unambiguous before activation | L |
| FE-16 | Resumable intake | Pending and error states are durable and resumable; a failed email never blocks activation, and a failed activation never half-creates | L |
| FE-17 | Client roster | Searchable, filterable list of a firm's clients with derived status, open work count, close position, last activity | L |
| FE-18 | Engagement lifecycle | Activate, suspend, end; ended engagements retain their historical attribution and lose forward access | L |
| FE-19 | Bulk client import | CSV import validated through the same intake contract with per-row errors | P |

### Area 4 - Company and accounting setup (CS)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| CS-01 | Company profile | Legal name, trading name, registration identifiers, addresses, contacts, industry | L |
| CS-02 | Company type | Business and individual shapes, each with the fields that genuinely apply | L |
| CS-03 | Jurisdiction settings | Country, timezone, functional currency, reporting currency, fiscal year end with valid-date enforcement | L |
| CS-04 | Fiscal year end defaults | Country-appropriate defaults, including 5 April for UK individuals; invalid dates such as 30 February or 31 September rejected at every entry point | L |
| CS-05 | Accounting basis | Modified cash and modified accrual, defaulted at creation, driving downstream evaluation | L |
| CS-06 | Reporting framework | IFRS and US GAAP, driving statement nomenclature and the account catalogue | L |
| CS-07 | Chart of accounts | Account code, name, description, currency behaviour, active state, hierarchy | L |
| CS-08 | Account taxonomy | Elements, types, and label roles that drive statement mapping, finding evaluation, and posting rules; seeded from a versioned catalogue, extensible per company without breaking mapping | L |
| CS-09 | COA templates | Framework and country-appropriate starting charts, applied at provisioning | L |
| CS-10 | COA editing | Create, edit, deactivate; deactivation blocked where a balance or open item exists; codes are stable identifiers | L |
| CS-11 | Required accounts | The system-required accounts for each basis, guaranteed present, protected from deletion, clearly labelled | L |
| CS-12 | Fiscal calendar | Monthly period generation from fiscal year end, with period status: future, open, preparing, closed, locked | L |
| CS-13 | **Accounting conversion date** | Client-owned date at which history begins, may fall mid-month, stable across firm changes, enforced as a posting boundary | L |
| CS-14 | **Opening and conversion balances** | Import or enter trial-balance opening positions as a balanced conversion journal at the conversion date, including bank balances in native and reporting currency, with validation that it balances | L |
| CS-15 | Company settings | Categorisation policy, autopost policy, close policy, notification defaults, document requirements | L |
| CS-16 | Exchange rates | Rate sources per currency pair with provenance and effective date; scheduled ingestion; documented direction convention; the official Nigerian rate kept current | L |
| CS-17 | Rate application policy | Which rate applies to which posting date and which balance type, decided once and applied everywhere | L |

### Area 5 - Banking (BK)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| BK-01 | Provider abstraction | One interface: create link, exchange token, describe connection, sync transactions, handle errors; adding a third provider touches only its adapter and a catalogue row | L |
| BK-02 | Provider registry | Database-driven enablement by country and currency, with the ability to disable a provider without a deploy | L |
| BK-03 | Plaid integration | Full lifecycle for the US market | L+ |
| BK-04 | Mono integration | Full lifecycle for the Nigerian market | L+ |
| BK-05 | Connection lifecycle | Connect, healthy, requires-action, revoked, disconnected; every state has a defined user-facing meaning and next action | L |
| BK-06 | Account discovery and binding | Discovered provider accounts are explicitly bound to ledger bank accounts by the user; binding is stable across reconnects | L |
| BK-07 | Reauthorisation | Re-consent for an existing connection, including for a subset of accounts, rebinding the same ledger accounts | L |
| BK-08 | Reconnect as replacement | Reconnecting through a new provider item replaces the old connection and rebinds existing accounts without duplicating history | L |
| BK-09 | Disconnect handling | Bank-side revocation is detected, the connection state changes, and the responsible people are notified | L |
| BK-10 | Transaction sync | Per-account cursors, incremental fetch, deduplication by provider identity, ordered application, resumable after failure | L |
| BK-11 | Sync execution guarantees | Leased execution, defer-while-collecting, retry budget, no double-application under concurrent runs | L |
| BK-12 | Scheduled sync scan | Time-driven scan that enqueues sync intents per account with jitter and backoff, sized to scale to thousands of accounts | L |
| BK-13 | Provider webhooks | Signature-verified, stored raw, then processed through the outbox; idempotent under replay and out-of-order delivery; implemented for every provider that offers them | L |
| BK-14 | Manual sync | User-triggered sync with visible progress and a truthful result | L |
| BK-15 | Transaction supersession and removal | Provider-amended and provider-removed transactions are handled explicitly, surfaced for review where they affect posted books | L |
| BK-16 | Historical import | Offer the available history range, let the user choose a start date, import within a bounded window, show progress; expire unclaimed offers | L |
| BK-17 | Statement import | CSV and OFX upload with column mapping, preview, duplicate detection against feed data, per-row errors, and a reversible batch | L |
| BK-18 | Import batch management | View a batch, see what it produced, delete a batch that has not been posted | L |
| BK-19 | Sync health | A single per-connection health state distinguishing "needs your action" from "data is delayed", surfaced in the UI and in the roster | L |
| BK-20 | Balance anchor | Provider-reported balance stored as a bank-side anchor with its as-of timestamp, never conflated with the ledger balance | L |
| BK-21 | Bank reconciliation | Per-account, per-period reconciliation of the bank-side anchor to the ledger balance, showing unreconciled items and producing a reconciliation statement | L |
| BK-22 | Transfer detection | Detect movements between the same company's own accounts and offer a single transfer treatment rather than two unrelated postings | L |
| BK-23 | Payload retention | Raw provider payloads and sync run records are purged on a schedule with a documented retention period | L |

### Area 6 - Transactions and categorisation (TC)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| TC-01 | Bank transaction record | Immutable provider or statement fact: date, description, amount, currency, counterparty hints, provider identity | L |
| TC-02 | Transaction lifecycle | Uncategorised, suggested, categorised, posted, excluded, superseded; one state machine, no ad hoc flags | L |
| TC-03 | Categorisation workspace | The primary daily working surface: fast list, keyboard-first, inline edit, durable drafts, no lost work on navigation or refresh | L |
| TC-04 | Cursor pagination | Stable cursor-based paging and infinite loading that cannot skip or duplicate rows when data changes mid-scroll | L |
| TC-05 | Rules engine | Deterministic, ordered, testable rules matching on description, counterparty, amount, account, direction; preview before enabling; rule provenance visible on the result | L |
| TC-06 | ML suggestions | Per-company model producing a category suggestion with a calibrated confidence and an explanation; degrades gracefully when the service is unavailable | L |
| TC-07 | Model training | Training from the company's own confirmed postings on a schedule, versioned models, ability to roll back a model | L |
| TC-08 | Autopost policy | Post automatically above a company-configured confidence threshold, with a visible record of what was autoposted and a one-action undo | L |
| TC-09 | Split transactions | Split one bank transaction across multiple accounts, contacts, and projects, with balance validation and durable drafts | L |
| TC-10 | Matching | Match a bank transaction to an existing draft or posted journal, or to an expected item, without double-posting | L |
| TC-11 | Counterparty capture | Assign or create a contact inline, with duplicate detection | L |
| TC-12 | Dimensions | Assign project and other configured dimensions inline | L |
| TC-13 | Attachments on transactions | Attach a receipt or invoice inline, from upload or from an existing document | L |
| TC-14 | Bulk actions | Bounded, server-issued bulk manifests with partial success and per-target errors; never a blind "apply to everything matching" | L |
| TC-15 | Filters and search | Filter by date, amount range, account, status, confidence, contact, project, source, text; shareable as URL state | L |
| TC-16 | Exclusion | Explicitly exclude a transaction from the books with a required reason, reversible, audited | L |
| TC-17 | Categorisation candidates | System-proposed changes to existing postings, presented for review as work, not applied silently | L |

### Area 7 - Journals and ledger (JL)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| JL-01 | Ledger posting | Balanced double-entry posting, atomic, with period and conversion-boundary checks, in one transaction with its audit and outbox effects | L |
| JL-02 | Double-entry invariants | Debits equal credits per transaction in both native and reporting currency; enforced by database constraint and by property test | L |
| JL-03 | Immutability and reversal | Posted transactions are never edited; correction is reversal plus repost, linked to the original and visible in history | L |
| JL-04 | Period control | Posting into a closed or locked period is rejected at the ledger, not at the UI; the only ways in are an authorised reopen or an authorised open-date treatment | L |
| JL-05 | Manual journals | Multi-line entry, per-line account, contact, project, description, native and reporting amounts, validation before post | L |
| JL-06 | Draft journals | Save, resume, collaborate, discard; drafts are visible to authorised firm staff and become work when their period enters preparation | L |
| JL-07 | Journal attachments | Presigned upload, persistence on save, signed download; no fabricated URLs; attachment presence is a queryable fact for findings | L |
| JL-08 | Recurring journal templates | Schedule, start and end, generation into drafts or postings, a visible list of what a template generated, pause and resume | L |
| JL-09 | Journal import | Structured import with preflight validation, per-row errors, an atomic commit of the accepted set, and a reversible batch | L |
| JL-10 | Reversal and correction tooling | One-action reversal with a required reason, and guided correction that reverses and re-posts as one command | L |
| JL-11 | Journal search and history | Filter by date, account, contact, project, amount, source, status; full posting history per transaction | L |
| JL-12 | Ledger view | Per-account general ledger with running balance, drill-through to the transaction and to its source document | L |
| JL-13 | Source traceability | Every ledger transaction records what produced it: bank transaction, journal, import, recurring template, conversion, revaluation, correction | L |

### Area 8 - Balances and FX (BF)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| BF-01 | Current balances | Per-account current balance in native and reporting currency, refreshed transactionally with every posting path without exception | L |
| BF-02 | Period balances | Per-account per-period opening, movement, and closing balances | L |
| BF-03 | Daily snapshots | Daily balance snapshots supporting as-of reporting and trend charts | L |
| BF-04 | Balance integrity check | A scheduled and on-demand check that derived balances equal the sum of entries, alerting on divergence | L |
| BF-05 | Multi-currency postings | Native and reporting amount on every entry, with the applied rate and its source recorded | L |
| BF-06 | FX position register | Open monetary exposure by currency and account, with the movements that opened and closed it | L |
| BF-07 | FX revaluation | A command that posts the revaluation journal and records the position movement together, never one without the other | L |
| BF-08 | Realised FX | Realised gain or loss recognised on settlement, traceable to the position that produced it | L |
| BF-09 | Rate provenance | Every converted amount can name the rate, its source, and its effective date | L |

### Area 9 - Reporting (RP)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| RP-01 | Trial balance | Per-account debits and credits for a period, grouped by element, visibly footing, with period selection | L |
| RP-02 | Income statement | Activity within a period, assembled from the account taxonomy, framework-correct labels, subtotals and totals | L |
| RP-03 | Balance sheet | Cumulative position as of a date, including the current-period result inside equity, balancing by construction | L |
| RP-04 | Cash flow statement | Indirect method, derived from ledger movements, reconciling to the movement in cash accounts | L |
| RP-05 | Statement drill-through | From a statement line to its accounts, from an account to its entries, from an entry to its source | L |
| RP-06 | Comparative periods | Prior period and prior year columns with variance | L |
| RP-07 | Reconciliation of reports | Automated check that the statements reconcile to the trial balance for the same period, run in tests and available as an operator check | L |
| RP-08 | Report packs | A named set of statements for a period, generated as PDF, versioned, attributable to a close version | L |
| RP-09 | Spreadsheet export | Trial balance, general ledger, journals, and statements as XLSX with correct types and no lost precision | L |
| RP-10 | Client dashboard | The client-facing summary: cash position, revenue and expense trend, outstanding requests, close status; real numbers only | L |
| RP-11 | Firm dashboard | Practice-level view: clients by status, work volume, close progress, overdue attention | L |
| RP-12 | Report period selection | One consistent period picker across every report surface, honouring the company's fiscal calendar | L |
| RP-13 | Formula-linked workbook and Sheets export | Traceable workbook with mappings and links back to source | P |

### Area 10 - Work kernel (WK)

The kernel is the backbone of the queue product.
Build it before any individual work type.

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| WK-01 | Work type registry | Declarative registration of each work type: target grain, routing, presentation, permitted commands, validated at application boot | L |
| WK-02 | Target adapters | Typed adapters resolving a work target to its domain root, engagement, and affected fiscal period | L |
| WK-03 | Prepared sync context | One prepared context per reconciliation pass so producers do not each re-query the world | L |
| WK-04 | Inline reconciliation | Any command that changes a work-relevant fact reconciles affected work items inside the same transaction | L |
| WK-05 | Discovery reconciliation | Outbox and sweep-driven reconciliation that finds work no command produced, and recovers from missed events | L |
| WK-06 | Occurrence lifecycle | Atomic open, resolve, supersede, reroute, and re-anchor, converging under replay, duplicate delivery, and concurrent reconcilers | L |
| WK-07 | Assignment routing | Route by engagement responsibility and type-specific rules; reassignment changes accountability without changing permission | L |
| WK-08 | Deadline model | Operational deadline supplied by routine policy unless an active package owns it, persisted on the work item for ordering | L |
| WK-09 | Work type: categorise bank transaction | Uncategorised bank transaction becomes one period-anchored work item, resolved by the categorisation command | L |
| WK-10 | Work type: review categorisation candidate | System-proposed change to an existing posting, resolved by accept or reject, supporting bounded bulk | L |
| WK-11 | Work type: review draft journal | Unresolved generated draft immediately, unresolved manual draft when its period enters preparation | L |
| WK-12 | Work type: restore bank connection | Created only for client-actionable `requires_action`, resolved by verified reauthorisation; deliberate revocation is notification only | L |
| WK-13 | Work type: resolve accounting finding | A materialised finding becomes work, resolved by correction or by an authorised professional decision | L |
| WK-14 | Work type: prepare period close | The close preparation obligation for the frontier period | L |
| WK-15 | Work type: approve period close | The Client Lead's approval obligation for a submitted version | L |
| WK-16 | Work type: review reopen request | The Client Lead's decision obligation on a durable reopen request | L |
| WK-17 | No user-created work | Work is system-derived only; there is no manual "add task" | L |

### Area 11 - Findings and confirmations (FC)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| FC-01 | Finding admission rule | A finding code enters the registry only with authoritative inputs, a deterministic evaluator, clear reasoning, at least one legitimate resolution, correct staleness lifecycle, and a complete vertical slice. No dormant or aspirational entries | L |
| FC-02 | Finding materialisation | Evaluated findings are persisted against their affected fiscal period with a material-facts hash | L |
| FC-03 | Evidence contract | Every finding can show the exact transactions, entries, accounts, balances, documents, and dates that produced it | L |
| FC-04 | Resolution by correction | The correcting domain command clears the finding only when the evaluator confirms it, never by user assertion | L |
| FC-05 | Professional resolution | Authorised accepted or not-applicable decisions with a required reason and evidence; never a generic dismissal | L |
| FC-06 | Staleness | A change in material facts or in the definition invalidates an earlier resolution and re-raises the finding | L |
| FC-07 | Re-evaluation at submission | Close submission re-evaluates all applicable findings against the then-current facts | L |
| FC-08 | `transaction_dated_in_closed_period` | Active unposted bank transaction dated inside a closed month; resolved by safe match, authorised open posting date preserving the bank date, or reopen | L |
| FC-09 | `bank_offset_to_non_cash_account_review` | Bank movement offset to depreciation, accumulated depreciation, or equity | L |
| FC-10 | `bank_receipt_direct_to_revenue_review` | Modified-accrual receipt straight to revenue where receivable or deferred treatment may apply | L |
| FC-11 | `supplier_payment_direct_to_expense_review` | Modified-accrual payment straight to expense where payable or accrual treatment may apply | L |
| FC-12 | `suspense_activity_review` | Activity remaining in a fallback or suspense account | L |
| FC-13 | `receivable_payable_missing_counterparty_review` | Counterparty-tracked balance posted with no contact | L |
| FC-14 | `missing_supporting_document_review` | Manual journal affecting a counterparty balance with no attached document | L |
| FC-15 | `journal_posted_to_bank_account_review` | Manual journal moving a bank account directly | L |
| FC-16 | `accumulated_depreciation_unexpected_movement_review` | Accumulated depreciation movement without its expected pair | L |
| FC-17 | `fixed_asset_depreciation_review` | Period fixed-asset activity without a clear depreciation treatment, catch-up aware across a package range | L |
| FC-18 | `fx_revaluation_decision_review` | Open monetary exposure with no recorded period revaluation decision | L |
| FC-19 | `cash_fixed_asset_or_liability_pattern_review` | Modified-cash books using asset or liability accounts, with the contributing accounts named in the evidence | L |
| FC-20 | Close confirmations | Monthly human confirmation obligations required by policy even with no anomaly, presented as Final checks | L |
| FC-21 | Immutable confirmation responses | Responses are append-only and bound to the close version they were given for | L |
| FC-22 | Finding registry versioning | Definitions are versioned; a changed definition invalidates dependent resolutions deterministically | L |

### Area 12 - Close (CL)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| CL-01 | Period close materialisation | Client-owned monthly period closes materialised ahead of month end on a business-day schedule in the client's timezone | L |
| CL-02 | Close lifecycle | Preview, preparing, submitted, approved, closed, locked, reopened; one state machine with defined transitions | L |
| CL-03 | Close frontier | Exactly one actionable close per client at a time, while later bookkeeping continues | L |
| CL-04 | Guided close workspace | Clear open work, resolve findings, complete final checks, review, submit; each step showing what remains | L |
| CL-05 | Close versions | Numbered preparations attributed to the preparing engagement, frozen on submission or supersession | L |
| CL-06 | Same-person close | Submit and approve in one action where the Lead and Bookkeeper are the same person, with that fact recorded | L |
| CL-07 | Split submission and approval | Bookkeeper submits, Client Lead approves or rejects with a reason; rejection returns the period to preparation as a new version | L |
| CL-08 | Material-change staleness | A material change after submission invalidates the submitted version and requires a new one | L |
| CL-09 | Aggregate close command | A close decision succeeds or fails as one transaction, including any cascade | L |
| CL-10 | Locking | Locking is a separate decision from closing, with its own authority and its own reversal path | L |
| CL-11 | Catch-up packages | Bounded contiguous ranges up to twelve months, created at intake or later, with an owner and a confirmed deadline | L |
| CL-12 | Package deadline ownership | An active package persists its operational deadline onto every covered open close and work item; reassignment does not change it | L |
| CL-13 | Package operations | Split, reassign, change deadline with a reason, submit, and approve atomically; a replacement package preserves its predecessor | L |
| CL-14 | Catch-up aware presentation | Monthly finding truth is preserved while the workspace suppresses repetitive presentation across a package range | L |
| CL-15 | Cascading reopen | Reopening a closed period cascades through the later closed sequence within the client scope, with a reason, respecting locks | L |
| CL-16 | Reopen requests | Durable request objects decided by the current Client Lead, including across a firm transfer; rejection returns the underlying concern unresolved | L |
| CL-17 | Reopen suggestions | Where a reopen would span many months, suggest a bounded reclose package instead | L |
| CL-18 | Transfer during close | An accepted firm transfer during preparation or approval does not replace the client-owned period close | L |
| CL-19 | Close history | Full history per period: versions, who prepared, what was found, how it was resolved, who approved, when reopened and why | L |
| CL-20 | Single close authority | No public endpoint outside the close aggregate can produce a conflicting fiscal period or close state | L |

### Area 13 - Queue, commands, and realtime (QR)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| QR-01 | Landing snapshot | One authorised firm-scoped projection: work groups, one close row per client, facets, counts, deadlines | L |
| QR-02 | Derived grouping | Work groups derived on request by engagement and work type, never stored | L |
| QR-03 | Scope controls | My work, portfolio, and capability-gated firm oversight, switchable and reflected in every count | L |
| QR-04 | Facets and search | Client and assignee facets, text search, deadline and status filters, all server-computed | L |
| QR-05 | Section pagination and lazy peek | Large sections page; a group can be peeked without loading everything | L |
| QR-06 | Ordinary work workspace | Lazy-loaded domain detail for a work item with its permitted commands in place | L |
| QR-07 | Close workspace | The guided close surface from CL-04 rendered from the same projection contracts | L |
| QR-08 | Server-confirmed commands | The UI waits for the server result and applies a server-issued delta; no optimistic accounting completion | L |
| QR-09 | Refetch hints | Commands return stable hints about what else changed so the client refetches precisely | L |
| QR-10 | Bounded bulk manifests | The server issues the exact target set for a bulk action; results are per-target | L |
| QR-11 | Realtime invalidation | One resumable firm-scoped SSE stream delivering targeted invalidation for changes committed elsewhere | L |
| QR-12 | Polling fallback | Bounded polling only while the stream is unavailable, with visible degraded state | L |
| QR-13 | Continuous stream view | The chronological activity stream alongside the grouped queue | L |
| QR-14 | Safety cues | Clear indication of which client's books you are acting in, and confirmation before cross-client actions | L |
| QR-15 | Complete states | Every surface has loading, empty, error, permission-denied, stale, and handled-elsewhere states | L |
| QR-16 | Deep links | Every queue item deep-links into the correct workspace, filtered to its exact subject, and back | L |

### Area 14 - Notifications and communications (NT)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| NT-01 | Notification catalogue | A bounded, versioned catalogue of notification types with their recipients, urgency, and channels | L |
| NT-02 | Provider-neutral emission | Domain transactions emit typed intents through the outbox; policy selects recipients and channels; adapters deliver. Adding a channel touches no domain code | L |
| NT-03 | In-app inbox | List, unread count, mark read, mark all read, deep link to the subject | L |
| NT-04 | Notification preferences | Per user, per company, per type and channel, with sensible defaults and a clear "critical cannot be disabled" set | L |
| NT-05 | Email delivery | Durable queue, provider abstraction with at least one fallback provider, bounce and complaint handling | L |
| NT-06 | Email templates | Versioned, tested, plain-text alternatives, correct rendering in major clients | L |
| NT-07 | Deliverability | Verified sending domain, SPF, DKIM, DMARC, inbox placement verified for major providers before launch | L |
| NT-08 | Digests | Daily or weekly digest of queue and deadline state, per user preference | L |
| NT-09 | Deadline attention | Notifications for approaching and passed operational deadlines, owned by the notification catalogue rather than by work producers | L |
| NT-10 | Client requests | A bounded request to a client for a document or an answer, attached to its work item or finding, tracked to resolution, without a general messaging product | L |

### Area 15 - AI (AI)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| AI-01 | Assistant threads | Persistent threads scoped to a company, with history | L |
| AI-02 | Tool use over domain commands | The assistant proposes domain commands; it never mutates state directly | L |
| AI-03 | Human approval | Every proposed mutation is reviewed and approved by an authorised human before execution, with the proposal and the decision audited | L |
| AI-04 | Command bar | One consistent entry point for assistance across the app | L |
| AI-05 | Contextual assistance | Results appear where the user already is rather than in a separate "AI mode" | L |
| AI-06 | Tenant isolation | No prompt, context, or retrieved document may cross a company boundary; proven by test | L |
| AI-07 | PII handling | Documented data flow, redaction where a third-party model is used, a per-firm opt-out, and no training on customer data without explicit consent | L |
| AI-08 | Cost and latency controls | Per-tenant budgets, timeouts, graceful degradation when the model is unavailable | L |
| AI-09 | Evaluation harness | A fixed evaluation set for categorisation and assistant quality, run on every model or prompt change | L |
| AI-10 | Inline autocomplete | Ghost-text suggestions in descriptions and titles | P |

### Area 16 - Client portal (CP)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| CP-01 | Client user access | A client user sees exactly their own company, never the firm or another client; proven by adversarial test | L |
| CP-02 | Client dashboard | Cash, trend, close status, and outstanding requests, all real | L |
| CP-03 | Client reports | Read-only statements and report packs for closed periods | L |
| CP-04 | Client action centre | The client's outstanding items: documents requested, questions asked, bank connections needing their action | L |
| CP-05 | Client bank authorisation | The client can complete or repair a bank connection without firm involvement | L |
| CP-06 | Client document upload | Upload a requested document straight onto its request | L |

### Area 17 - Billing (BL)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| BL-01 | Plan catalogue | Versioned plans, prices per currency, entitlements, grandfathering support | L |
| BL-02 | Billing account and ownership | Which billing account owns which workspaces, independent of accounting access | L |
| BL-03 | Subscription lifecycle | Trialing, active, past due, cancelled, with a tested state machine | L |
| BL-04 | Provider-hosted checkout | No card data touches our systems; Stripe for USD and Paystack for NGN, both behind one internal interface | L+ |
| BL-05 | Payment webhooks | Signature-verified, stored, processed through the outbox, idempotent under replay and out-of-order delivery | L |
| BL-06 | Entitlements | One resolver answering what a workspace is entitled to; soft enforcement at launch, banners not lockouts | L |
| BL-07 | Billing surface | Current plan, change plan, payment method, invoices, billing contact | L |
| BL-08 | Invoices and receipts | Downloadable, correct per jurisdiction, with tax treatment stated | L |
| BL-09 | Dunning | Retry schedule, notification sequence, defined outcome on final failure | L |
| BL-10 | Usage metering | Whatever the plan meters, metered accurately and visibly | L |

### Area 18 - Admin and support back office (AS)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| AS-01 | Firm verification queue | Review and decide firm verification, with reason and audit | L |
| AS-02 | Tenant lookup | Find a firm, company, or user and see their configuration and health without seeing their financial detail by default | L |
| AS-03 | Consented impersonation | Support access only through the time-boxed, reason-required, customer-visible grant from IA-14 | L |
| AS-04 | Operational dashboards | Outbox health, sync health, close progress, failed jobs, provider errors | L |
| AS-05 | Data operations | Retry a dead-lettered intent, re-run a sync, recompute balances, all as audited commands rather than direct SQL | L |
| AS-06 | Product metrics | Signups, activations, active firms, clients under management, closes completed, work cleared | L |
| AS-07 | Feature catalogue administration | Manage provider enablement, plan catalogue, and reference data without a deploy | L |

### Area 19 - Operations and reliability (OP)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| OP-01 | Environments | Development, CI, staging, production, with identical shapes and independent data | L |
| OP-02 | CI on every branch | Lint, typecheck, format, unit, integration, and contract tests on every push, not only on protected branches | L |
| OP-03 | Deployment pipeline | Automated deploy from the protected branch, migrations run as a gated step, rollback documented and rehearsed | L+ |
| OP-04 | Health endpoints | Liveness and readiness including database and queue dependencies | L |
| OP-05 | Backups and PITR | Automated backups with point-in-time recovery on the production database | L |
| OP-06 | Restore drill | A rehearsed, timed restore into a scratch environment, repeated before launch and quarterly | L+ |
| OP-07 | Uptime monitoring | External checks on API readiness and web availability, alerting to a human | L |
| OP-08 | Alerting | Dead-letter, backlog, stalled drain, failed sync, failed deploy, and error-rate alerts routed to an on-call inbox | L |
| OP-09 | Runbooks | API down, outbox backlog, bank connection broken, email not sending, restore from backup, incident communication | L |
| OP-10 | Release versioning | Every deployed artefact is tagged and identifiable from the running system | L |
| OP-11 | Migration safety | Additive-only after launch, with expand and contract for anything else, and a tested rollback path | L |
| OP-12 | Load and scale validation | Documented capacity: transactions per company, accounts per firm, queue size, concurrent users, with measured headroom | L |
| OP-13 | Environment protection | Production and staging cannot be destroyed or seeded by accident; destructive commands require explicit confirmation | L |
| OP-14 | Incident process | Severity definitions, response expectations, customer communication template, post-incident review | L |

### Area 20 - Security, privacy, and compliance (SC)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| SC-01 | Encryption | TLS everywhere, encryption at rest for database and object storage, encrypted backups | L |
| SC-02 | Secrets management | No secret in source or image; rotation procedure documented and rehearsed | L |
| SC-03 | Tenancy isolation tests | An automated suite that attempts cross-tenant access on every company-scoped endpoint and must fail every attempt | L |
| SC-04 | Input validation | Every boundary validated against the contract schema; no unvalidated pass-through | L |
| SC-05 | File safety | Type and size limits, virus scanning, no in-memory handling of large files, safe rendering of user-supplied documents | L |
| SC-06 | Dependency and vulnerability scanning | Automated in CI, with an agreed remediation window by severity | L |
| SC-07 | Penetration test | An independent test before launch, with findings resolved or explicitly accepted | L+ |
| SC-08 | Audit retention | Defined retention for audit, activity, and provider payloads, enforced by scheduled jobs | L |
| SC-09 | Data export | A tenant can export their complete data in a documented, machine-readable format | L |
| SC-10 | Data deletion | Deletion request handling that honours accounting retention duties and documents what is retained and why | L |
| SC-11 | Privacy policy and terms | Real, reachable from the app and the marketing site, versioned, with acceptance recorded at signup | L |
| SC-12 | Data processing agreement and subprocessors | Published DPA and a current subprocessor list, including the bank-feed and model providers | L |
| SC-13 | Breach response | Documented detection, assessment, notification timelines, and contact path | L |
| SC-14 | Access review | Periodic review of internal access to production and to customer data | L |

### Area 21 - Frontend quality bar (UX)

| ID | Feature | What it must do | Must |
| --- | --- | --- | --- |
| UX-01 | Design system | One token set, one component library, no ad hoc styling; light and dark | L |
| UX-02 | Accessibility | WCAG 2.2 AA: keyboard operable throughout, visible focus, correct roles and labels, no colour-only meaning, tested with a screen reader on the primary flows | L |
| UX-03 | Keyboard-first working surfaces | The categorisation and close workspaces are fully operable without a mouse, with discoverable shortcuts | L |
| UX-04 | Responsive | Every surface usable at mobile, tablet, and desktop widths; the queue and close workspaces are explicitly designed for each, not merely reflowed | L |
| UX-05 | Data grid | One table implementation supporting virtualisation, stable row identity, variable density, selection, expansion, keyboard navigation, inline editing with durable drafts, server-side filter, sort, and pagination, and pinned columns | L |
| UX-06 | Loading and error discipline | Skeletons that resolve, errors that explain and offer a next action, retries that do not duplicate commands | L |
| UX-07 | Number and date formatting | Locale and currency correct, never lossy, negative and zero handled explicitly, alignment correct for scanning columns of money | L |
| UX-08 | Motion | Purposeful, interruptible, honouring reduced-motion preferences | L |
| UX-09 | Empty states | Every list and workspace has a real empty state explaining what will appear and how | L |
| UX-10 | Offline and interruption tolerance | Durable drafts survive refresh, navigation, and connection loss; the user is told what is unsaved | L |
| UX-11 | Performance budgets | Meets section 6.2 on a mid-range laptop and a mid-range Android device on a 4G connection | L |

---

## 6. Cross-cutting requirements

### 6.1 Correctness bars

These must hold continuously and be asserted by automated tests.

1. Every posted ledger transaction balances in both native and reporting currency.
2. The sum of ledger entries per account equals the derived current balance, and the period balances tie to the entries within the period.
3. The trial balance foots, and the income statement plus balance sheet reconcile to it for the same period.
4. The balance sheet balances, including the current period result in equity.
5. No posting exists in a closed or locked period without an authorised reopen or an authorised open-date treatment recorded.
6. No bank transaction produces two ledger postings, under any retry, replay, or reconnect path.
7. No work item is open for a condition that no longer exists, and no unmet condition has no work item, after reconciliation converges.
8. A finding resolution never applies to material facts other than the ones it was given for.
9. Every command is convergent under retry with the same `commandId`.
10. No query returns data from a company the actor lacks a capability on.

### 6.2 Performance budgets

Measured on production-representative data: a firm with 200 clients, a client with 100,000 ledger entries and 50,000 bank transactions per year.

| Operation | Budget (p95) |
| --- | --- |
| Queue landing snapshot | 500 ms server, 1.5 s to interactive |
| Categorisation list page (50 rows) | 300 ms server |
| Categorisation command round trip | 400 ms server |
| Trial balance for a month | 1 s server |
| Income statement or balance sheet for a month | 1.5 s server |
| Close workspace load | 1.5 s server |
| Bulk command, 100 targets | 5 s server, streamed or polled result |
| Realtime invalidation delivery | 2 s from commit |
| Full sync of one account, 5,000 new transactions | 5 minutes end to end |

Exceeding a budget is a defect.
Fix the query or the model, and only then consider a cache, with a written justification.

### 6.3 Scale targets

Design so these need no re-architecture: 1,000 firms, 50,000 client companies, 200,000 bank accounts, 500 million ledger entries, 10,000 concurrent users.
Show us the query plans for the queue snapshot, the trial balance, and the categorisation list at that scale.

---

## 7. Definition of done

### 7.1 The vertical slice contract

A feature is complete only when every applicable item is true.
A backend with no usable surface is not a feature.
A screen on synthetic data is not a feature.

1. Contract defined in the shared package and validated in both directions.
2. Domain command or query implemented behind a narrow module interface.
3. Authorisation implemented and adversarially tested.
4. Persistence with the constraints that enforce its invariants in the database.
5. Audit and outbox effects emitted in the same transaction.
6. Work reconciliation performed where the change is work-relevant.
7. Notification intents emitted where the catalogue requires them.
8. UI surface with loading, empty, error, permission-denied, and stale states.
9. Tests: unit, integration against real infrastructure, authorisation, idempotency, concurrency, and at least one adversarial case.
10. Observability: structured logs, and a way to answer "is this working right now".
11. Documentation: the domain language used, and any decision that a future reader would otherwise have to reverse-engineer.
12. No dead code, no superseded path, no unused contract left behind.

### 7.2 Phase gates

No phase is accepted until its gate passes in a real deployed environment, not on a developer machine.

| Gate | Passes when |
| --- | --- |
| G0 Foundations | A clean database migrates from empty, tenancy isolation tests pass, a command writes audit and outbox and converges under retry, CI is green on every branch, staging is deployed |
| G1 Identity | Signup, verification, login, password reset, MFA, session revocation, and capability resolution all work end to end, with the adversarial suite green |
| G2 Accounting core | A company can be provisioned with a chart of accounts, opening balances entered as a balanced conversion journal, journals posted, and the trial balance foots |
| G3 Banking | A real bank in each market connects, syncs, reauthorises, reconnects without duplication, and reconciles to its balance anchor |
| G4 Bookkeeping | Bank transactions categorise through rules, ML, manual, split, and match; autopost is auditable; balances refresh on every path |
| G5 Reporting | All statements reconcile to the trial balance, drill through to entries, export correctly, and meet their budgets |
| G6 Engagement | Every intake path satisfies the one activation contract, forged inputs cannot widen access, transfers and split responsibilities pass scenario tests |
| G7 Work kernel | Reconciliation converges under replay, duplicate delivery, recurrence, reassignment, stale source, and concurrent reconcilers |
| G8 Work slices | Each of the eight work types passes the vertical slice contract |
| G9 Findings | All twelve definitions pass the admission rule with named tables, evaluator tests, evidence, resolutions, and staleness scenarios |
| G10 Close | Every close invariant is executable through public commands, no endpoint can produce a conflicting state, catch-up and reopen scenarios pass |
| G11 Queue and realtime | Snapshot, facets, bulk, deltas, and SSE meet their budgets under the scale fixtures |
| G12 Billing | Test-mode checkout to active subscription, replayed and out-of-order webhooks converge, entitlements resolve |
| G13 Launch readiness | Restore drill timed and documented, alerting proven by a forced failure, pen test findings resolved, legal pages live, deliverability verified, runbooks written |

---

## 8. Build order

Dependency-ordered.
These are not release cuts: nothing external launches until section 7.2 passes in full.

| Phase | Contents |
| --- | --- |
| 1 | PF foundations, IA identity, OP environments and CI |
| 2 | CS company and chart of accounts, JL ledger and journals, BF balances |
| 3 | RP trial balance and statements, on the ledger built in phase 2 |
| 4 | BK banking, provider abstraction first, then both providers |
| 5 | TC categorisation, rules, then ML, then autopost |
| 6 | FE firm, engagement, and every intake path |
| 7 | WK work kernel, then the first complete work type end to end before any other |
| 8 | WK remaining ordinary work types, FC transaction and ledger findings |
| 9 | CL close, FC bank-ingestion and period findings, confirmations, packages, reopen, transfer |
| 10 | QR queue projections, commands, bulk, realtime, and the complete SPA |
| 11 | NT notifications and client requests, CP client portal, AI assistant |
| 12 | BL billing, AS admin, SC compliance, OP launch readiness |

Two things start on day one regardless of phase: the Plaid production application, which takes weeks of calendar time, and the Mono business verification.

---

## 9. Explicitly out of scope

Do not build these, and do not build abstractions in anticipation of them.

- A generic workflow engine, rules DSL, or user-configurable process builder.
- User-created ad hoc tasks.
- Tax computation, filing, or tax-specific work routing.
- Payroll.
- A general messaging or chat product between firm and client. NT-10 is a bounded request object, not a conversation.
- Offline-first operation or client-side command queues.
- Multi-entity consolidation and intercompany elimination.
- A fixed-asset register with automated depreciation schedules. Depreciation is a journal, and FC-17 detects when it is missing.
- Inventory, invoicing, or accounts-payable workflow products.
- Organisational reporting hierarchies beyond firm, engagement, and responsibility.
- Per-tenant feature flags, customer cohorts, or A/B infrastructure.

If you believe one of these is unavoidable to deliver something in section 5, stop and raise it rather than building it quietly.

---

## 10. Additions we consider necessary that a narrower reading would omit

Called out because they are frequently cut, and each one has bitten this product's earlier design.

1. **Password reset and MFA** (IA-05, IA-07). An accounting product holding bank connections without account recovery and second-factor is not shippable.
2. **Opening and conversion balances** (CS-14). Every real client arrives with existing books. Without this the product only serves companies founded yesterday.
3. **Bank reconciliation** (BK-21). Firms will not trust numbers they cannot reconcile to the bank statement.
4. **Notification surface, not just a notification backend** (NT-03, NT-04). Sync failures and connection breaks that notify nobody produce silently wrong books.
5. **Transfer detection** (BK-22). Without it, every internal transfer double-counts, and the client sees inflated revenue and expense.
6. **Report packs and spreadsheet export** (RP-08, RP-09). The deliverable a firm hands a client is a file. A product that cannot produce one is not finished.
7. **Client requests** (NT-10). Bookkeeping is blocked on missing documents more than on anything else. A bounded request object avoids building a messaging product while solving the actual blocker.
8. **Admin back office** (area 18). You cannot operate a multi-tenant financial product through SQL consoles.
9. **Restore drill, not just backups** (OP-06). An untested backup is a rumour.
10. **Scale fixtures and query plans** (section 6.3). The queue snapshot and statement assembly are the two places this design will fail under load. Prove them early, not at launch.

---

## 11. How we will review and accept

- We review against sections 3, 6, and 7, in that order, before we look at the feature behaviour.
- We will run the adversarial tenancy suite (SC-03) ourselves on any build submitted for acceptance.
- We will ask, for any accounting number on any screen, to be shown the path from that number to the ledger entries that produced it. If that path passes through the client, the work is rejected.
- Any deviation from this specification is acceptable if it is raised, argued, and agreed in writing before it is built. None is acceptable if we discover it in the code.
- The final acceptance is a working system in production, one real bank connected in each market, one real charge taken and refunded, one restore drill timed, and one month closed end to end for a real client company.
