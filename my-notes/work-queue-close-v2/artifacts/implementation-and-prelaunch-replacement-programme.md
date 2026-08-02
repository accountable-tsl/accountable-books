# Work Queue and Close V2 implementation and pre-launch replacement programme

## Decision

Accountable Books has not been launched and has no production tenant data. Work Queue and Close V2 therefore requires a **greenfield implementation and pre-launch replacement programme**, not a live-system migration.

The new system will be built as a separate domain path beside the existing experiments only for the duration of development. The existing work/task models are frozen reference material: they are not adapted, dual-written, backfilled, treated as a correctness oracle, or shipped as a dormant production fallback. After V2 passes the gates in this programme, it becomes the sole queue and close path and the superseded code, schema, routes, contracts, workers, and mocks are removed before first external launch.

The first external launch is the complete agreed product, not a reduced wedge. Engagement authorization, all eight Work Types and twelve admitted Findings, routine monthly Close, Confirmations, split and same-person approval, Catch-up/Reclose Packages, transfers, reopening and Reopen Requests, firm oversight, bulk commands, realtime invalidation, and the complete projection-driven SPA are all blocking launch scope. The stages below manage dependency, implementation size, and proof; they do not move agreed capabilities into later releases.

All developer and CI databases are disposable. The unshipped work-related migration history may be rewritten or removed so a fresh database creates only the authoritative V2 design. This does not authorize squashing unrelated Accountable Books migration history.

## 1. What this programme does and does not do

### It does

- order implementation by architectural dependency rather than frontend screen;
- identify which existing Accountable Books capabilities are retained, adapted, replaced, or deleted;
- preserve a temporary internal V2 route while complete vertical slices are proved;
- define automated and human verification gates;
- make clean-database creation and removal of obsolete systems launch requirements;
- define a cheap pre-launch recovery posture based on code reversion and database recreation;
- hand implementation a sequence in which every increment has one observable accounting-to-UI outcome.
- retain the complete agreed launch scope while using stage gates to prevent a large unverified integration batch.

### It does not

- backfill old Work, Task, Close, Finding, or decision rows;
- dual-write V2 and any legacy work model;
- compare two materializers against live customer traffic;
- create customer cohorts, tenant migration states, or per-firm production feature flags;
- preserve API or DTO compatibility for an interface that was never released;
- convert `workflow_runs`, `engagement_tasks`, `legacy_work_items`, `work_item_subjects`, or the experimental July `work_items` table into the V2 model;
- treat old queue output as expected truth when it conflicts with the settled operating model.

## 2. Existing-system disposition

Implementation begins with a checked-in disposition inventory. The following is the architectural baseline; implementation may add file-level entries but may not change a category without an explicit design correction.

| Existing area                                                                                     | Disposition                                           | Required treatment                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companies, users, roles, permissions, company settings                                            | **Keep and extend**                                   | Retain identity and capability ownership. Add only the relational keys/settings required by the authoritative schema.                                                                        |
| Ledger, bank transactions, categorization candidates, journals, fiscal calendar, bank connections | **Keep as domain truth**                              | V2 producers inspect these facts and domain commands mutate them. Work never becomes their source of truth.                                                                                  |
| Audit events, activity events, outbox, notification infrastructure, advisory locks                | **Keep and adapt**                                    | Reuse their distinct responsibilities. Add V2 entity/event registrations and generic source references; do not create parallel generic event logs.                                           |
| Close-readiness evaluators and facts-hash techniques                                              | **Evaluate and adapt selectively**                    | Reuse useful detection logic as registered Finding evaluators. Replace the old persistence/decision lifecycle where it conflicts with V2 Findings, resolutions, Versions, and Confirmations. |
| `client_firm_assignments`, `firm_user_client_assignments`                                         | **Replace for V2 ownership**                          | Engagements and effective-dated responsibilities become authoritative. Remove old queue/close consumers after all other consumers have an explicit disposition.                              |
| `workflow_runs`, `engagement_tasks`, blockers, events, task registry/evaluation workers           | **Delete**                                            | Do not route V2 producers or commands through the abandoned workflow engine.                                                                                                                 |
| `legacy_work_items`, `work_item_subjects`, legacy work materializer/read service                  | **Delete**                                            | Do not translate group-first state into atomic Work.                                                                                                                                         |
| Experimental July `app.work_items`; empty work-event/group migrations                             | **Replace in migration history**                      | Remove or rewrite the unshipped migration before creating canonical `app.work_items`. No preflight row inspection or data conversion is required.                                            |
| Existing close-review signal/decision tables                                                      | **Replace unless proven independently authoritative** | Preserve reusable evaluator code, not obsolete row identities. There is no production history to migrate.                                                                                    |
| Firm task-queue mocks and both obsolete work/queue contracts                                      | **Delete after V2 SPA integration**                   | V2 projection DTOs become the only browser contract.                                                                                                                                         |
| Existing public close/reopen endpoints for managed monthly periods                                | **Replace**                                           | V2 aggregate commands become the only public route to managed close state; internal fiscal-period primitives remain reusable.                                                                |

Two coupling hazards must be resolved deliberately:

1. Existing `activity_events.work_item_id` and `notifications.work_item_id` relationships point at `legacy_work_items`. V2 should use their generic source identity where sufficient. A canonical Work FK is added only if a proven query requires it; the columns must never be silently repointed.
2. Existing modules outside work/close may consume current assignment or close-readiness APIs. The disposition inventory must find these imports before deletion and either move them to Engagement/registry services or record why the old capability remains independently necessary.

## 3. Migration-history policy

The database target is a clean schema created from an empty database.

1. Keep unrelated Accountable Books migrations in their existing order.
2. Remove or rewrite unshipped migrations that create abandoned work/task/close-review structures when no retained module needs them.
3. Replace the experimental July `app.work_items` definition with the canonical V2 table; do not add a drop-and-recreate migration after it merely to preserve unused history.
4. Add the twelve V2 authoritative tables in dependency order:
   - `firm_client_engagements`;
   - `engagement_team_assignments`;
   - `firm_engagement_defaults`;
   - `work_items`;
   - `period_closes`;
   - `period_close_versions`;
   - `close_packages`;
   - `accounting_findings`;
   - `period_reopen_requests` (created after its optional Finding FK is available);
   - `finding_resolutions`;
   - `close_confirmations`;
   - `close_confirmation_responses`.
5. Add required extensions, composite uniqueness, foreign keys, checks, partial/exclusion indexes, append-only guards, and audit entity registrations in the same implementation tranche as the tables that depend on them.
6. Update or remove legacy foreign-key-bearing activity/notification migrations so the complete history builds cleanly without obsolete Work tables.
7. Make database recreation explicit in developer setup and CI. A stale local database is reset; it is not upgraded through a fabricated customer migration.

The proof is not that the latest migration applies to an old local database. The proof is that `migrate:latest` from empty produces the exact reviewed schema, rollback/reapply works for the new tranche during development, and every application/test process can start against it.

After first external launch this policy ends: all later changes use normal forward-only production migration discipline.

## 4. Target implementation boundaries

V2 should be a deep domain module, not logic scattered through controllers and React components. The exact folder names may follow repository conventions, but these ownership seams are required:

| Boundary                   | Owns                                                                                                | Must not own                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Engagement                 | accepted firm-client-service agreements, responsibilities, defaults, transfers, eligibility queries | accounting permissions globally or queue presentation                                    |
| Work kernel                | Work Type Registry, target adapters, prepared sync contexts, reconciliation, occurrence lifecycle   | accounting mutations, user-created tasks, Work Group rows                                |
| Findings and Confirmations | registered evaluation/policy, materialized concerns/obligations, immutable responses                | generic workflow configuration or approval presentation                                  |
| Close                      | Period Close/Version/Package aggregates, frontier, submission, approval, rejection, reopen          | ledger truth or a separate task lifecycle                                                |
| Queue query                | firm-authorized scopes, Work Groups, close cluster, facets, DTO/copy assembly                       | authoritative state transitions or stored Work Groups                                    |
| Domain commands            | accounting intent, authorization, concurrency, audit/outbox, transactional Work reconciliation      | direct user manipulation of Work lifecycle                                               |
| Realtime invalidation      | firm-scoped projection invalidation after commit                                                    | accounting evidence or authoritative queue state                                         |
| SPA                        | render server projections, hold interaction state, invoke domain commands, target refetch           | access derivation, priority, close readiness, grouping, optimistic accounting completion |

The initial V2 route family remains `/api/v2`. During implementation the SPA may expose a separate internal `/work-queue-v2` route or one repository-level development switch. This is a developer integration seam, not a tenant feature-flag platform. It is removed when V2 replaces the normal queue route.

## 5. Ordered implementation programme

### Stage 0 — Freeze and inventory

Deliverables:

- mark the three old work approaches as frozen in code ownership/documentation;
- list every related migration, table, route mount, worker registration, outbox intent, contract, frontend import, notification/activity reference, and test fixture;
- give every entry a keep/adapt/replace/delete result;
- identify non-work consumers of legacy assignment and close-readiness code.

Exit gate: nothing slated for deletion has an unknown consumer, and no new feature branch is expected to build on an abandoned model.

### Stage 1 — Clean schema and shared primitives

Implement the twelve reviewed tables and all schema invariants. Extend existing membership keys, audit registration, activity/notification source conventions, outbox handlers, and locking primitives as required.

Also provide test builders for firms, client companies, memberships, Engagements, monthly Fiscal Periods, responsibility assignments, and accounting facts. These are infrastructure for every later slice, not a second domain model.

Exit gate: empty-database migration, schema-constraint tests, append-only tests, and tenant-crossing FK tests all pass.

### Stage 2 — Engagement and authorization foundation

Implement:

- one shared Engagement-activation contract consumed by accepted firm invite, branded signup, platform placement, and transfer flows owned elsewhere in Accountable Books;
- required Client Lead and Primary Bookkeeper assignment before activation;
- firm defaults and fallback-to-admin policy;
- contributor assignment and effective-dated responsibility replacement;
- conversion boundary and first managed period validation;
- authorized `my_work`, `portfolio`, and capability-gated `firm_oversight` scope resolution.

The client invite/signup/referral UI and its pending lifecycle are not delivered by this programme. Its Accountable Books owner must supply the complete accepted input to the activation contract; V2 rejects incomplete activation rather than filling accounting boundaries silently.

Exit gate: every external intake source passes the same activation-contract tests; forged firm, client, assignee, scope, and engagement inputs cannot widen access; freelancers, split Lead/Bookkeeper firms, multiple managers, and transfers pass scenario tests.

### Stage 3 — Work kernel

Implement:

- the eight-code launch Work Type Registry, including Client Lead review of durable Period Reopen Requests;
- typed target adapters and registry validation at application boot;
- `DomainRootRef`, prepared `WorkSyncContext`, and fast Engagement/period resolution;
- transactional inline reconciliation for source-changing commands;
- outbox-driven discovery/recovery reconciliation;
- atomic Work occurrence open/resolve/supersede/reroute/re-anchor logic;
- centralized audit, curated activity, notification, and invalidation effects.

Notification production is provider-neutral: domain transactions emit typed notification intents through the outbox, the notification policy/registry selects recipients and delivery channels, and provider adapters perform delivery. Adding email, Slack, Teams, SMS, or another provider must not change Work producers, Close commands, or notification identity/lifecycle.

Exit gate: replay, duplicate outbox delivery, same-target recurrence, assignment change, stale source, and concurrent reconciler tests converge without duplicate open Work.

### Stage 4 — First complete vertical slice

Build `categorize_bank_transaction` end to end first because it proves the ordinary path with minimal close coupling:

1. an uncategorized bank transaction is domain truth;
2. producer materializes one authorized, period-anchored Work occurrence;
3. snapshot derives one client/work-type Work Group;
4. lazy workspace loads domain details through the adapter;
5. categorization command commits ledger state, audit/outbox, and Work reconciliation atomically;
6. server returns the domain result and authorized queue delta/refetch hints;
7. SPA waits for confirmation and advances cleanly;
8. SSE invalidates another authorized session.

Exit gate: this path works in API integration tests and the production Accountable Books shell at desktop/mobile widths. No legacy materializer or mock task data participates.

### Stage 5 — Remaining ordinary producer slices

Add one complete slice at a time:

1. `review_categorization_candidate`, including server-issued bounded bulk manifests and partial results;
2. `review_draft_journal`;
3. `restore_bank_connection`, created only for client-actionable authorization status `requires_action` and resolved by verified reauthorization;
4. `resolve_accounting_finding`, beginning with transaction/ledger findings that may surface before month end.

All eight admitted transaction/ledger Finding definitions must complete this stage. “Beginning with” describes implementation order inside the stage, not a partial launch catalogue.

Deliberate disconnection (`revoked`) remains notification-only. Automatic provider sync retry conditions create neither Work nor user action.

Exit gate for each slice: producer, adapter, domain command, Work lifecycle, authorization, audit/outbox, projection, DTO, workspace, empty/error/stale states, and tests ship together. A backend-only occurrence with no usable surface is not a completed slice.

### Stage 6 — Monthly close and catch-up

Implement in dependency order:

1. make existing direct public `closeFiscalPeriod`/`reopenFiscalPeriod` routes unavailable for managed bookkeeping Engagements and retain their underlying services only as internal primitives called by V2 aggregate commands;
2. one lightweight hourly Close lifecycle/recovery sweep using Monday–Friday business days in the client timezone; it runs set-based eligibility checks and invokes idempotent commands rather than scheduling one job per client;
3. client-owned monthly Period Close materialization five business days before client month end;
4. Preview-to-Preparing transition at period end and overdue derivation at the agreed deadline;
5. the closed-period bank-ingestion Finding and all three admitted period Finding evaluators, evidence contracts, correcting commands, professional-resolution strategies, definition/facts freshness, and Catch-up-aware presentation;
6. applicable Close Confirmation materialization and immutable responses;
7. Close Frontier and one-client-row close projection;
8. guided close workspace: clear open Work, resolve Findings, complete Final Checks, review;
9. same-person submit-and-close;
10. separate Primary Bookkeeper submission and Client Lead approval/rejection;
11. material-change staleness and next-Version creation;
12. Catch-up/Reclose Package creation, splitting, assignment, reasoned deadline changes, submission, and atomic approval; Package acceptance/replacement/deadline commands persist the Package operational deadline onto every covered open Period Close and Work Item, while reassignment leaves it unchanged;
13. late-transaction closed-period treatment through safe match, open `fs_date`, direct reopen, or durable request/rejection;
14. client-scoped cascading reopen across predecessor Version attribution, with reason, current Engagement scope, locked-period rejection, and six-month Package suggestion;
15. accepted firm transfer while preparation or approval is active without replacing the client-owned Period Close.

Exit gate: every close invariant from the authoritative schema is executable through public commands, and no public endpoint can independently produce a conflicting Fiscal Period/Period Close state.

### Stage 7 — Full query, realtime, and SPA integration

Implement the complete ticket-005/006/007 contracts:

- one authorized landing snapshot;
- section pagination, client/assignee facet search, lazy group peek, ordinary workspace, close workspace, and approval review;
- deterministic on-request grouping by Engagement and Work Type with registry enrichment;
- one Close cluster and at most one visible row per client;
- server-confirmed command deltas and stable refetch hints;
- one resumable, firm-scoped SSE connection with targeted invalidation;
- bounded polling only while SSE is unavailable;
- searchable client roster, capability-gated entry/link to Accountable Books' externally owned client-intake flow, scope controls, responsive Queue/Clients surfaces, continuous stream, safety cues, and complete loading/error/handled-elsewhere states.

Exit gate: the Accountable Books SPA no longer imports mock queue data or old queue DTOs on the V2 route, and the prototype is used only as interaction reference.

### Stage 8 — Verification and pre-launch replacement

Run the full gates in section 7. When they pass:

1. point the normal Accountable Books queue navigation at the V2 SPA;
2. make the V2 API family the only work/close API consumed by the browser;
3. delete old route mounts, services, workers, registries, contracts, mocks, tests, and migrations/tables marked replace/delete;
4. remove the internal V2 route/switch and any fallback branch;
5. recreate developer/test databases from the final migration history;
6. rerun the complete test, performance, browser, and dependency-absence suites;
7. launch only from this single-path state.

There is no period in which the first external users are deliberately split between old and new systems.

## 6. Vertical-slice completion contract

A producer or close capability is complete only when all applicable cells are satisfied:

| Layer         | Required proof                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Domain truth  | Authoritative source state and legal mutation command are named.                                                                      |
| Registry      | Stable code, target/root types, adapter, assignment policy, timing semantics, close effect, and presentation contract are registered. |
| Persistence   | Exact Work/Close/Finding rows and constraints are exercised; no UI grouping state is stored.                                          |
| Consistency   | Inline and/or outbox reconciliation follows the decided split and is idempotent.                                                      |
| Authorization | Read and command authorization are independently proven from authenticated firm context and Engagement relationships.                 |
| Command       | Expected state, `commandId` retry correlation, convergent outcome, lock order, audit/outbox, and domain+Work atomicity are tested.    |
| Read model    | Snapshot/group/workspace DTO is generated from authoritative rows and registry/domain adapters.                                       |
| SPA           | Server-confirmed success, stale, failure, waiting, empty, and external-change states are usable.                                      |
| Operations    | Recovery reconciliation and useful structured diagnostics exist.                                                                      |
| Removal       | Any old code made redundant by this slice is identified for Stage 8 deletion.                                                         |

This prevents a horizontal build that creates every table, then every repository, then every screen without proving that the seams deliver the intended experience.

## 7. Verification gates

All gates are blocking; “works on the happy path” is not sufficient.

### Schema and architecture

- empty PostgreSQL database migrates successfully to latest;
- schema matches the corrected twelve-table model and deliberately omitted generic tables do not exist;
- all invariant, composite-tenant, exclusion, partial-unique, append-only, and FK tests pass;
- no production module imports old Work/Task contracts after replacement;
- architecture checks prevent SPA/controller code from reaching Work persistence directly.

### Correctness and recovery

- every producer is idempotent under retry, duplicate outbox delivery, and concurrent delivery;
- source-changing commands reconcile Work in the same transaction where required;
- async discovery can lag and recover without losing user-actionable Work;
- queue projection failure after a committed command cannot cause the accounting command to be replayed;
- same-person close, split approval, rejection, stale approval, catch-up, Package deadline propagation/change, Package split with explicit replacement deadlines, Package reassignment without deadline change, transfer, late closed-period treatment, Reopen Request approval/rejection, bulk partial success, and cross-engagement cascading reopen pass executable scenarios;
- Reopen Request projection tests prove one atomic Work occurrence, no ordinary-group duplication, one Close row per client, exact decision-owner/requester/observer copy, deadline/overdue ordering, stale impact rejection, and return of every covered unresolved Finding after rejection;
- bank `requires_action`, `revoked`, automatic retry, and reauthorization transitions create exactly the agreed Work/notification outcomes.
- every launch notification code has recipient, attention-key, lifecycle, destination, default-delivery, duplicate-outbox, preference, and provider-adapter tests; adding a test provider requires no Work/Close domain change.

### Authorization

- a bookkeeper cannot widen `scope`, change `clientCompanyId`, `assigneeUserId`, Work ID, target ID, Engagement ID, or Period Close ID to access another manager's portfolio;
- assignment never grants otherwise absent client access;
- client users can perform only their bounded client obligations;
- approval, package, transfer, reopen, and oversight capabilities are checked server-side;
- SSE and command deltas reveal only projections the authenticated user may read.

### Performance

Create deterministic synthetic firms at realistic and stress sizes, including caught-up clients and heavy month-end conditions. Capture `EXPLAIN (ANALYZE, BUFFERS)` for:

- the one-request landing snapshot;
- each scoped section page;
- group peek and workspace head queries;
- one-row-per-client Close Frontier projection;
- active-Package operational-deadline propagation and Package-covered queue/Close projections at 12-month range limits;
- a 100-unit independent bulk whose targets all share one Engagement and Fiscal Period, proving expected period-lock serialization, bounded latency, and absence of deadlock/starvation despite per-unit reauthorization;
- close blocker/finding/confirmation checks;
- reconciliation lookup and occurrence upsert;
- authorization scope expansion and client/assignee facets.

Pass/fail budgets must be set in the implementation environment before launch, then recorded with fixture sizes and query plans. A Redis or materialized-view dependency is introduced only if indexed PostgreSQL fails an agreed budget and measurement identifies the exact projection causing it.

### Product and browser behaviour

- desktop and mobile queue, roster, continuous stream, ordinary workspaces, and Close workspace match the settled interaction artifact;
- keyboard, focus, accessible announcements, contrast, reduced motion, and responsive layouts are verified;
- loading, partial, stale, offline/degraded-live, retry, handled-elsewhere, and empty states are tested;
- accounting rows do not disappear before server confirmation;
- live invalidation preserves an actively read row and explains external completion;
- user testing covers at least freelancer, Primary Bookkeeper, Client Lead, separate manager portfolios, client reauthorization, Catch-up within deadline, overdue Catch-up, Package split/reassignment, and reasoned deadline-change scenarios.

### Single-path launch proof

- repository search finds no runtime mount/import/reference to the deleted workflow/task/legacy Work systems;
- fresh database contains no abandoned work tables;
- normal navigation reaches the V2 experience without a flag;
- CI exercises only the authoritative V2 queue/close contracts;
- no fallback can silently start writing an old work model.

## 8. Comparison policy

Old and new queue rows will not be compared for parity. The old systems failed to express the desired operating model and can produce a consistently wrong comparison result.

V2 is validated against named, deterministic scenario fixtures whose expected facts, responsibilities, Work occurrences, groups, Close Frontier, actions, and DTOs come from tickets 001–007 and the schema audit. During development, a diagnostic page or test reporter may display source facts beside the resulting V2 projection, but it must compare V2 to those expectations—not to an old materializer.

## 9. Rollback and recovery posture

Before launch:

- revert the responsible code/migration commits;
- recreate disposable developer/CI databases;
- restore the last passing V2 branch if a tranche destabilizes the integration route;
- never “roll back” by routing new mutations into an abandoned persistence model.

This makes small, reversible implementation tranches important. Schema and code for a tranche should land together or behind the internal V2 route until its exit gate passes.

At the final replacement point, keep a source-control tag or release commit for diagnosis, not a runtime fallback. If the final suite fails, do not launch; fix forward in the pre-launch environment or revert and recreate it.

After first launch, databases are no longer disposable. The team then adopts forward migrations, production-safe command compatibility, backup/restore, operational monitoring, and incident procedures as normal product operations. That future operating discipline must not be confused with a need to fabricate pre-launch backfills today.

## 10. Recommended implementation tranche order

The stages above should be converted into small tracer-bullet tickets with these blocking edges:

```text
freeze + disposition inventory
  -> clean V2 schema + fixtures
  -> Engagement + authorization
  -> Work kernel + registry
  -> uncategorized transaction vertical slice
  -> remaining ordinary producer slices
  -> Findings + Confirmations
  -> routine monthly close
  -> approval/staleness/reopen
  -> Catch-up Packages + transfers
  -> complete queue/SSE/SPA integration
  -> scale/browser/adversarial verification
  -> legacy deletion + clean-database launch proof
```

Some work inside a tranche may proceed in parallel, but the observable exit gate—not file completion—unblocks the next tranche. In particular, frontend shell work may begin early, but it must remain projection-driven and cannot invent contracts while the responsible backend slice is unresolved.

## 11. Launch readiness definition

Work Queue and Close V2 is ready for first external launch only when:

1. the normal application exposes one authoritative work/close path;
2. every launch Work Type and all twelve admitted Finding definitions have a complete vertical slice;
3. routine monthly close, catch-up, approval, transfer, bulk, and reopen scenarios satisfy the settled invariants;
4. the one-request queue and lazy workspaces meet measured query/UI budgets;
5. authorization has been adversarially tested across firm, portfolio, client, and actor boundaries;
6. clean database creation and CI pass without abandoned work structures;
7. the obsolete systems and temporary development switch have been deleted;
8. implementation documentation names each operational producer, command, reconciler, route, registry entry, and recovery mechanism.

That is the cutover. There is no data backfill or customer migration step after it.
