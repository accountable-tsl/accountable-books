# Establish the launch work and firm operating model

- Status: closed
- Type: grilling
- Blocks: `002`, `003`, `004`, `005`, `006`, `007`, `008`

## Question

What product and domain invariants must constrain the new work queue and close architecture before its schema and interfaces are designed?

## Resolution

### Scope and extensibility

- Build the ground-up Work Queue and Close V2 model; abandoned Accountable Books work/task models are historical evidence only.
- Focus the launch scope on bookkeeping and close.
- Provide a small domain-neutral work kernel with registered domain producers so tax and other services can extend it later.
- Do not build a universal workflow engine or DSL.

### Work identity and origin

- Every authoritative work item is one clear, independently finishable action intent against one domain target.
- Queue groups are display-only derived groupings of atomic work items.
- All launch-scope Work is produced by registered domain logic and has a machine-evaluable resolution condition.
- Users cannot create or manually complete ad hoc Work Items at launch.
- Messaging may become a work producer later only through explicit escalation rules.
- The underlying accounting/business entity remains truth for the fact; the atomic work item is truth for its work lifecycle.

### Consistency and commands

- User-triggered accounting commands update domain state and affected atomic work state atomically before responding.
- The frontend waits for server confirmation before removing accounting work.
- Command responses return targeted work/group deltas so the entire queue need not refetch.
- No IndexedDB or offline command queue is required at launch.
- Independent items in a bulk command may partially succeed; each individual accounting unit remains transactional and all-or-nothing.
- SSE is not a source of correctness, but it is part of the launch experience because client actions, teammate commands, bank processing, and automation routinely change an open firm queue. Use one authorized firm-scoped invalidation stream, command-returned deltas for local actions, targeted refetches for external actions, and focus/reconnect recovery. Poll only while the stream is unavailable.

### Firm and client responsibilities

- Firm role determines capability; client responsibility determines portfolio; atomic assignment determines current expected worker.
- Avoid overloaded `owner`; use `Client Lead` for the firm member accountable for a client relationship.
- Every active bookkeeping engagement has exactly one Client Lead and one Primary Bookkeeper; the same eligible person may hold both.
- Client Lead must be a manager or admin. Primary Bookkeeper may be a bookkeeper, manager, or admin.
- Additional Contributors may be assigned to the client and may receive explicitly routed work.
- Registered work types declare their default assignment basis, e.g. preparation to Primary Bookkeeper and approval to Client Lead.
- Role eligibility never automatically assigns a person to clients.
- No manager-of-manager hierarchy is required.

### Onboarding and engagements

- Managed client onboarding cannot complete without Client Lead and Primary Bookkeeper responsibilities.
- For firm-created invitations, Client Lead defaults to the inviting eligible member and Primary Bookkeeper defaults to that lead; both are visible and editable.
- Firms enabling branded signup, auto-acceptance, or platform referrals must configure fixed intake defaults and availability. Referral review is the default.
- The client company owns its data and exists independently of its service firms.
- Use an effective-dated Firm–Client Engagement per service domain rather than a permanent client-to-firm assignment.
- Only one engagement may be active for a client and service domain at a given time; different service domains may eventually use different firms.
- Transfers require receiving-firm acceptance, responsibilities, and a cutover date/period. Old work is ended; new work is materialized from current facts. Historical attribution remains with the prior engagement.
- Rejected referrals are not silently disclosed or assigned elsewhere; the client must consent to another placement.

### Assignment and visibility

- Automatic assignment is the normal path.
- Every Work Item has one assignee at launch. Users do not create, claim, or manage ownerless queue work.
- If normal routing cannot find an eligible assignee, the producer uses the Work Type's defined eligible fallback and emits an operational reconciliation signal; it does not create a hidden or null-assignee Client Pool item.
- Required client responsibilities cannot be removed without replacement.
- Firm Admin sees all firm work.
- Client Lead sees all work for clients they lead.
- Primary Bookkeeper sees all bookkeeping work for clients they primarily manage.
- Additional Contributor sees directly assigned work.
- Managers see assigned portfolios by default.
- Do not add Firm Work Overseer at launch. Multiple admins are allowed and the final active admin cannot be removed without replacement.

### Request context and queue loading

- The firm remains the stable active authorization context throughout the cross-client queue and stream.
- Client IDs identify authorized work targets and never grant access.
- Requested views are presentation requests only; the backend derives allowed views, client scope, and capabilities from the authenticated firm membership and responsibilities.
- Initial queue rendering should use one consolidated snapshot endpoint; heavy workspace details load lazily.
- Backend commands re-authorize the firm, engagement, client, target, action capability, and current work state independently of queue visibility.

### Period closing

- Normal monthly manager approval closes the fiscal period; it does not exceptionally lock it.
- A closed period blocks ordinary posting but may be reopened through an authorized, reasoned, audited workflow.
- A locked period is exceptionally frozen and cannot be reopened through normal workflows.
- Exact lock policy and UI are intentionally deferred; locked state belongs in period status/history and posting guards, not ordinary monthly close work.

## Consequences

- The work schema must distinguish atomic work from derived grouping without duplicating accounting truth.
- Responsibility and engagement validity must be available to authorization, assignment routing, queue projection, and close approval.
- Close design must integrate fiscal-period state while keeping monthly approval and exceptional locking distinct.
