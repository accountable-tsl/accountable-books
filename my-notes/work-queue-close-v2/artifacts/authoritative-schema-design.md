# Authoritative Work and Close Schema Design

> Status: resolved architecture for the closed Wayfinder ticket **Design the authoritative work database schema**, amended and revalidated by the dedicated schema-audit checkpoint. Later tickets may add implementation references, but changing a table identity or invariant requires another explicit architecture checkpoint.

## Objective

Define the normalized PostgreSQL write model for Work Queue and Close V2. The schema must preserve accounting-domain truth, make atomic work and monthly close history explicit, support firm-scoped authorization and client transfers, and allow queue/read projections to be rebuilt.

## Existing authoritative dependencies to retain

| Existing table/domain                                                                                 | Role in the new model                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.companies`                                                                                       | Global identity for firm and client workspaces; client accounting configuration, timezone, and the existing client-owned accounting `conversion_date` remain here.                                    |
| `app.users`                                                                                           | Global human identity. A Work Item or Close Package names one assignee; engagement responsibility, client access, and capability checks determine whether that user is eligible and what they may do. |
| `app.user_company_roles`                                                                              | Existing firm-membership and role assignment; extend its key constraints if needed so new tables can enforce same-firm composite foreign keys.                                                        |
| `app.roles`, permissions                                                                              | Capability source for firm admin, manager, and bookkeeper eligibility.                                                                                                                                |
| `app.fiscal_calendar`                                                                                 | Authoritative monthly accounting periods and `open/closed/locked` posting state. Launch-scope close references only monthly rows.                                                                     |
| Bank transactions, categorization candidates, journals, ledger transactions/entries, bank connections | Domain truth that work producers inspect and commands mutate. Work tables never replace these records.                                                                                                |
| `app.audit_events`                                                                                    | Append-only authoritative history for consequential work-item and close transitions, written in the same transaction as the state change.                                                             |
| `app.activity_events`                                                                                 | Curated user-meaningful history and notification input. It is not authoritative work history and may aggregate many atomic changes into one activity.                                                 |
| `app.outbox`                                                                                          | Transactional delivery backbone for asynchronous work reconciliation, notifications, projection updates, and recovery.                                                                                |

## Existing structures to supersede for Work Queue and Close V2

| Existing structure                                            | Reason                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client_firm_assignments`                                     | Models only one current pointer; cannot express proposals, effective dates, transfer history, service domain, or receiving-firm acceptance.                                                                                                                                                                                                |
| `firm_user_client_assignments`                                | Does not distinguish Client Lead, Primary Bookkeeper, Contributor, effective dates, or engagement ownership.                                                                                                                                                                                                                               |
| `workflow_runs`, `engagement_tasks`, blockers/events          | Abandoned workflow model; not the basis of Work Queue and Close V2.                                                                                                                                                                                                                                                                        |
| `legacy_work_items`, `work_item_subjects`                     | Group-first queue model; Work Queue and Close V2 requires atomic work as the authoritative grain.                                                                                                                                                                                                                                          |
| July scaffold `work_items` and empty group/finding migrations | The scaffold is unreferenced experiment code, but `app.work_items` is a real physical name collision. Because Accountable Books has not launched and developer/CI databases are disposable, rewrite or remove the unshipped scaffold migration before the canonical table is created; the empty group/finding migrations create no tables. |
| Existing close-review signals/decisions                       | Evaluator logic and facts-hash ideas may be reused, but V2 Findings, Period Close Versions, decisions, and evidence require an explicit monthly close model.                                                                                                                                                                               |

## Schema principles

1. **Global user is identity; scoped relationships grant authority.** A Work Item may be assigned to a firm worker or a client user, so it references `users.id`. Firm membership, engagement responsibility, client access, and capabilities determine eligibility, visibility, and authority; assignment alone never grants permission.
2. **Firm–Client Engagement is the operational tenancy seam.** Every V2 Work Item belongs to one effective-dated Engagement and therefore one firm, client, and service domain. A Period Close belongs to the client company and monthly Fiscal Period; each Period Close Version records the Engagement responsible for that preparation/review cycle.
3. **Atomic work is authoritative; grouping is derived.** A work item is one action intent against one strongly linked domain target. No authoritative work-group table belongs in the write model.
4. **Work type gives a generic target strict meaning.** `work_items` stores `work_type_code + target_id`; the registered work type fixes the target type, loads it through a target adapter, and verifies its company and outstanding condition. Users cannot create arbitrary work types or targets at launch.
5. **The system owns work lifecycle.** Work is `open`, `resolved`, or `superseded`. Users fix or decide the underlying domain condition; they never complete, cancel, reopen, or otherwise manage work-item state directly. Actionability, waiting state, and overdue presentation are derived.
6. **Monthly close truth remains monthly.** Packages accelerate preparation and approval but never replace monthly close records, Findings, Confirmation responses, Period Close Versions, or fiscal-period transitions.
7. **Current state plus centralized immutable history.** Operational tables keep queryable current state and version. `audit_events` records complete consequential transition history; `activity_events` selectively records user-meaningful history; `outbox` delivers downstream effects. No parallel work-event table is needed.
8. **No core-state JSON blobs.** JSONB is limited to versioned evidence/presentation inputs and event payloads where fields are producer-specific; identities, states, relationships, dates, actors, and monetary/accounting references remain relational.
9. **Derived surfaces are rebuildable.** Queue groups, client close rows, counts, copy, and viewer-specific actions are projections produced from authoritative records.
10. **Tenant isolation is enforced structurally.** Composite unique keys and foreign keys include firm/client scope where they prevent cross-tenant relationships; API authorization remains mandatory.

The Engagement and atomic Work kernel are extensible to later accounting service domains when an obligation has a meaningful monthly anchor, often the month containing a return period's end. Bookkeeping responsibilities, Period Close, Confirmations, and Catch-up Packages remain intentionally bookkeeping-specific at launch. A future tax domain may add responsibility codes, producers, and target tables; if an obligation has no honest monthly anchor, evolve the period contract rather than abusing `fiscal_period_id` or turning the registry into a workflow DSL.

## Launch table-count decision

The initial family list deliberately exposed every possible responsibility, but it over-normalized the launch design. Work Queue and Close V2 should launch with **12 new authoritative tables**, not 22–25. Eleven came from the original audit; the review-driven retroactive-facts correction added one justified identity, `period_reopen_requests`, because a pending reopen decision survives sessions and is neither Work, a Finding Resolution, nor an audit event. Each retained table represents a distinct business identity, cardinality, or immutable lifecycle that would become ambiguous if embedded elsewhere.

### A. Engagement and responsibility (3)

| Table                         | Sole responsibility                                                                                                                      | Why separate                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firm_client_engagements`     | Effective-dated agreement that firm F serves client C for service domain D, including intake/transfer source and managed-books boundary. | This is the tenancy and transfer-history seam; it must outlive current assignments.                                                                                                |
| `engagement_team_assignments` | Effective-dated Client Lead, Primary Bookkeeper, and Contributor responsibilities held by firm memberships for one engagement.           | One engagement has multiple people and responsibilities over time. Embedding current user ids would lose history and make handover unsafe.                                         |
| `firm_engagement_defaults`    | The firm's fixed default Client Lead membership and Primary Bookkeeper membership for intake paths where nobody selects them explicitly. | These are relational references and must be protected by same-firm membership foreign keys. Scalar intake and close policies use the existing `company_settings` facility instead. |

#### Exact `firm_client_engagements` fields

| Column                           | PostgreSQL shape                               | Null | Meaning                                                                                                                          |
| -------------------------------- | ---------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | `uuid` PK, UUIDv7                              | No   | Stable ownership identity for one accepted firm-client-service agreement.                                                        |
| `firm_company_id`                | `uuid` FK → `accounting_firms_meta.company_id` | No   | Firm responsible under the agreement.                                                                                            |
| `client_company_id`              | `uuid` FK → `companies.id`                     | No   | Independent client workspace whose accounting records are served.                                                                |
| `service_domain_code`            | `text`                                         | No   | Registered service boundary; launch persists `bookkeeping` while allowing later domains such as tax to use separate engagements. |
| `source_code`                    | constrained `text`                             | No   | `firm_invite`, `branded_signup`, `platform_placement`, `firm_transfer`, or `existing_client_activation`.                         |
| `predecessor_engagement_id`      | `uuid` self-FK                                 | Yes  | Immediate prior engagement when this accepted agreement results from a firm transfer.                                            |
| `effective_from`                 | `timestamptz`                                  | No   | Inclusive operational cutover instant from which this firm has authority and responsibility.                                     |
| `effective_to`                   | `timestamptz`                                  | Yes  | Exclusive end instant; null while the agreement has no scheduled end.                                                            |
| `end_reason_code`                | constrained `text`                             | Yes  | Required with `effective_to`: `firm_transfer`, `service_ended`, or `cancelled_before_activation`.                                |
| `first_managed_fiscal_period_id` | `uuid` FK → `fiscal_calendar.id`               | No   | Earliest monthly period whose bookkeeping close this engagement accepts, including contracted catch-up.                          |
| `version`                        | positive `integer`                             | No   | Starts at 1 and increments on every lifecycle or cutover change.                                                                 |
| `created_at`                     | `timestamptz`                                  | No   | When the accepted agreement was recorded.                                                                                        |
| `updated_at`                     | `timestamptz`                                  | No   | Last authoritative row change.                                                                                                   |

An Engagement row represents an accepted agreement, not a referral, invitation, or transfer proposal. Those intake objects retain their own pending/rejected lifecycle; acceptance creates the Engagement. `scheduled`, `active`, and `ended` are derived from `effective_from/effective_to` relative to the request time and are not stored states.

Do not conflate the Engagement boundary with the existing client-owned `companies.conversion_date`. The Company conversion date is the accounting-system/opening-balance boundary, may fall inside a monthly period, and remains stable across a later firm transfer. `first_managed_fiscal_period_id` is the firm-specific earliest monthly close responsibility. The first managed period may contain or follow the conversion date; the monthly period immediately before it is books-complete-through for this Engagement when that statement is applicable. Initial bookkeeping activation must establish or confirm the Company's conversion date. A transfer reviews but does not rewrite it, and once managed Work or Close exists it changes only through a dedicated accounting-boundary migration.

Required constraints:

- firm and client must be distinct workspaces of the correct classes;
- `service_domain_code` is nonblank and registered; only `bookkeeping` is enabled at launch;
- `effective_to >= effective_from` when present, and `end_reason_code` is present exactly when `effective_to` is present. Equality is permitted only for `cancelled_before_activation`, preserving an accepted future agreement that never became effective;
- no effective ranges for the same client and service domain overlap, regardless of firm; adjacent `[from,to)` ranges are valid;
- the first managed Fiscal Period is monthly, belongs to `client_company_id`, contains or follows the Company's conversion date, and may predate `effective_from` for catch-up;
- `predecessor_engagement_id` is required exactly for `source_code = 'firm_transfer'`, points to the same client and service domain under a different firm, and cannot form a cycle;
- an accepted transfer sets the predecessor's `effective_to` equal to the receiving Engagement's `effective_from` in the same transaction;
- firm/client/service/source/predecessor are immutable after activation. A dedicated, audited scope-expansion command may move the first managed period only earlier, never later in place, after validating conversion, prior ownership, locked/closed months, Package overlap, and accepted catch-up scope. The launch scope rejects later contraction of an activated boundary; ending service or transferring firms uses the explicit Engagement lifecycles, while a future same-firm responsibility-contraction product would require its own accepted replacement design. A not-yet-effective cutover may be rescheduled only by the dedicated transfer command, which adjusts both sides and audits the change.

```sql
ALTER TABLE firm_client_engagements
  ADD CONSTRAINT firm_client_engagements_id_firm_uidx
    UNIQUE (id, firm_company_id),
  ADD CONSTRAINT firm_client_engagements_id_client_uidx
    UNIQUE (id, client_company_id),
  ADD CONSTRAINT firm_client_engagements_no_overlap
    EXCLUDE USING gist (
      client_company_id WITH =,
      service_domain_code WITH =,
      tstzrange(effective_from, effective_to, '[)') WITH &&
    ) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX firm_client_engagements_firm_effective_idx
  ON firm_client_engagements
    (firm_company_id, service_domain_code, effective_from, client_company_id);

CREATE INDEX firm_client_engagements_client_history_idx
  ON firm_client_engagements
    (client_company_id, service_domain_code, effective_from DESC);

CREATE INDEX firm_client_engagements_predecessor_idx
  ON firm_client_engagements (predecessor_engagement_id)
  WHERE predecessor_engagement_id IS NOT NULL;
```

The migration must add `UNIQUE (id, company_id)` to existing `user_company_roles`; the primary key does not by itself provide the composite key needed by the same-firm foreign keys below. Existing soft deletion remains, but membership offboarding becomes a guarded command rather than a cascading delete.

#### Exact `engagement_team_assignments` fields

| Column                | PostgreSQL shape   | Null | Meaning                                                                                                                        |
| --------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                  | `uuid` PK, UUIDv7  | No   | Stable identity for one effective responsibility interval.                                                                     |
| `engagement_id`       | `uuid`             | No   | Engagement receiving the responsibility.                                                                                       |
| `firm_company_id`     | `uuid`             | No   | Deliberate scope copy used only to enforce both composite same-firm foreign keys.                                              |
| `firm_membership_id`  | `uuid`             | No   | Existing `user_company_roles` membership carrying the responsibility; the user derives through it.                             |
| `responsibility_code` | constrained `text` | No   | `client_lead`, `primary_bookkeeper`, or `contributor`.                                                                         |
| `effective_from`      | `timestamptz`      | No   | Inclusive instant at which the responsibility begins.                                                                          |
| `effective_to`        | `timestamptz`      | Yes  | Exclusive instant at which it ends; null for an open-ended interval.                                                           |
| `end_reason_code`     | constrained `text` | Yes  | Required with `effective_to`: `replaced`, `removed`, `membership_ended`, `engagement_ended`, or `cancelled_before_activation`. |
| `version`             | positive `integer` | No   | Starts at 1 and increments when an open-ended interval is scheduled to end.                                                    |
| `created_at`          | `timestamptz`      | No   | When the responsibility interval was recorded.                                                                                 |
| `updated_at`          | `timestamptz`      | No   | Last authoritative row change.                                                                                                 |

Use composite foreign keys `(engagement_id, firm_company_id) -> firm_client_engagements(id, firm_company_id)` and `(firm_membership_id, firm_company_id) -> user_company_roles(id, company_id)`. The scope copy is justified by structural tenant isolation and must never be supplied from an untrusted request; the command obtains it from the locked Engagement.

Required constraints:

- `effective_to >= effective_from` when present, and `end_reason_code` is present exactly when `effective_to` is present. A zero-length interval is permitted only with `end_reason_code = 'cancelled_before_activation'`, preserving a future scheduled responsibility that was withdrawn before it began even when the Engagement remains active;
- every assignment interval lies within the Engagement interval and its membership is active and role-eligible at the interval start;
- Client Lead and Primary Bookkeeper intervals may not overlap another interval of the same responsibility for the Engagement; the same eligible membership may hold both responsibilities;
- Contributor intervals may not overlap for the same Engagement and membership;
- an active Engagement has complete, gap-free Client Lead and Primary Bookkeeper coverage from activation until end. This is enforced by engagement/responsibility commands under one Engagement lock, not by a row check;
- ending a Contributor or changing/removing a membership is rejected while that user retains open assigned Work unless the same transaction reroutes it;
- role/capability changes that make a required assignment ineligible must include a replacement; they never leave null responsibility.

```sql
ALTER TABLE engagement_team_assignments
  ADD CONSTRAINT engagement_team_assignments_singletons_no_overlap
    EXCLUDE USING gist (
      engagement_id WITH =,
      responsibility_code WITH =,
      tstzrange(effective_from, effective_to, '[)') WITH &&
    ) WHERE (responsibility_code IN ('client_lead', 'primary_bookkeeper'))
      DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT engagement_team_assignments_contributor_no_overlap
    EXCLUDE USING gist (
      engagement_id WITH =,
      firm_membership_id WITH =,
      tstzrange(effective_from, effective_to, '[)') WITH &&
    ) WHERE (responsibility_code = 'contributor')
      DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX engagement_team_assignments_engagement_current_idx
  ON engagement_team_assignments
    (engagement_id, responsibility_code, effective_from DESC, firm_membership_id)
  WHERE effective_to IS NULL;

CREATE INDEX engagement_team_assignments_membership_current_idx
  ON engagement_team_assignments
    (firm_membership_id, engagement_id, responsibility_code)
  WHERE effective_to IS NULL;
```

#### Exact `firm_engagement_defaults` fields

| Column                                     | PostgreSQL shape                               | Null | Meaning                                                                                       |
| ------------------------------------------ | ---------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| `firm_company_id`                          | `uuid` FK → `accounting_firms_meta.company_id` | No   | Firm whose intake defaults apply.                                                             |
| `service_domain_code`                      | `text`                                         | No   | Service boundary; `bookkeeping` at launch.                                                    |
| `default_client_lead_membership_id`        | `uuid`                                         | No   | Active same-firm membership used when intake does not explicitly select a Client Lead.        |
| `default_primary_bookkeeper_membership_id` | `uuid`                                         | No   | Active same-firm membership used when intake does not explicitly select a Primary Bookkeeper. |
| `version`                                  | positive `integer`                             | No   | Starts at 1 and increments on each replacement.                                               |
| `created_at`                               | `timestamptz`                                  | No   | When defaults for this service were first established.                                        |
| `updated_at`                               | `timestamptz`                                  | No   | Last replacement time.                                                                        |

The primary key is `(firm_company_id, service_domain_code)`. Each default membership uses a composite FK with `firm_company_id` to `user_company_roles(id, company_id)`. The same membership may be both defaults. Both must be active and capability-eligible; offboarding or role changes must replace affected defaults in the same transaction. A bookkeeping firm must have this row before enabling branded signup, auto-acceptance, or platform referrals. If setup omitted an explicit choice, provisioning selects an eligible Firm Admin for both fields and makes that fallback visible when the firm later reviews its team settings.

```sql
CREATE INDEX firm_engagement_defaults_lead_membership_idx
  ON firm_engagement_defaults (default_client_lead_membership_id);

CREATE INDEX firm_engagement_defaults_bookkeeper_membership_idx
  ON firm_engagement_defaults (default_primary_bookkeeper_membership_id);
```

#### Role, engagement responsibility, and work assignment are distinct

- `user_company_roles` answers **what may this firm member do at all?** It supplies capabilities such as administering the firm, leading clients, preparing bookkeeping, or approving close.
- `engagement_team_assignments` answers **for which client engagement do they carry an ongoing responsibility or have portfolio access?** A role never automatically places somebody on every client.
- `work_items.assignee_user_id` answers **who is currently accountable for moving this particular action forward?** Firm workers must have an eligible active engagement relationship; client users must have eligible client access. Assignment never upgrades capability.

Authorization intersects all three. For example, a Manager role makes a member eligible to be a Client Lead; an active Client Lead assignment scopes that authority to a client; a close-approval command still checks the required capability and the exact engagement/close target.

#### Contributor lifecycle

- A Contributor row is created when a Client Lead or Firm Admin explicitly grants a firm member access to help with that client; it is not silently created merely because somebody attempts a work assignment.
- The assignment UI may offer one explicit transactional action—“Add to this client and assign this work”—when the selected member is eligible but is not yet a Contributor.
- Client Lead and Primary Bookkeeper assignments remain active until atomically replaced or the engagement ends. Replacing one closes the old row and opens the new row at the same instant, preserving history and avoiding a gap.
- A future-dated replacement or Contributor grant may be cancelled before it starts. The row becomes a zero-length `cancelled_before_activation` interval; the same command restores or retains any required Lead/Primary coverage that had been scheduled to end.
- A Contributor assignment remains active until explicitly removed, the member leaves the firm, or the engagement ends.
- A Contributor cannot be removed while they retain assigned open work unless the same command reroutes that work to another authorized user, normally the engagement's Primary Bookkeeper.
- Required Client Lead or Primary Bookkeeper responsibility cannot end without a simultaneous eligible replacement while the engagement remains active.
- These are effective timestamps (`effective_from`, `effective_to`), not accounting periods. Work access can change during a month without changing monthly accounting truth.

#### Existing `company_settings` usage

Add registry-backed firm settings for scalar policy values such as:

- `client_referral_acceptance_mode` (default `review_required`)
- `accepting_platform_referrals` or a small availability enum
- `close_preview_business_days` (hidden launch default `5`)
- `close_due_business_days` (hidden launch default `5`)

Do not store default Lead or Bookkeeper membership IDs as string settings: the existing generic settings table cannot foreign-key those values to active same-firm memberships. Keep those two references in `firm_engagement_defaults`.

For launch, a business day means Monday through Friday in the client Company's configured timezone; public-holiday calendars are not applied. Clock-driven Close lifecycle recovery uses one lightweight hourly sweep across eligible client periods. Transaction-, journal-, and ledger-triggered Finding evaluation remains event-driven and is not repeated by that sweep.

### B. Atomic work kernel (1)

| Table        | Sole responsibility                                                                                                            | Why separate                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `work_items` | One independently finishable, system-detected action against one domain target, for one engagement and required fiscal period. | This is the authoritative current-work grain. Groups, presentation, target detail, audit history, and notifications already have other owners. |

No `work_item_events`, `work_groups`, `work_item_targets`, `work_item_periods`, blocker, dependency, or assignment-history table belongs in the launch atomic-work kernel.

#### Exact `work_items` fields

| Column                       | PostgreSQL shape                         | Null | Meaning                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                         | `uuid` PK, UUIDv7                        | No   | Stable identity for this occurrence of work.                                                                                                                                                                 |
| `engagement_id`              | `uuid` FK → `firm_client_engagements.id` | No   | Firm-client-service relationship that owns this occurrence and supplies its authorization/team scope.                                                                                                        |
| `fiscal_period_id`           | `uuid` FK → `fiscal_calendar.id`         | No   | One monthly accounting period currently affected by the work.                                                                                                                                                |
| `work_type_code`             | `text`                                   | No   | Key into the deployed work-type registry; says what must be done and gives `target_id` its type.                                                                                                             |
| `target_id`                  | `uuid`                                   | No   | Underlying domain record. It is generic because its type is fixed by `work_type_code`; it is never accepted directly from arbitrary user input.                                                              |
| `state`                      | constrained `text`                       | No   | `open`, `resolved`, or `superseded`.                                                                                                                                                                         |
| `assignee_user_id`           | `uuid` FK → `users.id`                   | No   | One person accountable for moving the work forward. Other authorized people may still be able to perform the domain command.                                                                                 |
| `assignment_basis`           | constrained `text`                       | No   | `primary_bookkeeper`, `client_lead`, `client_contact`, `explicit_assignment`, or `fallback`; explains routing and whether a later engagement-responsibility change should reroute the item.                  |
| `due_at`                     | `timestamptz`                            | No   | Current indexed operational deadline. It is normally supplied by the Period Close/routine producer policy; while the anchored period is covered by an active Package, it must equal that Package's `due_at`. |
| `opened_at`                  | `timestamptz`                            | No   | When this occurrence became outstanding.                                                                                                                                                                     |
| `ended_at`                   | `timestamptz`                            | Yes  | When it resolved or was superseded; null while open.                                                                                                                                                         |
| `end_reason_code`            | `text`                                   | Yes  | Registered reason such as `condition_cleared`, `acknowledged_resolution`, `no_longer_applicable`, or `engagement_transferred`. Detailed evidence remains on the domain target or resolution.                 |
| `ended_by_user_id`           | `uuid` FK → `users.id`                   | Yes  | User whose domain command caused the end; null for a system/integration transition. Full actor identity is retained in `audit_events`.                                                                       |
| `superseded_by_work_item_id` | `uuid` self-FK                           | Yes  | Replacement occurrence when one exists; absence is valid when no replacement is appropriate.                                                                                                                 |
| `version`                    | positive `integer`                       | No   | Starts at 1 and increments on every current-row change for concurrency and delta responses.                                                                                                                  |
| `updated_at`                 | `timestamptz`                            | No   | Last authoritative row change.                                                                                                                                                                               |

`engagement_id`, rather than duplicated firm and client IDs, is the ownership seam. It determines which firm owns the work, which team responsibilities apply, and which engagement receives or relinquishes work during a transfer. The company is derived through the engagement. A deferred constraint trigger must prove that `fiscal_period_id` belongs to that engagement's client company.

`assignee_user_id` deliberately references global user identity because client users as well as firm workers can be assigned work. The routing service must prove the chosen user has the appropriate active firm/engagement relationship or client access. A Work Item still has one accountable person when several authorized people could perform the underlying command; if another eligible person fixes the condition, the same item resolves.

#### State constraints

- `open` requires `ended_at`, `end_reason_code`, `ended_by_user_id`, and `superseded_by_work_item_id` to be null.
- `resolved` requires `ended_at` and `end_reason_code`; `superseded_by_work_item_id` must be null.
- `superseded` requires `ended_at` and `end_reason_code`; `superseded_by_work_item_id` is optional because not every obsolete item has a replacement.
- Users never issue a work-item completion, cancellation, or reopen command. A domain command or reconciler changes the target, re-evaluates the registered outstanding condition, and then resolves, supersedes, reanchors, reroutes, or retains the item in the same transaction.
- A condition that becomes outstanding again after resolution produces a new occurrence rather than rewriting the ended item.

#### Target representation and registry

`work_type_code + target_id` is the complete stored target identity. `target_type` and `root_type` are not repeated on `work_items` because every work type maps to exactly one target type. PostgreSQL cannot provide a generic target FK, so safety comes from a strict deployed registry, producer-only materialization, adapter validation, and soft-delete/restrict policies for referenced domain records.

The registry is backend code, not a database-configurable workflow engine:

```ts
type WorkTypeDefinition = {
  code: string;
  targetType: string;
  rootType?: string;

  defaultAssignmentBasis:
    | "primary_bookkeeper"
    | "client_lead"
    | "client_contact";

  primarySurface:
    | "ordinary_queue"
    | "close_workspace"
    | "approval_queue"
    | "post_close";

  closeRequirement: "blocking_work" | "close_domain_state" | "none";

  accessPolicy: "delivery_team" | "client_action" | "lead_approval";

  presentation: {
    workspace: string;
    groupTitle: GroupTitleFunction;
    groupSummary: GroupSummaryFunction;
    itemLabel: ItemLabelFunction;
    bulkActions: readonly string[];
  };

  targetAdapter: WorkTargetAdapter;
};
```

The fields are deliberately narrow:

- `code` is the stable persisted semantic identifier.
- `targetType` says what domain identity `target_id` denotes. Optional `rootType` relates a wrapper such as a categorization candidate to its underlying bank transaction.
- `defaultAssignmentBasis` supplies a fallback assignment category; the routing service resolves it to a concrete eligible user and the producer may explicitly override it.
- `primarySurface` selects the Work Type's primary projection policy without storing placement on every item. It is not an exclusive list of everywhere the Work may appear: `closeRequirement`, `accessPolicy`, assignment, and viewer responsibility independently allow the same condition to appear as a close prerequisite, client action/banner, delivery-team waiting signal, or oversight view.
- `closeRequirement` distinguishes ordinary open work that blocks the period, work whose close effect is governed by close-domain state, and post-close/non-blocking work.
- `accessPolicy` selects a reusable authorization policy. It does not store viewer-specific roles on the work item.
- `presentation` owns server-generated group/item copy, shared workspace identity, and supported bulk-command codes.
- `targetAdapter` is runtime code that batch-loads target summaries, proves target/company scope, and evaluates whether the target remains outstanding. It is not another stored row or string name.

The registry does not calculate or persist due dates. The producer that understands the domain supplies `due_at`; a group containing different deadlines reports the earliest due date and overdue counts. Active Package coverage is the one override: Package `due_at` becomes the authoritative operational deadline for every covered open Work Item and Period Close. Package commands persist that value into the indexed rows, and later producer/recovery reconciliation reads current coverage before inserting or updating Work. No `deadline_source` column is stored because the active Package range already explains the source. Startup validation rejects duplicate work codes, tests require every produced code to be registered, and deployment diagnostics must fail loudly on orphaned stored codes.

#### Assignment, visibility, action, and notification

These are separate concepts:

- `assignee_user_id` controls personal accountability and default personal-queue placement.
- `canAct` is calculated by authorizing a requested domain command. More than one person may be capable of fixing the target without becoming jointly assigned to the item.
- `canSee` is calculated from engagement responsibility, client access, or an explicit firm-oversight capability. A Contributor sees their assigned work; a Primary Bookkeeper and Client Lead may persistently see relevant waiting work for their client; firm-wide access is never inferred from a query parameter.
- Notification is a message caused by an event, not queue assignment or persistent visibility. Notification policy consumes outbox/activity signals and determines recipients, preferences, copy, and channel without creating duplicate Work Items.

#### Accounting-period scope

Every launch-scope Work Item has one required indexed `fiscal_period_id`: the accounting period in whose queue and close sequence the action is anchored.

- a bank transaction derives its month from the transaction date and client fiscal calendar;
- a draft journal derives its month from the journal date;
- a close finding, check, or period-close approval points to that close's month;
- a bank connection requiring reauthorization anchors to the earliest open managed month its active feeds can affect: the current Close Frontier when one exists, otherwise the client's current in-progress monthly Fiscal Period. It does not wait for Preview to materialize;
- a multi-period package or impact decision anchors to its earliest actionable affected period, while its domain target retains the complete range.

This period reference is required because the launch queue is an accounting-work surface, not a generic operational inbox. Whether it blocks close is stable work-type semantics in `closeRequirement`, not a mutable `blocks_close` flag. If relevant domain facts move open work to another period, the domain command reanchors it and audits the change in the same transaction.

A generic `work_item_periods` many-to-many table is deliberately omitted. An atomic item should not casually claim to be 36 monthly work items at once. Genuine multi-period coordination has a real domain target:

- catch-up work targets a `close_package`, whose contiguous months are derived from its inclusive start/end fiscal periods;
- retroactive bank data targets an Accounting Finding whose permitted resolution may subsequently produce a reclose package or monthly work;
- bulk categorization is one command over many independent transaction work items, not one multi-period work item.

Close readiness queries open items by `engagement_id + fiscal_period_id` using the registry's set of `blocking_work` codes, while finding/approval/package/frontier state comes from the close tables.

#### Derived groups and shared workspaces

An ordinary work group is derived by `engagement_id + work_type_code`; because the engagement identifies the client, this is exactly one group per work type per client. It is generated by an indexed set-based query on each queue request and is not stored as a PostgreSQL table/view, Redis read projection, or browser database at launch.

The aggregate calculates total, actionable, waiting, overdue, bulk-eligible, and earliest-due values. The registry adds title, summary, workspace, item label, and authorized actions. A generated group ID is a deterministic encoding of the two-key group identity and has no database lifecycle.

Similar work can share a workspace without being merged into one group:

| Work type                         | Target                                                  | Group/workspace behaviour                                                |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `categorize_bank_transaction`     | `bank_transaction`                                      | Separate group; no confidence and no blind bulk action.                  |
| `review_categorization_candidate` | `categorization_candidate` with root `bank_transaction` | Separate group; exposes suggestion confidence and bounded bulk approval. |

Both definitions use the `categorization` workspace, so opening either group places the user in the same coherent UI space while preserving distinct copy, counts, data, and safe actions.

The queue landing is one frontend API call. The backend performs three bounded base reads—authorized portfolio/facets, ordinary open-work groups, and close-frontier rows—inside the authenticated firm scope, then enriches them through registered presentation functions. Opening a group makes one paginated workspace request whose target adapter batch-loads domain detail. Launch needs no queue-group table, materialized view, Redis read cache, or IndexedDB; add a projection only after measurements prove indexed aggregation insufficient. One firm-scoped SSE connection uses Redis only to transport post-commit invalidations and never as queue truth.

#### Indexes and uniqueness

```sql
CREATE UNIQUE INDEX work_items_one_open_target_uidx
  ON work_items (engagement_id, work_type_code, target_id)
  WHERE state = 'open';

CREATE INDEX work_items_assignee_queue_idx
  ON work_items (assignee_user_id, due_at, engagement_id)
  WHERE state = 'open';

CREATE INDEX work_items_engagement_group_idx
  ON work_items (engagement_id, work_type_code, due_at)
  WHERE state = 'open';

CREATE INDEX work_items_period_close_idx
  ON work_items (engagement_id, fiscal_period_id, work_type_code)
  WHERE state = 'open';
```

The active uniqueness index intentionally excludes `fiscal_period_id`. One bank connection in `requires_action` cannot produce simultaneous January and February obligations or duplicate one client reauthorization action across its several feeds. It has one active occurrence anchored to the earliest frontier its feeds affect, or the current in-progress month before a frontier exists. Reauthorization, deliberate revocation, retirement of all relevant feeds, complete alternative records, or a valid evidenced Finding resolution can resolve that occurrence; only after the relevant month/frontier advances may a still-actionable connection reanchor or produce a new occurrence according to the registered period-specific resolution policy.

#### Centralized history and user activity

Do not create `work_item_events`.

- Every consequential transition writes a versioned `audit_events` row in the same transaction as `work_items`, using `entity_type = 'work_item'` and actions such as `work_item.opened`, `work_item.assignment_changed`, `work_item.period_reanchored`, `work_item.due_date_changed`, `work_item.resolved`, and `work_item.superseded`.
- The existing audit entity-type application registry must add `work_item`; the database column and format constraint already support it.
- The audit row's `company_id` is the client company. Its payload records the work type, engagement, period, target, relevant before/after values, and end reason. Existing `correlation_id` storage carries the public `commandId` and links it to the domain audit event; per-attempt request identity remains separate.
- `activity_events` receives only curated user-meaningful outcomes and may aggregate many atomic changes—for example, “12 transactions categorized”—rather than mirroring every work transition.
- `outbox` guarantees asynchronous creation of activity, notification, and future projection effects. Neither `audit_events` nor `activity_events` is queried to reconstruct current queue state.
- During pre-launch replacement, never silently repoint the existing `activity_events.work_item_id` or `notifications.work_item_id` columns: they reference `legacy_work_items` by schema. Prefer the existing generic `source_entity_type + source_entity_id/key` when canonical Work is genuinely the source. Add a separate typed canonical-Work FK only if the projection/API design proves a query needs simultaneous source and Work linkage; otherwise remove the obsolete relationship when the legacy system is deleted.

### C. Monthly close, reopening, and catch-up packages (4)

| Table                    | Sole responsibility                                                                                                                                                                                                          | Why separate                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `period_closes`          | Client-owned current close lifecycle and due date for one monthly fiscal period.                                                                                                                                             | A client's accounting month continues across firm changes and reopen cycles; it must not be replaced merely because operational responsibility changes.                                      |
| `period_close_versions`  | One numbered preparation version attributable to one Engagement, mutable only while it is the current draft and permanently frozen on submission or supersession; the frozen version also owns its single approval decision. | Approval and historical firm attribution must refer to exactly what was reviewed. Rejection, material staleness, transfer, and reopening create a new version rather than rewriting history. |
| `close_packages`         | Durable lifecycle, assignee, deadline, and inclusive start/end fiscal periods for one bounded contiguous catch-up or reclose range.                                                                                          | A package coordinates monthly closes but does not replace them. Contiguous membership is derived from its validated period boundaries, so no bridge table is needed.                         |
| `period_reopen_requests` | Durable pending/approved/rejected decision asking the current Client Lead to authorize a client-scoped cascading reopen.                                                                                                     | A request must survive sessions, create reviewer Work, preserve rejection notes, and remain distinct from the unresolved accounting Finding and from audit history.                          |

Package creation must prove that both boundaries belong to the engagement's client, every included monthly period exists and has ended, the inclusive range contains at most twelve months, and it does not overlap another active package. Current or future routine months never enter a Catch-up/Reclose Package. Creating a package preserves existing monthly state and materializes any missing historical Period Close directly in Preparing with its initial Version, applicable Findings, Confirmations, and Work. Splitting supersedes the original package and creates replacement contiguous ranges without rewriting history.

#### Exact `period_closes` fields

| Column              | PostgreSQL shape                 | Null | Meaning                                                                                                                                                                                                                            |
| ------------------- | -------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `uuid` PK, UUIDv7                | No   | Stable client-owned identity for the close of one monthly period across firms and reopen cycles.                                                                                                                                   |
| `client_company_id` | `uuid` FK → `companies.id`       | No   | Client company that owns the books and Period Close.                                                                                                                                                                               |
| `fiscal_period_id`  | `uuid` FK → `fiscal_calendar.id` | No   | Monthly accounting period being prepared and closed.                                                                                                                                                                               |
| `state`             | constrained `text`               | No   | `preview`, `preparing`, `awaiting_approval`, or `closed`.                                                                                                                                                                          |
| `due_at`            | `timestamptz`                    | No   | Current indexed operational deadline. Routine Close uses the configured post-period deadline; active Package coverage replaces it with the Package deadline until the Package completes or is superseded by explicit replacements. |
| `state_changed_at`  | `timestamptz`                    | No   | Time of the most recent lifecycle transition.                                                                                                                                                                                      |
| `version`           | positive `integer`               | No   | Starts at 1 and increments on every current-row change for concurrency and queue deltas.                                                                                                                                           |
| `created_at`        | `timestamptz`                    | No   | When the close was materialized, normally when Preview opens.                                                                                                                                                                      |
| `updated_at`        | `timestamptz`                    | No   | Last authoritative row change.                                                                                                                                                                                                     |

Normal lifecycle remains `preview -> preparing -> awaiting_approval -> closed`, with authorized `closed -> preparing` during cascading reopen. The Period Close itself is never superseded on firm transfer. Operational responsibility and historical attribution live on Versions and Work.

`due_at` is intentionally mutable operational state even though the Period Close identity is client-owned. Fiscal Period start/end dates preserve accounting chronology, while audit captures each deadline change. Package acceptance, split/replacement, transfer replacement, or an authorized deadline change increments the affected open Period Close versions and aligns their deadlines transactionally. Historical routine deadlines do not remain active queue deadlines merely because the accounting months are old.

Do not store firm/Engagement ID, `is_frontier`, overdue/readiness/blocker/finding counts, current Lead or Bookkeeper, package ID, approval status, financial snapshot, `closed_at`, `closed_by`, or lock state. They are respectively derived from the current Version/current bookkeeping Engagement, calculated from current records, owned by the current Period Close Version, or already authoritative on `fiscal_calendar`.

Required database and service constraints:

- unique `(client_company_id, fiscal_period_id)` with composite FK to the client-owned monthly Fiscal Period;
- every active Package-covered open Period Close has `due_at = close_packages.due_at`; Package commands/reconciliation enforce this under the range locks;
- only Preview may have no Period Close Version;
- Preparing and Awaiting Approval have one current Version belonging to the current responsible bookkeeping Engagement;
- Closed has one current approved Version, which may belong to a predecessor Engagement until an authorized reopen creates a later Version under the current Engagement.

```sql
CREATE UNIQUE INDEX period_closes_client_period_uidx
  ON period_closes (client_company_id, fiscal_period_id);

CREATE INDEX period_closes_active_due_idx
  ON period_closes (client_company_id, due_at, state)
  WHERE state IN ('preview', 'preparing', 'awaiting_approval');

CREATE INDEX period_closes_fiscal_period_idx
  ON period_closes (fiscal_period_id, state);
```

#### Exact `period_close_versions` fields

| Column                        | PostgreSQL shape                         | Null | Meaning                                                                                                                                    |
| ----------------------------- | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                          | `uuid` PK, UUIDv7                        | No   | Stable identity for one numbered preparation version and the approval decision on its frozen submission.                                   |
| `period_close_id`             | `uuid` FK → `period_closes.id`           | No   | Parent monthly close.                                                                                                                      |
| `engagement_id`               | `uuid` FK → `firm_client_engagements.id` | No   | Bookkeeping Engagement responsible for preparing/reviewing this Version; immutable historical firm attribution.                            |
| `version_number`              | positive `integer`                       | No   | Monotonic sequence within the Period Close, beginning at 1.                                                                                |
| `origin_code`                 | constrained `text`                       | No   | `initial`, `approval_rejected`, `material_change`, `reopened`, or `engagement_transfer`.                                                   |
| `origin_reason`               | `text`                                   | Yes  | Required for `reopened`; optional where the preceding Version or engagement record owns the detailed reason.                               |
| `submitted_at`                | `timestamptz`                            | Yes  | Time the draft was frozen for review.                                                                                                      |
| `submitted_by_user_id`        | `uuid` FK → `users.id`                   | Yes  | Eligible preparer who submitted the version.                                                                                               |
| `content_hash`                | `text`                                   | Yes  | Deterministic hash of the exact accounting and review evidence submitted.                                                                  |
| `snapshot_schema_version`     | `text`                                   | Yes  | Version needed to interpret the immutable submission snapshot.                                                                             |
| `submission_snapshot`         | `jsonb` object                           | Yes  | Self-describing evidence and financial summary reviewed by the Client Lead.                                                                |
| `approval_decision`           | constrained `text`                       | Yes  | The version's one terminal review decision: `approved` or `rejected`; null before a decision or when an undecided submission became stale. |
| `approval_decided_by_user_id` | `uuid` FK → `users.id`                   | Yes  | Eligible Client Lead who made the decision.                                                                                                |
| `approval_decided_at`         | `timestamptz`                            | Yes  | Time the decision was made.                                                                                                                |
| `approval_reason`             | `text`                                   | Yes  | Mandatory nonblank explanation for rejection; optional nonblank note for approval.                                                         |
| `superseded_at`               | `timestamptz`                            | Yes  | Time this version stopped being current.                                                                                                   |
| `superseded_reason_code`      | constrained `text`                       | Yes  | `approval_rejected`, `material_change`, `reopened`, or `engagement_transferred`.                                                           |
| `created_at`                  | `timestamptz`                            | No   | When this preparation iteration began.                                                                                                     |
| `updated_at`                  | `timestamptz`                            | No   | Last draft submission, single approval decision, or supersession annotation time.                                                          |

Version preparation and review state is deliberately derived rather than stored:

| Shape                                                                               | Meaning                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `submitted_at IS NULL` and `superseded_at IS NULL`                                  | Current draft.                                                                                                     |
| Submitted, current, and `approval_decision IS NULL`                                 | Frozen submission pending approval.                                                                                |
| `approval_decision = 'approved'`                                                    | Approved version; it remains current while the close stays closed and may later become historical after reopening. |
| `approval_decision = 'rejected'` and `superseded_reason_code = 'approval_rejected'` | Rejected historical version.                                                                                       |
| Submitted, superseded, and `approval_decision IS NULL`                              | Stale historical version; material change, reopening, or transfer ended review without a decision.                 |
| Unsubmitted and superseded                                                          | Historical draft that never reached review.                                                                        |

The Version Engagement must be bookkeeping responsibility for the Period Close's client and must cover the Version's creation/review operation; it is immutable even after transfer. The submission fields—timestamp, submitter, content hash, schema version, and snapshot—must be either all null or all present. The snapshot must be a JSON object. The three decision identity fields—decision, actor, and timestamp—must likewise be all null or all present. `approval_reason` must be null before a decision, must be nonblank for rejection, and may be null or nonblank for approval. The decision command may assign a decision only when the Version is submitted and current at command start; the decision is assigned once and is immutable. Rejection records the decision and supersedes the Version in that same transaction. Supersession timestamp and reason must appear together. Submission content is immutable after `submitted_at`; only the single approval decision and later supersession metadata may be added. An unsubmitted draft becomes immutable when superseded. `origin_reason` is mandatory when `origin_code = 'reopened'`.

`submission_snapshot` may contain the client/period identity, ledger or trial-balance version, reviewer financial summary, blocking-work result, Finding IDs/facts hashes/resolution IDs, Confirmation/response IDs, prior-period Version relied upon, package identity, and material warnings or acknowledgements. Relational source rows remain authoritative; the snapshot proves exactly what was reviewed after those rows later change.

```sql
CREATE UNIQUE INDEX period_close_versions_number_uidx
  ON period_close_versions (period_close_id, version_number);

CREATE UNIQUE INDEX period_close_versions_one_current_uidx
  ON period_close_versions (period_close_id)
  WHERE superseded_at IS NULL;

CREATE INDEX period_close_versions_history_idx
  ON period_close_versions (period_close_id, version_number DESC);

CREATE INDEX period_close_versions_engagement_history_idx
  ON period_close_versions (engagement_id, created_at DESC);
```

The partial unique index makes the current Period Close Version an inexpensive indexed join; do not add a redundant `period_closes.current_version_id` or circular foreign key. The Engagement history index supports bounded former-firm access to frozen Versions without exposing the client's live books.

#### Close/version/fiscal-period alignment

| Period Close state  | Current version                                             | Approval         | Fiscal Period                     |
| ------------------- | ----------------------------------------------------------- | ---------------- | --------------------------------- |
| `preview`           | None                                                        | None             | `open`                            |
| `preparing`         | One draft                                                   | None             | `open`                            |
| `awaiting_approval` | One frozen submission with no decision                      | Pending, derived | `open`                            |
| `closed`            | One frozen submission with `approval_decision = 'approved'` | Approved         | `closed` or subsequently `locked` |

These cross-table invariants require transactional commands plus deferred constraint checks; simple row checks cannot prove them.

#### Authoritative transitions

- **Preview → Preparing:** at period-end, create Version 1, advance the close, and materialize period-dependent Findings and Confirmations.
- **Submit:** lock the close/current draft, prove frontier/prior-period/readiness invariants, fully re-evaluate Findings and Confirmations, freeze the snapshot/hash, materialize or reroute approval Work targeting that Version, and advance to Awaiting Approval in one transaction.
- **Reject:** set the Version's rejection decision and reason, supersede it, create the next draft Version, return to Preparing, and reroute preparation Work atomically.
- **Material change:** supersede the undecided submitted Version, create the next draft, and return to Preparing. Its stale review state is derived rather than recorded as a decision.
- **Approve:** revalidate currency and sequence, set the exact Version's approval decision, close `fiscal_calendar`, set Period Close to Closed, resolve approval Work, and advance the derived frontier in one transaction. The same-person command performs submission and approval atomically.
- **Reopen:** lock the selected and every later closed month, reopen their Fiscal Periods, supersede the approved Versions, create new drafts with the required reason, return the closes to Preparing, and re-evaluate chronologically.
- **Transfer:** leave a closed Period Close and approved Version unchanged. For an unfinished close, supersede the current old-Engagement Version, resolve old Work, and create the next draft Version on the same Period Close under the receiving Engagement; Preview with no Version needs only future responsibility resolution.

For managed client periods, the existing direct `closeFiscalPeriod` and `reopenFiscalPeriod` services must become internal primitives invoked only by these aggregate commands. Allowing callers to mutate `fiscal_calendar` directly would bypass Findings, Confirmations, approval, and cascading reopen while leaving the Period Close inconsistent.

#### Exact `close_packages` fields

| Column                   | PostgreSQL shape                         | Null | Meaning                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid` PK, UUIDv7                        | No   | Stable identity for one accepted multi-period work package.                                                                                                                                                                                                                                                         |
| `engagement_id`          | `uuid` FK → `firm_client_engagements.id` | No   | Engagement responsible for every monthly close in the range.                                                                                                                                                                                                                                                        |
| `package_type`           | constrained `text`                       | No   | `catch_up` for an accepted historical-backlog plan or `reclose` for a bounded cascading reopen.                                                                                                                                                                                                                     |
| `origin_code`            | constrained `text`                       | No   | `engagement_intake`, `existing_backlog`, `cascading_reopen`, `engagement_transfer`, `split`, or `scope_replacement`.                                                                                                                                                                                                |
| `start_fiscal_period_id` | `uuid` FK → `fiscal_calendar.id`         | No   | First monthly Fiscal Period in the inclusive range.                                                                                                                                                                                                                                                                 |
| `end_fiscal_period_id`   | `uuid` FK → `fiscal_calendar.id`         | No   | Last monthly Fiscal Period in the inclusive range.                                                                                                                                                                                                                                                                  |
| `assignee_user_id`       | `uuid` FK → `users.id`                   | No   | One eligible firm member accountable for moving this package forward. Assignment does not grant authority or silently reassign its underlying Work Items.                                                                                                                                                           |
| `due_at`                 | `timestamptz`                            | No   | Authoritative operational deadline for the active Package and every covered open Period Close/Work Item. The Client Lead explicitly selects and confirms it at creation and may later change it only through the audited deadline command. Launch promises no fixed Catch-up/Reclose duration or generated default. |
| `state`                  | constrained `text`                       | No   | `active`, `completed`, or `superseded`. Monthly preparation and approval phases are deliberately not package states.                                                                                                                                                                                                |
| `ended_at`               | `timestamptz`                            | Yes  | When the package completed or was superseded; null while active.                                                                                                                                                                                                                                                    |
| `end_reason_code`        | constrained `text`                       | Yes  | `range_closed`, `split`, `engagement_transferred`, or `scope_replaced`; required when the package ends.                                                                                                                                                                                                             |
| `predecessor_package_id` | `uuid` self-FK                           | Yes  | Immediate superseded Package replaced by this row during a split, scope replacement, or engagement transfer. It points to the predecessor, not necessarily the first Package in the lineage.                                                                                                                        |
| `version`                | positive `integer`                       | No   | Starts at 1 and increments on every current-row change for concurrency and queue deltas.                                                                                                                                                                                                                            |
| `created_at`             | `timestamptz`                            | No   | When the reviewed plan was accepted and this package became authoritative.                                                                                                                                                                                                                                          |
| `updated_at`             | `timestamptz`                            | No   | Last authoritative row change.                                                                                                                                                                                                                                                                                      |

The package does not store `preparing`, `ready`, `awaiting_approval`, progress counts, current month, approval status, or a list of period IDs. Its working phase and progress are derived from the ordered monthly Period Closes, current Period Close Versions and their decisions, Findings, Confirmations, and blocking Work Items in its inclusive range.

Required database and service constraints:

- both boundary periods are monthly, belong to the engagement's client, fall within the engagement's responsibility range, have ended as of Package acceptance, and `start <= end` in the client's fiscal calendar;
- the range is contiguous and contains between one and twelve monthly periods, with fiscal-year alignment preferred by the planning policy rather than forced by a row constraint;
- every included Fiscal Period is ended and `open` at Package acceptance; closed/locked months are invalid. After acceptance every included Period Close is Preparing: missing historical closes are materialized directly in Preparing, an ended Preview is advanced through the normal preparation primitive, and an existing Awaiting Approval or Closed close causes rejection rather than being silently absorbed;
- no two `active` packages for an engagement overlap; the command serializes package-range changes per engagement and validates overlap through ordered Fiscal Periods because UUID boundary values cannot enforce calendar overlap by themselves;
- while active, the Package `due_at` equals `due_at` on every covered open Period Close and open Work Item. Package creation, replacement, transfer replacement, and deadline change update those indexed copies in the same transaction; later Work materialization inherits the current Package deadline;
- `active` requires all end fields to be null; `completed` requires `ended_at` and `end_reason_code = 'range_closed'`; `superseded` requires `ended_at` and an applicable non-completion reason;
- `predecessor_package_id` is required for every split/scope replacement and whenever an engagement-transfer Package replaces an active Package from the prior engagement. It is null for origins that replace nothing;
- a split predecessor has the same engagement and Package type; a transfer predecessor has the same client and service domain through a different engagement and the same Package type. Every predecessor is superseded, one predecessor may have several replacement rows, and lineage may never form a cycle;
- Package replacement lineage is one-to-many only: a transfer or scope replacement may retain or split each predecessor range, but one replacement may not merge several predecessor Packages. The launch scope deliberately adds no many-to-many lineage bridge;
- an ordinary split/scope replacement is rejected while any included current Version is submitted and undecided; the review must first be rejected/staled. Engagement transfer is the controlled exception and atomically stales those submissions;
- the assignee is an active eligible Client Lead, Primary Bookkeeper, or Contributor for the engagement. Changing the assignee is explicit and audited; it does not silently reassign existing in-range Work Items.
- initial Package creation requires an explicit Client Lead-confirmed `due_at`. Every replacement created by split, scope replacement, or transfer also requires its own explicitly confirmed `due_at`; no deadline is defaulted or inherited silently;
- changing an active Package deadline requires Client Lead or `manage_close_packages`, expected Package version, and a nonblank reason. It increments the Package plus affected open Close/Work versions and audits old/new deadline and reason. Reassignment alone never changes `due_at`;
- the current Client Lead has inherent Package-management authority for their own Engagement. `manage_close_packages` is an explicit delegated exception for an otherwise authorized non-Lead and does not grant Package approval authority;
- an active Package cannot be superseded while any covered Period Close remains open unless explicit non-overlapping replacement Packages cover every still-managed open month and install their deadlines in the same transaction. Completion is permitted only after the range closes.

```sql
CREATE INDEX close_packages_engagement_active_idx
  ON close_packages (engagement_id, start_fiscal_period_id, end_fiscal_period_id)
  WHERE state = 'active';

CREATE INDEX close_packages_assignee_active_idx
  ON close_packages (assignee_user_id, due_at, engagement_id)
  WHERE state = 'active';

CREATE INDEX close_packages_predecessor_idx
  ON close_packages (predecessor_package_id)
  WHERE predecessor_package_id IS NOT NULL;
```

#### Package lifecycle and monthly authority

- **Create:** a reviewed plan becomes authoritative only when its Package rows are inserted with an explicit Lead-confirmed deadline. New/receiving engagements may create contracted catch-up for any non-empty ended-month range. Existing-client catch-up requires at least six contiguous ended, unclosed months starting at the Close Frontier. Reclose has no arbitrary minimum; packaging fewer than six reopened months is optional. Missing historical Period Closes enter Preparing immediately through the same preparation primitive; they never pass through Preview after their periods have ended. The command writes the Package deadline to every covered open Close and Work row before commit.
- **Prepare:** multiple packages may be assigned and prepared in parallel, but monthly close truth remains independent and chronological. Package assignment does not grant close authority: an assigned Contributor may perform routed preparation work, while the current Primary Bookkeeper remains the submitter and the Client Lead remains the approver. A later package cannot submit or close before all earlier managed months are closed.
- **Split or replace scope:** when no included submission is pending review, one transaction supersedes the original with reason `split` or `scope_replaced` and creates one or more non-overlapping replacement Packages referencing it. Each replacement requires an explicit selected deadline; the transaction updates every affected open Close/Work row to its replacement Package deadline. Package boundaries are not rewritten in place after work begins, and several predecessors are never merged into one replacement.
- **Change deadline:** Client Lead or `manage_close_packages` submits the expected Package version, new deadline, and nonblank reason. One transaction updates the active Package and every covered open Close/Work deadline, increments their versions, and audits the complete before/after set. This command does not change Package assignment.
- **Submit:** the current Primary Bookkeeper uses one command to validate the whole range, freeze every included current monthly Version, and materialize or reroute approval Work for each Version with one shared `commandId`; the Package remains `active`. An included month cannot use the ordinary single-period submit command while the Package is active.
- **Approve:** the current Client Lead uses one all-or-nothing command to record approval on every included monthly Version, close every included month chronologically, and then mark the Package `completed`. An included month cannot use the ordinary single-period approval command while the Package is active. If one actor currently holds both Primary Bookkeeper and Client Lead, one explicit Review-and-close-Package command performs both decisions atomically with separate correlated audit actions and no self-addressed approval Work. Completion remains durable even if a later authorized reopen creates a new reclose Package.
- **Reject or stale:** rejection records the decision on the affected Version; staleness leaves the decision null. In both cases the Version is superseded, the relevant month receives a new draft Version and returns to preparation, and Package phase is re-derived without a competing package-level rejection state.
- **Transfer:** the old engagement's active Package is superseded. The receiving firm reviews and creates its own accepted replacement scope and explicit deadlines; every resulting replacement row points to the old Package through `predecessor_package_id`, and covered current-Engagement open Close/Work deadlines are updated accordingly. A transfer with no old active Package creates ordinary intake Packages with no predecessor. Ownership is never rewritten.

#### Derived catch-up recommendation

The recommendation to organize an existing-client backlog is not a Work Item, Work Group, blocker, package draft, or new table. It is optional organizational advice derived from authoritative close state.

An engagement is eligible when all of the following are true:

- no active Package covers its Close Frontier;
- at least six contiguous ended, unclosed monthly periods begin at that frontier;
- the frontier is `preparing`, not `awaiting_approval`;
- every candidate month falls inside the active engagement responsibility range and none is locked; and
- the same continuously eligible backlog episode has not already been accepted into Packages.

Eligibility is reconciled after period end, approval, rejection or staleness, Package completion or supersession, engagement activation, and by a daily recovery sweep. New and receiving engagements do not use this trigger because their catch-up scope is explicitly reviewed during intake or transfer and has no minimum.

The primary recipient is the Client Lead. Firm members with the explicit `manage_close_packages` oversight capability may also see it; the Primary Bookkeeper is not repeatedly prompted unless they are also the Client Lead. The recommendation appears contextually in the expanded Month-end Close client row and Close workspace, with `Review catch-up plan` and `Continue monthly` actions, rather than as an ordinary queue group.

Reuse the existing notification/attention mechanism with `source_entity_type = 'firm_client_engagement'`, the Engagement ID, and `attention_key = catchup_recommendation:{engagement_id}`. Notify or emphasize once when eligibility changes from false to true. `Continue monthly` resolves the recipient's attention row but deliberately leaves that episode unarchived; the reconciler therefore suppresses another notification while eligibility remains continuously true even if the frontier advances. When eligibility becomes false, the reconciler archives every notification row for that episode, including an already-resolved row. A later false-to-true transition may then create a new row with an idempotency key containing the new frontier and transition version. A newly assigned Client Lead has no recipient-specific row and may receive attention during the same episode. Acceptance creates the authoritative Package rows and ends/archives the recommendation episode. This reuses existing `resolved_at`, `archived_at`, source identity, active-attention uniqueness, and notification lifecycle idempotency; no Package-proposal or recommendation-state table is needed.

#### Exact `period_reopen_requests` fields

| Column                          | PostgreSQL shape                         | Null | Meaning                                                                                                                  |
| ------------------------------- | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`                            | `uuid` PK, UUIDv7                        | No   | Stable request identity and target of Client Lead review Work.                                                           |
| `client_company_id`             | `uuid` FK → `companies.id`               | No   | Client that owns the affected books.                                                                                     |
| `requested_fiscal_period_id`    | `uuid` FK → `fiscal_calendar.id`         | No   | Earliest closed monthly period proposed for reopening.                                                                   |
| `engagement_id`                 | `uuid` FK → `firm_client_engagements.id` | No   | Current bookkeeping responsibility under which the request was made.                                                     |
| `trigger_accounting_finding_id` | `uuid` FK → `accounting_findings.id`     | Yes  | Late-impact Finding that initiated the request, when applicable.                                                         |
| `requested_by_user_id`          | `uuid` FK → `users.id`                   | No   | Authorized actor asking for the decision.                                                                                |
| `request_reason`                | `text`                                   | No   | Required nonblank professional reason.                                                                                   |
| `impact_hash`                   | `text`                                   | No   | Hash of the current cascade preview for stale-decision protection.                                                       |
| `impact_snapshot`               | `jsonb` object                           | No   | Self-describing affected-period, approval, known-report, and Work impacts shown when refreshed.                          |
| `state`                         | constrained `text`                       | No   | `pending`, `approved`, `rejected`, or `superseded`.                                                                      |
| `reviewed_by_user_id`           | `uuid` FK → `users.id`                   | Yes  | Authorized reviewer for approved/rejected requests.                                                                      |
| `reviewed_at`                   | `timestamptz`                            | Yes  | Decision time.                                                                                                           |
| `review_reason`                 | `text`                                   | Yes  | Required and nonblank for rejection; optional for approval.                                                              |
| `superseded_reason_code`        | constrained `text`                       | Yes  | Required only for `superseded`, such as `engagement_transferred`, `earlier_request_replaced`, or `no_longer_applicable`. |
| `version`                       | positive `integer`                       | No   | Optimistic concurrency for preview refresh and decision.                                                                 |
| `created_at`                    | `timestamptz`                            | No   | Request creation time.                                                                                                   |
| `updated_at`                    | `timestamptz`                            | No   | Last preview/state change.                                                                                               |

Required constraints and lifecycle:

- composite `(requested_fiscal_period_id, client_company_id)` FK proves the period is monthly and client-owned; the request command proves it is closed and inside the current Engagement's accepted scope;
- Engagement is a current bookkeeping Engagement for the client when created and never changes in place;
- at most one pending request exists per client. Under the client close-sequence lock, an earlier requested month replaces/supersedes a later pending request; a later/equal trigger refreshes and reuses the wider request;
- decision identity fields appear together only for approved/rejected states; rejection requires `review_reason`;
- `superseded_reason_code` appears exactly for `superseded`; terminal rows are immutable;
- `impact_hash` is nonblank and `impact_snapshot` is an object; approval recomputes the cascade and rejects a stale expected hash;
- request and rejection do not resolve any covered retroactive Finding. Approval resolves review Work and performs the cascade; affected transactions still require later categorization/matching.

```sql
CREATE UNIQUE INDEX period_reopen_requests_one_pending_client_uidx
  ON period_reopen_requests (client_company_id)
  WHERE state = 'pending';

CREATE INDEX period_reopen_requests_engagement_queue_idx
  ON period_reopen_requests (engagement_id, state, created_at)
  WHERE state = 'pending';

CREATE INDEX period_reopen_requests_period_history_idx
  ON period_reopen_requests
    (client_company_id, requested_fiscal_period_id, created_at DESC);
```

The optional `trigger_accounting_finding_id` records initiating provenance only. The current set of registered unresolved retroactive Findings covered by the client-sequence decision is derived and frozen into the self-describing `impact_snapshot`; approve/reject commands recompute that set and its `impact_hash`. This avoids a bridge table while preventing one later-discovered affected transaction from escaping the reviewed cascade. The request does not store a deadline: its single open `review_period_reopen_request` Work Item owns the current Close Frontier operational `due_at` used by queue ordering and overdue attention. If no Close Frontier has materialized yet, it stores the current in-progress month's routine Close deadline instead.

### D. Accounting findings and Close Confirmations (4)

| Table                          | Sole responsibility                                                                                                                                                                 | Why separate                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounting_findings`          | Current evaluator conclusion that one accounting concern is detected, cleared, or superseded for an engagement, monthly period, registered Finding code, and durable domain target. | The Finding owns stable relational identity, current material facts/evidence, definition version, and detection state; it may surface before close or be consumed by close readiness. |
| `finding_resolutions`          | Immutable confirmed corrections or professional decisions for one exact definition-and-facts version of a Finding.                                                                  | Correction, accepted treatment, and not-applicable decisions have different semantics; changed facts invalidate their current applicability without erasing history.                  |
| `close_confirmations`          | Materialized monthly human-confirmation obligation with exact definition, affirmative prompt, and current material context.                                                         | A Confirmation exists because policy requires a human statement even when the system detected no anomaly; it is not a subtype of Finding or an automated check.                       |
| `close_confirmation_responses` | Immutable confirmed/not-confirmed/not-applicable answers against one exact Confirmation definition and context.                                                                     | Changed facts, reopening, or a replacement answer can require another response without deleting earlier evidence.                                                                     |

Evaluator timing follows available facts, not the close calendar. Transaction, journal, and ledger Findings materialize immediately when their predicates are knowable; aggregate period Findings may remain provisional in Preview and become durable after period-end. A deterministic condition with only one valid correction may produce direct Work against its accounting target. A concern permitting professional judgement is a Finding whose registered strategies may include correction, linked evidence, or acknowledgement.

#### Exact `accounting_findings` fields

| Column                   | PostgreSQL shape                         | Null | Meaning                                                                                                       |
| ------------------------ | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid` PK, UUIDv7                        | No   | Stable identity for this engagement's occurrence of one accounting concern against one target.                |
| `engagement_id`          | `uuid` FK → `firm_client_engagements.id` | No   | Firm-client-service relationship responsible for reviewing the concern.                                       |
| `fiscal_period_id`       | `uuid` FK → `fiscal_calendar.id`         | No   | Monthly period affected by the concern.                                                                       |
| `finding_code`           | `text`                                   | No   | Stable key into the deployed Finding registry.                                                                |
| `target_id`              | `uuid`                                   | No   | Durable domain record at the grain the user reviews; its type is fixed by `finding_code`.                     |
| `condition_state`        | constrained `text`                       | No   | `detected`, `cleared`, or terminal `superseded`. This is evaluator state, not user attention state.           |
| `definition_version`     | `text`                                   | No   | Exact evaluator, material-facts, evidence, resolution-policy, and presentation contract currently applied.    |
| `facts_hash`             | `text`                                   | No   | Server-computed hash of every material fact relevant to the current evaluator conclusion.                     |
| `evidence`               | `jsonb` object                           | No   | Current versioned evaluator evidence and domain references required to explain and resolve the concern.       |
| `state_changed_at`       | `timestamptz`                            | No   | Time `condition_state` last changed.                                                                          |
| `superseded_reason_code` | constrained `text`                       | Yes  | Required only for `superseded`, such as `engagement_transferred`, `definition_retired`, or `target_replaced`. |
| `version`                | positive `integer`                       | No   | Starts at 1 and increments whenever current facts, evidence, definition, state, or supersession changes.      |
| `created_at`             | `timestamptz`                            | No   | First time this engagement-scoped Finding was materialized.                                                   |
| `updated_at`             | `timestamptz`                            | No   | Last authoritative row change.                                                                                |

`finding_code + target_id` is the complete stored subject identity. The registry fixes `targetType`, provides the target adapter/evaluator, defines every material fact included in `facts_hash`, supplies resolution strategies and authorization policies, and owns presentation. A transaction-shaped Finding targets the transaction or entry; a period-wide Finding targets its Fiscal Period; an account-specific Finding may target the account. Supporting records belong in evidence and do not become identity merely because several contributed to detection.

Do not store an opaque `fingerprint`: unlike the existing read-time rollups, a materialized Finding has a real relational identity. `facts_hash` changes when material evidence changes but does not replace the Finding. The server always recomputes it; a client may submit only an expected hash for stale-write detection.

Required constraints and transitions:

- the Fiscal Period is monthly, belongs to the engagement's client, and falls inside the engagement's responsibility range;
- the registered target adapter proves that `target_id` is the required type and belongs to the same client and affected period where applicable;
- `evidence` is a JSON object and contains every human-readable/reference value covered by `facts_hash`;
- `superseded_reason_code` is null for `detected` and `cleared`, and required for `superseded`;
- first detection inserts `detected`; changed material facts update definition/hash/evidence and keep or return the row to `detected`; disappearance of the predicate moves it to `cleared`; reappearance reuses the same non-superseded row; and `superseded` never reopens;
- engagement transfer supersedes the old engagement's Finding and materializes a new receiving-engagement Finding if the current predicate still fires. The deterministic client/period/code/target identity and correlated audit events provide traceability; a Finding predecessor column is unnecessary because Findings cannot split or merge like Packages;
- a resolution never changes `condition_state`: acknowledgement can satisfy a still-detected condition, while an accounting correction moves the condition to `cleared` only after evaluator confirmation.

```sql
CREATE UNIQUE INDEX accounting_findings_one_current_identity_uidx
  ON accounting_findings
    (engagement_id, fiscal_period_id, finding_code, target_id)
  WHERE condition_state <> 'superseded';

CREATE INDEX accounting_findings_period_detected_idx
  ON accounting_findings
    (engagement_id, fiscal_period_id, finding_code, updated_at)
  WHERE condition_state = 'detected';

CREATE INDEX accounting_findings_target_idx
  ON accounting_findings (finding_code, target_id, engagement_id);
```

#### Exact `finding_resolutions` fields

| Column                          | PostgreSQL shape                     | Null | Meaning                                                                                                                                 |
| ------------------------------- | ------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | `uuid` PK, UUIDv7                    | No   | Immutable resolution identity captured by Period Close Versions and audit.                                                              |
| `accounting_finding_id`         | `uuid` FK → `accounting_findings.id` | No   | Finding whose exact facts were addressed.                                                                                               |
| `resolution_number`             | positive `integer`                   | No   | Monotonic sequence within the Finding; later records can replace an earlier decision without mutation.                                  |
| `applies_to_definition_version` | `text`                               | No   | Exact Finding definition reviewed or used to confirm correction.                                                                        |
| `applies_to_facts_hash`         | `text`                               | No   | Exact server-computed material facts reviewed or cleared.                                                                               |
| `resolution_kind`               | constrained `text`                   | No   | `corrected`, `accepted`, or `not_applicable`; there is no generic dismissal.                                                            |
| `strategy_code`                 | `text`                               | No   | Finding-specific registered strategy, such as `recurring_journal_with_end_date`, `verified_opening_balance`, or `documented_exclusion`. |
| `reason`                        | `text`                               | Yes  | Required and nonblank for `accepted` and `not_applicable`; optional for evaluator-confirmed correction.                                 |
| `decided_by_user_id`            | `uuid` FK → `users.id`               | Yes  | Authorized decision maker; required for professional judgement and nullable only for system-confirmed correction.                       |
| `evidence`                      | `jsonb` object                       | No   | Immutable self-describing facts snapshot, supporting domain references, and decision/correction evidence.                               |
| `decided_at`                    | `timestamptz`                        | No   | Time the decision was made or the correction was confirmed.                                                                             |

Resolution rows are append-only: no update or delete is permitted. The resolution command locks the Finding, recomputes its definition version and facts hash, rejects a stale client expectation, validates `strategy_code` against the registered Finding definition and actor capability, captures evidence, allocates the next resolution number, and inserts the row transactionally with audit/outbox effects.

For current detected facts, the effective professional resolution is the highest `resolution_number` whose definition version and facts hash both match and whose kind is `accepted` or `not_applicable`. A `corrected` row records that the evaluator confirmed a historical correction, but it never suppresses the same condition if it is detected again. When material facts or the definition change, prior resolutions remain immutable history but cease to satisfy the Finding. If exactly the same material facts later return within the same Finding occurrence, an earlier professional decision remains applicable; this matches the rule that the user should not repeatedly answer the same period concern.

```sql
CREATE UNIQUE INDEX finding_resolutions_number_uidx
  ON finding_resolutions (accounting_finding_id, resolution_number);

CREATE INDEX finding_resolutions_current_match_idx
  ON finding_resolutions
    (accounting_finding_id, applies_to_definition_version,
     applies_to_facts_hash, resolution_number DESC);
```

#### Derived Finding attention and close interaction

| Current shape                                                           | Derived meaning                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `detected` with no applicable professional resolution                   | `needs_action`; materialize/retain the registered Work Item and block close according to Finding policy. |
| `detected` with an applicable `accepted` or `not_applicable` resolution | `satisfied`; resolve the Work Item while retaining the evaluator concern and reviewed decision.          |
| `cleared`                                                               | `inactive`; resolve the Work Item and retain correction/resolution history.                              |
| `superseded`                                                            | `inactive`; supersede the Work Item and preserve old-engagement or retired-definition history.           |

Do not store attention state, assignee, deadline, Work Item ID, Work Group, firm/client IDs, `period_close_id`, `close_package_id`, current-resolution pointer, title/copy, target type, resolution strategies, approval state, or event history on these tables. They are respectively derived or owned by Work Items, the engagement, registry, monthly close/Package range, Period Close Versions, and centralized audit/activity/outbox domains.

Close submission re-evaluates every applicable Finding, requires no `needs_action` result, and freezes Finding IDs, definition versions, facts hashes, evidence, and exact Resolution IDs in the Period Close Version snapshot. Any material Finding or applicable-resolution change while approval is pending supersedes the undecided submitted Version and returns the Period Close to Preparing.

#### Exact `close_confirmations` fields

| Column                   | PostgreSQL shape               | Null | Meaning                                                                                                                                                             |
| ------------------------ | ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid` PK, UUIDv7              | No   | Stable materialized identity for one required human confirmation.                                                                                                   |
| `period_close_id`        | `uuid` FK → `period_closes.id` | No   | Client-owned monthly Period Close requiring the confirmation; Fiscal Period derives through it and current firm responsibility derives through the current Version. |
| `confirmation_code`      | `text`                         | No   | Stable key into the deployed Close Confirmation registry.                                                                                                           |
| `definition_version`     | `text`                         | No   | Exact applicability, affirmative wording, context, response-policy, authorization, and presentation contract.                                                       |
| `prompt`                 | `text`                         | No   | Exact affirmative statement the user is asked to confirm, preserved so historical responses remain understandable.                                                  |
| `context_hash`           | `text`                         | No   | Server-computed hash of the system-known material context to which a response applies.                                                                              |
| `context_evidence`       | `jsonb` object                 | No   | Versioned context snapshot and domain references explaining what the user was asked to consider.                                                                    |
| `state`                  | constrained `text`             | No   | `required` or terminal `superseded`. Completion is deliberately not stored here.                                                                                    |
| `state_changed_at`       | `timestamptz`                  | No   | Time the requirement state last changed.                                                                                                                            |
| `superseded_reason_code` | constrained `text`             | Yes  | Required only for `superseded`, such as `no_longer_applicable`, `definition_replaced`, or `engagement_transferred`.                                                 |
| `version`                | positive `integer`             | No   | Starts at 1 and increments when current context, state, or supersession changes.                                                                                    |
| `created_at`             | `timestamptz`                  | No   | When the Confirmation was materialized.                                                                                                                             |
| `updated_at`             | `timestamptz`                  | No   | Last authoritative row change.                                                                                                                                      |

The registry determines applicability from accounting basis, client configuration, service policy, and close context. It supplies the affirmative prompt, the system-known context builder, whether `not_applicable` is permitted, response authorization, and presentation guidance. The UI labels the phase **Final checks**; the stored domain identity remains Close Confirmation.

Confirmations materialize when a Period Close enters Preparing, not during Preview. Only applicable definitions create rows. The prompt must be affirmative and unambiguous so `confirmed`, `not_confirmed`, and `not_applicable` have stable meaning. A definition or prompt change supersedes the current row and creates a replacement; it does not rewrite what an earlier user answered. A material context change under the same definition updates `context_hash`, `context_evidence`, and version, making prior responses inapplicable.

Required constraints and transitions:

- `period_close_id` identifies the client and one monthly Fiscal Period, so neither is duplicated on the Confirmation; the context hash includes the review cycle/current Version responsibility so transfer cannot reuse a prior firm's response silently;
- `prompt` and `context_hash` are nonblank, while `context_evidence` is a JSON object containing every system-known value covered by the hash;
- `superseded_reason_code` is null for `required` and mandatory for `superseded`; superseded Confirmations never reactivate;
- reconciliation supersedes Confirmations that are no longer applicable and materializes missing applicable definitions;
- engagement transfer leaves the client-owned Period Close in place but supersedes required Confirmations tied to the old review context; the next Version under the receiving Engagement materializes policy-appropriate replacements;
- reopening changes the Confirmation context even if ledger values return unchanged: the context builder includes the current reopen review cycle, so a response from the earlier closed cycle cannot silently satisfy the reclose;
- ordinary rejection does not automatically invalidate an unchanged response. A response changes only when the preparer answers again or its definition/context changes.

```sql
CREATE UNIQUE INDEX close_confirmations_one_required_code_uidx
  ON close_confirmations (period_close_id, confirmation_code)
  WHERE state = 'required';

CREATE INDEX close_confirmations_required_idx
  ON close_confirmations (period_close_id, confirmation_code, context_hash)
  WHERE state = 'required';
```

#### Exact `close_confirmation_responses` fields

| Column                          | PostgreSQL shape                     | Null | Meaning                                                                                                                                 |
| ------------------------------- | ------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | `uuid` PK, UUIDv7                    | No   | Immutable response identity captured by Period Close Versions and audit.                                                                |
| `close_confirmation_id`         | `uuid` FK → `close_confirmations.id` | No   | Confirmation being answered.                                                                                                            |
| `response_number`               | positive `integer`                   | No   | Monotonic sequence within the Confirmation; a changed answer is another row.                                                            |
| `applies_to_definition_version` | `text`                               | No   | Exact applicability, wording, and response policy answered.                                                                             |
| `applies_to_context_hash`       | `text`                               | No   | Exact system-known material context considered.                                                                                         |
| `answer`                        | constrained `text`                   | No   | `confirmed`, `not_confirmed`, or `not_applicable`.                                                                                      |
| `reason`                        | `text`                               | Yes  | Required and nonblank for `not_confirmed` and `not_applicable`; optional for `confirmed`.                                               |
| `responded_by_user_id`          | `uuid` FK → `users.id`               | No   | Authorized human who made the confirmation; system-generated responses are prohibited.                                                  |
| `evidence`                      | `jsonb` object                       | No   | Immutable copy of the exact Confirmation context reviewed, plus supporting references or explanatory evidence supplied with the answer. |
| `responded_at`                  | `timestamptz`                        | No   | Time the answer was recorded.                                                                                                           |

Responses are append-only: no update or delete is permitted. Response `evidence` must be a JSON object containing the complete `context_evidence` represented by `applies_to_context_hash`, so it remains self-describing after the Confirmation's current context changes. The response command locks the Confirmation, proves it is still required, recomputes definition/context, rejects a stale client expectation, verifies that the actor may respond and that the registry permits `not_applicable` where selected, allocates the next response number, and inserts audit/outbox effects in the same transaction.

The effective response is the highest `response_number` matching both the current `definition_version` and `context_hash`. An older exact-context response can apply again if the system-known context genuinely returns unchanged, but reopening always changes the review cycle and therefore requires a fresh response.

```sql
CREATE UNIQUE INDEX close_confirmation_responses_number_uidx
  ON close_confirmation_responses
    (close_confirmation_id, response_number);

CREATE INDEX close_confirmation_responses_current_match_idx
  ON close_confirmation_responses
    (close_confirmation_id, applies_to_definition_version,
     applies_to_context_hash, response_number DESC);
```

#### Derived Confirmation readiness and close interaction

| Current shape                                      | Derived meaning                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Required with no matching response                 | `needs_response`; its Confirmation Work Item remains open and close is blocked. |
| Required with effective `not_confirmed`            | `needs_action`; reason explains what remains and close stays blocked.           |
| Required with effective `confirmed`                | `satisfied`; resolve the Confirmation Work Item.                                |
| Required with permitted effective `not_applicable` | `satisfied`; resolve the Work Item while preserving the explanation.            |
| Superseded                                         | `inactive`; supersede its Work Item and preserve response history.              |

Package UI may bulk-enter the same answer across several monthly Confirmations with explicit exceptions, but the backend validates and inserts one immutable response per month. Confirmation truth never becomes package-level.

Do not store engagement/Fiscal Period IDs, assignee, due date, Work Item ID, Package ID, completion state, current-response pointer, approval state, registry logic, or event history on these tables. They are respectively derived through the Period Close or owned by Work Items, Package ranges, Period Close Versions, deployed registry, and centralized audit/activity/outbox domains.

Close submission requires every current Confirmation to be `satisfied` and freezes exact Confirmation/Response IDs, definition versions, context hashes, prompts, and evidence in the Period Close Version snapshot. A definition, context, or effective-response change while approval is pending supersedes the undecided submitted Version and returns the Period Close to Preparing.

### Deliberately not separate at launch

| Earlier candidate                                              | Launch treatment                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work-type, Finding, and Confirmation catalog tables            | Versioned code registries. Changes require a deployment anyway; database-configurable workflow logic would add risk without user value. Materialized Finding and Confirmation rows preserve the version actually used.                                                       |
| `work_item_blockers`                                           | Omitted. Users do not manage generic readiness or blocker records. Viewer waiting state is derived from responsibility and authorization; close blocking is stable registry semantics plus underlying domain/close state.                                                    |
| `work_item_dependencies`                                       | Not part of the launch domain. Close blocking uses required indexed `work_items.fiscal_period_id`; orchestration stays in domain commands/producers rather than a generic task DAG.                                                                                          |
| Work/close event tables                                        | Existing append-only `app.audit_events` records complete consequential transitions, `app.activity_events` records selected user-meaningful outcomes, and `app.outbox` delivers downstream effects. Do not create parallel generic event logs.                                |
| `work_item_targets`                                            | Omitted. `work_type_code + target_id` lives directly on `work_items`; registered target adapters are backend code, not rows or separate one-to-one tables.                                                                                                                   |
| `work_item_periods`                                            | Replaced by required `work_items.fiscal_period_id`. Real multi-period objects use their own domain tables rather than turning atomic work into a generic many-to-many period container.                                                                                      |
| `work_groups`                                                  | Omitted. A group is a deterministic projection of open work by `engagement_id + work_type_code`, enriched through the registry.                                                                                                                                              |
| `close_plans`                                                  | Routine close needs no plan record. `close_packages` directly represents the exceptional multi-period catch-up/reclose coordination.                                                                                                                                         |
| `close_package_periods`                                        | Omitted. Packages are constrained to one contiguous monthly range, so membership is derived inclusively from `start_fiscal_period_id` and `end_fiscal_period_id`. Splits supersede the original package and create replacement ranges.                                       |
| `close_package_assignments`                                    | Current package assignee is a field on `close_packages`; assignment changes are audited. Add history only if concurrent multi-person package roles become a real requirement.                                                                                                |
| `close_blocker_exceptions`                                     | Omitted. Work with no legitimate alternative must be fixed; concerns permitting judgement are Findings resolved through correction or evidenced acknowledgement and reviewed as part of the submitted Period Close Version.                                                  |
| `closed_period_impacts`                                        | Omitted. Retroactive facts materialize a specialized Accounting Finding whose resolution strategies include verified opening-balance treatment, documented exclusion, or authorized cascading reopen.                                                                        |
| Separate finding evidence table                                | Evidence references/payload live on each immutable resolution and current evaluator evidence lives on the finding. Move large documents to object storage and retain references.                                                                                             |
| `close_approvals` or separate approval request/decision tables | Omitted. Submission itself creates pending review of one exact frozen Period Close Version, and that Version can receive at most one immutable approval or rejection decision. Staleness is supersession without a decision; a later attempt necessarily uses a new Version. |

### E. Cross-table invariants and enforcement ownership

An invariant is not merely application validation. It must have one named enforcement owner and a test that proves invalid committed states cannot survive. Use the narrowest reliable layer:

- **DB** — foreign keys, composite tenant keys, `CHECK`, unique/partial/exclusion indexes, append-only triggers, and a small number of deferred constraint triggers.
- **Command** — one database transaction with deterministic locks where the rule depends on several current rows, registry code, actor intent, or ordered accounting periods.
- **Authorization** — capability plus authenticated firm scope plus active Engagement responsibility; assignment alone never authorizes.
- **Reconciler** — idempotently restores derived Work/Finding/Confirmation materialization from domain truth and alerts on hard-state corruption. It never invents an approval, silently closes/reopens a Fiscal Period, or repairs authoritative accounting facts by guesswork.

#### Engagement, tenancy, and responsibility

| ID       | Invariant                                                                                                                                                                                                                                                                                 | Enforcement owner                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENG-01` | At most one Firm–Client Engagement is effective for a client and service domain at any instant.                                                                                                                                                                                           | DB exclusion constraint on `[effective_from,effective_to)`.                                                                                                |
| `ENG-02` | Every Engagement child resolves to the same immutable firm, client, and service domain; untrusted firm/client query parameters never establish scope.                                                                                                                                     | DB FK to Engagement; composite same-firm keys where another scoped parent is referenced; Authorization reloads Engagement from its ID.                     |
| `ENG-03` | `first_managed_fiscal_period_id` is monthly, belongs to the Engagement client, contains or follows the Company conversion date, and defines the earliest period the firm may close. It may move only earlier through an accepted, audited scope expansion; it never moves later in place. | Composite DB FK `(first_managed_fiscal_period_id, client_company_id)` to `fiscal_calendar(id, company_id)` plus activation/scope-expansion Command checks. |
| `ENG-04` | Every effective Engagement has exactly one eligible Client Lead and one eligible Primary Bookkeeper at every instant; one person may hold both. A scheduled responsibility withdrawn before its start remains as a zero-length cancelled interval and never counts as coverage.           | DB non-overlap exclusions plus deferred coverage trigger; engagement/assignment Command locks the Engagement before replacing or cancelling intervals.     |
| `ENG-05` | Contributors exist only by explicit grant. Ending any responsibility or firm membership cannot strand assigned open Work.                                                                                                                                                                 | Authorization plus membership/assignment Command; reroute Work in the same transaction or reject.                                                          |
| `ENG-06` | A transfer is accepted before the new Engagement exists; accepted cutover ends the predecessor exactly when the successor begins and never rewrites old ownership.                                                                                                                        | Transfer Command plus DB range exclusion, predecessor FK, and centralized audit.                                                                           |
| `ENG-07` | Default Lead/Bookkeeper memberships belong to the same firm, remain active and capability-eligible, and must be replaced before offboarding or disqualifying role change.                                                                                                                 | Composite DB FKs plus membership/default Command.                                                                                                          |
| `ENG-08` | A bookkeeping client has a confirmed Company conversion date before managed Work/Close activation. Once managed state exists, ordinary Company update paths cannot change it; transfers preserve it.                                                                                      | Engagement activation plus guarded accounting-boundary migration/service.                                                                                  |

#### Atomic Work

| ID       | Invariant                                                                                                                                                        | Enforcement owner                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `WRK-01` | Each Work Item has a registered `work_type_code`; that definition fixes its target type, root semantics, close effect, access policy, presentation, and adapter. | Registry startup validation, producer tests, and Reconciler diagnostics.                                                                       |
| `WRK-02` | The target exists, has the registered type, belongs to the Engagement client, and currently satisfies that Work Type's outstanding predicate.                    | Producer/target-adapter Command; generic FK is intentionally impossible. Reconciler rechecks and alerts on orphan targets.                     |
| `WRK-03` | The required Fiscal Period is monthly, belongs to the Engagement client, and is the period dictated by target facts or the single Close Frontier anchoring rule. | Composite/deferred DB scope check plus producer Command.                                                                                       |
| `WRK-04` | At most one open occurrence exists for `(engagement_id, work_type_code, target_id)`; recurrence after an end creates a new row.                                  | Partial unique DB index plus idempotent upsert/reconcile Command.                                                                              |
| `WRK-05` | Open/resolved/superseded field shapes are internally consistent and ended rows never reactivate.                                                                 | DB `CHECK` constraints and update guard trigger; Command creates a new occurrence.                                                             |
| `WRK-06` | Every Work Item has exactly one eligible assignee. `assignment_basis` explains routing but neither assignment nor visibility grants authority.                   | Routing Command plus Authorization; responsibility-change reconciliation reroutes basis-derived items atomically.                              |
| `WRK-07` | A user domain command changes accounting truth and affected Work synchronously before success is returned; users never directly complete/cancel/reopen Work.     | Owning domain Command in one transaction. Outbox Reconciler is the recovery path for external/worker facts, not the primary user-command path. |
| `WRK-08` | Blocking behavior is stable Work Type semantics, not a per-row mutable flag.                                                                                     | Registry and close-readiness service.                                                                                                          |

#### Monthly close, Versions, and Fiscal Period

| ID       | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                    | Enforcement owner                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CLS-01` | One client-owned Period Close exists per client company and monthly Fiscal Period across every Engagement and reopen cycle. Materialization through an Engagement is allowed only at/after that Engagement's First Managed Period.                                                                                                                                                                                           | DB composite unique/FK plus close-materialization Command.                                                                          |
| `CLS-02` | For the current bookkeeping Engagement, the Close Frontier is the earliest ended, unclosed accepted month. Later months may prepare and ordinary work may continue. Single-period submit/approve applies only to the frontier; the bounded exception is an active Package beginning at the frontier, whose fully ready range may submit as one unit and whose approval closes its months chronologically in one transaction. | Derived ordered query plus period/Package submit and approve Commands under a client close-sequence lock.                           |
| `CLS-03` | Preview may have no Version; Preparing has one current draft under the current Engagement; Awaiting Approval has one current submitted undecided Version under that Engagement; Closed has one current submitted approved Version and a closed/locked Fiscal Period. A closed Version may belong to a predecessor Engagement until reopen.                                                                                   | Partial unique index plus deferred `period_close_alignment` constraint trigger and transition Commands.                             |
| `CLS-04` | A Version number is monotonic within one Period Close and only one Version is current. Submitted snapshot fields are all present and immutable.                                                                                                                                                                                                                                                                              | DB unique/partial indexes, `CHECK`, and immutability trigger; parent Close row is locked while allocating the number.               |
| `CLS-05` | Submission is impossible before period end, before every prior managed month is closed, or while blocking Work, an unsatisfied Finding, or an unsatisfied Confirmation exists.                                                                                                                                                                                                                                               | Submit Command re-evaluates under locks; no cached readiness boolean is trusted.                                                    |
| `CLS-06` | Submission freezes the exact ledger/trial-balance version, Work readiness result, Findings/Resolutions, Confirmations/Responses, warnings, and package context reviewed.                                                                                                                                                                                                                                                     | Submit Command writes the immutable Version snapshot/hash and audit event transactionally.                                          |
| `CLS-07` | A submitted Version receives at most one immutable decision. Rejection requires a reason and atomically supersedes it; staleness supersedes it with no decision.                                                                                                                                                                                                                                                             | Version `CHECK`/immutability trigger plus reject/stale Commands.                                                                    |
| `CLS-08` | Approval is made by the current eligible Client Lead against the exact still-current snapshot. It closes both Period Close and Fiscal Period atomically; same-person completion remains allowed only when the actor currently holds both responsibilities.                                                                                                                                                                   | Authorization plus approve/review-and-close Command.                                                                                |
| `CLS-09` | Any material fact, effective Finding resolution, or Confirmation response/context change while review is pending supersedes the undecided Version, creates the next draft, returns the Close to Preparing, and resolves/reroutes approval Work.                                                                                                                                                                              | Owning accounting/finding/confirmation Command calls the close-staleness primitive in the same transaction; Reconciler is recovery. |
| `CLS-10` | Fiscal Period `closed/locked` mutation for managed months cannot bypass Period Close. Existing direct close/reopen functions become internal primitives.                                                                                                                                                                                                                                                                     | Service boundary, module tests, and deferred alignment trigger.                                                                     |
| `CLS-11` | A locked Fiscal Period cannot be reopened by normal commands. Reopening requires reason and authority and cascades client-wide through every later closed month; the current Engagement must first accept responsibility back to the selected month.                                                                                                                                                                         | Authorization plus client-scoped cascading-reopen Command locking periods chronologically.                                          |
| `CLS-12` | Reopening across Engagement boundaries preserves prior approved Versions, decisions, firm attribution, evidence, responses, and audit; it supersedes them where necessary and creates new monthly draft Versions under the current Engagement with fresh Confirmation review context.                                                                                                                                        | Cascading-reopen Command plus Version Engagement FK and append-only/immutability guards.                                            |
| `CLS-13` | An unfinished current Version belongs to the current responsible Engagement. Transfer supersedes an unfinished predecessor Version and creates the next Version on the same Period Close; a closed predecessor Version remains current until reopen.                                                                                                                                                                         | Transfer Command plus Version/Engagement scope checks.                                                                              |
| `CLS-14` | At most one Reopen Request is pending per client. Request/rejection never resolves any covered retroactive Finding; approval requires a current request version and impact hash, rejects any locked month, and performs the full cascade atomically.                                                                                                                                                                              | Partial unique index plus request/review/cascade Commands.                                                                          |

#### Findings and Confirmations

| ID       | Invariant                                                                                                                                                                                                                                                                             | Enforcement owner                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `FND-01` | A non-superseded Finding is unique by Engagement, monthly period, registered Finding code, and target; target and period belong to the Engagement client.                                                                                                                             | Partial unique/composite DB checks plus Finding adapter/evaluator. |
| `FND-02` | Finding condition state is evaluator truth. A Resolution never directly clears it; correction becomes cleared only when re-evaluation proves the predicate disappeared.                                                                                                               | Finding reconciliation Command.                                    |
| `FND-03` | Resolutions are append-only, monotonically numbered, and apply only to an exact definition version and facts hash. `accepted/not_applicable` require an authorized human and reason.                                                                                                  | DB append-only trigger/unique/`CHECK` plus resolution Command.     |
| `FND-04` | A current detected Finding is close-satisfied only by a matching permitted professional Resolution; `corrected` history alone never suppresses re-detection. Registered retroactive-impact Findings from earlier closed periods also block the current Close Frontier until resolved. | Close-readiness query and Finding registry policy.                 |
| `CNF-01` | At most one required Confirmation exists per Period Close and code. Its prompt, definition, context hash, and context evidence agree.                                                                                                                                                 | Partial unique/`CHECK` plus Confirmation reconciler.               |
| `CNF-02` | Confirmation Responses are append-only, monotonically numbered, human-authored, and apply to the exact current definition/context.                                                                                                                                                    | DB append-only trigger/unique/`CHECK` plus response Command.       |
| `CNF-03` | A required Confirmation is satisfied only by the highest exact-context permitted `confirmed` or `not_applicable` response; `not_confirmed` remains blocking.                                                                                                                          | Close-readiness query and Confirmation registry policy.            |
| `CNF-04` | Reopening always changes Confirmation review-cycle context even when ledger facts are identical; ordinary rejection alone does not invalidate unchanged responses.                                                                                                                    | Reopen and Confirmation context builders.                          |

#### Packages, history, and delivery

| ID       | Invariant                                                                                                                                                                                                                                                                                                          | Enforcement owner                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PKG-01` | A Package covers 1–12 contiguous ended monthly periods for one bookkeeping Engagement, within its managed range, whose Fiscal Periods are open at acceptance; start and end are inclusive. Missing historical closes materialize directly in Preparing.                                                            | Package Command using ordered `fiscal_calendar`; DB boundary FKs/checks.                                                                                   |
| `PKG-02` | Active Package ranges for one Engagement never overlap.                                                                                                                                                                                                                                                            | Engagement-scoped advisory/row lock plus overlap query; a UUID boundary pair cannot express a reliable exclusion range without duplicating calendar dates. |
| `PKG-03` | Package phase/progress/approval is derived from monthly closes and Versions. Packages never replace or rewrite monthly truth.                                                                                                                                                                                      | Query projection and Package Commands.                                                                                                                     |
| `PKG-04` | Later Packages may prepare concurrently but cannot submit or approve until every managed month before that Package's start is closed. Within the frontier Package, all included ready Versions may submit together and are approved/closed chronologically in one transaction.                                     | Submit/approve Package Command under the Engagement close lock.                                                                                            |
| `PKG-05` | Package submission/approval is all-or-nothing and closes included monthly Versions chronologically. While a Package is active, its months cannot use ordinary single-period submit/approve commands; a clean prefix must be split before it proceeds separately.                                                   | Submit/approve Commands check active derived Package membership under the Engagement close lock; one Package transaction rolls back on any month failure.  |
| `PKG-06` | Package assignee is one eligible engagement team member. Reassignment does not silently reassign included Work Items.                                                                                                                                                                                              | Assignment Command and Authorization.                                                                                                                      |
| `PKG-07` | Split/transfer/scope replacement ends the old Package and creates immutable non-overlapping replacements pointing to their immediate predecessor; lineage is acyclic.                                                                                                                                              | Package Command, self-FK, and lineage validation.                                                                                                          |
| `PKG-08` | Package assignment is preparation accountability, not close authority. The current Primary Bookkeeper submits and current Client Lead approves; the same-person shortcut requires both current responsibilities.                                                                                                   | Authorization in Package submit/approve/review-and-close Commands.                                                                                         |
| `PKG-09` | While a Package is active, its `due_at` is the effective operational deadline for every covered open Period Close and Work Item. Queue ordering, overdue counts, attention, and copy read the persisted copies; old routine deadlines do not create separate overdue months.                                       | Package Commands plus reconciliation under range/period locks; versioned Work/Close updates and audit.                                                     |
| `PKG-10` | Every Package/replacement has an explicit deadline. Deadline change requires Client Lead or `manage_close_packages`, expected version, and nonblank reason; reassignment cannot change it. An active Package with open months can end only through complete coverage by explicit replacements or range completion. | Package deadline/split/transfer Commands and authorization.                                                                                                |
| `HIS-01` | Durable domain rows are never hard-deleted in normal operation. Resolutions, responses, submitted Version content, and approval decisions are append-only/immutable; other lifecycle rows end or supersede.                                                                                                        | DB FK `RESTRICT`, guard triggers, and repository API.                                                                                                      |
| `HIS-02` | Every consequential command writes `audit_events` in the same transaction with the client company as scope and one shared `commandId` carried through existing correlation storage; asynchronous side effects use `outbox`.                                                                                        | Command transaction and audit/outbox integration tests.                                                                                                    |
| `HIS-03` | `activity_events`, notifications, queue groups, counts, overdue state, readiness, frontier, and package phase are projections and can be rebuilt without audit replay.                                                                                                                                             | Read/reconciliation services; schema review forbids them as write-model columns.                                                                           |

Only the small set of invariants whose violation would leave contradictory authoritative rows should use deferred constraint triggers: Engagement responsibility coverage, Work/Period client scope, and Period Close/Version/Fiscal Period alignment. Registry-dependent business policy belongs in Commands, where deployed code and authorization are available.

### F. Transactional command and concurrency model

#### Common command protocol

All state-changing service methods accept an existing Knex transaction and never open a nested independent transaction. The public command wrapper starts the transaction, reloads authorization scope, invokes domain primitives, writes audit/outbox rows, and commits before returning queue deltas.

1. Derive the firm from the authenticated session; never trust a body/query `firm_company_id`.
2. Load the Engagement through that firm and derive the client/service scope.
3. Acquire the appropriate transaction-scoped advisory lock, then lock relational rows in the global order below.
4. Re-authorize the exact command using current membership, capability, Engagement responsibility, and target scope.
5. Compare expected mutable-row `version`, submitted `content_hash`, Finding `facts_hash`, or Confirmation `context_hash`; stale expectations fail with a conflict and no partial mutation.
6. Recompute authoritative predicates inside the transaction. Queue/readiness values supplied by the frontend are never trusted.
7. Apply domain, Work, close, audit, and outbox changes together. Do not call external services while locks are held.
8. Commit, then return authoritative changed entities/group keys and refetch hints. A successful accounting response never asks the browser to pretend a row resolved before commit.

Normal isolation may remain PostgreSQL `READ COMMITTED` because advisory/row locks, unique/exclusion constraints, and expected-version updates serialize contested aggregates. Use a bounded lock timeout for interactive commands and return a retryable conflict; background reconcilers may defer and retry through the existing outbox. Do not silently continue after failing to acquire a correctness lock.

#### Lock namespaces and global order

Use the existing transaction-level advisory-lock utility with namespaced deterministic keys:

1. `client_service:{client_company_id}:{service_domain_code}` — Engagement activation/transfer/cutover serialization.
2. `client_close_sequence:{client_company_id}` — client-owned Close Frontier, transfer of unfinished Versions, Package range, package submit/approve, Reopen Requests, and cascading reopen serialization across Engagement boundaries.
3. `client_period:{client_company_id}:{fiscal_period_id}` — per-month accounting, Period Close, Confirmation, submission staleness, and cross-engagement reopen correctness. Engagement-scoped Finding/Work reconciliation may take its narrower registered producer key after this lock.
4. registered producer/materializer scope — idempotent target reconciliation, reusing the existing Accountable Books advisory-lock pattern.

When several same-namespace keys are required, sort by client Fiscal Period `start_date`, then UUID. After advisory locks, row locks are always taken in this order:

1. Engagements, then Engagement team/default memberships;
2. Fiscal Periods in chronological order;
3. Period Closes in the same order;
4. current Period Close Versions;
5. Packages by range start then ID;
6. accounting domain targets, Findings, Confirmations, and their current matching histories in stable target/ID order;
7. Work Items by ID;
8. insert-only audit and outbox rows last.

An ordinary accounting command needs only its client-period and producer locks; it does not take the client-wide close-sequence lock unless it must change sequence structure. Package, transfer-of-unfinished-close, Reopen Request, and reopen commands acquire the client sequence lock and then every affected period lock chronologically. This preserves parallel preparation across different clients and periods while allowing one cascade to cross historical Engagement attribution safely.

#### Command matrix

| Command                              | Required authorization and locked truth                                                                                                                                                                         | Atomic outcome                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activateEngagement`                 | Accepted intake/transfer; lock client-service key, Company conversion boundary, selected/default memberships, predecessor when present, first managed period.                                                   | Establish or confirm conversion for initial onboarding, insert Engagement and gap-free Lead/Bookkeeper assignments, insert accepted ended-month intake Packages where applicable, end predecessor at cutover for transfer, and write audit/outbox. A transfer never rewrites Company conversion. Activation fails rather than creating incomplete responsibility.                                                               |
| `extendEngagementManagedBoundary`    | Client Lead/Firm Admin with accepted expanded scope; lock client-service, client close sequence, old/new boundary periods, affected prior responsibility, and Package ranges.                                   | Move `first_managed_fiscal_period_id` only earlier, increment Engagement version, create accepted ended-month Packages and missing client-owned Preparing closes/Engagement-attributed Versions, and audit the amendment. Reject conversion violations, locked/closed responsibility conflicts, overlap, or any attempt to move the boundary later in place.                                                                    |
| `replaceEngagementResponsibility`    | Client Lead or Firm Admin with team-management capability; lock Engagement, old/new memberships, assignments, affected open Work and active Packages.                                                           | End old interval and start eligible replacement at one instant; reroute basis-derived Work and pending approval Work; require explicit Package reassignment and reroute any stranded explicit Work before offboarding. Cancelling a not-yet-started replacement writes a zero-length cancelled interval and restores/retains required coverage in the same transaction.                                                         |
| `grantContributorAndAssignWork`      | Client Lead/Firm Admin; selected membership role-eligible; lock Engagement, membership, Work.                                                                                                                   | Optionally insert Contributor interval and assign the exact open Work in one explicit transaction. Merely assigning never silently creates access.                                                                                                                                                                                                                                                                              |
| `applyAccountingCommand`             | Capability for the underlying accounting action and authorized client target; lock period, domain targets, related close state, and Work.                                                                       | Mutate accounting truth, re-evaluate directly affected Findings/Confirmations, resolve/reanchor/reroute affected Work, stale any materially affected submitted Version, and write audit/outbox before returning. Bulk callers run one transaction per independent accounting unit.                                                                                                                                              |
| `resolveLateClosedPeriodTransaction` | Authorized accounting actor; lock bank transaction, affected closed-period Finding, selected open posting period or safe match target, related Work, and current close state.                                   | Either match without changing closed-period accounting, or preserve bank date and post using a validated open `fs_date`; audit both dates/evidence, re-evaluate the Finding, and reconcile Work atomically. It never writes ordinary categorization into a closed/locked period.                                                                                                                                                |
| `reconcileWorkScope`                 | System producer only; lock registered materializer scope and affected Work.                                                                                                                                     | Derive desired occurrences solely from current targets, insert missing open Work, update due/period/assignee when semantics permit, and end obsolete Work idempotently. Unknown code/target/scope becomes an operational alert, never arbitrary Work.                                                                                                                                                                           |
| `openClosePreview`                   | Scheduler/system; resolve current Engagement, then lock client-period and Fiscal Period.                                                                                                                        | Idempotently insert the client-owned Period Close five configured business days before period end with persisted due time; no Version/Confirmation is created.                                                                                                                                                                                                                                                                  |
| `beginClosePreparation`              | Scheduler/system after period end; resolve current Engagement and lock client-period, Fiscal Period, and Period Close.                                                                                          | Advance Preview to Preparing, create the next/initial Version under the current Engagement, materialize period-dependent Findings and applicable Confirmations, reconcile close Work, and emit audit/outbox. Recovery sweeps perform the same idempotent command.                                                                                                                                                               |
| `resolveFinding`                     | Registered strategy authorization; lock period, Finding, current Version if submitted, and its Work.                                                                                                            | Recompute definition/facts, insert one immutable Resolution, perform linked accounting correction where selected, re-evaluate the Finding, update Work, and stale pending review if material—all in one transaction.                                                                                                                                                                                                            |
| `respondToConfirmation`              | Registry-authorized human; lock period, Confirmation, current Version if submitted, and Work.                                                                                                                   | Validate exact definition/context, insert one immutable Response, update Work, and stale pending review if the effective response/context materially changes.                                                                                                                                                                                                                                                                   |
| `submitPeriodClose`                  | Current eligible Primary Bookkeeper; lock close sequence, target period, prior managed period, Close, Version, active Package membership, readiness rows, and approval Work identity.                           | Reject a period covered by an active Package. Otherwise prove frontier/readiness, freeze snapshot/hash and submission actor/time, set Close to Awaiting Approval, and create `approve_period_close` Work targeting the submitted Version for the current Client Lead.                                                                                                                                                           |
| `reviewAndClosePeriod`               | Same actor currently holds eligible Primary Bookkeeper and Client Lead responsibilities; lock active Package membership too.                                                                                    | Reject a period covered by an active Package. Otherwise run submission and approval validation in one transaction; freeze and approve the Version, close Fiscal Period and Period Close, create no self-addressed approval Work, and emit separate submit/approve audit events with one `commandId`.                                                                                                                            |
| `approvePeriodClose`                 | Current eligible Client Lead; lock sequence, period, Close, current submitted Version, active Package membership, readiness evidence, and approval Work.                                                        | Reject a period covered by an active Package. Otherwise recompute snapshot currency and frontier, record the immutable approval decision, close Fiscal Period and Period Close, resolve approval Work, and advance/reconcile the next frontier atomically.                                                                                                                                                                      |
| `rejectPeriodClose`                  | Current eligible Client Lead; nonblank reason; lock period, Close, current submitted Version, approval and preparation Work.                                                                                    | Record rejection, supersede the Version, create the next draft Version, return Close to Preparing, resolve approval Work, and route preparation Work. Unchanged Finding resolutions and Confirmation responses remain applicable.                                                                                                                                                                                               |
| `staleSubmittedClose`                | Internal primitive invoked by the material accounting/Finding/Confirmation command.                                                                                                                             | Supersede the undecided Version without a decision, create the next draft, return Close to Preparing, and resolve/reroute approval/preparation Work in the same outer transaction.                                                                                                                                                                                                                                              |
| `createOrSplitClosePackage`          | Client Lead or `manage_close_packages`; explicit due date for every created/replacement Package; lock close sequence, boundaries, included closes/Work, overlapping active Packages, selected assignee.         | Validate an accepted range of 1–12 ended monthly periods and its chronology. Preserve existing monthly state and create any missing historical Close directly in Preparing, or supersede the original and insert non-overlapping replacements with immediate-predecessor lineage. Set each covered open Close/Work deadline to its Package deadline, increment versions, audit changes, and reject many-to-one Package lineage. |
| `changeClosePackageDeadline`         | Client Lead or `manage_close_packages`; expected Package version, new deadline, and nonblank reason; lock Package, range, covered open Closes and Work.                                                         | Update Package and every covered open Close/Work `due_at` atomically, increment their versions, write old/new deadline plus reason to audit, and invalidate queue/close projections.                                                                                                                                                                                                                                            |
| `reassignClosePackage`               | Client Lead or package-management capability; new assignee is eligible.                                                                                                                                         | Change Package assignee and audit it. Included Work Items change only when the command receives and validates an explicit rerouting choice; Package and covered-row deadlines remain unchanged.                                                                                                                                                                                                                                 |
| `submitClosePackage`                 | Current eligible Primary Bookkeeper; lock sequence, Package, and every included month chronologically.                                                                                                          | Require all earlier managed months closed and every included month ready; freeze each current monthly Version and create/reroute one approval Work occurrence per Version under one `commandId`. Package remains active.                                                                                                                                                                                                        |
| `approveClosePackage`                | Current eligible Client Lead; lock sequence, Package, and every included month chronologically.                                                                                                                 | Revalidate every Version first, then approve and close all months in one transaction and mark Package completed. Any failure rolls back the entire approval.                                                                                                                                                                                                                                                                    |
| `reviewAndClosePackage`              | Same actor currently holds eligible Primary Bookkeeper and Client Lead responsibilities; lock sequence, Package, and every included month chronologically.                                                      | Run Package submission and approval validations atomically, freeze and approve every included Version, close months chronologically, complete the Package, create no self-addressed approval Work, and emit separate correlated submit/approve audit actions.                                                                                                                                                                   |
| `requestPeriodReopen`                | Authorized actor who may resolve the initiating concern but lacks reopen authority; nonblank reason; lock client sequence, current Engagement, affected periods, pending request, covered Findings, and Work.    | Reject locked/out-of-scope ranges; create or widen/refresh the client's one pending Reopen Request and impact hash, keep every covered retroactive Finding unresolved/waiting, and create one `review_period_reopen_request` Work occurrence for the current Client Lead using the frontier deadline.                                                                                                                              |
| `rejectPeriodReopenRequest`          | Current Client Lead or authorized reopen reviewer; expected request version/impact hash and nonblank note; lock client sequence, request, covered Findings, and Work identities.                                | Recompute and require the exact reviewed impact, record immutable rejection, resolve review Work, keep every covered Finding detected, and return each Work occurrence to its current eligible bookkeeper with the note and open-period/safe-match actions.                                                                                                                                                                      |
| `approvePeriodReopenRequest`         | Current Client Lead or authorized reopen reviewer; expected request version and impact hash; same locks as cascade.                                                                                            | Recompute and require the exact reviewed impact, mark the request approved, and run `cascadeReopenPeriods` in the same transaction. No approval is recorded if the cascade fails.                                                                                                                                                                                                                                                |
| `cascadeReopenPeriods`               | Client Lead, Firm Admin, or explicit reopen capability; nonblank reason; lock client sequence and selected through latest closed month chronologically.                                                         | Require current Engagement scope back to the selected month and reject if any affected month is locked; reopen Fiscal Periods, supersede approved Versions without changing their Engagement/evidence, create new drafts under the current Engagement, return the same client-owned Closes to Preparing, reconcile Work/Findings/Confirmations, and audit the whole impact. Create a reclose Package only when accepted.        |
| `transferEngagement`                 | Accepted receiving firm plus required authority on both platform-mediated sides; lock client-service/client-close keys, old/new Engagement scope, all unfinished Work/Versions/Packages in deterministic order. | End old Engagement/team intervals, supersede unfinished old Work/Findings/Confirmations/Versions, pending Reopen Requests, and active Packages; keep company-owned Period Closes and closed Versions; create the receiving Engagement/team and any accepted replacement Package lineage, then materialize new Versions/Work state from current client facts. Historical ownership is never updated in place.                    |

#### Bulk semantics

- Independent accounting units use bounded concurrency and one transaction per unit. The response reports `succeeded`, `failed`, and authoritative deltas per target; one bad transaction does not roll back unrelated successful transactions.
- Bulk Confirmation responses still insert and validate one immutable monthly Response per Confirmation. They may partially succeed because the monthly obligations are independent; close submission remains blocked until every required month is satisfied.
- Package approval is the deliberate exception: it is one all-or-nothing transaction because the user approved a bounded package as a unit. Split a clean prefix before submission when partial progress is desired.
- Commands require expected versions/hashes and one logical `commandId`. The command/concurrency contract defines retry/result envelopes: `commandId` is propagated through existing correlation infrastructure but is not a generic stored-response idempotency key, and no workflow-run, receipt, or command-log table is introduced.

#### Audit, activity, and outbox contract

Use `audit_events.company_id = client_company_id`; entity types include `firm_client_engagement`, `engagement_team_assignment`, `work_item`, `period_close`, `period_close_version`, `period_reopen_request`, `close_package`, `accounting_finding`, `finding_resolution`, `close_confirmation`, and `close_confirmation_response`. Representative actions include `period_close.submitted`, `period_close.approved`, `period_close.rejected`, `period_close.review_staled`, `period_close.reopened`, `period_reopen.requested`, `period_reopen.approved`, `period_reopen.rejected`, `engagement.transferred`, and `close_package.split`.

One human command uses one `commandId` across all entity events and outbox intents, stored in existing `correlation_id` infrastructure fields where required. `activity_events` is produced only for curated user-facing outcomes and may summarize bulk changes. Outbox scopes are deterministic and debounced—for example `work_reconcile:{engagement_id}:{period_id}:{producer_code}` and `queue_invalidate:{firm_company_id}`—so a retry never creates a second authoritative domain decision.

### G. Index and representative-query proof

#### Index sufficiency review

| Read/write path                                  | Supporting index                                                                              | Decision                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firm-scoped active portfolio                     | `firm_client_engagements_firm_effective_idx` plus Engagement range constraint                 | Filters by authenticated firm/service first; effective end is checked after the selective prefix.                                                         |
| Current viewer responsibility                    | team-assignment exclusion indexes plus `engagement_team_assignments_*_current_idx`            | Open-ended assignments are the common fast path; scheduled replacements remain supported by effective-range indexes.                                      |
| Queue groups for a portfolio                     | `work_items_engagement_group_idx`                                                             | Exact grouping prefix is `(engagement_id, work_type_code)` and includes due order.                                                                        |
| Personal assigned queue/approval work            | `work_items_assignee_queue_idx`                                                               | One index supports assignee, due order, and engagement. Approval uses ordinary Work targeting a Period Close Version.                                     |
| Close blocking Work                              | `work_items_period_close_idx`                                                                 | Exact equality prefix is Engagement + Fiscal Period; registry supplies the bounded blocking-code set.                                                     |
| Work producer idempotency                        | `work_items_one_open_target_uidx`                                                             | Prevents duplicate current occurrences while preserving ended history.                                                                                    |
| One monthly close and current attention          | `period_closes_client_period_uidx`, `period_closes_active_due_idx`                            | No stored frontier index is needed; the active Engagement selects its accepted client periods and current Versions, while due order follows period order. |
| Current/historical Close Version                 | `period_close_versions_one_current_uidx`, `period_close_versions_history_idx`                 | Current join is one indexed lookup; history is ordered without a pointer on Period Close.                                                                 |
| Active Packages by Engagement/assignee           | `close_packages_engagement_active_idx`, `close_packages_assignee_active_idx`                  | Overlap is serialized and validated after resolving UUID boundaries to ordered Fiscal Period dates.                                                       |
| Detected Findings and exact Resolution           | `accounting_findings_period_detected_idx`, `finding_resolutions_current_match_idx`            | Supports close readiness without a stored current-resolution pointer.                                                                                     |
| Required Confirmations and latest exact Response | `close_confirmations_required_idx`, `close_confirmation_responses_current_match_idx`          | Supports readiness without stored completion/current-response state.                                                                                      |
| Reopen review                                    | `period_reopen_requests_one_pending_client_uidx`, engagement queue and period-history indexes | Enforces one pending client decision and supports Client Lead Work/history.                                                                               |
| Transfer/split lineage                           | predecessor/superseded-by partial indexes                                                     | Only add indexes for lineage FKs actually traversed or protected during parent updates.                                                                   |

Add the following small history/lineage indexes omitted from the table-local sections:

```sql
CREATE INDEX work_items_superseded_by_idx
  ON work_items (superseded_by_work_item_id)
  WHERE superseded_by_work_item_id IS NOT NULL;

CREATE INDEX accounting_findings_period_history_idx
  ON accounting_findings
    (engagement_id, fiscal_period_id, finding_code, created_at DESC);

CREATE INDEX close_confirmations_period_history_idx
  ON close_confirmations
    (period_close_id, confirmation_code, created_at DESC);
```

Do not add standalone indexes for every actor/timestamp FK pre-emptively. Accountable Books soft-disables users instead of physically deleting history, and operational reads begin from Engagement/period/domain identity. Add an actor-centric index only when a measured audit or compliance query needs it. Likewise, do not duplicate existing `fiscal_calendar_company_type_start_idx` or its composite `(id, company_id)` unique key; Package range expansion and client-scope FKs reuse them.

#### Representative query 1: one firm/viewer queue-group read

The query service resolves and authorizes `:effective_scope` before running this query. Whole-firm visibility is active only when that resolved scope is `firm_oversight`; being a Firm Admin makes the scope available but does not silently replace an explicitly requested/default portfolio view. Client Lead/Primary Bookkeeper see relevant client Work in portfolio scope; Contributors see only directly assigned Work. Optional client filters are applied only after this authorized set.

```sql
WITH viewer_portfolio AS (
  SELECT
    e.id AS engagement_id,
    e.client_company_id,
    e.first_managed_fiscal_period_id,
    (:effective_scope = 'firm_oversight')
      OR bool_or(
        membership.id IS NOT NULL
        AND eta.responsibility_code IN ('client_lead', 'primary_bookkeeper')
      )
      AS can_see_all_client_work
  FROM firm_client_engagements e
  LEFT JOIN engagement_team_assignments eta
    ON eta.engagement_id = e.id
   AND eta.effective_from <= :as_of
   AND (eta.effective_to IS NULL OR eta.effective_to > :as_of)
  LEFT JOIN user_company_roles membership
    ON membership.id = eta.firm_membership_id
   AND membership.user_id = :viewer_user_id
   AND membership.company_id = :firm_company_id
   AND membership.is_deleted = false
  WHERE e.firm_company_id = :firm_company_id
    AND e.service_domain_code = 'bookkeeping'
    AND e.effective_from <= :as_of
    AND (e.effective_to IS NULL OR e.effective_to > :as_of)
  GROUP BY e.id, e.client_company_id, e.first_managed_fiscal_period_id
  HAVING (:effective_scope = 'firm_oversight') OR bool_or(membership.id IS NOT NULL)
)
SELECT
  w.engagement_id,
  vp.client_company_id,
  w.work_type_code,
  count(*) AS total_count,
  min(w.due_at) AS earliest_due_at,
  count(*) FILTER (WHERE w.due_at < :as_of) AS overdue_count
FROM viewer_portfolio vp
JOIN work_items w ON w.engagement_id = vp.engagement_id
WHERE w.state = 'open'
  AND (vp.can_see_all_client_work OR w.assignee_user_id = :viewer_user_id)
  AND w.work_type_code = ANY(:ordinary_surface_codes)
GROUP BY w.engagement_id, vp.client_company_id, w.work_type_code
ORDER BY min(w.due_at), vp.client_company_id, w.work_type_code;
```

The registry enriches these rows with titles, summaries, workspace, bulk support, and viewer-authorized actions. It may batch-compute actionable/waiting subsets when those require target state; the SQL never stores presentation copy or viewer permissions.

#### Representative query 2: one close row per authorized client

Reuse `viewer_portfolio`. Firm Admin, Client Lead, and Primary Bookkeeper select the client's earliest actionable unclosed month; if none exists, they select the earliest Preview as upcoming. A Contributor's candidate set is first restricted to months inside an active Package assigned to them or months carrying their assigned close-surface Work, then the same earliest-row rule applies. This prevents assignment to a later Package from exposing the client's unrelated overall frontier.

```sql
SELECT
  vp.engagement_id,
  vp.client_company_id,
  selected.period_close_id,
  selected.fiscal_period_id,
  selected.close_state,
  selected.start_date,
  selected.end_date,
  selected.due_at,
  reopen_request.period_reopen_request_id,
  reopen_request.review_work_item_id,
  reopen_request.review_due_at
FROM viewer_portfolio vp
JOIN fiscal_calendar managed_start
  ON managed_start.id = vp.first_managed_fiscal_period_id
LEFT JOIN LATERAL (
  SELECT
    pc.id AS period_close_id,
    pc.fiscal_period_id,
    pc.state AS close_state,
    fp.start_date,
    fp.end_date,
    pc.due_at
  FROM period_closes pc
  JOIN fiscal_calendar fp ON fp.id = pc.fiscal_period_id
  LEFT JOIN period_close_versions pcv
    ON pcv.period_close_id = pc.id
   AND pcv.superseded_at IS NULL
  WHERE pc.client_company_id = vp.client_company_id
    AND pc.state IN ('preview', 'preparing', 'awaiting_approval')
    AND fp.start_date >= managed_start.start_date
    AND (pc.state = 'preview' OR pcv.engagement_id = vp.engagement_id)
    AND (
      vp.can_see_all_client_work
      OR EXISTS (
        SELECT 1
        FROM close_packages p
        JOIN fiscal_calendar package_start
          ON package_start.id = p.start_fiscal_period_id
        JOIN fiscal_calendar package_end
          ON package_end.id = p.end_fiscal_period_id
        WHERE p.engagement_id = vp.engagement_id
          AND p.state = 'active'
          AND p.assignee_user_id = :viewer_user_id
          AND fp.start_date BETWEEN package_start.start_date
                                AND package_end.start_date
      )
      OR EXISTS (
        SELECT 1
        FROM work_items w
        WHERE w.engagement_id = vp.engagement_id
          AND w.fiscal_period_id = pc.fiscal_period_id
          AND w.state = 'open'
          AND w.assignee_user_id = :viewer_user_id
          AND w.work_type_code = ANY(:close_surface_codes)
      )
    )
  ORDER BY
    CASE WHEN pc.state IN ('preparing', 'awaiting_approval') THEN 0 ELSE 1 END,
    fp.start_date,
    pc.id
  LIMIT 1
) selected ON true
LEFT JOIN LATERAL (
  SELECT
    r.id AS period_reopen_request_id,
    w.id AS review_work_item_id,
    w.due_at AS review_due_at
  FROM period_reopen_requests r
  JOIN work_items w
    ON w.engagement_id = r.engagement_id
   AND w.work_type_code = 'review_period_reopen_request'
   AND w.target_id = r.id
   AND w.state = 'open'
  WHERE r.engagement_id = vp.engagement_id
    AND r.client_company_id = vp.client_company_id
    AND r.state = 'pending'
    AND (
      vp.can_see_all_client_work
      OR w.assignee_user_id = :viewer_user_id
      OR r.requested_by_user_id = :viewer_user_id
    )
  LIMIT 1
) reopen_request ON true
WHERE selected.period_close_id IS NOT NULL
   OR reopen_request.period_reopen_request_id IS NOT NULL;
```

The authorized Engagement/client portfolio is the driving relation, not `period_closes`, because a Reopen Request can arrive early in the month before Preview exists. In that case the projection returns one request-only Close row with a null frontier; it never materializes a fake Period Close. Backlog count, active Package, assignee relevance, blocking counts, and upcoming-close copy are set-based lateral/CTE enrichments in the queue projection ticket. They do not change the authoritative one-row-per-client selection.

#### Representative query 3: authoritative readiness for one Close Frontier

The submit command calls one Close-readiness module and runs equivalent predicates after taking its locks. `:blocking_work_codes` and `:frontier_blocking_retroactive_finding_codes` come from the deployed registries. Current-period Work and Findings are evaluated together with registered unresolved retroactive Findings from earlier client periods; controllers and callers never special-case a particular Finding code. Confirmation readiness uses the latest exact-context response, so a later `not_confirmed` correctly overrides an earlier confirmation.

```sql
WITH blocking_work AS (
  SELECT count(*) AS count
  FROM work_items w
  WHERE w.engagement_id = :engagement_id
    AND w.fiscal_period_id = :fiscal_period_id
    AND w.state = 'open'
    AND w.work_type_code = ANY(:blocking_work_codes)
), unsatisfied_findings AS (
  SELECT count(*) AS count
  FROM accounting_findings f
  JOIN fiscal_calendar finding_period
    ON finding_period.id = f.fiscal_period_id
  JOIN fiscal_calendar frontier_period
    ON frontier_period.id = :fiscal_period_id
  WHERE f.engagement_id = :engagement_id
    AND (
      f.fiscal_period_id = :fiscal_period_id
      OR (
        f.finding_code = ANY(:frontier_blocking_retroactive_finding_codes)
        AND finding_period.start_date < frontier_period.start_date
      )
    )
    AND f.condition_state = 'detected'
    AND NOT EXISTS (
      SELECT 1
      FROM finding_resolutions r
      WHERE r.accounting_finding_id = f.id
        AND r.applies_to_definition_version = f.definition_version
        AND r.applies_to_facts_hash = f.facts_hash
        AND r.resolution_kind IN ('accepted', 'not_applicable')
    )
), confirmation_answers AS (
  SELECT c.id, answer.answer
  FROM close_confirmations c
  LEFT JOIN LATERAL (
    SELECT r.answer
    FROM close_confirmation_responses r
    WHERE r.close_confirmation_id = c.id
      AND r.applies_to_definition_version = c.definition_version
      AND r.applies_to_context_hash = c.context_hash
    ORDER BY r.response_number DESC
    LIMIT 1
  ) answer ON true
  WHERE c.period_close_id = :period_close_id
    AND c.state = 'required'
), unsatisfied_confirmations AS (
  SELECT count(*) AS count
  FROM confirmation_answers
  WHERE answer IS NULL OR answer NOT IN ('confirmed', 'not_applicable')
)
SELECT
  blocking_work.count AS blocking_work_count,
  unsatisfied_findings.count AS unsatisfied_finding_count,
  unsatisfied_confirmations.count AS unsatisfied_confirmation_count,
  blocking_work.count = 0
    AND unsatisfied_findings.count = 0
    AND unsatisfied_confirmations.count = 0 AS content_ready
FROM blocking_work, unsatisfied_findings, unsatisfied_confirmations;
```

`content_ready` is necessary but not sufficient. The command separately proves period end, current Close Frontier, prior-month closure, current actor, Fiscal Period `open`, and current draft Version before submission.

#### Representative query 4: expand an inclusive Package range

```sql
SELECT fp.id, fp.start_date, fp.end_date, pc.id AS period_close_id, pc.state
FROM close_packages p
JOIN firm_client_engagements e ON e.id = p.engagement_id
JOIN fiscal_calendar range_start ON range_start.id = p.start_fiscal_period_id
JOIN fiscal_calendar range_end ON range_end.id = p.end_fiscal_period_id
JOIN fiscal_calendar fp
  ON fp.company_id = e.client_company_id
 AND fp.period_type = 'monthly'
 AND fp.start_date BETWEEN range_start.start_date AND range_end.start_date
JOIN period_closes pc
  ON pc.client_company_id = e.client_company_id
 AND pc.fiscal_period_id = fp.id
WHERE p.id = :close_package_id
ORDER BY fp.start_date, fp.id;
```

Package validation checks row count is 1–12 and that each period starts the day after the preceding period ends according to the client's calendar. UUID start/end values are identities, never ordering keys.

#### Performance posture

The landing endpoint remains one HTTP call backed by three bounded base reads: authorized portfolio/facets, authorized ordinary Work groups, and authorized client close rows. Run them sequentially inside one short read-only `REPEATABLE READ` transaction when the response needs one coherent snapshot; separate pooled connections do not share a PostgreSQL snapshot by default. Workspace details and target evidence remain paginated/lazy. Launch deliberately adds no Work Group table, materialized view, Redis read cache, or IndexedDB dependency. Realtime invalidation uses one firm-scoped SSE connection over the existing Redis transport, while projection truth remains in PostgreSQL. Before production rollout, seed representative firms and verify these queries with `EXPLAIN (ANALYZE, BUFFERS)`; only measured plan regressions justify another projection/index.

### H. Scenario validation

| Scenario                                                     | Expected authoritative path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Result                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Firm invitation or branded/direct signup                     | Accepted intake creates one Engagement plus eligible Lead/Bookkeeper intervals; explicit selections win, otherwise same-firm defaults apply. First managed month—not signup date—controls close materialization.                                                                                                                                                                                                                                                                                                                                | Covered by Engagement fields, defaults, `ENG-03/04`, and `activateEngagement`.                        |
| Routine month with separate roles                            | Preview exists without a Version; period end creates Version 1 and Confirmations; Bookkeeper clears Work/Findings/Confirmations and submits; approval Work targets Version 1; Lead approval closes Period Close and Fiscal Period together.                                                                                                                                                                                                                                                                                                     | Covered by `CLS-03/05/08` and submit/approve Commands.                                                |
| Freelancer holds both responsibilities                       | `reviewAndClosePeriod` freezes and approves the same Version in one transaction, records separate correlated audit actions, and creates no self-addressed approval Work.                                                                                                                                                                                                                                                                                                                                                                        | Covered without a special schema field or approval table.                                             |
| Lead rejects submission                                      | Version records `rejected`, actor/time/reason, is superseded, and Version 2 becomes the current draft. Unchanged exact-context Finding/Confirmation decisions remain available.                                                                                                                                                                                                                                                                                                                                                                 | No overwritten evidence and no second decision on Version 1.                                          |
| Ledger fact changes while approval is pending                | Accounting command changes the ledger, re-evaluates affected Work/Findings, supersedes the undecided Version, creates the next draft, returns Close to Preparing, and resolves approval Work before commit.                                                                                                                                                                                                                                                                                                                                     | Staleness is unambiguously derived without an approval status row.                                    |
| Previous month overdue while newer bookkeeping continues     | Later months may have ordinary Work and even Preparing closes, but the earliest ended unclosed month remains the only submit/approve/close frontier and the queue still selects one client row.                                                                                                                                                                                                                                                                                                                                                 | Covered by `CLS-02`; no one-row-per-period top-level UX.                                              |
| New client has 36 months of catch-up                         | Intake accepts three non-overlapping Packages of at most 12 ended months, preferably fiscal-year aligned, each with assignee and explicit deadline. Missing historical Closes materialize directly in Preparing and covered open Close/Work deadlines become the applicable Package deadline. Every month retains its own Close, Version, Findings, Responses, and approval decision; Packages coordinate them.                                                                                                                                 | No 36-row top-level queue, no flood of routine-overdue months, and no package-period bridge.          |
| Additional contracted backlog is discovered after activation | The authorized scope-expansion command moves the Engagement's first-managed boundary only earlier, validates Company conversion/prior responsibility, and creates accepted Packages and missing client-owned Preparing closes/current-Engagement Versions without replacing the Engagement.                                                                                                                                                                                                                                                     | Existing Work routing and Period Close identity remain stable and the amendment is versioned/audited. |
| Several catch-up Packages have different contributors        | Package assignments and deadlines may differ while monthly Work assignment remains unchanged unless explicitly rerouted. Later ranges prepare in parallel but cannot submit before earlier managed months close; each viewer's queue uses the persisted deadline of their relevant Package.                                                                                                                                                                                                                                                     | Covered by `PKG-04/06/09`.                                                                            |
| Clean prefix of a Package is ready                           | Package cannot partially approve. Lead explicitly splits it into immutable replacement ranges, selects each replacement deadline, and then submits/approves the clean prefix. Covered open Close/Work deadlines change atomically.                                                                                                                                                                                                                                                                                                              | Covered by Package predecessor lineage, `PKG-09/10`, and all-or-nothing approval.                     |
| Objective transaction anomaly appears mid-month              | Finding materializes immediately against the transaction and affected monthly period; registered Work surfaces before month-end. It later participates in that month's readiness without being recreated as close-only Work.                                                                                                                                                                                                                                                                                                                    | Covered by Finding timing, `FND-01/02`, and required Work period.                                     |
| Late bank transaction is dated inside a closed month         | Ordinary categorization Work is suppressed. A `transaction_dated_in_closed_period` Finding offers a non-mutating safe match, open-`fs_date` treatment, direct authorized reopen, or a durable Reopen Request. The unresolved retroactive Finding also blocks the current frontier.                                                                                                                                                                                                                                                              | No impossible posting Work is created against a closed period.                                        |
| Bank connection requires reauthorization                     | One open Work occurrence per connection follows the earliest Close Frontier affected by any of its feeds, or anchors to the current in-progress month before a frontier/Preview exists. An evidenced legitimate alternative is represented by the registered Finding strategy/resolution and reviewed in the submitted Version; the system does not duplicate the one reauthorization action per account/feed or create simultaneous obligations for every later month. Revocation resolves the Work and projects a disconnection notification. | Covered by Work uniqueness/anchoring and no blocker-exception table.                                  |
| Bulk categorization contains two invalid transactions        | Each transaction command is atomic. Valid units commit accounting and resolve their Work; invalid units return errors and remain visible. Group counts/deltas come from committed results only.                                                                                                                                                                                                                                                                                                                                                 | Covered by independent-unit bulk semantics; no optimistic disappearance.                              |
| Client Lead changes during pending approval                  | Responsibility command ends/starts intervals and reroutes approval Work to the new Lead. The submitted Version remains current because reviewer identity is not part of accounting content; eventual actor is recorded on the Version.                                                                                                                                                                                                                                                                                                          | No approval row rewrite and no manager-view query escalation.                                         |
| Contributor is removed with assigned Work/Package            | Offboarding fails unless the same command reroutes open Work and explicitly reassigns Packages or preserves another valid team responsibility.                                                                                                                                                                                                                                                                                                                                                                                                  | Covered by `ENG-05`, assignee indexes, and replacement Command.                                       |
| Firm transfer occurs mid-period or during approval           | Accepted successor starts at exact cutover. Company-owned Period Closes remain. Old unfinished Work/Finding/Confirmation/Version and active Package are ended or superseded; receiving firm creates the next Version/Work under its Engagement. Closed Versions remain attributed to the former firm.                                                                                                                                                                                                                                           | Pending approval is never transferred blindly and Period Close identity does not fork by firm.        |
| New firm reopens a predecessor-closed month                  | Current Engagement first accepts scope back to the selected month. Client-scoped impact preview selects it through every later closed month; locked impact rejects atomically. Earlier Versions remain immutable while each Period Close receives a new draft Version under the current Engagement.                                                                                                                                                                                                                                             | Covered by `CLS-11/12/13`; former-firm access is frozen-evidence-only.                                |
| Same condition reappears after Work resolution               | Reconciler creates a new Work occurrence; the ended row remains unchanged. Same Finding identity may return to detected with a new facts hash, and only an exact matching professional Resolution can satisfy it.                                                                                                                                                                                                                                                                                                                               | Recurrence history remains clear without event reconstruction.                                        |

#### Existing Accountable Books seams confirmed

- `app.companies.conversion_date` already owns the client accounting/opening-balance boundary and may fall inside a monthly period. Engagement activation must establish/confirm it; transfer must not rewrite it.
- `app.fiscal_calendar` already has composite `(id, company_id)` uniqueness, monthly type, non-overlapping date ranges, and authoritative `open/closed/locked` metadata. Reuse it; make current public close/reopen controllers unavailable for managed periods and call internal primitives only from V2 Aggregate Close Commands.
- Accountable Books' PostgreSQL image already provisions `btree_gist`, which the Engagement and responsibility exclusion constraints require. Deployment preflight must verify the extension exists in every target database.
- `app.audit_events` is append-only, tenant-scoped, correlation-aware, and already indexed by company/entity/action/actor. Extend its application entity registry; do not add close/work event tables.
- `app.outbox` already provides transactional, debounced `(intent_type, scope_key)` delivery and `FOR UPDATE SKIP LOCKED` dispatch. Reuse its handler-does-the-work invariant for reconciliation/invalidation.
- The advisory-lock utility and current work materializer establish the right concurrency primitive, but the V2 synchronizer must operate at atomic Work grain rather than retaining the legacy group/subject model.
- Existing notifications already have source identity, attention keys, `resolved_at`, `archived_at`, active-attention uniqueness, and lifecycle idempotency. Add a small catch-up-episode reconciler/archive operation; no recommendation table is required.
- Existing `user_company_roles` needs composite `UNIQUE (id, company_id)` and guarded soft-offboarding so same-firm responsibility/default FKs and rerouting invariants can be enforced.
- Accountable Books already has an unreferenced experimental `app.work_items` migration. Because the product has not launched and local/CI databases may be recreated, replace that unshipped definition directly with the canonical schema rather than preserving or converting experimental rows. `legacy_work_items`/`work_item_subjects` may coexist only as frozen developer reference while V2 is built and must be removed before first external launch.

#### Validation conclusion

The corrected 12-table write model covers routine bookkeeping, routine close, same-person close, rejection/staleness, catch-up, package split/parallel preparation, bulk accounting, responsibility changes, firm transfer, late closed-period facts, durable Reopen Requests, and cross-engagement cascading reopen without a persisted Work Group, generic approval table, blocker-exception table, package-period bridge, or workflow engine. The twelfth table is a bounded accounting decision exposed by external review, not a reopening of the generic-work design.

### I. Read projections (specified fully in ticket 005)

- Firm/viewer queue snapshot projection
- Atomic-work display groups
- One client-close row projection
- Approval and waiting summaries

## Design order

1. Engagement identity, effective dates, and team responsibilities.
2. Atomic work current state, registry-typed generic targets, assignment, derived visibility, and period impact.
3. Monthly close identity, Period Close Versions, bounded package ranges, and assignment.
4. Accounting Findings, Close Confirmations, approval, and immutable resolution/response history.
5. Cross-table invariants and transition transactions.
6. Index plan and representative queries.
7. Scenario validation and migration ordering.
