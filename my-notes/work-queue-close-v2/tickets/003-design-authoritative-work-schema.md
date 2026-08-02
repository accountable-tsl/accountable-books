# Design the authoritative work database schema

- Status: closed
- Claimed by: Temi with Codex
- Type: research
- Blocked by: `002`
- Blocks: `004`, `005`, `006`, `008`

## Question

Which normalized tables, fields, constraints, indexes, histories, and extension contracts should authoritatively represent atomic work, assignment, responsibility, engagement scope, blockers, dependencies, lifecycle, and audit without duplicating domain truth?

## Working artifact

- [Authoritative schema design](../artifacts/authoritative-schema-design.md)

## Finalized within this ticket

- The launch atomic-work kernel adds only `work_items`; centralized `audit_events`, curated `activity_events`, `outbox`, and notifications retain their distinct existing responsibilities.
- A Work Item is system-managed current state with required engagement and monthly period scope, `work_type_code + target_id`, one assignee, a concrete deadline, and `open/resolved/superseded` lifecycle.
- The deployed work-type registry defines target/root semantics, default assignment basis, surface, close requirement, access policy, presentation functions, shared workspace, bulk commands, and a batch target adapter. It is not a workflow DSL or database catalog.
- Ordinary Work Groups are derived by `engagement_id + work_type_code`; related types may share a workspace without being merged into one group.
- Assignment, authority to act, persistent visibility, and notification are separate concepts.
- One target can have at most one open occurrence per engagement and work type. A bank connection requiring reauthorization produces one client action across all of its feeds and follows the single close frontier rather than creating simultaneous monthly obligations.
- The corrected close domain has eight authoritative identities: client-owned Period Close, Engagement-attributed Period Close Version, Close Package, Period Reopen Request, Accounting Finding, Finding Resolution, Close Confirmation, and Confirmation Response. Close Approval remains a decision on one submitted Period Close Version, not an independent identity.
- A Close Package stores one validated contiguous start/end period range; `close_package_periods` is unnecessary at launch.
- Accounting Findings materialize whenever sufficient facts exist, including before period-end. Findings permit correction or evidenced acknowledgement; Close Confirmations remain separate human-confirmation obligations presented as Final checks.
- Blocker acknowledgements and retroactive closed-period impacts are specialized Finding/resolution flows, not separate generic exception or impact tables. A durable request for another actor to authorize reopening is a distinct `period_reopen_requests` identity.
- The corrected launch design contains twelve new authoritative tables: three engagement/responsibility, one atomic-work, and eight close-domain tables.
- `period_closes` stores client-company/period identity, current lifecycle, persisted due time, transition time, and concurrency version; it continues across firm transfers and reopen cycles. Frontier, overdue, readiness, assignment, and package membership remain derived, approval evidence/decision and firm attribution belong to the Period Close Version, and posting/locking truth remains on the Fiscal Period.
- `period_close_versions` has one indexed current row per close and required immutable Engagement attribution, is mutable only as a draft, freezes a versioned evidence snapshot/content hash on submission or supersession, and may receive at most one immutable approval decision. It is superseded rather than rewritten after rejection, material change, reopening, or transfer.
- `period_reopen_requests` owns one durable client-level pending/reviewed cascade decision with current Engagement, initiating Finding where applicable, requester/reviewer evidence, impact hash/snapshot, and rejection note. The initiating Finding is provenance while the impact covers the complete current registered retroactive-Finding set. It creates one Client Lead Work occurrence but requesting or rejecting never resolves any covered Finding.
- `close_approvals` is omitted. Pending and stale review state are derived from the current submitted Period Close Version; approval or rejection actor, time, decision, and reason are single-assignment fields on that exact frozen version.
- `close_packages` stores one validated catch-up/reclose range, assignee, authoritative operational deadline, and durable `active/completed/superseded` lifecycle. While active, its deadline is persisted transactionally onto every covered open `period_closes` and `work_items` row for indexed ordering/attention; no projection-only override or `deadline_source` column exists. Split and transfer replacements require explicit deadlines, reassignment does not change one, and reasoned deadline changes are version-checked/audited. Working and approval phases remain derived from the authoritative monthly closes and Period Close Versions in that range. Replacement rows link to their immediate superseded predecessor Package.
- Existing-client catch-up eligibility is derived from the Close Frontier and monthly state. A one-time, suppressible attention is directed primarily to the Client Lead; it is not a Work Item, blocker, or persisted package proposal.
- `accounting_findings` materializes one engagement/period/code/target evaluator identity with current `detected/cleared/superseded` condition, definition version, facts hash, and evidence. It stores neither opaque fingerprints nor user attention state.
- `finding_resolutions` is append-only exact-version/exact-facts history with `corrected`, `accepted`, and `not_applicable` outcomes plus a registered strategy. Current attention and close satisfaction are indexed derivations; corrections never suppress later re-detection.
- `close_confirmations` materializes one versioned affirmative confirmation prompt and current context per Period Close/code; it stores only `required/superseded` requirement state, while completion is derived.
- `close_confirmation_responses` is append-only exact-definition/exact-context human history using `confirmed`, `not_confirmed`, or `not_applicable`. Reopening and relevant material changes invalidate prior responses through a changed context hash.
- `firm_client_engagements`, `engagement_team_assignments`, and `firm_engagement_defaults` now have exact fields, composite same-firm keys, effective-range rules, transfer lineage, required responsibility coverage, and portfolio/offboarding indexes.
- Every cross-table invariant has one enforcement owner: database constraint/trigger, transactional command, authorization, or idempotent reconciler. Reconcilers may restore derived materialization but never invent approval decisions or silently mutate Fiscal Period status.
- The command matrix fixes transaction boundaries, advisory-lock namespaces, row-lock order, expected-version/hash checks, audit/outbox effects, independent-unit bulk semantics, and all-or-nothing Package approval.
- Representative authorized queue, one-client close-row, close-readiness, and Package-range queries are covered by the final index plan without a Work Group table, view, materialized view, Redis, or browser cache dependency.
- Routine close, same-person close, rejection/staleness, concurrent later-month work, Catch-up operational deadlines, Package splitting/reassignment/deadline changes, bulk work, responsibility changes, firm transfer, and cascading reopen have been pressure-tested against the model.
- The dedicated follow-up audit originally retained eleven table identities while correcting seven implementation-critical edges. Independent cross-ticket review then corrected Period Close ownership and justified the twelfth `period_reopen_requests` identity; these review amendments are recorded in the audit and canonical schema rather than hidden as implementation detail.

## Resolution

The authoritative launch write model is twelve normalized tables: three Engagement/responsibility tables, one atomic Work table, and eight monthly close-domain tables. Accounting and client-domain records remain the source of underlying facts; the new tables own Engagement responsibility, Work lifecycle, client-owned close lifecycle, Engagement-attributed Version evidence, durable Reopen Requests, bounded Package coordination, Findings/resolutions, and Confirmations/responses. Queue groups, Close Frontier, readiness, overdue state, Package phase, visibility, and copy remain derived.

The complete fields, constraints, indexes, enforcement catalogue, transactional command/lock model, representative queries, Accountable Books integration seams, and scenario proof live in the linked [Authoritative schema design](../artifacts/authoritative-schema-design.md). The independent [schema audit](../artifacts/authoritative-schema-audit.md) records the deletion, authorization, concurrency, migration, and scenario tests plus its corrections. This resolution unblocks producer/reconciliation, projection/API, command-contract, and migration design without authorizing production implementation yet.
