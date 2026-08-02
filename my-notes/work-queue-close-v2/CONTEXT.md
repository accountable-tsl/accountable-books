# Accountable Books Work and Close

This context defines the language for system-derived accounting work, firm responsibility, and monthly close. These terms describe business identities and responsibilities, not database or UI implementation.

## Firm and client responsibility

**Firm–Client Engagement**:
The effective-dated agreement under which one firm serves one client for a service domain. It is the responsibility and authorization boundary for firm-routed Work and for attributing who prepared a Period Close Version; it does not own the client's books, Fiscal Periods, or Period Closes.
_Avoid_: Client assignment, permanent firm link

**Accounting Conversion Date**:
The client-owned date at which its opening-balance/accounting history begins in Accountable Books. It may fall inside a monthly Fiscal Period and remains stable when the client changes firms.
_Avoid_: Firm cutover date, automatically the first day of a month

**First Managed Period**:
The earliest monthly Fiscal Period whose bookkeeping close a Firm–Client Engagement has accepted. It may contain or follow the Accounting Conversion Date and may predate the firm's operational cutover when catch-up is contracted.
_Avoid_: Signup month, conversion date, engagement start timestamp

**Client Lead**:
The firm member accountable for the client relationship and close approval. Every active engagement has exactly one Client Lead.
_Avoid_: Manager when referring to client responsibility

**Primary Bookkeeper**:
The firm member primarily accountable for routine bookkeeping and close preparation for an engagement. Every active engagement has exactly one Primary Bookkeeper.
_Avoid_: Assignee when referring to the ongoing client responsibility

**Contributor**:
A firm member granted continuing access to help with a specific engagement without becoming its Client Lead or Primary Bookkeeper.
_Avoid_: Automatically assigned teammate

## Work

**Work Item**:
One system-detected, independently finishable accounting action against one domain target. Users resolve the underlying condition; they do not manually complete or manage the Work Item itself.
_Avoid_: Task, user-created work, grouped row

**Work Type**:
The stable semantic definition of what must be done, what kind of target it concerns, how assignment is normally routed, and how it is presented.
_Avoid_: Target type, UI category

**Work Target**:
The underlying accounting or close record whose current condition requires attention.
_Avoid_: Work Item when referring to accounting truth

**Assignee**:
The one person currently accountable for moving a Work Item or Close Package forward. Other authorized people may still act, and assignment does not grant permission.
_Avoid_: Responsible User, sole permitted actor

**Work Group**:
A display-only collection of open Work Items of one Work Type for one client engagement. It has no lifecycle or authority independent of its Work Items.
_Avoid_: Task, persisted group, source of truth

**Persistent Visibility**:
Ongoing ability to see work because of engagement responsibility, client access, or an explicit oversight capability. It is distinct from being assigned, being able to act, or merely receiving a notification.
_Avoid_: Observer role

**Notification**:
A message informing a recipient about a meaningful event. Receiving it does not create assignment or persistent queue visibility.
_Avoid_: Queue assignment

**Domain Command**:
An authorized request to change an underlying accounting, banking, engagement, or close fact. Work changes only as a consequence of the resulting domain state.
_Avoid_: Complete task, update Work status

**Independent Bulk Action**:
One user convenience that attempts the same Domain Command against an explicit bounded set of independently valid targets. Some targets may succeed while others remain unchanged with specific errors.
_Avoid_: One transaction for unrelated targets, all currently matching work

**Aggregate Close Command**:
One bounded close decision whose parts must remain consistent, such as approving a Close Package or cascading a reopen. It succeeds or fails as one transaction rather than as independent bulk units.
_Avoid_: Optional all-or-nothing bulk mode

**Manual Draft Journal**:
An unposted journal deliberately saved as a draft by a user. It does not become ordinary queue Work merely because it exists, but an unresolved draft becomes close work when its Fiscal Period enters preparation.
_Avoid_: Immediately actionable journal

**Generated Draft Journal**:
An unposted journal occurrence produced by a recurring schedule, integration, import, or other system process. Its existence represents an outstanding accounting action and may produce Work immediately.
_Avoid_: User-created draft

## Close

**Fiscal Period**:
One monthly accounting period for a client. Monthly periods remain the accounting invariant even when several are prepared through catch-up.
_Avoid_: Quarterly close period, annual close period

**Period Close**:
The client-owned controlled process of establishing that one monthly Fiscal Period is complete, reviewed, and approved. The same Period Close continues across firm changes and reopen cycles; closing and locking are separate decisions.
_Avoid_: Close task, permanent lock

**Period Close Version**:
One numbered preparation version of a Period Close performed under a particular Firm–Client Engagement. It becomes permanently frozen when submitted or superseded and may receive at most one approval decision, so review and historical firm attribution always refer to the exact accounting facts, resolutions, and confirmations presented.
_Avoid_: Mutable approval snapshot, audit event

**Period Reopen Request**:
A durable request for the current Client Lead to decide whether one closed monthly Fiscal Period and its required later closed sequence should reopen. Approval performs the client-scoped cascade; rejection leaves the underlying accounting concern unresolved and returns it for open-period treatment.
_Avoid_: Work Item approval state, notification, Finding Resolution

**Close Approval**:
The Client Lead's decision to approve or reject one submitted Period Close Version. It has no identity or lifecycle independent of that version.
_Avoid_: Approval of a mutable Period Close, standalone approval object

**Close Frontier**:
The earliest monthly Period Close that currently requires or awaits action for a client. Only one frontier is actionable at a time, although later bookkeeping may continue.
_Avoid_: Every open month shown simultaneously

**Accounting Finding**:
A system-detected accounting concern anchored to its affected Fiscal Period. It may be resolved through correction or an evidenced professional decision where policy permits.
_Avoid_: Close-only finding, mandatory journal, human checklist

**Finding Catalogue**:
The exact deployed set of admitted Accounting Finding definitions. Every definition has authoritative inputs, deterministic evaluation and facts, clear evidence and reasoning, legitimate resolution paths, authorization, and a complete tested user-facing slice; unsupported ideas have no dormant catalogue entry.
_Avoid_: Aspirational rule list, future Finding placeholder, generic anomaly backlog

**Launch Scope**:
The complete agreed Work Queue and Close V2 product that must pass all implementation and verification gates before first external launch. Stages determine build order and proof, not separate releases.
_Avoid_: Reduced wedge, stage-specific release, partial first launch

**Command ID**:
The UUID identifying one logical domain command and correlating its transport retries, audit, outbox, logs, traces, and results. It is reused only for retries of the unchanged command and does not imply a stored request hash, cached response, authorization, or generic deduplication guarantee.
_Avoid_: Idempotency key, request ID, domain target ID, command receipt

**Finding Resolution**:
An immutable correction result or professional decision addressing one exact material-facts version of an Accounting Finding. It ceases to apply when those material facts or the Finding definition change.
_Avoid_: Dismissal, mutable Finding status

**Close Confirmation**:
A monthly human-confirmation obligation required by close policy even when the system detected no accounting anomaly. The product presents Confirmations as Final checks.
_Avoid_: Attestation, automated check, Finding, checklist task

**Catch-up Package**:
A bounded agreement and work container for preparing several contiguous historical monthly Period Closes together while preserving monthly truth, validation, and chronological closure. While active, it owns the effective operational deadline for its covered open Close and Work. A replacement Package preserves its immediate predecessor rather than rewriting its identity or history.
_Avoid_: One multi-month close

**Operational Deadline**:
The current deadline used for queue ordering, overdue attention, counts, and user-facing due copy. Routine close policy supplies it unless an active Catch-up/Reclose Package owns it. Historical Fiscal Period dates remain accounting context rather than competing current deadlines.
_Avoid_: Fiscal Period end, historical routine deadline, projection-only deadline override
