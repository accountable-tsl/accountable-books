# Work Queue and Close V2 Wayfinder Map

## Destination

Produce an implementation-ready, ground-up architecture and pre-launch replacement programme for Accountable Books' work queue and close-management system. The result must specify the authoritative domain model, database tables and fields, backend services and functions, materialization and consistency rules, authorization, queue projections, API/DTO contracts, combined UX, performance strategy, and ordered implementation/deprecation plan so implementation is straightforward.

## Notes

- Planning lives privately in `workqueue-ui`; `/Users/temi/codebase/accountable-books` is the read-only production-code reference.
- **Version terminology:** “Work Queue and Close V2” names the greenfield replacement system and its `/api/v2` API family. “Launch scope” or “initial release” describes the complete agreed feature set required before first external launch. Do not call that feature set “V1”.
- Canonical domain language for this private planning effort lives in [CONTEXT.md](CONTEXT.md); implementation decisions live in ticket artifacts rather than the glossary. Move the settled glossary into Accountable Books when implementation begins.
- Closed tickets record the current decisions, but the architecture is not declared fully implementation-ready until **Not yet specified** is empty or every remaining item is explicitly ruled out of scope.
- `workqueue-ui` expresses the desired queue, stream, close, safety, and oversight experience.
- The design is ground-up. `workflow_runs`, `engagement_tasks`, `legacy_work_items`, and `work_item_subjects` are historical evidence, not migration targets or foundations.
- Accountable Books has not launched and developer/CI databases are disposable. Do not design data backfills, production dual-writing, customer cohorts, or live-system fallback; remove obsolete paths before first external launch.
- Reuse valid Accountable Books domains such as ledger facts, categorization, fiscal periods, access control, audit, outbox, and close-readiness inputs only after evaluating their fit.
- Focus the launch scope on bookkeeping and close while providing clean domain-producer extension points for tax and future services. Do not build a universal workflow DSL.
- Use domain modeling and grilling while resolving tickets. Resolve at most one ticket per working session.

## Decisions so far

- [Establish the launch work and firm operating model](tickets/001-establish-launch-work-and-firm-operating-model.md) — Atomic, system-derived work is grouped only for display; firm/client responsibilities, authorization scope, engagement lifecycle, consistency, bulk behaviour, and launch boundaries are settled.
- [Define the close lifecycle and close-work model](tickets/002-define-close-lifecycle-and-work-model.md) — Monthly sequential close, client-frontier presentation, guided workspace, context-aware findings, bounded Catch-up Packages with one operational deadline, approval, and cascading reopen are settled.
- [Design the authoritative work database schema](tickets/003-design-authoritative-work-schema.md) — The corrected twelve-table model defines client-owned Period Closes, Engagement-attributed Versions, durable Reopen Requests, authoritative Package deadlines with indexed Close/Work copies, and the exact fields/keys/indexes, enforcement owners, commands/locks, queries, and scenario validation.
- [Audit the authoritative work database schema](tickets/009-audit-authoritative-work-schema.md) — The original audit's seven corrections remain valid; independent review later amended Close ownership and justified one bounded twelfth table without disturbing the generic Work/Package/Finding design.
- [Define work producers and reconciliation](tickets/004-define-work-producers-and-reconciliation.md) — Eight registered Work Types use prepared, transactional, idempotent reconciliation against domain truth; active Packages supply persisted operational deadlines, Findings require complete evidence/resolution contracts, and a bounded provider-neutral notification catalogue owns cross-person and deadline attention without coupling providers to Work or Close.
- [Design queue projections, API calls, and DTOs](tickets/005-design-queue-projections-api-and-dtos.md) — One authorized firm-scoped snapshot combines the desired interaction model with Accountable Books roster controls, returns derived Work Groups and one Close row per client, and uses persisted Package-aligned deadlines without another read-model table or cache dependency.
- [Specify command, bulk, concurrency, and realtime contracts](tickets/006-specify-command-bulk-concurrency-and-realtime.md) — Domain-specific commands use one `commandId`, expected domain state, convergent outcomes, transactional Work reconciliation, and server-confirmed queue deltas; independent bulk is bounded and partial, close aggregates remain atomic, and one firm-scoped SSE stream drives targeted refresh for changes committed elsewhere.
- [Merge the two frontend interaction models](tickets/007-merge-frontend-interaction-models.md) — The final projection-driven SPA combines the calm grouped queue/stream/close experience with Accountable Books' roster, filters, capability-gated external-intake link, responsive and failure-state strengths; scopes, workspaces, client safety, server-confirmed commands, and realtime behavior are fixed. The throwaway prototype proves the core composition but not every high-risk launch flow.
- [Plan the greenfield implementation and pre-launch replacement](tickets/008-design-side-by-side-migration.md) — V2 has an ordered vertical-slice programme and hard gates, but stages are not release cuts: the complete agreed Work, Close, Catch-up, transfer, reopening, oversight, realtime, Finding, and frontend system is required before first external launch.
- [Resolve retroactive facts and cross-engagement reopening](tickets/010-resolve-retroactive-facts-and-cross-engagement-reopening.md) — Period Close is client-owned, Versions preserve firm attribution, late closed-period transactions become explicit Findings, and a twelfth table/eighth Work Type now support durable Client Lead reopen decisions and cross-firm cascades without rewriting history.

## Not yet specified

- The consolidated [implementation-readiness review](artifacts/implementation-readiness-review.md) is the open-seam register. Stage 0 may begin now; Stage 1 remains blocked until its authority/disposition prerequisites are closed.
- Accountable Books assignment/tenancy consumer disposition and Engagement-versus-commercial-assignment authority.
- Exact capability catalogue, role/responsibility mapping, delegation mechanism, and Engagement-activation contract.
- Executable Close-readiness/content, Finding, historical bank-coverage, and feed-freshness contracts.
- Exact Package, client Action Centre, continuous-stream, projection-revision, and remaining workspace/command DTO contracts. Reopen Request contracts are closed.
- Exact clock boundaries, SSE operational ownership, numeric performance budgets, and prototype coverage of the highest-risk flows.

## Out of scope

- Converting or incrementally repairing the abandoned workflow/task/work-item models as the basis of Work Queue and Close V2.
- User-created ad hoc tasks at launch.
- Offline-first operation and IndexedDB-backed command queues.
- A generic workflow DSL or organization reporting hierarchy.
- Production implementation while the Wayfinder map is still resolving architecture decisions.
- Production data backfills, dual-writing, tenant migration cohorts, or live fallback for the never-launched abandoned work systems.
- Messaging-to-work escalation rules until a messaging domain exists; launch Work remains system-created bookkeeping/close Work.
- Tax-specific producers, responsibilities, and queue group shapes; the kernel extension contract is settled, while tax product policy belongs to a later map.
- Client invitation/signup/referral UI and its pending-state implementation. Accountable Books owns that flow; this map owns only the accepted Engagement-activation contract it must satisfy and the capability-gated link from the queue.
- Long-lived analytical reporting, retention, and archival policy beyond the operational/audit histories required for launch.
