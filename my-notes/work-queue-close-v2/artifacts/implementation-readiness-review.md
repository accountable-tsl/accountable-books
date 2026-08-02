# Work Queue and Close V2 implementation-readiness review

## Verdict

The package tells one coherent product and architecture story. The twelve-table Work/Close model is sound, its authority boundaries are disciplined, and it can deliver the intended calm, safe experience: atomic system-created Work, derived client/type groups, one Close row per client, guided monthly close, Package-level catch-up attention, stable firm context, and server-confirmed accounting commands.

It is ready to hand to the Accountable Books team to begin **Stage 0 — Freeze and inventory**. It is not yet ready to hand over as “all product/interface decisions are closed; start writing migrations and screens.” The remaining gaps are concentrated where settled modules meet: Accountable Books tenancy, authorization, Package coordination, client action, Close readiness, and exact read/command contracts. They do not justify reopening the twelve-table model.

## Review method

The review traced the map, glossary, ten decision tickets, nine artifacts, the throwaway `workqueue-ui` implementation, and the relevant Accountable Books assignment, role/permission, fiscal-calendar, banking, audit, notification, outbox, close-readiness, queue, billing, signup, and provisioning code. Three independent passes covered domain/schema correctness, UX/API contracts, and implementation handoff. Findings below consolidate repeated symptoms into one seam owner.

## What is settled and should not be reopened casually

1. The client owns its Fiscal Periods and Period Closes; immutable Period Close Versions record the responsible Engagement.
2. Work Items and Close Packages are Engagement-owned; Work is system-created and ends only when domain truth changes.
3. Work Groups are derived by Engagement and Work Type. No Work Group table, materialized view, Redis authority, or IndexedDB store is justified at launch.
4. Close is monthly, sequential, and presented as one cluster with at most one row per client.
5. Catch-up/Reclose Packages coordinate at most twelve contiguous ended months while monthly close/evidence remains authoritative.
6. Package `due_at` is the operational deadline for covered open Close and Work rows.
7. Domain commands and affected Work reconcile in one transaction for user-triggered accounting changes; outbox handles discovery, recovery, notification, and invalidation.
8. The firm is the stable cross-client authorization context. Client identifiers narrow an already-authorized scope.
9. Accounting commands are server-confirmed. Independent bulk units may partially succeed; Close/Package aggregate transitions are atomic.
10. SSE transports authorized invalidation only. PostgreSQL projections remain truth and bounded polling is recovery while SSE is unavailable.

## Blocking seams to close before Stage 1

### 1. Accountable Books authority and consumer disposition

`companies.assigned_firm_id`, `client_firm_assignments`, and `firm_user_client_assignments` currently drive more than queue ownership. Their consumers include signup/provisioning, billing/commercial mode, firm-mediated client access, support access, banking notifications, telemetry, company queries, and old close readiness.

Stage 0 must produce a checked-in file/symbol-level graph with current responsibility, keep/adapt/replace/delete result, replacement interface, owner, dependency, and verification evidence. It must explicitly decide whether `assigned_firm_id` retains a narrower commercial/platform meaning or is removed in favour of service-domain Engagement lookup. A global current-firm pointer must never silently remain authorization truth beside effective-dated Engagements.

No V2 schema migration should land until that authority sequence is explicit.

### 2. Canonical authorization contract

The documents use firm oversight, Package management, period reopening, responsibility management, professional Finding decisions, client intake, and frozen historical-Version access without one canonical capability catalogue.

Before Stage 2, specify:

- exact Accountable Books permission keys;
- default role grants;
- authority inherent in Client Lead or Primary Bookkeeper responsibility;
- permitted client/firm scope;
- command/read surfaces controlled by each capability; and
- whether selected-user delegation needs a direct membership-capability grant mechanism beyond the current role-to-permission tables.

Representative queries must consume a server-resolved effective scope, never a role boolean. Managers and Firm Admins may have `firm_oversight` available without silently landing in it.

### 3. Exact Engagement activation contract

Client invitation/signup/referral UI remains outside this programme, but accepted Engagement activation is a V2-owned deep interface. Define its exact request, result, error, retry, and authorization contracts for firm invite, branded signup, platform placement, existing-client activation, and transfer.

The contract must cover accepted-source identity; firm/client/service; conversion-date confirmation; first managed period; effective cutover/predecessor; Lead and Primary Bookkeeper selection/defaults; every accepted Package range, assignee, and deadline; and the atomic outcome. Accountable Books' existing intake TODO remains the owner of gathering and reviewing those inputs.

### 4. One Close-readiness/content interface

Create one internal `CloseReadiness`/`CloseContent` module used by submission, approval, staleness, workspace projection, and recovery. It must own:

- current-period blocking Work, Findings, and Confirmations;
- registered unresolved retroactive Findings from earlier periods that block the current frontier;
- deterministic Version submission snapshot/content hash;
- the exact definition of a material change;
- bank-feed completeness/freshness policy and `waiting_on_system` reasoning; and
- current/prior-period and lock/posting preconditions.

Callers must not special-case `transaction_dated_in_closed_period` or independently decide whether an accounting mutation stales approval.

### 5. Executable Finding catalogue

The twelve admitted Finding concepts have authoritative source evidence, but each still needs an implementation appendix fixing target grain, material hash inputs, detected/clearing predicate, close effect, evidence DTO, strategy codes, correcting commands, decision capability, and tests. Every admitted launch Finding should require correction or an authorized professional decision before close; remove launch `advisory` semantics unless a concrete post-close obligation is approved.

One earlier promise is not represented by the twelve-code catalogue: a newly connected feed/history selection that reaches across already-closed months should produce one coverage/opening-balance/reopen decision rather than a flood of transaction decisions. Accountable Books now has durable `bank_transaction_history_imports` and candidate rows that may support this. The product must either admit and fully define that Finding or explicitly retract the generic `closed_period_impact` promise; it cannot remain unnamed prose.

## Contracts required before their owning stages

### 6. Package coordination and contributor accountability — before Stage 6

Define the Package planning/workspace DTOs and commands for recommendation, `Continue monthly`, proposed segmentation, eligible assignees, explicit deadlines, ordered month progress, grouped Finding families, bulk Confirmations, split/replacement, reassignment, deadline change, submission, and frozen multi-month review.

Also settle one accountability rule: assigning a Package to a Contributor must say whether preparation Work in its range is rerouted to that assignee or merely made visible. The recommended simple rule is a registered `close_package_assignee` assignment basis: Package creation/reassignment routes existing and later Primary-Bookkeeper preparation Work in the range to the Package assignee, while client actions, Lead approvals, and deliberately separate explicit assignments retain their owners.

### 7. Read DTO and command compatibility — before each vertical slice

Every workspace response must contain the exact versions/hashes required by its permitted commands. Current gaps include Finding version, Confirmation version/effective response, transaction/candidate/journal domain versions, draft Period Close Version/prior-close expectation, and an exact frozen `CloseVersionReviewDto`.

Define typed request/expected-state/result/error contracts for every launch command rather than relying on `permittedCommandCodes` plus prose.

### 8. Continuous-stream and projection-race contract — before Stage 7

The queue promises server-authorized cross-client continuation, but no continuation endpoint/token exists. Add an opaque signed continuation contract carrying effective scope/filters and the current ordering position; it must reauthorize and safely reset when the queue has reordered.

Snapshots, command deltas, and invalidations also need one race rule. A simple authority-preserving design is an opaque projection revision on the snapshot plus an expected-base/result revision on a delta. Apply a delta only when its context and expected base match the current cache; otherwise discard it and refetch. SSE remains invalidation, not an accounting patch stream.

### 9. Client bank reauthorization — before Stage 5

Define a client-company-context Action Centre GET endpoint/DTO; the firm queue cannot supply a client user's persistent action surface. Launch resolution is provider reauthorization or deliberate revocation unless a separate admitted Finding explicitly defines another accounting treatment.

Routing should prefer the still-eligible `connected_by_id`, then a deterministic active client owner/admin. Client access/offboarding must preserve at least one eligible recipient or reroute the Work atomically. If no eligible client user exists despite that invariant, do not assign impossible Work to a firm worker; raise an operational reconciliation incident and make client-contact repair explicit.

### 10. Reopen-review deadline and destination — resolved correction

`review_period_reopen_request` uses the current Close Frontier's effective operational deadline; if it has passed, the item is overdue immediately. If no frontier exists, it uses the current in-progress month's routine Close deadline. Widening may move the deadline earlier but never postpone it implicitly.

The one atomic Work occurrence is assigned to the current Client Lead and contributes to counts and the continuous stream. Its sole landing representation is the client's single Close row and dedicated request workspace; it is not duplicated as an ordinary Work Group. Exact read and command DTOs now carry Work/request versions, impact hash, covered Findings, cascade effects, and typed destinations.

### 11. Exact clock semantics — before Stage 6

Run the lightweight lifecycle sweep hourly every calendar day. Monday–Friday affects business-day arithmetic, not whether the scheduler runs. In the client timezone:

- Preview opens at the start of the fifth preceding business date;
- Preparing begins at the start of the calendar date after the inclusive Fiscal Period end date;
- the routine deadline is the end of the fifth following business date; and
- a user-selected Package date becomes the end of that client-local date.

Convert local boundaries to UTC instants with the IANA timezone so DST does not change the chosen local date. The idempotent sweep may observe a transition within one hour of its boundary.

### 12. Realtime operations and measurable performance — before Stage 7/launch

Give SSE a dedicated infrastructure ticket covering Redis Stream topology/retention, multi-instance relay, heartbeat/proxy behavior, auth expiry, permission change, connection/backpressure limits, shutdown, replay gaps, reset, and degraded-polling observability.

Set fixture sizes, payload budgets, and p95 targets before the performance gate. Validate bounded group aggregation without loading every target, Package ranges, Close readiness, facets, and 100-unit same-period bulk serialization. Add pre-launch monitoring for scheduler lag, outbox age/failures, reconciliation drift, Work-sync failures, lock contention, query latency, notification delivery, and SSE health.

## UX assessment

The intended UX follows directly from the architecture and is worth preserving:

- users scan groups and clients instead of hundreds of atomic rows;
- close remains one stable client row even with several unfinished months;
- Catch-up uses one Package deadline and does not manufacture dozens of overdue months;
- categorization and candidate review share a workspace without being conflated;
- the firm remains stable while users work across clients;
- consequential buttons name the client and accounting result;
- rows wait for server confirmation and remain explainable when handled elsewhere; and
- client, bookkeeper, Lead, and oversight surfaces are different projections of the same Work, not duplicate tasks.

The greatest UX risk is currently the gap between Package/client-action prose and their DTOs. If left open, API and frontend implementers will independently invent those flows. The Reopen Request read/command/presentation contract is now exact, but the prototype still needs to exercise it. The prototype proves the core grouped queue and stream, but it does not yet prove Catch-up planning, Package management, late closed-period decisions, Reopen Request review, or the client Action Centre. Those states should be prototyped before production frontend implementation; the prototype's current `Unassigned` and `In progress` oversight concepts are explicitly noncanonical.

## Handoff package and next work

Do not create more architecture tickets for each symptom. Consolidate this review into prerequisite implementation work:

1. Complete Stage 0 and decide Engagement versus legacy/commercial assignment authority.
2. Close the authorization and Engagement-activation contracts.
3. Close the `CloseReadiness`/Finding/freshness contracts.
4. Close Package, client-action, continuation, revision, clock, and exact DTO/command contracts in their owning artifacts.
5. Prototype the high-risk interaction states.
6. Copy the settled package into a versioned Accountable Books location with a `HANDOFF.md` and stable relative links.
7. Convert the programme stages into small tracer-bullet implementation tickets only after Stage 0 identifies real module/file ownership.

The ten existing tickets are decision records, not an engineering backlog. The implementation tickets should each name the vertical outcome, module/interface owner, schema and command work, authorization, transaction/locks, audit/outbox/notification effects, DTO/UI states, tests, performance proof, blocking edges, and deletion impact.

## Readiness status

- **Stage 0:** ready now.
- **Stage 1 schema:** blocked on the Stage 0 authority/disposition result and the remaining schema/readiness corrections.
- **Later vertical slices:** architecture is stable, but their exact seam contracts above must close before their owning stage.
- **Full team handoff with no product invention:** not ready yet.
- **Expected outcome after this correction pass:** a strong, implementable handoff without changing the twelve-table Work/Close model.
