# Queue Projections, API, and DTO Design

## Decision

The production queue is a firm-scoped read model assembled on request from current Engagements, atomic `work_items`, the Work Type registry, and monthly close state. It is not another workflow store. The SPA makes one request when the user lands on the queue, receives the authorized client/assignee filters, one close row per relevant client, derived Work Groups, ordered sections, copy, counts, capabilities, and typed destinations, and then renders them. Detailed targets are loaded only when the user peeks at a group or enters a workspace.

The launch design adds no `work_groups` table, SQL view, materialized view, Redis read projection, or browser database. Three bounded base reads inside one short read-only transaction—authorized portfolio/facets, ordinary Work Group aggregates, and client close frontiers—are sufficient. Work-type adapters may add at most one batch enrichment query per Work Type present in the result; they may never query once per row or target. One firm-scoped SSE stream uses the existing Redis infrastructure only to transport authorized post-commit invalidations.

The workqueue prototype supplies the primary interaction model. Accountable Books supplies roster search, add-client entry, team filters, responsive roster treatment, capability-aware empty states, and the surrounding application shell. Neither existing queue DTO nor either prototype's exact section logic is adopted unchanged.

## 1. What the interface should become

### 1.1 Desktop queue

The production desktop surface keeps the workqueue prototype's two-column shape:

- the main column is the queue and guided entry into the work stream;
- the right rail is an authorized client filter, not a second source of work truth;
- the rail gains Accountable Books' client search, add-client button, empty states, and—only in authorized portfolio/firm views—an assignee filter;
- selecting a client filters the queue in place and updates the URL; it does **not** switch the application's active company from the firm to that client;
- an explicit `Open books` action may enter the client's accounting workspace while the queue itself remains in firm context;
- stable client accents, named commit actions, the cross-client transition beat, peeks for light work, and full workspaces for heavy work remain.

The current Accountable Books `FirmQueueRow` calls `openClientBook` when a row is activated. That is unsuitable for a cross-client work stream. A production queue row opens a firm-scoped route whose client company is an authorized work target; it does not mutate tenant context merely to inspect or perform the work.

### 1.2 Mobile queue

A long horizontal chip list does not scale to a real portfolio. Mobile combines the two prototypes as follows:

- `Queue` and `Clients` remain top-level mobile tabs, as in Accountable Books;
- the Queue tab may show `All`, the selected client, and a small number of urgent/recent client chips for fast switching;
- `Clients` opens the full searchable roster, supports add-client when authorized, and shows work/close counts;
- selecting a client returns to Queue with that authorized filter active;
- heavy workspaces use the existing focused full-screen stream treatment and sticky actions.

The API does not need a different mobile payload. Responsive composition is an SPA concern.

### 1.3 Queue scopes

The server offers only scopes the viewer is allowed to use:

| Scope            | Meaning                                                                                                                                                                                  | Default use                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `my_work`        | Work for which the viewer is the accountable assignee, decisions explicitly assigned to them, plus the waiting Reopen Request raised from their assigned retroactive Work.               | Contributor execution and an optional narrow view for other roles.                                                                          |
| `portfolio`      | All relevant work for engagements where the viewer is Client Lead or Primary Bookkeeper, plus directly assigned contributor work. Persistent client-action/waiting signals are included. | Default for Client Leads, Primary Bookkeepers, managers, freelancers, and firm owners. It still means assigned clients, not the whole firm. |
| `firm_oversight` | The firm's authorized active bookkeeping portfolio.                                                                                                                                      | Explicit view only for Firm Admin or a separately granted firm-oversight capability.                                                        |

Managers therefore see assigned clients by default. A query parameter cannot turn `portfolio` into `firm_oversight`; the requested scope is intersected with server-derived capabilities and the response reports the effective scope.

The prototype persona switch is a development control, not a production permission model. Production may show a scope switch only when `availableScopes` contains more than one value.

### 1.4 Client rail and client management

The client rail contains every active, authorized bookkeeping Engagement in the effective scope, including a caught-up client with no open Work. Each entry reports actionable, waiting, overdue, and close-attention counts. It does not label the client itself `healthy`, `unhealthy`, or `overdue`; those are work/close facts, not a client lifecycle state.

`Add client` is a capability-gated link into Accountable Books' externally owned client intake/onboarding, not a queue command and not an implementation responsibility of Work Queue and Close V2. The queue snapshot returns whether the link is available. That external flow must satisfy the V2 Engagement-activation contract by capturing or defaulting the two required responsibilities, conversion/first-managed-period decisions, and any catch-up agreement. Direct platform signup, branded firm signup, referral review, and firm transfer enter the same acceptance seam outside the queue. Once accepted, the new Engagement naturally appears in client facets and any resulting Work/Close rows.

The current Accountable Books single `defaultAssigneeUserId` invite concept is not sufficient for the locked operating model. Intake requires a Client Lead and Primary Bookkeeper, even when both resolve to the same person.

### 1.5 Section model

The server returns ordered semantic sections; the SPA does not reclassify rows. Empty sections are omitted.

For `my_work` and `portfolio`, the normal order is:

1. Month-end close, when at least one client needs an action or decision now.
2. Ready to work.
3. Waiting on clients.
4. Waiting on the team or another dependency.
5. Upcoming closes, only when there is no active close cluster or when explicitly expanded.

For `firm_oversight`, the same facts are ordered as close decisions, overdue attention, ready portfolio work, waiting on clients, and waiting on the team. Because canonical `work_items.assignee_user_id` is required, the launch interface has no normal `Unassigned work` section. Responsibility and routing commands must produce a valid fallback or fail. Because Work has no stored `in_progress` state, the launch interface also has no authoritative `In progress` section unless a later presence/session feature deliberately introduces one.

`Completed this session` is presentation memory composed only from server-confirmed command responses during the current browser session. It is not in the initial snapshot, is not persisted in IndexedDB, and disappears on a full reload. The SPA may hold it in ordinary in-memory state.

## 2. Close projection corrections

### 2.1 One cluster and one row per client

The workqueue prototype currently shows, for the same Summit client, an April close under `Waiting on approval` and a May close under the Month-end cluster. Production must not do this.

There is one Month-end Close cluster and at most one displayed row per Engagement/client. That row is selected from the client's earliest unresolved Close Frontier. It may summarize a later month that can be prepared in parallel, but it never creates a second top-level client row.

Examples:

- Client Lead: `April needs your approval` with `Review close`.
- Primary Bookkeeper: `April is with Maria for approval · May preparation has 2 items` with `Open close workspace`.
- Same person holds both responsibilities: `May is ready to review and close` with the combined action.
- Preview only: `May close starts in 3 days`; it is upcoming, not urgent daily work.

The workspace route is engagement-shaped, not period-row-shaped, so it can open the frontier and show permitted preparation for the immediately following month without duplicating queue rows.

### 2.2 Cluster placement

- If any visible client has overdue Preparing work, a submission ready to review, or another viewer-actionable close condition, the close cluster is first.
- Its default expansion contains only clients needing current attention; approval and preparation states are ranked within the same cluster.
- Preview-only clients are reached through `See upcoming closes` and are not mixed into the urgent count.
- If every visible close is Preview, a collapsed Upcoming Closes cluster appears after ordinary actionable work rather than dominating the page.
- With an explicit client filter, that client's Preview row may be shown because the user deliberately asked for that client.

Cluster copy counts clients, not periods: `3 clients need close attention`, never `3 periods to close` when there are three client rows.

### 2.3 Approval placement

`approve_period_close` remains atomic Work assigned to the current Client Lead, but its primary visual representation is the affected client's single close row. The launch interface does not also repeat it in an ordinary approval section. The row and close workspace use viewer-specific copy to distinguish `Needs your approval` from `Waiting for Maria`.

`review_period_reopen_request` follows the same projection rule. It is one atomic Work occurrence assigned to the current Client Lead and included in counts and the continuous stream, but it is never also rendered as an ordinary Work Group. A pending request makes the affected client's Close row lead with `Review reopening request` for the decision owner, `Waiting for {Client Lead}` for the requester, or read-only pending context for an observer; all three open the dedicated Reopen Request workspace.

## 3. Ordinary Work Group projection

An ordinary row is derived from exactly:

```text
engagement_id + work_type_code
```

The query aggregates open atomic Work Items and the registry adds presentation and workspace semantics. A group is placed once using this precedence:

1. at least one target the viewer can act on now;
2. otherwise waiting on a client;
3. otherwise waiting on a team member/dependency;
4. otherwise informational.

The group retains counts for all of those categories, so mixed responsibility is visible without duplicating the row. Earliest due time and overdue count are calculated directly from persisted `work_items.due_at`; attention is derived, not stored as mutable priority. When the earliest item belongs to an active Package, its persisted deadline already equals Package `due_at`. A set-based Package-range join annotates source/context only—it never substitutes a hidden projection deadline.

`categorize_bank_transaction` and `review_categorization_candidate` remain separate rows because the latter has confidence, suggestion, and bounded bulk-accept semantics while the former requires a fresh accounting choice. They use the same icon family and open the same `categorization` workspace. Opening either workspace can show both panels, with the selected group focused. Similar presentation does not justify corrupting their semantic or safety boundary.

## 4. HTTP read contract

All endpoints are subordinate to the stable firm context:

```text
/api/v2/firms/{firmCompanyId}/...
```

Accountable Books may continue sending its active company ID, but on these routes it must be the firm company. `clientCompanyId` is only an authorized target/filter. Every endpoint validates the authenticated user's membership/capability in the firm and then intersects any requested client, assignee, Engagement, Work Group, or Close identifier with the resolved portfolio.

### 4.1 Initial snapshot — one landing request

```http
GET /api/v2/firms/{firmCompanyId}/work-queue
```

Query parameters:

| Name                    | Shape                                    | Rule                                                                                                                                |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `scope`                 | `my_work \| portfolio \| firm_oversight` | Optional request; server returns the authorized effective value.                                                                    |
| `clientCompanyId`       | UUID                                     | Optional authorized client filter. It never expands scope.                                                                          |
| `assigneeUserId`        | UUID                                     | Optional filter visible only where the effective scope allows team filtering. It never grants access to that user or their clients. |
| `sectionLimit`          | integer, default 20, max 50              | Number of rows per ordinary section and close cluster.                                                                              |
| `includeUpcomingCloses` | boolean, default false                   | Used after an explicit expansion or a client-scoped request; normal landing returns only the upcoming summary.                      |

The route accepts no `viewerUserId`, `viewerRole`, `currentUserId`, list of clients, role flags, initials, or `isFirmAdmin`. Those are derived on the server. The existing mock `FetchFirmTaskQueueParams` must not become a network contract.

### 4.2 Section pagination

```http
GET /api/v2/firms/{firmCompanyId}/work-queue/sections/{sectionKey}
```

It accepts the same authorized scope/filter parameters plus an opaque `cursor` and `limit` (max 50). `sectionKey` is one of the keys returned in the snapshot; the server does not accept arbitrary SQL sort/group fields.

The cursor contains a signed scope/filter fingerprint and the section's stable sort tuple. Ordinary groups sort by semantic attention rank, overdue state, earliest due time, client display name, Engagement ID, and Work Type code. Close rows sort by viewer decision/action rank, overdue state, deadline, client display name, and Engagement ID. A cursor cannot be replayed under a wider scope or different filter.

### 4.3 Client and assignee facet search

```http
GET /api/v2/firms/{firmCompanyId}/work-queue/clients?q={text}&cursor={cursor}&limit={limit}
GET /api/v2/firms/{firmCompanyId}/work-queue/assignees?q={text}&cursor={cursor}&limit={limit}
```

The initial snapshot includes the first authorized facet page so landing still requires one request. These endpoints serve search/scroll for large portfolios. Client search matches display name and a safe secondary label such as industry; it never searches inaccessible companies. Assignee search is omitted/forbidden when the effective scope lacks team-filter capability. Production uses user UUIDs, not initials.

### 4.4 Ordinary group peek/workspace

```http
GET /api/v2/firms/{firmCompanyId}/work-queue/groups/{groupKey}?mode=peek
GET /api/v2/firms/{firmCompanyId}/work-queue/groups/{groupKey}?mode=workspace
GET /api/v2/firms/{firmCompanyId}/work-queue/groups/{groupKey}?mode=workspace&panel={workTypeCode}&cursor={cursor}
```

`groupKey` is an opaque, versioned encoding of Engagement ID plus Work Type code. It is a locator, not an authorization token. The server decodes it, re-resolves visibility/action policies, reloads open Work, and returns `404` for a nonexistent or inaccessible group to avoid scope disclosure.

`peek` returns up to three registered item summaries and no heavy evidence. `workspace` returns the first page for all group panels sharing that registry workspace on the same Engagement. For categorization this means the uncategorized and candidate-review panels can arrive together, while retaining separate group keys, cursors, counts, and command eligibility.

### 4.5 Close workspace and approval review

```http
GET /api/v2/firms/{firmCompanyId}/close-workspaces/{engagementId}
GET /api/v2/firms/{firmCompanyId}/close-versions/{periodCloseVersionId}/review
GET /api/v2/firms/{firmCompanyId}/period-reopen-requests/{periodReopenRequestId}
```

The first endpoint is the current Engagement's bookkeeper/client-lead client workspace over client-owned Period Closes. It returns the one Close Frontier, a possible immediately-following preparation month, blocking Work Groups, Findings, Final Checks, Package context, pending reopen attention, and authorized next transitions. The second returns the frozen submitted Version and exact evidence needed for a Lead decision. It also supports bounded read-only historical access when that Version belongs to a former firm's Engagement; that response contains only the immutable snapshot/evidence and never joins current books. The third returns a current Reopen Request, initiating Finding/transaction, cascade preview, locks, invalidated approvals, known report references, current impact hash, and permitted approve/reject commands.

Command endpoints are deliberately specified in ticket 006. Read DTOs expose domain versions and permitted command codes but do not let the SPA mark Work complete. A `commandCode` identifies an available domain operation; it is distinct from the per-execution `commandId` generated when the SPA invokes that operation.

## 5. Exact queue DTO

```ts
type QueueScope = "my_work" | "portfolio" | "firm_oversight";

type QueueSectionKey =
  | "ready"
  | "overdue_attention"
  | "waiting_on_client"
  | "waiting_on_team"
  | "informational";

type QueueSnapshotDto = {
  schemaVersion: 1;
  contextKey: string; // canonical hash of the effective authorized scope/filters/window
  generatedAt: string; // ISO timestamptz
  firm: {
    firmCompanyId: string;
    displayName: string;
  };
  viewer: {
    userId: string;
    displayName: string;
  };
  scope: {
    requested: QueueScope | null;
    effective: QueueScope;
    available: QueueScope[];
    label: string;
  };
  capabilities: {
    canAddClient: boolean;
    canFilterByAssignee: boolean;
    canOpenFirmOversight: boolean;
  };
  header: {
    title: string;
    summary: string;
    actionableGroupCount: number;
    actionableItemCount: number;
    waitingItemCount: number;
    clientCount: number;
    overdueItemCount: number;
  };
  filters: {
    selectedClientCompanyId: string | null;
    selectedAssigneeUserId: string | null;
    clients: FacetPageDto<ClientFacetDto>;
    assignees: FacetPageDto<AssigneeFacetDto> | null;
  };
  addClientAction: null | {
    kind: "open_client_intake";
    route: "/clients/new";
    label: string;
  };
  close: CloseClusterDto | null;
  sections: QueueSectionDto[];
};

type FacetPageDto<T> = {
  total: number;
  items: T[];
  nextCursor: string | null;
};

type ClientRefDto = {
  clientCompanyId: string;
  engagementId: string;
  displayName: string;
  initials: string;
  accentKey: string; // semantic stable token, never a CSS class
};

type ClientFacetDto = ClientRefDto & {
  counts: {
    openItems: number;
    actionableItems: number;
    waitingItems: number;
    overdueItems: number;
  };
  closeAttention:
    | "action_required"
    | "awaiting_approval"
    | "overdue"
    | "preview"
    | "none";
};

type AssigneeFacetDto = {
  userId: string;
  displayName: string;
  initials: string;
  counts: {
    openItems: number;
    overdueItems: number;
  };
};

type QueueSectionDto = {
  key: QueueSectionKey;
  title: string;
  description: string | null;
  tone: "default" | "attention" | "waiting";
  rows: WorkGroupRowDto[];
  page: {
    nextCursor: string | null;
  };
};

type OperationalDeadlineDto = {
  dueAt: string;
  source: "routine_close" | "close_package";
  closePackageId: string | null;
};
```

Server-provided `title`, `summary`, and labels make the SPA simple and keep role-specific wording consistent. The SPA still owns layout, typography, responsive behaviour, icons mapped from semantic keys, and accessible interactions. The backend never sends JSX, HTML, Tailwind classes, or arbitrary colors.

## 6. Work Group row DTO

```ts
type WorkGroupRowDto = {
  rowKind: "work_group";
  groupKey: string;
  groupVersion: string; // opaque hash of current member ids/versions
  sortKey: string; // opaque projection ordering key used by confirmed deltas
  client: ClientRefDto;
  workType: {
    code: string;
    iconKey: string;
  };
  presentation: {
    title: string;
    summary: string;
    itemNounSingular: string;
    itemNounPlural: string;
  };
  counts: {
    total: number;
    actionableNow: number;
    assignedToViewer: number;
    waitingOnClient: number;
    waitingOnTeam: number;
    informational: number;
    overdue: number;
    bulkEligible: number;
  };
  timing: {
    earliestDeadline: OperationalDeadlineDto;
    dueLabel: string;
    attention: "overdue" | "due_now" | "upcoming" | "normal";
  };
  accountability: {
    primaryAssignee: null | {
      userId: string;
      displayName: string;
      initials: string;
    };
    distinctAssigneeCount: number;
  };
  actionability: {
    state:
      | "actionable_now"
      | "waiting_on_client"
      | "waiting_on_team"
      | "informational";
    explanation: string | null;
  };
  bulk: {
    supportedCommandCodes: string[];
    eligibleCount: number;
  };
  destination: {
    kind: "work_group";
    groupKey: string;
    workspaceKind:
      | "categorization"
      | "journal_review"
      | "finding_resolution"
      | "bank_connection";
  };
};
```

The row has no stored task `status`, mutable `priority`, `blocksClose`, `readiness`, viewer role, or CSS treatment. `actionability`, section placement, attention, copy, and bulk eligibility are projection results. The registry's `closeRequirement` remains backend semantics and is exposed in the close workspace only where it helps explain a gate.

## 7. Close cluster DTO

```ts
type CloseClusterDto = {
  title: string; // normally "Month-end close"
  placement: "first" | "after_ready";
  defaultExpanded: boolean;
  summary: {
    attentionClientCount: number;
    needsViewerDecisionCount: number;
    overdueClientCount: number;
    upcomingClientCount: number;
    label: string;
  };
  rows: CloseClientRowDto[];
  page: {
    nextCursor: string | null;
  };
  upcoming: null | {
    label: string; // e.g. "See 8 upcoming closes"
    included: boolean;
  };
};

type CloseClientRowDto = {
  rowKind: "close_client";
  rowVersion: string;
  sortKey: string; // opaque projection ordering key used by confirmed deltas
  client: ClientRefDto;
  frontier: null | {
    periodCloseId: string;
    fiscalPeriodId: string;
    periodLabel: string;
    state: "preview" | "preparing" | "awaiting_approval";
    deadline: OperationalDeadlineDto;
    timing: "preview" | "due" | "overdue";
  };
  presentation: {
    title: string;
    summary: string;
    badge: null | {
      key:
        | "needs_your_approval"
        | "awaiting_approval"
        | "preparing"
        | "overdue"
        | "preview";
      label: string;
    };
  };
  counts: {
    blockingWork: number;
    openFindings: number;
    incompleteFinalChecks: number;
    backlogMonthsAfterFrontier: number;
  };
  approval: null | {
    periodCloseVersionId: string;
    submittedByDisplayName: string;
    viewerRelationship: "decision_owner" | "submitter" | "observer";
  };
  nextPreparation: null | {
    periodCloseId: string;
    periodLabel: string;
    openRequirementCount: number;
  };
  package: null | {
    closePackageId: string;
    label: string;
    packageType: "catch_up" | "reclose";
    startPeriodLabel: string;
    endPeriodLabel: string;
    position: number;
    totalPeriods: number;
    assignee: {
      userId: string;
      displayName: string;
      initials: string;
    };
    dueAt: string;
    timing: "within_deadline" | "overdue";
  };
  reopenRequest: null | {
    periodReopenRequestId: string;
    requestVersion: number;
    impactHash: string;
    workItem: WorkItemRefDto;
    requestedPeriodLabel: string;
    requestedByDisplayName: string;
    coveredFindingCount: number;
    deadline: OperationalDeadlineDto;
    timing: "due" | "overdue";
    state: "pending";
    viewerRelationship: "decision_owner" | "requester" | "observer";
    label: string;
  };
  viewerAction: {
    kind:
      | "prepare"
      | "review_submission"
      | "review_reopen_request"
      | "review_and_close"
      | "observe"
      | "preview";
    label: string;
  };
  destination:
    | { kind: "close_workspace"; engagementId: string }
    | {
        kind: "period_reopen_request";
        periodReopenRequestId: string;
      };
};
```

`frontier` may be null only when a pending Reopen Request is itself the current Close attention before the present month's Preview has materialized. The row then takes its timing, copy, viewer action, and destination from `reopenRequest`; the server does not invent a Period Close merely to render the decision. `nextPreparation` is summary context, not a second Close Frontier and not permission to submit out of sequence. Catch-up also remains one client row: Package range, position, assignee, and deadline explain the backlog while the workspace advances monthly truth in order. When present, the frontier and Package both expose the same persisted operational `dueAt`; Fiscal Period labels/dates supply historical context rather than reviving each month's former routine deadline.

Projection invariants:

- `frontier === null` requires a nonnull `reopenRequest`, `viewerAction.kind` of `review_reopen_request` or `observe`, and a `period_reopen_request` destination;
- a pending Reopen Request outranks routine Close preparation copy for the decision owner and always selects the request destination for the requester/observer too;
- `review_reopen_request` is emitted only when the viewer can approve/reject; requesters and observers receive `observe` and no command codes;
- without a pending Reopen Request, `frontier` is nonnull and the destination is `close_workspace`;
- header, client-facet, Close-cluster, and continuous-stream counts count the atomic review Work once even though no ordinary group row exists.

Package-covered overdue state is true only when Package `due_at` has passed. Header, facet, group, client, and close-cluster overdue counts therefore count persisted Package-aligned Work/Close deadlines rather than months in the range. The UI may say `Catch-up Jan–Dec 2024 · due 30 September`; it must not produce twelve separately overdue close rows or copy such as `January was due 8 months ago` while that active Package is still within deadline.

## 8. Lazy workspace DTOs

### 8.1 Ordinary workspace envelope

```ts
type WorkWorkspaceDto = {
  schemaVersion: 1;
  generatedAt: string;
  firmCompanyId: string;
  client: ClientRefDto;
  workspaceKind: WorkGroupRowDto["destination"]["workspaceKind"];
  focusGroupKey: string;
  panels: WorkWorkspacePanelDto[];
};

type WorkWorkspacePanelDto = {
  group: WorkGroupRowDto;
  items: WorkspaceItemDto[];
  bulkActions: BulkActionManifestDto[];
  page: { nextCursor: string | null };
};

type BulkActionManifestDto = {
  commandCode: string;
  label: string;
  groupKey: string;
  groupVersion: string;
  eligibleCount: number;
  limit: number;
  truncated: boolean;
  units: Array<{
    targetType: string;
    targetId: string;
    workItemId: string;
    expected: Record<string, unknown>;
  }>;
};

type WorkItemRefDto = {
  workItemId: string;
  workItemVersion: number;
  workTypeCode: string;
  target: { type: string; id: string };
  fiscalPeriodId: string;
  dueAt: string;
};

type WorkspaceItemDto =
  | UncategorizedBankTransactionDto
  | CategorizationCandidateDto
  | DraftJournalDto
  | AccountingFindingDto
  | BankConnectionActionDto;
```

The typed items contain `workItem` as a concurrency/explanation reference and the actual domain target data needed by the workspace. Commands operate on domain intent and target identity; users never complete or cancel `workItem` directly.

Minimum launch shapes:

```ts
type UncategorizedBankTransactionDto = {
  kind: "uncategorized_bank_transaction";
  workItem: WorkItemRefDto;
  transaction: {
    bankTransactionId: string;
    transactionDate: string;
    description: string;
    counterparty: string | null;
    amount: string;
    currency: string;
    bankAccountDisplayName: string;
    bankAccountLastFour: string | null;
  };
  permittedCommandCodes: string[];
};

type CategorizationCandidateDto = {
  kind: "categorization_candidate";
  workItem: WorkItemRefDto;
  candidateId: string;
  transaction: UncategorizedBankTransactionDto["transaction"];
  suggestion: {
    accountId: string;
    accountName: string;
    confidence: number;
    confidenceBand: "high" | "medium" | "low";
    explanation: string | null;
  };
  bulkEligible: boolean;
  permittedCommandCodes: string[];
};

type DraftJournalDto = {
  kind: "draft_journal";
  workItem: WorkItemRefDto;
  journalBatchId: string;
  journalDate: string;
  reference: string | null;
  description: string;
  source: "generated_from_template" | "manual";
  debitTotal: string;
  creditTotal: string;
  lineCount: number;
  warningLabels: string[];
  bulkEligible: boolean;
  permittedCommandCodes: string[];
};

type AccountingFindingDto = {
  kind: "accounting_finding";
  workItem: WorkItemRefDto;
  findingId: string;
  findingCode: string;
  definitionVersion: string;
  factsHash: string;
  title: string;
  explanation: string;
  affectedRecord: null | {
    type: string;
    id: string;
    label: string;
  };
  closeEffect: "blocking" | "required_review" | "advisory";
  allowedResolutionKinds: Array<"correct" | "accept" | "not_applicable">;
  suggestedActionIds: string[];
  permittedCommandCodes: string[];
};

type BankConnectionActionDto = {
  kind: "bank_connection_action";
  workItem: WorkItemRefDto;
  bankConnectionId: string;
  providerDisplayName: string;
  affectedAccounts: Array<{
    bankAccountId: string;
    displayName: string;
    lastFour: string | null;
  }>;
  authorizationStatus: "requires_action";
  actorCopy: string;
  observerCopy: string;
  permittedCommandCodes: string[];
};
```

Domain-specific monetary/account identifiers must reuse Accountable Books' canonical public DTO types where they already exist. The shapes above define the queue/workspace boundary, not a duplicate ledger model.

### 8.2 Close workspace envelope

```ts
type CloseWorkspaceDto = {
  schemaVersion: 1;
  generatedAt: string;
  firmCompanyId: string;
  client: ClientRefDto;
  row: CloseClientRowDto;
  frontier: {
    periodCloseId: string;
    version: number;
    fiscalPeriodId: string;
    periodLabel: string;
    state: "preview" | "preparing" | "awaiting_approval";
    canSubmit: boolean;
    submissionGateExplanations: string[];
  };
  phases: {
    clearExistingWork: {
      groups: WorkGroupRowDto[];
      blockingItemCount: number;
    };
    findings: {
      open: AccountingFindingDto[];
      resolvedCount: number;
    };
    finalChecks: {
      items: CloseConfirmationDto[];
      completeCount: number;
    };
    signoff: {
      mode: "submit_for_approval" | "review_and_close" | "review_submission";
      permittedCommandCodes: string[];
    };
  };
  nextPreparation: CloseClientRowDto["nextPreparation"];
  package: CloseClientRowDto["package"];
};

type CloseConfirmationDto = {
  closeConfirmationId: string;
  confirmationCode: string;
  definitionVersion: string;
  contextHash: string;
  prompt: string;
  helpText: string | null;
  allowedAnswers: Array<"confirmed" | "not_confirmed" | "not_applicable">;
  currentAnswer: null | {
    answer: "confirmed" | "not_confirmed" | "not_applicable";
    explanation: string | null;
    respondedByDisplayName: string;
    respondedAt: string;
  };
  permittedCommandCodes: string[];
};

type PeriodReopenRequestWorkspaceDto = {
  schemaVersion: 1;
  generatedAt: string;
  firmCompanyId: string;
  periodReopenRequestId: string;
  requestVersion: number;
  engagementId: string;
  client: ClientRefDto;
  workItem: WorkItemRefDto;
  deadline: OperationalDeadlineDto;
  timing: "due" | "overdue";
  viewerRelationship: "decision_owner" | "requester" | "observer";
  requestedPeriod: {
    fiscalPeriodId: string;
    label: string;
  };
  request: {
    requestedByDisplayName: string;
    requestedAt: string;
    reason: string;
  };
  trigger: null | {
    accountingFindingId: string;
    bankTransactionId: string;
    bankDate: string;
    amount: string;
    description: string;
  };
  coveredFindings: Array<{
    accountingFindingId: string;
    factsHash: string;
    findingCode: string;
    periodLabel: string;
    summary: string;
  }>;
  impact: {
    impactHash: string;
    affectedPeriods: Array<{
      fiscalPeriodId: string;
      label: string;
      lockState: "closed" | "locked";
      periodCloseVersionId: string;
      preparedByFirmDisplayName: string;
    }>;
    invalidatedApprovalCount: number;
    knownReportReferences: Array<{ id: string; label: string }>;
    canReopen: boolean;
    blockingExplanations: string[];
  };
  permittedCommandCodes: Array<
    "approve_period_reopen_request" | "reject_period_reopen_request"
  >;
};
```

The command codes are empty for requesters and observers. The decision owner is the current Client Lead by default; an authorized Firm Admin or explicitly reopen-capable actor can also receive the decision commands without changing the Work assignee. `coveredFindings` is the current recomputed set included in `impactHash`, not merely the optional initiating Finding. The workspace must refresh before a decision whenever the request version or impact hash changes.

The review endpoint returns the frozen Period Close Version, submitted totals, exact Finding resolutions and Confirmation responses included in that Version, material-change/staleness status, submitter, and permitted `approve`/`reject` command codes. It never re-queries current mutable facts and presents them as if they were the submitted evidence.

## 9. Authorization rules for every read

1. Authenticate the user and validate active membership in `firmCompanyId`.
2. Resolve capabilities and active Engagement responsibilities at `generatedAt`.
3. Build the authorized Engagement set:
   - Firm Admin/firm-oversight capability: firm scope when explicitly requested;
   - Client Lead/Primary Bookkeeper: their responsibility portfolio;
   - Contributor: directly assigned Work and Package-relevant close months only.
4. Intersect requested client and assignee filters with that set.
5. Apply registry visibility/access policy and domain action authorization separately.
6. Return capabilities and actionability; never trust role or permission claims from the DTO/query.

Visibility, accountability, ability to perform the domain command, and notification remain separate. A Primary Bookkeeper may see a client bank-reconnect obligation as waiting while the client contact is the assignee. A Client Lead may see the same condition and be allowed to accept evidenced alternative records through the Finding/close decision path. None of that creates duplicate Work.

An inaccessible client/group/version should normally return `404`; a valid firm scope with a disallowed requested view returns `403` or a documented downgrade only when the UI explicitly asks for capability discovery. The initial snapshot simply returns authorized `available` scopes and facet options.

The frozen historical-Version endpoint has one narrow exception to active-Engagement portfolio rules: an active member of a former firm with the required historical/compliance capability may read an immutable submitted Version whose `engagement_id` belongs to that firm. The serializer reads only the Version snapshot and captured evidence. This authorization never adds the client to the former firm's current queue/facets and never permits live-ledger, current-Close, later-Version, Finding, Confirmation, Work, or command access.

## 10. Query-service design

```ts
type QueueSnapshotQuery = {
  firmCompanyId: string;
  authenticatedUserId: string;
  requestedScope: QueueScope | null;
  clientCompanyId: string | null;
  assigneeUserId: string | null;
  sectionLimit: number;
  includeUpcomingCloses: boolean;
};

interface QueueSnapshotQueryService {
  execute(query: QueueSnapshotQuery): Promise<QueueSnapshotDto>;
}
```

Execution:

1. Start a short read-only `REPEATABLE READ` transaction and capture one `generatedAt`.
2. Resolve the effective scope and authorized Engagement portfolio; return client/assignee facets and capabilities.
3. Run the indexed ordinary-group aggregate over open `work_items` for that portfolio, excluding close-only presentation codes such as `approve_period_close`, `respond_close_confirmation`, and `review_period_reopen_request`; use persisted `due_at` for ordering/overdue and a set-based active-Package join only to annotate the earliest deadline's source. Those excluded Work Items still contribute to authorized counts/stream projections and are composed by the Close query.
4. Run the one-row-per-client close query from the authorized Engagement/client portfolio, laterally selecting the optional client-owned Close Frontier and optional pending Reopen Request. This preserves a request-only row before Preview exists. Use persisted Close/Work `due_at` and return active Package context without deriving a replacement deadline.
5. Batch-enrich group aggregates through the registry. Each Work Type adapter receives all target IDs/aggregate keys for that type in one call.
6. Derive section placement, semantic attention, server copy, destinations, and cursors; commit the read transaction.

The base path is therefore three database statements, not one query per section and not one query per client. When richer queue summaries genuinely require target facts, the ceiling is one additional batch query per represented Work Type. Initial row copy should remain intentionally summary-level so the queue does not fetch evidence that belongs in a peek/workspace.

The group and close queries reuse the indexes proved in ticket 003. Before rollout, representative firms must be seeded and the exact plans verified with `EXPLAIN (ANALYZE, BUFFERS)` for personal, portfolio, firm, client-filtered, and assignee-filtered cases. A measured regression—not anticipated scale alone—is the trigger for another index or projection.

## 11. Cache, refresh, and consistency posture

- TanStack Query/in-memory HTTP caching is sufficient for navigation and back-to-queue reuse.
- Response `ETag` may be based on the scope/filter plus returned row versions; `If-None-Match` is an HTTP optimization, not authority.
- Server-confirmed command responses carry queue deltas/invalidation hints. The SPA applies those only after commit confirmation.
- The SPA opens one authorized SSE connection for the stable active firm. It does not open a connection per client, group, or workspace.
- Domain transactions that can change another viewer's queue commit a coalescible queue-invalidation outbox intent. The relay publishes it through the existing Redis infrastructure after commit; SSE carries only affected projection identities/revisions, never accounting records.
- An SSE invalidation triggers only the named snapshot, group, close, or workspace refetch. PostgreSQL and the HTTP DTOs remain authoritative.
- Focus, network reconnect, stream reset, a replay gap, or permission change triggers a full authorized snapshot refetch.
- Normal connected operation does not poll. Visible-tab polling with jitter runs only while SSE is unavailable and stops when the stream recovers.
- Redis may later cache an already-authorized snapshot by firm/user/scope/filter and an authoritative version watermark, but it must never be required to decide access or Work state.

## 12. What the queue DTO must not contain

| Omitted                                                  | Reason                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Individual Work Items on landing                         | Produces the jarring item-by-item UI the Work Group exists to prevent and creates oversized payloads.                         |
| Viewer role/current user supplied by the SPA             | Identity and capability are server facts; accepting them creates privilege escalation.                                        |
| Client roster supplied by the SPA                        | A filtered list cannot authorize database reads.                                                                              |
| `workGroupId` database identity                          | Groups are deterministic derived rows with no lifecycle.                                                                      |
| Mutable priority/readiness/blocks-close fields           | Those are derived from dates, registry semantics, target state, and close state.                                              |
| Historical routine deadline as current Package attention | Active Package deadlines are already persisted onto covered open Close/Work rows; Fiscal Period dates remain backlog context. |
| Domain evidence/details                                  | Loaded lazily by registered workspace adapters.                                                                               |
| Arbitrary action URLs or HTML/CSS                        | Use typed destinations, command codes, semantic tone/icon keys, and SPA-owned rendering.                                      |
| Completion/cancellation controls for Work                | Users perform domain commands; reconciliation ends Work.                                                                      |
| Persisted session completion                             | It is transient acknowledgment of confirmed commands, not accounting truth.                                                   |
| Client `health` as a lifecycle state                     | Work attention and Close state must not be conflated with the client relationship.                                            |

## 13. Validation against the two interfaces

### Retained from `workqueue-ui`

- queue as the scanning home and stream as the committed working posture;
- client accent safety, cross-client transition beat, and named commit actions;
- light inline peeks and heavy workspaces;
- one calm close cluster;
- server-confirmed disappearance and a transient completed-this-session area;
- responsive client filtering and session completion acknowledgment.

### Retained from Accountable Books

- searchable client roster and clear selected-client filtering;
- capability-gated add-client entry and no-client/no-match empty states;
- assignee/team filtering for authorized portfolio and firm views;
- mobile Queue/Clients tabs;
- the existing application shell, client intake components, and domain DTOs where their boundaries remain valid.

### Corrected rather than retained

- individual mock task rows become derived Work Groups;
- changing queue filters refetches an authorized server projection instead of filtering a frontend-supplied universe;
- client-row activation no longer changes firm context;
- Accountable Books mock parameters `viewerRole`, `currentUserId`, `clients`, and teammate initials do not cross the API boundary;
- separate close and close-approval rows for the same client collapse into one client Close Frontier row;
- `Unassigned` and `In progress` are removed from the canonical launch interface because the write model supports neither as normal state;
- `3 periods to close` becomes client-focused close copy;
- Preview-only closes do not occupy the top of the queue;
- add-client permission is returned as a capability, not inferred in the SPA from role names.

## 14. Acceptance scenarios

1. A Primary Bookkeeper lands on the queue and one HTTP request returns their authorized clients, active close rows, ordinary Work Groups, waiting client actions, and filter facets.
2. Changing `clientCompanyId` to a manager's unassigned client cannot reveal it; the target is rejected even if the ID is valid.
3. A manager defaults to `portfolio`; editing `scope=firm_oversight` cannot expand access without the explicit capability.
4. A Firm Admin with firm oversight can filter by an authorized team member using UUID and sees only work inside the firm.
5. A Contributor sees their assigned Work and only Package/close months relevant to their contribution, not the client's unrelated Close Frontier.
6. Two hundred transaction targets appear as one client/Work Type group; opening it pages target detail.
7. Uncategorized transactions and candidate reviews appear as separate groups but open one categorization workspace with two panels.
8. A client awaiting April approval with May preparation available produces one close row. Lead copy asks for the April decision; bookkeeper copy reports waiting and offers the client close workspace.
9. Preview-only clients do not lead the queue; `See upcoming closes` loads them on demand.
10. A client bank connection in `requires_action` appears once for the client assignee and as waiting visibility for the firm team; revoked connections create no queue row.
11. A caught-up authorized client remains searchable in the rail and produces a useful empty filtered queue.
12. Add client is present only when the server capability permits it and links to Accountable Books' intake rather than creating a manual Work Item.
13. A command that resolves the final target returns a confirmed group removal/delta; the SPA moves it to session completion only after that response.
14. A stale group key or superseded close Version returns a safe current-state response without showing another firm's/client's existence.
15. Initial plans remain indexed and bounded without a Work Group table, view, Redis read projection, or IndexedDB; SSE transports invalidations but owns no queue data.
16. An active Catch-up Package covering twelve historically late months but due next month produces one client Close row, no package-covered overdue count, and Package-focused copy using that future deadline.
17. When that Package deadline passes, the Package/client becomes overdue once; its covered open Work Groups and Close row use the same persisted deadline without creating twelve monthly overdue rows.
18. Changing a Package deadline with current version, authority, and reason updates every covered open Period Close and Work Item atomically; the next snapshot/delta reflects the new deadline and audit evidence records the change.
19. Splitting or replacing a Package requires an explicit deadline for every replacement and propagates each deadline only to its range. Reassigning a Package changes its accountable assignee but leaves its deadline unchanged.

## 15. Implementation boundary handed to the next tickets

Ticket 006 defines command envelopes, independent/all-or-nothing bulk results, row/group version checks, queue delta responses, stale-result handling, and launch SSE invalidation. Ticket 007 should map these DTOs into the final responsive component tree, route transitions, peek/workspace loading states, close copy, accessibility, realtime refresh states, and error/empty states. Ticket 008 should introduce these endpoints beside existing Accountable Books mocks/legacy queue reads, compare projections, and cut the UI over only after authorization, count, performance, and realtime recovery are proven.
