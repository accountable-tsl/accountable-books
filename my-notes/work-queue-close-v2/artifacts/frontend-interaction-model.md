# Work Queue and Close V2 frontend interaction model

## Decision

The final interface combines `workqueue-ui`'s calm queue, grouped work, focused stream, close workspace, and client-safety cues with Accountable Books' searchable client roster, capability-gated link into its separately owned client-intake flow, team filters, responsive Queue/Clients split, mature empty/error states, and surrounding application shell.

The SPA remains deliberately projection-driven. It receives one authorized firm-scoped snapshot, renders the ordered sections and capabilities returned by the server, and lazily loads peeks/workspaces. It never reconstructs Work Groups, Close Frontiers, access, priority, actionability, or close readiness. Accounting commands are server-confirmed. One firm SSE stream invalidates only affected projections; polling is a degraded fallback while SSE is unavailable.

This artifact fixes the component tree, routes, interaction states, copy responsibilities, command behavior, responsive behavior, and DTO-to-UI mapping. It does not create a second frontend source of domain policy.

## 1. Product posture

The interface has two complementary postures:

1. **Scan and choose** on the queue. A user can understand the firm's immediate work, narrow it by authorized client or person, inspect a group, and deliberately enter work.
2. **Focus and progress** in a workspace/stream. Dense accounting work gets the screen it needs, while the client identity and the route back to the queue remain persistent.

The continuous stream is an accelerator, not the only navigation model. `Start working the queue` appears in `my_work` and `portfolio`; it does not appear in `firm_oversight`. Rows also expose direct workspace entry so a user can choose a specific starting point.

## 2. Route and component tree

```text
/firms/:firmCompanyId/work-queue
└── WorkQueuePage
    ├── FirmShellHeader
    ├── QueueScopeSwitch                 (only when availableScopes.length > 1)
    ├── QueueStatusNotice                (stream completion / external update / degraded live state)
    ├── MobileSurfaceTabs                (Queue / Clients)
    ├── QueueSurface
    │   ├── CloseCluster                 (zero or one)
    │   │   └── CloseClientRow           (at most one per authorized client)
    │   ├── QueueSection[]               (server ordered)
    │   │   └── WorkGroupRow[]
    │   │       └── WorkGroupPeek        (lazy, inspection only)
    │   └── HandledThisSessionDrawer     (browser-session projection only)
    └── ClientRoster
        ├── ClientSearch
        ├── AddClientAction              (capability gated)
        ├── AssigneeFacet                (authorized portfolio/oversight only)
        └── ClientFacetRow[]

/firms/:firmCompanyId/work-queue/groups/:groupKey
└── WorkStreamShell
    ├── ClientIdentityHeader
    ├── QueuePositionNavigation
    ├── ClientSwitchBeat
    └── RegisteredWorkspace
        ├── CategorizationWorkspace
        ├── JournalWorkspace
        ├── FindingWorkspace
        └── registered future workspaces

/firms/:firmCompanyId/close/:engagementId
└── WorkStreamShell
    └── CloseWorkspace
        ├── AwaitingLeadState | StaleSubmissionState
        ├── ClearOpenWork
        ├── ResolveFindings
        ├── CompleteFinalChecks
        └── ReviewAndSubmit | ReviewAndClose | ReviewSubmission

/firms/:firmCompanyId/reopen-requests/:periodReopenRequestId
└── WorkStreamShell
    └── PeriodReopenRequestWorkspace
        ├── LateTransactionContext
        ├── CascadeImpactPreview
        └── ApproveReopen | RejectWithReason

/clients/:clientCompanyId/actions
└── ClientActionCentre
    └── BankReauthorizationAction
```

Route names may be adapted to Accountable Books' router, but firm context and identities may not be changed: the firm company is the active application context; a client ID is an authorized filter or domain target.

## 3. Queue scopes and authorization presentation

The initial snapshot returns `scope.effective`, `scope.available`, filters, and capabilities. The SPA does not infer these from role labels.

| Scope | Default use | UI behavior |
|---|---|---|
| `my_work` | Directly assigned Work and the viewer's own decisions | Personal queue and continuous stream |
| `portfolio` | Assigned-client responsibility plus directly assigned contributor Work | Default for managers, Client Leads, Primary Bookkeepers, firm owners, and freelancers |
| `firm_oversight` | Explicitly authorized whole-firm exception/coordination view | Available only when returned by the server; no continuous-stream CTA |

When more than one scope is available, a compact `My work / Portfolio / Firm oversight` switch appears near the queue heading. Managers still land on `portfolio`, not whole-firm oversight. Changing scope sends a new snapshot request; it is not a client-side widening of an already loaded result.

The production persona switch in the prototype is removed. It remains only as a local test control. Assignment does not grant access, role names do not determine approval, and a forged client/assignee/scope query cannot expand the authorized projection.

## 4. Landing request and rendering

The queue makes one landing request:

```http
GET /api/v2/firms/{firmCompanyId}/work-queue
  ?scope={requestedScope}
  &clientCompanyId={optionalNarrowingFilter}
  &assigneeUserId={optionalAuthorizedNarrowingFilter}
  &sectionLimit=20
  &includeUpcomingCloses=false
```

The response from ticket 005 supplies:

- authorized effective/available scopes;
- client and assignee facets, including caught-up clients;
- capability-gated top-level actions such as client intake;
- one Close cluster with one row per relevant client;
- ordered semantic queue sections and derived Work Group rows;
- stable copy, attention, destination, counts, and allowed UI actions;
- projection revisions and refresh tokens used by commands/SSE.

The SPA renders the returned order. It may retain expanded-row, mobile-tab, scroll, and handled-this-session state, but it may not reclassify groups or derive permission/domain state.

Selecting a client updates the URL and requests the same queue narrowed to that authorized client. It does not switch the active company. `Open books` is a separate explicit action when the user wants the client's normal accounting workspace.

## 5. Queue sections

Empty sections are omitted. The server provides final section ordering; the launch presentation follows these semantics:

### Personal and portfolio

1. Month-end Close, when any visible client needs a current action or decision.
2. Ready to work.
3. Waiting on clients.
4. Waiting on the team or another dependency.
5. Upcoming Closes, only when no active close exists or after explicit expansion.

### Firm oversight

1. Close decisions/current close attention.
2. Overdue attention.
3. Ready portfolio work.
4. Waiting on clients.
5. Waiting on the team.

There is no normal `Unassigned` section because every open Work Item has an accountable actor or producer fallback. There is no authoritative `In progress` section because Work has no stored in-progress lifecycle. A future presence feature may display ephemeral activity without changing Work state.

`Handled this session` is browser-session feedback, not another server Work status. It contains targets confirmed by local command responses and explanatory outcomes such as `Handled elsewhere`.

## 6. Work Group rows and peeks

A row represents one server-derived Work Group, not one atomic Work Item. Its identity is `engagement + work type`; its count may represent hundreds of targets.

The row contains only projection data already supplied by `WorkGroupRowDto`:

- client identity and stable accent;
- server-generated group title and summary;
- total/actionable/waiting/overdue counts;
- earliest due/attention copy;
- destination workspace;
- safe bulk availability summary where relevant.

Clicking the row opens a lazy peek. A peek returns at most three target summaries and is inspection-only: no accounting mutation, no direct Work completion, and no hidden client-context change. The explicit workspace action enters the registered workspace. Light domain actions may remain inline only when their domain command and evidence genuinely fit; the row still waits for server confirmation before it changes.

The row's deadline is always the effective operational deadline returned by the projection. When its earliest target is covered by an active Catch-up/Reclose Package, the row uses the Package-aligned persisted deadline and may identify the Package in its due copy. The SPA never compares the historical monthly deadline and substitutes its own result.

## 7. Categorization: related, not merged

`categorize_bank_transaction` and `review_categorization_candidate` remain separate Work Groups because they have different target identities and safe actions:

| Panel | Meaning | Data | Bulk |
|---|---|---|---|
| Uncategorized | No acceptable accounting decision exists yet | Bank transaction and accounting context; no confidence | No blind bulk categorization |
| Suggestions | A concrete candidate is ready for review | Candidate, root transaction, proposed entries, confidence, evidence | Server-issued bounded bulk manifest may allow acceptance |

Both groups open the same `CategorizationWorkspace`. The selected group determines the focused panel, while the sibling panel and count remain visible. Switching panels changes group identity/cursor without leaving the client workspace.

Bulk acceptance:

1. The workspace renders only the explicit manifest returned by the server.
2. The CTA names the target client: for example, `Post 12 safe to Nova Design Studio`.
3. Click creates one `commandId` UUID and shows an in-flight state; no row disappears. The same ID is reused only for transport retries of this unchanged bulk command.
4. The server returns a result per independent target.
5. Successful targets move to handled state; stale/forbidden/failed targets remain with specific recovery actions.
6. The group count and queue placement come only from the confirmed delta/refetch.

There is no generic accounting undo. A genuine reversing/correcting action is a separate domain command with its own authorization and audit semantics.

## 8. Month-end Close presentation

The queue contains one collapsed Month-end Close cluster. Its summary counts clients, for example `3 clients need close attention`, never periods. Even one client remains inside the single cluster shape so the queue is stable across month-end volume.

Opening the cluster shows at most one row per client. The row is selected from the earliest unresolved Close Frontier and may summarize the immediately following preparation month:

- Client Lead: `April needs your approval` → `Review close`.
- Primary Bookkeeper: `April is with Maria for approval · May preparation is available` → `Open workspace`.
- Same person holds both responsibilities: `May is ready for you to review and close`.
- Preview only: `May close starts in 3 days`; this belongs under `See upcoming closes`, not the urgent count.

The prototype's separate `Waiting on approval` close row is rejected. Approval Work remains atomic backend Work, but its primary presentation is the same client Close row.

The operational Close workspace is entered through the current Engagement rather than a period-row route, while each underlying Period Close remains client-owned across firm changes and reopen cycles. Its launch phases are:

1. **Clear open work** — reuse the client's existing blocking Work Groups for the frontier period.
2. **Resolve findings** — show transaction/root findings as soon as they exist and period-level findings when their evaluation context becomes valid.
3. **Final checks** — human confirmations that cannot be inferred safely.
4. **Review** — submit for approval, review and close, or review a frozen submission.

If submission is awaiting the Client Lead, the Primary Bookkeeper sees a frozen waiting state and may move naturally to the immediately following preparation month. If material facts change, the approval becomes stale and the workspace returns to preparation with an explanation.

The final close CTA requires a concise confirmation dialog that names client and period. Closing does not lock the fiscal period. Reopening and locking remain separate controlled domain flows.

### Catch-up Package presentation and deadlines

Catch-up does not change the calm queue shape. The Month-end Close cluster still shows at most one row per client, with the active Package as context around that client's current monthly frontier. Copy leads with the range, accountable assignee, and effective deadline—for example, `Catch-up Jan–Dec 2024 · due 30 September`—rather than presenting every historical month as separately overdue. The Package becomes overdue only after its own deadline; underlying Fiscal Period labels and dates remain visible in the Close workspace as accounting history, not current attention dates.

Package creation is a Client Lead/`manage_close_packages` flow inside the expanded Close client row or Close workspace. The Client Lead must explicitly select and confirm a deadline and eligible assignee before accepting the Package; the CTA remains unavailable while either is missing. Launch promises no fixed Catch-up/Reclose duration or system-generated deadline suggestion. A future non-authoritative suggestion can be added without changing the Package identity or command contract.

Package management keeps assignment and deadline as separate decisions:

- splitting or replacing a Package requires an explicit assignee and deadline for each replacement range;
- reassignment does not silently change the deadline;
- changing an accepted Package deadline is available only with current authority, requires a nonblank reason, and confirms the affected client/range before submission; and
- after server confirmation, all covered open Close/Work rows immediately use the new operational deadline for ordering, counts, attention, and copy.

The Close workspace may show monthly progress, Findings, Confirmations, and historical routine dates because monthly truth is preserved. The landing queue never expands that truth into dozens of late monthly rows.

### Late transactions in closed periods

A transaction whose bank date falls in a closed/locked month does not appear in the ordinary Uncategorized or Suggestions panels until its posting-period decision is valid. Its `transaction_dated_in_closed_period` Finding opens a focused decision state showing the immutable bank date and affected month:

- `Match an existing transaction` is available when the match changes no closed-period accounting fact;
- `Record in an open period` suggests the earliest suitable open `fs_date`, allows an authorized alternative, and then enters normal categorization/matching while preserving both dates;
- `Review reopening impact` appears directly for the Client Lead, Firm Admin, or reopen-capable actor;
- `Request reopening` appears for an authorized bookkeeper who lacks reopen authority.

The request leaves all covered retroactive Findings visible as waiting and creates one Client Lead decision Work occurrence. Its only landing representation is the affected client's single Close row; it is included in counts and the continuous stream but is not repeated as an ordinary Work Group. The decision owner sees `Review reopening request`, the requester sees `Waiting for {Client Lead}`, and observers see pending context. All open the same dedicated workspace, with commands omitted for read-only viewers.

The workspace shows the initiating transaction when present, every currently covered retroactive Finding, starting month, chronological cascade, locked months, affected approvals and known reports, effective deadline, and clear `Reopen periods` / `Reject request` actions. Rejection requires a note and returns every still-open covered Finding to its current bookkeeper with open-period/match guidance; it never marks an affected transaction handled. Same-person Lead/Bookkeeper users see the direct action only. A Firm Admin or explicitly reopen-capable actor may decide an authorized request, but the accountable assignee remains the current Client Lead.

If any affected month is locked, reopening is unavailable and the workspace explains the remaining safe treatments. After successful reopen, ordinary categorization Work appears against the now-open original month; the UI does not imply that reopening categorized the transaction.

Former firms may open only frozen Close Version evidence attributable to their ended Engagement. That historical view contains no current ledger, Work, later Versions, or navigation into the client's live workspace.

## 9. Continuous stream and client safety

`Start working the queue` enters the first server-ordered actionable destination for the current personal/portfolio snapshot. A direct row action enters at that group. Previous/next navigation follows server continuation tokens or refreshed ordering; the SPA does not invent priority.

Every workspace pins:

- client name and stable accent;
- work title/panel;
- queue position or continuation context;
- a one-step route back to the queue.

Crossing clients triggers the short client-switch beat. It is not a confirmation toll: the destination client fills the screen briefly, Enter may advance immediately, and Escape returns. Buttons that commit accounting state name the client or show the pinned client identity immediately beside the action. Color is supplemental, never the only cue.

`Not now` may leave the stream, but it must not silently mutate authoritative Work deadlines or priority. If the launch product needs session-local deferral, it changes only the stream continuation for that browser session.

## 10. Command interaction state machine

Every domain command uses this generic UI state machine:

```text
idle
  -> confirming (only for consequential aggregate actions)
  -> submitting (same commandId retained for retries)
  -> confirmed (apply domain result + authorized queue delta)
     -> handled / next target / refreshed workspace
  -> partial (independent bulk only; successful units handled, failures remain)
  -> stale (show new state and required refresh; never replay user intent silently)
  -> busy_or_unknown (bounded same-commandId retry; keep explanatory pending state)
  -> failed (specific safe retry or return path)
```

The UI never calls a generic Work complete/cancel/reopen endpoint. It sends domain intent and may include Work identity/version only for target context and stale explanations; `commandId` owns command correlation.

## 11. Realtime and external changes

The SPA opens one SSE connection for the active firm. Invalidation events identify an authorized projection and contain no accounting evidence.

| Event | UI behavior |
|---|---|
| Local command confirmed | Apply its returned delta; invalidate only named queries |
| Inactive row changed elsewhere | Targeted refetch and quiet in-place update; preserve scroll/focus when possible |
| Expanded/open target resolved elsewhere | Keep the frame visible as `Handled elsewhere`, explain actor/system when available, then offer next/back |
| Many rows reordered | Coalesce into one accessible `Queue updated` notice; do not show a toast per target |
| SSE reconnect | Resume with `Last-Event-ID`, then full authorized snapshot refetch before trusting the stream |
| SSE unavailable | Show subtle degraded-live status and poll visible queue every 30s / active head every 15s with jitter; stop immediately on recovery |
| Browser focus returns | Validate the active snapshot/workspace once |

No open accounting row is yanked away while the user is reading or acting on it.

## 12. Client-facing obligations

Ticket 007 includes only the bounded client surface required to complete a firm workflow; it does not redesign the client portal.

When a bank connection requires reauthorization:

- one client Work occurrence exists for the connection;
- the client sees a persistent Action Centre/card plus a contextual banking-page callout and notification;
- the CTA opens the provider reauthorization flow;
- Primary Bookkeeper and Client Lead see the same obligation as `Waiting on client`, not as an action they can perform;
- successful provider verification resolves the Work and sends firm-scoped invalidation;
- deliberate `revoked` disconnection creates notification only and no reconnect Work.

Ordinary sync delay/failure that the system can retry creates no user action.

## 13. Client roster and intake

The desktop roster is a right rail; mobile uses a dedicated `Clients` tab. It includes every authorized active bookkeeping Engagement in scope, even when caught up. A row reports Work/Close facts (`2 ready`, `1 waiting`, `close attention`) and never assigns a lifecycle `healthy/unhealthy` status to the client itself.

Roster actions:

- search by client name/reference;
- narrow the queue by client;
- narrow by assignee only when the snapshot capability/facet permits it;
- open books explicitly;
- start client intake when `topLevelActions` permits it.

`Add client` does not create Work. It links to the client-intake flow owned elsewhere in Accountable Books. That flow must capture/default Client Lead, Primary Bookkeeper, conversion boundary, first managed month, and any accepted catch-up scope before calling V2 Engagement activation. Direct signup, branded signup, referral review, and firm transfer meet the same activation contract through their own entry routes. Work Queue and Close V2 owns the capability-gated entry and post-acceptance queue result, not the invite/signup UI or its pending lifecycle.

## 14. Responsive behavior

### Desktop

- queue and client roster remain visible together;
- queue is the larger column;
- roster search/add/filter controls remain sticky enough for long queues;
- dense workspaces may use tables, panes, or keyboard controls where the domain benefits.

### Mobile

- top-level `Queue / Clients` tabs replace the compressed horizontal client-chip strip;
- choosing a client returns to Queue with the filter visible and removable;
- scope switch scrolls horizontally if needed;
- heavy workspaces become focused single-column surfaces with sticky primary action;
- no hover-only action or color-only status exists;
- swipe/arrow navigation is optional acceleration, never the only navigation.

## 15. Loading, error, stale, and empty states

| Boundary | Required state |
|---|---|
| Initial snapshot | Layout-preserving skeleton; do not flash an unauthorized empty queue |
| Snapshot failure | Firm-safe error, retry, no stale cross-firm data |
| Empty effective queue | `Nothing needs attention here`; roster still exposes caught-up clients |
| No client search match | Clear-search action; Add Client only when authorized |
| Group peek loading/failure | Keep row and expansion stable; retry only the peek |
| Workspace loading/failure | Preserve client header and route home; retry workspace target |
| Stale target/version | Explain the current state and point to refreshed group/current Close Version |
| Access changed | Clear affected caches and return 404/authorized queue without revealing hidden identities |
| Partial bulk | Success summary plus target-specific failures that remain actionable |
| Connection degraded | Small persistent live-status indicator, not an alarming modal |

## 16. Accessibility and safety requirements

- Scope, Queue/Clients, categorization panels, and roster selection use correct tab/pressed semantics.
- Every status update is announced once through an appropriate live region; bulk outcomes are summarized rather than spammed.
- Expanded rows preserve keyboard focus after refetch.
- A client accent always has a text/avatar/name companion and passes contrast requirements.
- Keyboard shortcuts are disabled while typing and have visible-button equivalents.
- Consequential dialog focus is trapped and restored to its launching control.
- Reduced-motion users retain the perceptual client-switch duration but do not receive decorative motion.
- Command buttons expose pending/disabled state without making an unknown outcome look failed.

## 17. Prototype coverage

The throwaway `workqueue-ui` prototype demonstrates the core queue/stream composition, not every accepted launch flow:

- `/` — portfolio queue, client roster, scope switch, one client Close Frontier row, Queue/Clients mobile split;
- `/?variant=loading` — initial snapshot loading;
- `/?variant=error` — safe snapshot failure and retry;
- `/?variant=empty` — empty effective scope while roster behavior remains understandable;
- `/?variant=updated` — coalesced external queue update;
- `/stream/t-summit-categorize` — Uncategorized panel;
- `/stream/t-summit-review-candidates` — Suggestions panel and server-confirmed bulk pending state;
- `/stream/t-summit-review-candidates?variant=handled` — active target handled elsewhere;
- `/stream/t-summit-close-april` — Primary Bookkeeper waiting on Client Lead with May preparation available;
- switch prototype persona to Maria, choose Firm oversight, then open Summit close — Client Lead review path.

Prototype local state is illustrative. It is not a production DTO implementation or permission source. Its current Firm-oversight mock still contains `Unassigned`/`In progress` concepts that the production model explicitly rejects. Catch-up planning and Package management, late-transaction treatment, Reopen Request review, and the client Action Centre remain to be exercised in prototype states before production frontend implementation.

## 18. Explicit rejections

- no individual target flood on the landing queue;
- no stored frontend Work Group lifecycle;
- no role-derived authorization or free manager view;
- no client-row click that silently switches company context;
- no separate close approval row for a client already in the Close cluster;
- no normal Unassigned or In progress queue bucket;
- no confidence/bulk action on uncategorized transactions;
- no generic accounting undo;
- no optimistic disappearance before server confirmation;
- no silent removal of active work resolved elsewhere;
- no polling during healthy SSE operation;
- no IndexedDB/offline command queue in the launch scope.

## 19. Implementation boundary for ticket 008

Ticket 008 should introduce this interface beside the legacy Accountable Books queue and close surfaces. It should bind components to ticket 005 DTOs and ticket 006 command/SSE contracts, not port the prototype's `Task` type or local role logic. The migration must prove authorized counts, one-client Close Frontier behavior, client filters, command deltas, partial bulk, stale-state recovery, live invalidation, and representative query/interaction performance before the new route becomes default and legacy models are removed.
