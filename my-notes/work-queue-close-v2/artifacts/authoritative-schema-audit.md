# Authoritative Work and Close Schema Audit

> Audit date: 2026-07-14
>
> Scope: the resolved schema in `authoritative-schema-design.md`, tested against the locked operating and close models, the prototype interaction model, and the current Accountable Books database/service seams.
>
> Original verdict: **passed after seven bounded corrections.**
>
> Review amendment (2026-07-20): an independent cross-ticket review exposed a predecessor-engagement reopen conflict and an unmodeled durable Reopen Request. The corrected model has twelve tables and the audit is superseded only on those points by [retroactive-facts-and-cross-engagement-reopening.md](retroactive-facts-and-cross-engagement-reopening.md).
>
> Consistency amendment (2026-07-20): active Catch-up/Reclose Package `due_at` is the authoritative operational deadline for its covered open Period Close and Work rows. This resolves historical-overdue amplification without adding another table or projection-owned rule.

## Executive conclusion

The original eleven-table write model had the right generic seams, but the later cross-ticket review corrected Period Close ownership and justified one additional bounded identity. Atomic Work, Engagement responsibility, client-owned monthly Close, Engagement-attributed immutable Versions, bounded Package coordination, Findings, human Confirmations, and durable Period Reopen Requests are genuinely different business identities. Work Groups, generic approval rows, blocker exceptions, Package-period bridges, event tables, and a workflow engine remain unjustified.

The audit found and incorporated seven corrections before producer/reconciliation design proceeds:

1. distinguish the company's existing accounting `conversion_date` from an Engagement's first managed monthly period;
2. permit an audited, monotonic earlier extension of an Engagement's first-managed boundary when additional contracted backlog is discovered;
3. require Catch-up/Reclose Packages to contain only ended months and materialize missing historical closes directly in Preparing, not Preview; and
4. make the migration explicitly retire or rename Accountable Books' unused experimental `app.work_items` table before the canonical table takes that name; and
5. make active Package membership an exclusive submit/approval command boundary so single-month commands cannot bypass all-or-nothing Package review; and
6. represent cancellation of a scheduled responsibility before it starts without deleting history or cancelling the whole Engagement; and
7. make the one-client close-row query select a Contributor's relevant Package/assigned month rather than leaking the client's overall frontier.

It also found several places where wording should be tightened so later tickets do not implement accidental infrastructure: registry `surface` is a primary projection classification rather than exclusive visibility, generic activity/notification source identity should be preferred over automatically adding another Work FK, Package replacement lineage is one-to-many but not many-to-one, and a bank connection requiring reauthorization needs a defined period anchor even before Preview exists.

## Audit method

The design was tested through six lenses:

1. **Decision traceability** — every locked product rule must have a table, derived projection, command, or explicit deferral.
2. **Identity/deletion test** — each table must own a distinct business identity, cardinality, or immutable lifecycle; every field must own data that cannot be safely derived from a stronger source.
3. **Authority test** — no projection, cached count, viewer-specific permission, or accounting fact may become duplicate truth.
4. **Adversarial access/concurrency test** — forged firm/client/view parameters, simultaneous accounting/close commands, transfers, role changes, and retries must not produce unauthorized or contradictory state.
5. **Scenario test** — routine close, same-person close, rejection, staleness, catch-up, bulk work, Package split/transfer, and cascading reopen were walked end-to-end.
6. **Accountable Books fit test** — the design was compared with current migrations and services for companies, conversion/opening balances, fiscal calendar, membership, audit, activity, notifications, outbox, advisory locks, categorization, journals, and legacy Work.

## Traceability summary

| Locked decision family | Authoritative owner | Derived or command-owned result | Audit result |
| --- | --- | --- | --- |
| Firm/client/service responsibility and transfers | `firm_client_engagements` | Effective state, current firm, transfer command | Pass after conversion/boundary correction |
| Client Lead, Primary Bookkeeper, Contributors | `engagement_team_assignments` | Portfolio visibility and routing | Pass |
| Firm intake defaults | `firm_engagement_defaults` plus scalar `company_settings` | Intake selection/fallback | Pass |
| One system-derived finishable action | `work_items` plus deployed registry and target adapter | Groups, copy, actions, close effect | Pass |
| One display group per client and Work Type | No table | Indexed aggregate by Engagement + Work Type | Pass |
| Monthly close lifecycle and frontier | `period_closes` plus `fiscal_calendar` | Frontier, overdue, readiness | Pass |
| Exact submitted evidence, firm attribution, and approval decision | `period_close_versions` | Pending/stale/rejected presentation | Amended: Version owns Engagement; Period Close is client-owned |
| Bounded catch-up/reclose coordination | `close_packages` | Range membership, phase, progress, Package operational deadline | Pass after ended-month/materialization and deadline corrections |
| Durable request to authorize cascading reopen | `period_reopen_requests` | Client Lead review Work and impact presentation | Added after independent cross-ticket review |
| Objective accounting concerns and judgement | `accounting_findings`, `finding_resolutions` | Current attention and close satisfaction | Pass |
| Required human final checks | `close_confirmations`, `close_confirmation_responses` | Completion and readiness | Pass |
| Central audit/activity/delivery | Existing `audit_events`, `activity_events`, `outbox`, notifications | Rebuilt activity/attention projections | Pass with integration simplification |
| One firm-scoped queue request | Authorized set-based query and registry enrichment | Viewer buckets and DTO | Pass; exact DTO remains ticket 005 |
| Server-confirmed accounting commands and partial bulk success | Domain command transaction per independent unit | Group deltas/refetch hints | Pass; exact envelope remains ticket 006 |

## Required corrections

### R1 — Separate Company conversion from Engagement responsibility

**Problem.** Accountable Books already stores `companies.conversion_date`. It is used as the accounting/opening-balance boundary and may fall inside a monthly Fiscal Period. It is also stable across a later firm transfer. The schema's statement that conversion date is always the `start_date` of `first_managed_fiscal_period_id` is therefore false.

**Correction.** Keep both existing and new identities without adding a table or field:

- `companies.conversion_date` remains the client-owned accounting-system/opening-balance boundary;
- `firm_client_engagements.first_managed_fiscal_period_id` remains the firm-specific earliest monthly close responsibility;
- the first managed period may contain or follow the conversion date, but no managed close may precede the company's accounting boundary;
- initial client activation must establish or confirm the company conversion date before bookkeeping close work starts;
- a firm transfer reviews but does not rewrite the existing company conversion date; and
- once managed Work/Close exists, changing conversion date requires a dedicated accounting-boundary migration, not an ordinary company update.

This also fixes partial-month conversion: a 15 June conversion may make June the first managed month without pretending conversion occurred on 1 June.

### R2 — Allow monotonic earlier scope expansion

**Problem.** The schema makes `first_managed_fiscal_period_id` immutable after activation. Real onboarding may discover additional contracted backlog after an Engagement becomes active. Replacing the entire Engagement would unnecessarily supersede valid current Work and Close history, while creating a Package before the current boundary violates the schema.

**Correction.** Add a dedicated, audited `extendEngagementManagedBoundary` command. It may move the boundary only to an earlier monthly period, never later in place. It must validate the Company conversion boundary, current/previous firm ownership, locked/closed periods, Package overlap, and accepted scope; then create the accepted Catch-up Packages and missing monthly Close state atomically. The launch scope rejects later contraction of an activated boundary: that relinquishes responsibility already accepted and needs a future explicit same-firm replacement product rather than an in-place edit. Service end and firm transfer remain supported by their existing Engagement lifecycles.

No new scope-history table is required: the Engagement version and append-only audit event preserve the amendment, and no existing child row changes ownership.

### R3 — Packages are historical ended-month ranges

**Problem.** The schema constrains Package ranges to monthly periods but does not explicitly require those periods to have ended. It also says Package creation materializes missing Period Close rows without stating the correct lifecycle. Inserting historical months as Preview would contradict the locked close lifecycle.

**Correction.** Every Catch-up or Reclose Package month must have ended and its Fiscal Period must be open as of Package acceptance. Current/future routine months remain outside the Package. Every included Period Close must be Preparing after acceptance: missing historical closes are materialized directly in Preparing with their initial current Version, applicable Findings, Confirmations, and Work; an ended Preview advances through the same primitive; Awaiting Approval or Closed closes are rejected rather than silently absorbed. Reclose Packages are created only after the cascading reopen command has returned the ended months to Preparing. The later R8 correction removed Period Close's own superseded state; Version/Package supersession retains history.

### R4 — Resolve the existing `app.work_items` name before canonical creation

**Problem.** Accountable Books migration `20260702112440_work_items.ts` already creates `app.work_items`. It is currently unreferenced by application code, but the canonical schema cannot create a second table with the same name. Calling it merely an "unimplemented experiment" does not remove the physical conflict.

**Correction.** Accountable Books has not launched and developer/CI databases are disposable. The implementation programme must therefore:

1. prove by repository inventory that the experimental definition has no retained consumer or foreign-key dependant;
2. remove or rewrite the unshipped migration rather than fabricate a data migration for disposable rows; and
3. create canonical `app.work_items` directly when a fresh database runs the final migration history.

The `legacy_work_items`/`work_item_subjects` path may remain frozen developer reference while V2 is implemented but must be removed before first external launch. The empty Work Group/Finding migration files create no physical tables and therefore do not conflict.

### R5 — An active Package owns submit and approval commands for its range

**Problem.** The schema says Package approval is all-or-nothing but did not explicitly prevent ordinary single-month submit/approve commands from closing an included month. That would let callers bypass the Package contract and make derived Package phase ambiguous.

**Correction.** While a monthly Period Close is covered by an active Package, it may be prepared normally but may be submitted or approved only through Package commands. A clean prefix must first be split into a replacement Package. This is the bounded exception to single-month frontier submission: the active Package must begin at the Close Frontier, every month before its start must already be closed, all included months must be ready, and approval closes them chronologically inside one transaction. Package assignment still does not grant authority: an assigned Contributor may prepare the range, the current Primary Bookkeeper submits it, and the current Client Lead approves it. When one eligible actor holds both required responsibilities, one explicit Review-and-close-Package command freezes and approves every included month atomically and creates no self-addressed approval Work.

Package creation also requires every included Fiscal Period to be ended and currently open; closed or locked months are invalid. A Reclose Package is created only after the cascading reopen command has returned its months to open/Preparing.

### R6 — Scheduled responsibilities need a cancellation shape

**Problem.** Responsibility intervals allow future scheduling, but the original zero-length rule allowed cancellation only when the entire Engagement was cancelled. A future replacement or Contributor grant may be withdrawn before its own start while the Engagement remains active. Deleting that accepted scheduled row would violate the durable-history rule.

**Correction.** Add `cancelled_before_activation` to assignment end reasons and permit `effective_to = effective_from` only with that reason. The responsibility command cancels the future row and atomically restores/retains the required Lead or Primary Bookkeeper coverage it had been scheduled to replace. Ordinary ended intervals still require `effective_to > effective_from`; current responsibility can never use this cancellation reason.

### R7 — Contributor close selection must be relevance-scoped

**Problem.** The representative close-row query selected the client's overall earliest active close before checking whether a Contributor was relevant through an assigned Package or assigned close Work. A Contributor assigned to a later Package could therefore qualify for the row but receive an earlier frontier they did not own and might not be authorized to inspect.

**Correction.** Apply viewer relevance inside the lateral close selection. Firm Admin, Client Lead, and Primary Bookkeeper continue to select the client's overall frontier/upcoming close. A Contributor selects only the earliest active Period Close contained in their assigned active Package or anchored to their assigned close-surface Work. Optional client filters still apply only after this authorized candidate set.

### R8 — Period Close is client-owned; Version is Engagement-attributed

**Problem.** The original audit tested transfer and reopening independently but missed their combination. An Engagement-owned Period Close left no valid way for a receiving firm to reopen a month closed by its predecessor without either rewriting ownership or reopening the client Fiscal Period while the predecessor Close incorrectly remained Closed.

**Correction.** One `period_closes` row belongs to `client_company_id + fiscal_period_id` across every firm and reopen cycle. Each `period_close_versions` row has immutable `engagement_id` attribution. Transfer supersedes only an unfinished Version and creates the next Version under the receiving Engagement; closed Versions remain unchanged. A later client-scoped cascade supersedes historical approved Versions and creates new drafts under the current Engagement on the same Period Close. Former-firm access is limited to its frozen Version evidence, never current books.

### R9 — A pending reopen decision needs one bounded table

**Problem.** A bookkeeper without reopen authority needs to request a Client Lead decision that survives sessions, can be rejected with a note, protects against a stale cascade preview, and creates reviewer Work without resolving the underlying late-transaction Finding. Work, Finding Resolution, notification, and audit records cannot own that current pending lifecycle cleanly.

**Correction.** Add `period_reopen_requests` with one pending request per client, current Engagement, requested starting period, optional initiating Finding, request/review actors and reasons, recomputable impact hash/snapshot, version, and terminal decision. The initiating Finding is provenance; the snapshot/recomputed hash covers every currently affected registered retroactive Finding. Approval performs the complete cascade atomically; rejection returns every still-unresolved covered Finding to its eligible bookkeeper. One Client Lead Work occurrence owns the deadline and is presented only through the client's Close row/request workspace, avoiding an ordinary-group duplicate. This is a specialized accounting decision, not a generic approval/workflow facility.

### R10 — Active Packages must replace historical operational deadlines

**Problem.** Applying each historical month's routine close deadline inside an accepted Catch-up Package would make a 36–60 month backlog create dozens of immediately overdue Close rows and potentially thousands of overdue Work Items. That contradicts the one-client-row calm queue and makes the agreed Package deadline operationally meaningless.

**Correction.** `close_packages.due_at` is authoritative while a Package is active. Package acceptance, split/replacement, and reasoned deadline-change commands atomically persist it onto every covered open `period_closes.due_at` and `work_items.due_at`; later Work in the range inherits it and recovery repairs drift. Queue queries use those indexed values and join Package only to annotate context. Package replacement requires an explicit deadline per replacement, reassignment never changes one implicitly, and an accepted deadline change requires current authority/version plus a nonblank audited reason. Fiscal Period dates preserve historical accounting context. No deadline-source column, override table, view, materialized view, Redis rule, or frontend calculation is introduced.

## Worth simplifying or clarifying

### C1 — Registry surface is not exclusive visibility

The registry's `surface` field should be named/documented as a primary projection policy, not as the only place a Work Item may appear. A client-action Work Item can be an ordinary firm queue group, a client banner/action, a waiting signal for the delivery team, and a close prerequisite. Those appearances derive independently from primary surface, `closeRequirement`, access policy, assignment, and viewer responsibility. No actor/observer/notified arrays belong on Work Items or in the registry.

### C2 — Prefer generic activity/notification source identity

Existing `activity_events` and notifications already support `source_entity_type + source_entity_id/key`. Their current `work_item_id` columns point to `legacy_work_items`. Those columns must never be repointed to canonical Work while legacy history exists, but the migration should not automatically add another Work FK either. Use generic source identity when canonical Work is genuinely the source; add a separate typed FK only if ticket 005/006 demonstrates a query needing simultaneous source and Work linkage.

### C3 — Package lineage cannot merge predecessors

One `predecessor_package_id` correctly supports one predecessor producing several split/transfer replacements. It cannot represent one replacement merging several predecessor Packages. The launch scope explicitly prohibits many-to-one lineage: a transfer or scope replacement may retain or split each predecessor's range, but may not merge multiple predecessor Packages into one replacement. This preserves the locked one-table/no-bridge decision.

### C4 — Bank-connection period anchoring before Preview

A persistent bank-reauthorization occurrence anchors to the earliest open managed month any active feed on that connection can affect: the current Close Frontier when one exists, otherwise the current in-progress monthly Fiscal Period. One connection produces one client action even when it supplies several bank accounts. It does not wait for a Preview row to exist. As the frontier advances, the producer re-evaluates whether the same occurrence should reanchor or whether reauthorization, revocation, feed retirement, or a period-specific evidenced resolution ended it.

### C5 — Be honest about extension boundaries

The Engagement and atomic Work kernel can support later tax obligations when each obligation has a meaningful monthly anchor, often the month containing a return period's end. Bookkeeping Close tables, bookkeeping responsibility codes, and Catch-up Packages are intentionally not a universal tax workflow. A tax domain may add responsibility codes, producers, and target tables, and should evolve the period anchor rather than abusing it if a tax obligation has no meaningful monthly anchor.

### C6 — Add a current-portfolio index only if the measured plan needs it

The proposed firm/effective Engagement index is sufficient for correctness. Since the landing query is critical and history will grow, production plan tests should compare a partial open-ended Engagement index such as `(firm_company_id, service_domain_code, client_company_id) WHERE effective_to IS NULL`. Add it only if representative `EXPLAIN (ANALYZE, BUFFERS)` shows a benefit, because scheduled-to-end current Engagements still require the effective-range path.

### C7 — The prototype's lock copy is not canonical

The current `workqueue-ui` prototype repeatedly uses copy such as “Approve & lock” and “Locked” for routine monthly close. The locked operating model deliberately separates Close from exceptional Lock. Ticket 007 must replace that copy and any lock-shaped interaction semantics: normal Client Lead approval closes the Fiscal Period; a locked period is a future exceptional, non-reopenable state and has no ordinary launch CTA.

## Confirmed design choices

### The corrected twelve tables are not overengineering

| Identity | Why it cannot safely be merged or derived |
| --- | --- |
| Engagement | Owns effective firm/client/service responsibility and transfer history independent of assignments. |
| Team Assignment | Has many effective-dated responsibility intervals per Engagement and must preserve handover history. |
| Firm Engagement Defaults | Owns two same-firm relational defaults that generic scalar settings cannot foreign-key safely. |
| Work Item | Owns system-managed occurrence, assignment, deadline, period anchor, and open/ended lifecycle; the domain target owns the accounting fact. |
| Period Close | Owns one client/month close lifecycle across firms and reopen cycles; Fiscal Period owns posting status and lock. |
| Period Close Version | Owns one Engagement-attributed exact preparation/submission and its one approval decision. |
| Close Package | Owns accepted multi-month coordination, assignee, deadline, state, and replacement lineage. |
| Period Reopen Request | Owns one durable pending/reviewed decision, impact hash, requester, reviewer, and rejection explanation. |
| Accounting Finding | Owns current evaluator identity/facts/evidence. |
| Finding Resolution | Owns immutable human/correction decision against exact facts. |
| Close Confirmation | Owns a required monthly human statement and exact current context. |
| Confirmation Response | Owns immutable human response against exact wording/context. |

### The intentionally omitted structures remain omitted

- Work Groups remain indexed request-time projections by Engagement and Work Type.
- Work target/period bridge tables are unnecessary because target and one required monthly anchor live on Work.
- Approval remains a decision on Period Close Version.
- Blocker exceptions and closed-period impacts remain Finding/Resolution strategies.
- Package membership remains an inclusive contiguous start/end range.
- Event/history tables remain centralized in audit/activity/outbox.
- Redis read projections, materialized views, and IndexedDB are not launch dependencies. The existing Redis infrastructure is used only to transport authorized SSE invalidations; it never owns queue or accounting truth.

### Authorization model passes

The firm comes from authenticated context, Engagement determines client/service ownership, membership capability determines what the actor may do, responsibility determines portfolio visibility, and assignment determines personal accountability. Client IDs and requested view modes never grant access. The representative query grants whole-firm Work only when the resolved effective scope is authorized `firm_oversight`; in portfolio scope it gives Lead/Primary their relevant client Work and Contributors only directly assigned Work. Every mutation still reauthorizes the firm, Engagement, target, capability, responsibility, and current state.

No PostgreSQL RLS layer is required to make the launch design correct, provided repository entry points cannot bypass these scoped queries/commands and adversarial authorization tests cover forged firm/client/filter/view inputs.

### Transaction and concurrency model passes with an integration warning

The advisory-lock namespaces, chronological close-sequence locking, expected versions/hashes, append-only decisions, and partial unique/exclusion constraints are sufficient under `READ COMMITTED`. Accountable Books already provides deterministic advisory-lock helpers and `btree_gist` in its PostgreSQL image.

This is not a drop-in addition to current accounting commands. Categorization and Journal services currently take domain-specific locks before Work Queue and Close V2 locks exist. Implementation must refactor each integrated command to discover affected periods, take the V2 period lock first, then lock/revalidate domain targets before mutation. Inline Work/Close reconciliation is mandatory for successful user accounting commands; the current outbox/materializer defer path is recovery for external/system facts, not permission to return stale Work after a user command.

### Query/performance model passes

One queue snapshot HTTP call backed by three bounded base reads remains credible:

1. authorized portfolio and initial client/assignee facets;
2. authorized ordinary Work grouped by Engagement + Work Type; and
3. one selected close row per authorized client.

Heavy target evidence remains paginated and adapter-batched when a workspace opens. The proposed partial indexes match the equality prefixes used by active queue, assignment, readiness, and history queries. A short read-only `REPEATABLE READ` transaction is the correct optional coherence boundary; separate pooled connections do not share a snapshot.

No stored Work Group or cache is justified before representative production-scale plan tests fail.

## Scenario pressure-test result

| Scenario | Result |
| --- | --- |
| Firm invite, branded signup, direct placement | Pass after requiring/confirming Company conversion boundary before activation. |
| Routine monthly close, separate preparer/approver | Pass. |
| Same person prepares and approves | Pass through one atomic Review-and-close command with two audit actions. |
| Rejection and material staleness | Pass through superseded immutable Versions and a new draft. |
| Several overdue months while current work continues | Pass through one derived Close Frontier and later preparation. |
| 36–60 month new-client backlog | Pass after R3; use bounded sequential Packages while monthly truth remains authoritative. |
| Additional backlog discovered after activation | Failed before R2; passes with monotonic earlier scope extension. |
| Several Packages assigned to different Contributors | Pass after R5; assignees may prepare, while current Primary Bookkeeper submission and Client Lead approval remain the control boundary. |
| Package split/transfer | Pass after explicitly prohibiting many-to-one lineage. |
| Single-month command targets a month in an active Package | Failed before R5; now rejected until the caller uses the all-or-nothing Package command or explicitly splits the range. |
| Bulk categorization with partial failures | Pass with one transaction per independent target and committed deltas only. |
| Contributor/Lead offboarding | Pass only with same-transaction rerouting/replacement. |
| Future-dated responsibility replacement is cancelled before it starts | Failed before R6; now preserved as a zero-length cancelled interval while required active coverage is restored atomically. |
| Contributor owns a later Package while an earlier Package is active | Failed before R7; now returns that Contributor's earliest in-Package close without exposing the overall client frontier. |
| Firm transfer during pending approval | Amended by R8: same client-owned Close remains; old Version/Work is superseded and the receiving Engagement creates the next Version. |
| New firm reopens predecessor-closed month | Failed in the original audit; passes after R8 through client-scoped cascade and new current-Engagement Versions without rewriting old evidence. |
| New retroactive bank data | Amended by R9: late-impact Finding suppresses impossible categorization Work; safe match/open-`fs_date` treatment or durable Reopen Request/direct cascade resolves the decision. |
| Tax extension | Kernel can extend for monthly-anchorable obligations; bookkeeping Close is intentionally not universal. |

## Accountable Books evidence checked

- `app.companies.conversion_date` exists and is used by opening-balance guards and close-readiness managed-period logic.
- `app.fiscal_calendar` already owns monthly/open/closed/locked posting truth, `(id, company_id)` uniqueness, date spans, and non-overlap constraints.
- `btree_gist` is provisioned in `infra/postgres/image/00-extensions.sql` and the database setup script.
- `app.audit_events` is append-only/correlation-aware; `activity_events` is a distinct curated stream.
- `app.outbox` and advisory-lock helpers already provide the right delivery/concurrency primitives.
- Notifications already own source identity, attention keys, idempotency, resolve/archive timestamps, and active-attention uniqueness.
- `app.work_items` exists as an unreferenced July experiment; `legacy_work_items` and `work_item_subjects` are the current live queue path.
- Current direct Fiscal Period close/reopen and accounting command seams will need internalization/refactoring before managed V2 Close can be authoritative.

## Audit disposition

- **Fixed before releasing ticket 004:** R1–R7.
- **Added after independent review:** R8–R9 and the twelfth authoritative table.
- **Clarify in the canonical schema now:** C1–C5.
- **Measure during implementation planning:** C6 and representative query plans.
- **Correct during frontend merge:** C7 routine-close versus exceptional-lock language.
- **Resolved by later tickets:** exact producer catalogue, DTOs/copy, command/retry envelope, and frontend interaction model.
- **Deliberately deferred:** lock product UI, tax-specific workflows, messaging escalation, and long-term archival.

With R8–R9 incorporated into the canonical design, the corrected twelve-table schema remains authoritative. The generic Work, grouping, Finding, Confirmation, Package, audit, and projection decisions remain intact; only Close ownership and the specialized reopen-request lifecycle changed.
