# Design queue projections, API calls, and DTOs

- Status: closed
- Claimed by: Codex
- Type: research
- Blocked by: `002`, `003`, `004`
- Blocks: `006`, `007`, `008`

## Question

What read projections or views, query services, initial snapshot endpoint, lazy detail endpoints, filters, pagination, authorization scopes, and exact DTOs let a dumb SPA render personal, portfolio, firm, blocked, close, and approval views with one initial request?

## Resolution

The launch scope uses one firm-scoped queue snapshot assembled on request from active Engagement responsibility, open atomic Work, the deployed Work Type registry, and monthly close state. The SPA receives its effective authorized scope, client/assignee facets, capabilities, semantic sections, derived Work Groups, and at most one Close row per client in one landing request; it loads target evidence only for peeks and typed workspaces. That row normally contains the Close Frontier, but may instead contain a pending Reopen Request before Preview exists. `my_work`, `portfolio`, and explicitly authorized `firm_oversight` scopes are server-derived, and client/assignee query parameters only narrow that set. The API accepts no viewer role, current-user identity, or frontend-supplied roster.

The final interface keeps the workqueue prototype's queue/stream, client-safety, peek, and close-cluster model while adding Accountable Books' roster search, capability-gated add-client entry, assignee filtering, responsive Queue/Clients treatment, and empty states. Selecting a client filters the firm-scoped queue instead of switching active tenant context. The canonical launch interface removes mock `Unassigned`/`In progress` sections, keeps completed-this-session only in browser memory after confirmed commands, and folds both period-close approval and Reopen Request review into the affected client's single Close row. Each remains one atomic Work occurrence counted in the stream, never a duplicate ordinary group. A request-only Close row is valid before the present month's Preview exists.

The add-client entry is only a capability-gated link to Accountable Books' separately owned intake flow. V2 owns the strict accepted Engagement-activation contract and the resulting queue visibility; it does not own invitation/signup/referral UI or pending-state lifecycle.

The endpoint catalogue covers the initial snapshot, section/facet pagination, ordinary group peek/shared workspaces, client close workspaces, Reopen Request review, and frozen Version review. Exact snapshot, group, close, request workspace, transaction/candidate/journal/Finding/bank-connection, and Close Confirmation DTOs are specified. The query service uses three bounded base reads inside one read-only `REPEATABLE READ` transaction, with no N+1 enrichment. The launch projection needs no Work Group table, database/materialized view, Redis read cache, or IndexedDB. Realtime delivery uses the existing Redis infrastructure only as ephemeral SSE transport; PostgreSQL and the projection endpoints remain authoritative.

Queue timing uses persisted operational deadlines. For an active Catch-up/Reclose Package, covered open Work and Close rows already carry Package `due_at`; the set-based Package join only annotates source/range/assignee context. The snapshot therefore shows one Close row per client, makes the Package overdue only once its own deadline passes, and never turns historical routine dates into dozens of overdue monthly rows.

The complete interface assessment, endpoint contract, DTO definitions, authorization rules, query execution, performance posture, and acceptance scenarios live in [Queue Projections, API, and DTO Design](../artifacts/queue-projections-api-and-dtos.md).
