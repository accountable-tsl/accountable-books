# Define the close lifecycle and close-work model

- Status: closed
- Claimed by: Temi with Codex
- Type: grilling
- Blocked by: none
- Blocks: `003`, `004`, `005`, `006`, `007`, `008`

## Question

What is the simplest authoritative period-close aggregate, lifecycle, version/approval model, readiness contract, and mapping from Findings/Confirmations/approval responsibilities into atomic work and display groups?

## Working decisions agreed

### Monthly invariant and frontier

- Launch-scope close is always monthly. Do not implement quarterly or annual close cadence or service schedules.
- Every managed month is closed independently and in chronological order.
- Each client has one actionable close frontier: the earliest ended, unclosed managed month.
- Later months may accumulate and their ordinary bookkeeping may continue, but they cannot close before the frontier.
- Completing the frontier should advance naturally to the next waiting month where the viewer has relevant work.

### Routine lifecycle and timing

- Hidden firm defaults open Preview five business days before the client's month-end and set the close due date five business days after month-end.
- Lifecycle: `preview -> preparing -> awaiting_approval -> closed`.
- Period Close itself has no transfer-superseded state. An unfinished Period Close Version is superseded when responsibility changes; the same client-owned Period Close continues under the receiving Engagement's next Version.
- Preview becomes Preparing when the monthly period ends.
- Overdue is derived from due time and current lifecycle; it is not a lifecycle state.
- Rejected/sent-back approval returns the close to Preparing with the decision and reason retained in history.
- Material accounting changes while approval is pending make the approval stale and return the close to Preparing.

### Responsibilities and approval

- The Primary Bookkeeper prepares and submits; the Client Lead approves and closes.
- Submission is allowed only after period-end, the prior managed month is closed, blocking work is clear, period findings are resolved or decisioned, and required checks are complete.
- Normal approval closes the fiscal month. Exceptional locking remains distinct.

### Queue presentation

- The queue has one Month-end Close cluster, not one top-level row per period.
- Expanding it shows at most one row per client, summarizing that client's close frontier and backlog.
- Default expansion focuses on clients with current close attention; preview clients belong under an upcoming-close affordance rather than generic all-client copy.
- Exact production copy and visual treatment will be finalized in the frontend interaction ticket using the prototype as a reference.

### Close workspace

- Phase 1 clears existing authoritative queue work that blocks the concerned period; close references/embeds it and does not duplicate it.
- Phase 2 resolves period-shaped findings that are inappropriate or noisy as daily work.
- Phase 3 completes curated, accounting-basis/client-relevant Close Confirmations presented as Final checks, using confirmed/not-confirmed/not-applicable responses with reasons where required.
- Phase 4 submits for approval, or submits and closes when the same eligible member holds both responsibilities.

### Catch-up

- Catch-up is a bounded agreement to repair a historical monthly range.
- Monthly period-level validation, Findings, evidence, Confirmation state, close history, and audit remain authoritative even when months are worked through a package.
- A catch-up package includes at most twelve contiguous months and should align to fiscal-year boundaries where possible.
- Each Package has one explicit operational deadline selected and confirmed by the Client Lead when the Package is created. No fixed Catch-up/Reclose duration or system-generated default is promised. While the Package is active, its selected deadline—not each month's historical routine deadline—drives queue ordering, overdue attention, counts, and copy for its covered open Close and Work.
- Packages close sequentially. Later packages may be prepared in parallel but cannot be approved before earlier packages.
- A single catch-up client still occupies one client row under the Month-end Close cluster.
- New-client catch-up scope is derived from conversion/opening-balance boundary, books-complete-through period, and the receiving firm's agreed responsibility range.
- Existing period work and findings are preserved when routine closes are reorganized into catch-up; replaced package-level workflow is superseded rather than silently mutated or deleted.

### Entry and firm changes

- Signup date does not define the first close. The active Firm–Client Engagement and bookkeeping boundary do.
- Firm invitation, branded signup, direct platform signup/placement, and firm transfer must all establish the receiving firm's responsibility start, prior books-complete-through boundary, opening-balance/conversion boundary, Client Lead, Primary Bookkeeper, and any accepted catch-up range before managed close work is activated.
- Firm transfers do not blindly transfer work or approvals. Historical attribution stays with the old engagement; the new firm materializes work from accepted responsibility and catch-up scope. Any replacement Close Packages are new rows linked to the old engagement's superseded Package rather than rewritten ownership.
- If transfer occurs before close completion, the old Engagement's current Period Close Version is superseded and the receiving Engagement creates the next Version on the same client-owned Period Close without rewriting historical evidence.

### Same-person completion

- When Primary Bookkeeper and Client Lead are the same eligible member, use one named `Review and close <period>` command with explicit client/period confirmation.
- The command performs submission and approval atomically but records separate submission and approval audit events with the same actor and `commandId`.
- No self-addressed approval work item is created. A future separation-of-duties policy may disable this shortcut without changing the lifecycle.

### Exceptional locking

- Define lock invariants now but defer lock workflow and UI beyond the launch close scope.
- Locking is never automatic, never closes an open month as a side effect, and requires already-closed periods.
- A financial-year lock requires every included monthly period to be closed first.
- Do not offer ordinary monthly lock controls or time-based lock suggestions at launch; annual accounts/tax/audit finality must drive a future product workflow.

### Accounting findings and Close Confirmations

- Existing objective bookkeeping work remains actionable before period-end.
- Finding evaluators materialize Accounting Findings as soon as sufficient authoritative facts exist. Transaction, journal, and ledger findings may therefore become actionable immediately rather than waiting for month-end.
- Findings that require complete period evidence may calculate provisional signals during Preview, but become durable/actionable after period-end and are fully revalidated before submission.
- Findings express an accounting obligation and evidence, not a mechanically required journal frequency.
- A finding definition exposes context-aware resolution strategies. Example: catch-up depreciation may be resolved through an appropriate annual/catch-up journal, a recurring monthly journal with an end date, or an evidenced not-applicable decision where policy permits.
- Period findings remain authoritative per month with independent facts hashes and evidence.
- Package UI may roll equivalent monthly findings into one exception family with affected-month chips; one resolution may satisfy several monthly findings only when re-evaluation proves it did.
- Close Confirmations are distinct from Findings: policy requires a human confirmation even when the system detected no anomaly. Confirmation responses remain monthly, and bulk response entry is allowed with explicit monthly exceptions.

### Approval work

- Separate-role submission creates one `approve_period_close` work item for the Client Lead.
- Reviewer presentation includes client, period/package, preparer, submission/due/overdue times, financial summary, Finding/Confirmation completion, material changes since review, and a review destination.
- Approval happens in the review workspace; the queue does not expose an unsafe blind approve action.

### Existing-client catch-up threshold

- Contracted catch-up for a new/receiving engagement has no minimum range.
- Converting an existing client's routine backlog requires at least six contiguous ended, unclosed months starting at the close frontier.
- Existing-client eligibility requires no active package covering the frontier, a frontier in Preparing rather than Awaiting Approval, all candidate months within the active engagement, and no locked month in the range.
- The system surfaces a contextual recommendation primarily to the Client Lead. Firm members with the explicit `manage_close_packages` oversight capability may also see it; the Primary Bookkeeper is not repeatedly prompted unless they are also the Client Lead.
- The recommendation appears in the expanded Month-end Close client row and Close workspace with `Review catch-up plan` and `Continue monthly` choices. It is optional organizational advice, not a Work Item, close blocker, or regular Work Group.
- Eligibility is re-evaluated after period end, period approval, rejection or staleness, package completion or supersession, engagement activation, and a daily reconciliation sweep.
- The existing notification/attention mechanism records one attention episode per engagement while the backlog remains continuously eligible. `Continue monthly` suppresses that episode; frontier movement does not prompt again. Falling below six eligible months ends the episode, and a later new six-month backlog may produce another. Accepting the recommendation creates the real package rows.

### Catch-up packages and assignment

- Client Leads may assign different packages to different eligible contributors.
- Later packages may be prepared concurrently but cannot submit or approve before prior packages close.
- Package assignment offers an explicit choice about reassigning existing in-range work; it never silently steals work from another contributor.
- Splitting or replacing a Package requires an explicit deadline for every replacement. Reassignment alone preserves the existing deadline.
- Changing an accepted Package deadline requires Client Lead or `manage_close_packages` authority, current Package version, and a nonblank reason; it is audited and updates all covered open Close/Work operational deadlines atomically.
- The current Client Lead has that Package-management authority inherently for their own Engagement. `manage_close_packages` is a delegated exception for another authorized firm member and never grants Package approval authority.
- Each viewer still receives one close client row focused on their relevant package, while Client Lead/Admin views retain the overall package frontier.
- Package approval is all-or-nothing. A clean contiguous prefix may be split into its own package explicitly before submission.

### Reopening and Period Close Versions

- Reopening a closed month is restricted to the Client Lead or Firm Admin and requires a reason.
- The impact preview must show that the selected month and every later closed month become reopened/stale because later balances depend on the earlier period.
- Reopening never deletes prior approval decisions, Findings, Confirmation responses, or audit history; it supersedes the approved Period Close Version and creates the next numbered Version for the changed facts.
- A confirmed reopen creates a bounded reclose/correction plan, regenerates affected work from current facts, and revalidates affected months in chronological order.
- If the affected range is at least six months, recommend organizing it with the same bounded package mechanics as catch-up.
- Retroactive facts such as a newly connected bank account produce a `closed_period_impact` decision for the Client Lead rather than reopening automatically. The decision presents safe options such as verified opening-balance treatment, documented exclusion where legitimate, or cascading reopen.
- A bank transaction dated inside a closed month specifically creates a late-impact Finding rather than impossible ordinary categorization Work. It may be matched without ledger mutation, recorded with an open `fs_date`, reopened directly by an authorized actor, or escalated through a durable Period Reopen Request whose rejection returns the unresolved transaction to the bookkeeper.
- Cascading reopen is client-scoped and may cross prior Engagement attribution. The current Engagement must accept responsibility back to the selected month; old Versions remain immutable and new Versions belong to the current Engagement.

## Resolution

Close is a monthly, sequential, client-owned process operated through the currently responsible Engagement and surfaced as one client row inside one Month-end Close cluster. Routine close opens in Preview five business days before month-end, becomes Preparing at period-end, is due five business days later, and proceeds through approval to Closed. Each Version records the Engagement that performed it. The workspace reuses existing blocking work, then resolves period findings, monthly human checks, and approval. Catch-up and reclose use Engagement-owned packages while retaining client-owned monthly truth. Reopening cascades client-wide under explicit authority and creates current-Engagement Versions without rewriting predecessor evidence.

## Deferred to later tickets

- Exact tables, fields, constraints, indexes, Period Close Version columns, and transaction boundaries: authoritative schema ticket.
- Exact work-item identities, producers, resolution predicates, and bulk materialization: producer/reconciliation ticket.
- Exact queue/approval/close DTOs and copy: projection/API and frontend interaction tickets.
- Exact bulk endpoints, idempotency, all-or-nothing package approval, and per-item accounting batches: command/concurrency ticket.
- Lock product workflow/UI, tax integration, and messaging escalation remain outside the launch close scope.
