# Merge the two frontend interaction models

- Status: closed
- Claimed by: Codex
- Type: prototype
- Blocked by: `002`, `005`, `006`
- Blocks: `008`

## Question

Which interaction patterns from `workqueue-ui` and the Accountable Books firm dashboard/categorization/close surfaces should form the final queue, stream, client-safety, bulk-work, close, manager, responsive, loading, error, and live-change experience?

## Resolution

Resolved in [frontend-interaction-model.md](../artifacts/frontend-interaction-model.md). The calm grouped queue, focused stream, client-safety beat, and core Close interaction are exercised in the throwaway `workqueue-ui` prototype; the specified Catch-up, late-period decision, Reopen Request, and client Action Centre states remain explicit prototype acceptance work before production frontend implementation.

The final interface uses `workqueue-ui`'s calm grouped queue, focused stream, client-safety beat, one Close cluster, and guided workspaces together with Accountable Books' searchable client roster, capability-gated link to its externally owned client-intake flow, assignee filtering, mobile Queue/Clients split, and mature loading/error/empty states. V2 does not implement invitations or pending intake. One server-authorized landing snapshot drives the SPA; `my_work`, `portfolio`, and explicitly authorized `firm_oversight` are projection scopes rather than role-derived views.

Ordinary rows are derived Work Groups. Uncategorized transactions and categorization candidates remain separate groups but share one two-panel categorization workspace; only server-manifest candidate review exposes bulk acceptance. Close remains one collapsed cluster and at most one row per client, combining the earliest unresolved Close Frontier, approval, and immediately following preparation context without a duplicate approval row. Client bank reauthorization gets the bounded client Action Centre/banner flow required to unblock the firm, while revoked connections remain notification-only.

Catch-up retains that one-client-row shape. The row/workspace shows Package range, assignee, and Package deadline; covered historical months do not flood overdue counts or copy. Package creation requires a reviewed assignee/deadline, splits require explicit replacement deadlines, reassignment preserves the date, and authorized deadline changes require a reason and wait for server confirmation.

Reopen review is one Client Lead Work occurrence presented only through that same client's Close row and a dedicated request workspace, while remaining included once in counts and the continuous stream. The requester sees a read-only waiting state; a decision owner sees the affected periods, locks, covered Findings, approval/report impact, and explicit reopen/reject actions. A request may produce the Close row before the current month's Preview exists; no fake Period Close is created.

Commands are server-confirmed, generic accounting undo is removed, and active work completed elsewhere becomes an explanatory `Handled elsewhere` state. One firm SSE stream drives targeted refetches; polling runs only while SSE is unavailable. The component tree, routes, command states, responsive behavior, DTO mapping, accessibility requirements, and migration handoff are fixed for ticket `008`.
