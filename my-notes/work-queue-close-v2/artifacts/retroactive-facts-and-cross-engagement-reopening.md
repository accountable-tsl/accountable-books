# Retroactive facts and cross-engagement reopening

## Decision

A Period Close belongs to the client company and one monthly Fiscal Period. An Engagement does not own the client's books or accounting periods; it identifies the firm responsible for preparing and reviewing a particular Period Close Version and owns the Work routed to that firm.

Late bank transactions dated inside a closed Fiscal Period do not create ordinary categorization Work immediately. They create a registered Accounting Finding requiring an explicit posting-period decision. The actor may record or match the transaction without mutating the closed ledger, or an authorized actor may reopen the affected month through a client-scoped cascading reopen. A bookkeeper who lacks reopen authority may create a durable Period Reopen Request for the current Client Lead.

This correction changes the authoritative model from eleven to twelve tables by adding `period_reopen_requests`. It does not add a generic approval/workflow table.

## 1. Ownership model

| Identity | Owner/scope | Meaning |
| --- | --- | --- |
| Fiscal Period | Client company | Monthly posting and lock state for the client's books. |
| Period Close | Client company + Fiscal Period | Continuous close lifecycle for that accounting month across firms and reopen cycles. |
| Period Close Version | Period Close + Engagement | One preparation/review cycle performed under a particular firm's accepted responsibility. |
| Work Item | Engagement | One action routed to the firm currently responsible for the target. |
| Close Package | Engagement | One firm's bounded coordination of contiguous historical monthly closes. |
| Period Reopen Request | Client company + current Engagement | Durable request for an authorized reviewer to decide whether a client-owned period sequence should reopen. |

The Period Close is never replaced merely because the client changes firms. Version numbers remain monotonic within the same Period Close across Engagements.

## 2. Transfer and historical access

When a client changes firms:

- already closed Period Closes remain closed and their approved Versions remain current historical evidence;
- an unfinished current Version under the former Engagement is superseded with `engagement_transferred`;
- if the incoming firm must continue that unfinished close, the same Period Close receives the next draft Version under the receiving Engagement;
- former-firm Work, active Packages, Findings, and pending Reopen Requests are ended or superseded; the receiving Engagement materializes its own operational records from current client facts;
- the former firm receives no new Work and loses access to the client's current books, current Period Close workspace, and later Versions;
- the former firm retains read-only access to the immutable submitted Version snapshots and evidence it prepared or approved, subject to ordinary historical/compliance retention policy.

The historical-access query authorizes from `period_close_versions.engagement_id` and returns only the frozen snapshot/evidence. It must not join or expose current ledger, Finding, Confirmation, Work, or later-Version state.

If a transfer happens during Preview, there may be no Version to supersede; preparation later creates the initial Version under the receiving Engagement. If transfer happens during Preparing or Awaiting Approval, the old Version is superseded and a new draft is created. Engagement identity on an existing Version is immutable.

## 3. Cross-engagement cascading reopen

An authorized reopen is client-scoped, not Engagement-scoped:

1. select the requested closed Fiscal Period and every later closed monthly Fiscal Period through the latest closed month;
2. acquire one client close-sequence lock, then affected client-period locks chronologically;
3. reject the entire command if any affected month is locked;
4. require the current bookkeeping Engagement to cover the requested month. If it does not, an explicit accepted scope expansion/catch-up agreement must move its First Managed Period earlier before reopening;
5. recompute the impact preview, including affected periods, approved/submitted Versions, known generated-report references, Work effects, and current hash;
6. reopen all affected Fiscal Periods atomically;
7. supersede each current approved Version while preserving its submission, decision, actors, Engagement, and evidence;
8. return each company-owned Period Close to Preparing and create its next draft Version under the current Engagement with a fresh review-cycle context;
9. reconcile current-Engagement Findings, Confirmations, and Work and audit the cascade under one `commandId`;
10. optionally organize the reopened range in one or more current-Engagement Reclose Packages.

The previous firm's approved Version is never edited or reassigned. The same client-owned Period Close simply acquires a later Version attributable to the current firm.

## 4. Late transaction decision

When a bank transaction's immutable bank date lies inside a closed or locked Fiscal Period and no safe existing match is established, its producer materializes a `transaction_dated_in_closed_period` Accounting Finding under the current Engagement. It does not materialize `categorize_bank_transaction` because an ordinary categorization posting into that period would be prohibited.

The Finding remains anchored to the affected historical Fiscal Period and blocks submission of the client's current Close Frontier until it is resolved, even though the affected month is already closed. Close readiness therefore includes unresolved registered retroactive-impact Findings from earlier periods; it does not rely only on Work whose `fiscal_period_id` equals the frontier month.

### Record in an open period

The system suggests the earliest appropriate open `fs_date`; an authorized bookkeeper may choose another permitted open date. The bank date remains unchanged. One accounting command validates the open posting period, categorizes the transaction, records both dates in audit evidence, re-evaluates the Finding, and reconciles Work atomically.

### Match without reopening

If the transaction matches an accounting entry already recorded in a closed period and establishing the match does not change ledger amounts, accounts, dates, contacts, tax treatment, or other material accounting facts, the match may be created without reopening. The command records the evidence and clears the Finding. Any match that would mutate closed-period accounting is prohibited and returns to the reopen/open-period choice.

### Reopen directly

A current Client Lead, Firm Admin, or actor with the explicit reopen capability receives an impact preview and may run the cascading reopen directly with a nonblank reason and current impact hash. A person who is both Primary Bookkeeper and Client Lead never requests approval from themselves.

After reopen, the late-impact Finding is re-evaluated and ordinary categorization Work may materialize against the now-open affected period. Reopening does not categorize the transaction by itself.

### Request reopening

An authorized bookkeeper/contributor who can act on the transaction but lacks reopen authority may request reopening. The request does not resolve the Finding. It temporarily changes every covered retroactive Finding Work's presentation to waiting on the Client Lead and creates one `review_period_reopen_request` Work occurrence for the current Client Lead.

Approval runs the same current-hash cascading-reopen command, records the request as approved, resolves review Work, and makes affected transactions eligible for ordinary categorization. Rejection requires a note, records the request as rejected, resolves review Work, and returns every still-open covered retroactive Finding Work to its current eligible bookkeeper with the instruction to match safely or use an open `fs_date`.

If any affected period is locked, ordinary direct/requested reopen is unavailable. The user sees the lock explanation and must use a non-mutating match or open-period treatment; unlocking is a separate future controlled policy.

## 5. `period_reopen_requests`

This table exists because a request is durable, independently reviewable business state that survives sessions and is not equivalent to Work, a notification, an audit event, or a Finding Resolution.

| Column | Shape | Null | Meaning |
| --- | --- | --- | --- |
| `id` | `uuid` PK, UUIDv7 | No | Stable request identity and Work target. |
| `client_company_id` | `uuid` FK → `companies.id` | No | Owner of the affected books. |
| `requested_fiscal_period_id` | `uuid` | No | Earliest closed monthly period the request proposes to reopen. |
| `engagement_id` | `uuid` FK → `firm_client_engagements.id` | No | Current firm responsibility under which the request was made and reviewed. |
| `trigger_accounting_finding_id` | `uuid` FK → `accounting_findings.id` | Yes | Finding that initiated the request, when applicable; a close workspace may initiate a request without one. |
| `requested_by_user_id` | `uuid` FK → `users.id` | No | Authorized actor asking the Client Lead to decide. |
| `request_reason` | `text` | No | Nonblank professional reason. |
| `impact_hash` | `text` | No | Hash of the current recomputable cascade preview used for stale-decision protection. |
| `impact_snapshot` | `jsonb` object | No | Self-describing requested periods and known approval/report/work impacts shown at request time. |
| `state` | constrained `text` | No | `pending`, `approved`, `rejected`, or `superseded`. |
| `reviewed_by_user_id` | `uuid` FK → `users.id` | Yes | Client Lead/capable reviewer for approved or rejected requests. |
| `reviewed_at` | `timestamptz` | Yes | Decision time. |
| `review_reason` | `text` | Yes | Required and nonblank for rejection; optional for approval. |
| `superseded_reason_code` | constrained `text` | Yes | Required only for superseded requests, such as engagement transfer, duplicate earlier request, or no-longer-applicable impact. |
| `version` | positive `integer` | No | Optimistic concurrency for recomputed previews and decision. |
| `created_at` | `timestamptz` | No | Request creation time. |
| `updated_at` | `timestamptz` | No | Last preview/state change. |

Required constraints:

- composite `(requested_fiscal_period_id, client_company_id)` FK to the monthly Fiscal Period;
- Engagement is current, bookkeeping, and for `client_company_id` when the request is created;
- at most one pending Reopen Request per client company; a request for an earlier period supersedes/replaces a later pending request under the client close-sequence lock, while later triggers reuse and refresh the existing wider request;
- decision identity fields appear together only for approved/rejected states;
- rejection requires `review_reason`; approval may include one;
- supersession reason appears exactly in `superseded`;
- `impact_snapshot` is an object and `impact_hash` is nonblank;
- approved/rejected/superseded rows are immutable except for centralized audit metadata outside this table;
- approval is legal only when a recomputed impact hash equals the reviewed expectation and the current Engagement still owns the request.

`trigger_accounting_finding_id` is provenance, not the membership of the decision. A single client-sequence request can cover more than one unresolved registered retroactive Finding whose safe resolution depends on the same cascade. The self-describing `impact_snapshot` freezes the Finding IDs/facts hashes and period/report/approval impacts shown when the request was created or refreshed; command authorization and approval/rejection always recompute the current covered set and `impact_hash`. No request–Finding bridge table is needed.

The request row does not duplicate operational scheduling state. Its one open `review_period_reopen_request` Work Item owns `due_at`: the current Close Frontier's effective operational deadline, or the current in-progress month's routine Close deadline if no frontier exists. An already-passed deadline makes the decision overdue immediately. Widening a pending request may move `due_at` earlier but never postpone it; a Client Lead deadline change can happen only through an existing Package/Close deadline command and audit trail.

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

## 6. Registry and presentation consequences

The launch Work Type catalogue grows from seven to eight codes:

- `resolve_accounting_finding` continues to surface the late transaction decision to the eligible bookkeeper;
- `review_period_reopen_request` targets `period_reopen_requests`, uses the request as its root, routes to the current Client Lead, has no independent user-managed lifecycle, and resolves/supersedes with the request;
- the Work occurrence contributes to the Client Lead's counts and continuous stream, but its sole landing representation is the client's single Close row—not a second ordinary Work Group;
- the Client Lead's workspace displays the initiating transaction/Finding, requested starting month, chronological cascade, locks, invalidated approvals, known report references, current impact hash, and approve/reject actions;
- the requester and observers reach the same dedicated workspace in a read-only waiting state;
- rejection returns every still-unresolved covered Finding group to actionable presentation with the review note; it never marks a transaction handled.

The Close cluster remains one row per client. For the decision owner, a pending Reopen Request outranks routine preparation/approval copy on that row and opens the request workspace. For the requester it says `Waiting for {Client Lead}`; for an observer it shows pending context. The underlying Close workspace remains reachable inside the request workspace. A Firm Admin or explicit reopen-capable actor may decide an authorized request, but accountability and Work assignment remain with the current Client Lead. A same-person Primary Bookkeeper/Client Lead uses direct reopen and creates no request.

## 7. New invariants

1. Exactly one Period Close exists per client company and monthly Fiscal Period, regardless of how many firms have served the client.
2. Every Period Close Version has exactly one Engagement for the same client and bookkeeping service domain; Engagement identity is immutable.
3. An unclosed Period Close's current Version belongs to the current responsible Engagement; transfer supersedes an unfinished prior Version and creates the next one where preparation is active.
4. A closed Period Close may retain an approved current Version under a predecessor Engagement until an authorized reopen supersedes it.
5. Former-firm historical access is limited to frozen Versions attributable to its Engagement and never grants access to live books.
6. Cascading reopen serializes by client company and crosses Version Engagement boundaries while preserving every earlier Version.
7. An unresolved late-transaction Finding never produces impossible ordinary categorization Work against a closed posting period.
8. One pending Reopen Request exists per client; requesting or rejecting it never resolves any covered retroactive Finding.
9. Reopen approval requires a current recomputed impact hash and fails atomically if any affected month is locked.
10. A safe match may link to existing closed-period accounting only when it changes no material accounting fact.

## 8. Scenario proof

| Scenario | Required outcome |
| --- | --- |
| Client transfers after January was approved | January Close and old-firm Version remain closed and immutable; new firm receives no January Work. |
| New firm reopens January after transfer | Current Engagement first accepts January responsibility; January and every later closed month reopen; old Versions are superseded but unchanged; new draft Versions belong to the current Engagement. |
| Transfer during awaiting approval | Old submission becomes superseded without decision; approval Work ends; same Period Close receives a new current draft Version under the receiving Engagement. |
| Late January transaction arrives while January is closed | No ordinary categorization Work is created; the current Engagement receives the late-impact Finding Work. |
| Transaction matches an existing January ledger entry exactly | Match is allowed without reopen because no material ledger fact changes; Finding clears. |
| Bookkeeper chooses March posting date | Bank date stays in January, `fs_date` is validated in open March, categorization and Finding/Work reconciliation commit atomically. |
| Bookkeeper requests January reopen | One pending request and one Client Lead review Work exist; all covered Findings remain waiting; the client has one Close row and no duplicate ordinary review group. |
| Lead rejects | Request review Work resolves; required note returns with every still-open covered Finding Work; affected transactions remain unresolved. |
| Same-person Lead/Bookkeeper | Direct cascade option appears; no self-addressed request is created. |
| Cascade contains a locked month | Request/direct approval fails without partial reopening; open-period or safe-match paths remain. |
