# Audit the authoritative work database schema

- Status: closed
- Claimed by: Temi with Codex
- Type: research
- Blocked by: `003`
- Blocks: `004`

## Question

Does the resolved authoritative Work and Close schema faithfully implement every locked operating/close decision without missing authority, contradictory invariants, unnecessary tables or fields, confusing terminology, unsafe authorization/concurrency assumptions, premature infrastructure, or extension/migration traps?

## Working artifact

- [Authoritative schema audit](../artifacts/authoritative-schema-audit.md)

## Resolution

The original eleven-table model passed the audit's tested identity/deletion, authority, authorization, concurrency, query, and scenarios after seven corrections. Independent cross-ticket review later found two seams the original audit did not cover: reopening a predecessor firm's closed month and historical-overdue amplification inside an accepted Catch-up Package. The corrected model has twelve tables. Period Close is client-owned, Period Close Version carries immutable Engagement attribution, `period_reopen_requests` owns the durable request/review lifecycle, and active Package `due_at` owns the effective operational deadline for its covered open Close/Work. No Work Group, generic approval, blocker-exception, Package-period, deadline-override, event, cache, or workflow table is justified.

The audit amended the canonical architecture in seven bounded places before releasing the next frontier:

- preserve the existing client-owned Company conversion date as distinct from the Engagement's first managed month;
- allow accepted backlog to move that month only earlier through a guarded, audited scope-expansion command;
- restrict Catch-up/Reclose Packages to ended, open months and materialize missing historical Close state directly in Preparing;
- require migration preflight to retire Accountable Books' unreferenced experimental `app.work_items` table before creating the canonical table; and
- make an active Package the exclusive submit/approval boundary for its range, preserving Primary Bookkeeper submission, Client Lead approval, chronological all-or-nothing closure, and the same-person shortcut; and
- preserve a withdrawn future responsibility assignment as a zero-length `cancelled_before_activation` interval while atomically retaining required coverage; and
- restrict Contributor close-row selection to the earliest month inside their assigned active Package or carrying their assigned close Work, without exposing the client's overall frontier.

Clarifications also make registry primary surface non-exclusive, prefer existing generic activity/notification source identity, prohibit many-to-one Package lineage, define bank-reauthorization anchoring before Preview, and state the honest bookkeeping/tax extension boundary. The later review amendments add exactly one bounded table and correct Package deadline semantics without adding another identity; both are recorded in the linked audit rather than rewriting the original audit history.

The corrected [authoritative schema design](../artifacts/authoritative-schema-design.md) and [retroactive-facts amendment](../artifacts/retroactive-facts-and-cross-engagement-reopening.md) are the implementation authority.
