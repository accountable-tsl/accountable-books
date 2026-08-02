# Plan the greenfield implementation and pre-launch replacement

- Status: closed
- Claimed by: Codex
- Type: research
- Blocked by: `002`, `003`, `004`, `005`, `006`, `007`
- Blocks: none

## Question

In what dependency order should Work Queue and Close V2 be implemented, verified against the agreed operating model, connected to the Accountable Books SPA, and made the sole work/close path before first launch, given that no production data migration or customer rollout is required?

## Resolution

Resolved in [implementation-and-prelaunch-replacement-programme.md](../artifacts/implementation-and-prelaunch-replacement-programme.md).

Because Accountable Books has not launched and has no production tenant data, V2 will use a greenfield implementation and pre-launch replacement programme rather than backfills, dual-writing, customer cohorts, shadow traffic, or production fallback. Developer and CI databases are disposable: unshipped abandoned work-related migrations may be rewritten or removed, while unrelated migration history remains intact.

Implementation proceeds from a freeze/disposition inventory through the corrected clean twelve-table schema, Engagement authorization, Work kernel, complete producer vertical slices, monthly close/catch-up/reopening, projection/SSE/SPA integration, and explicit verification gates. The old systems remain frozen reference code only while development is underway. Once V2 passes schema, correctness, authorization, recovery, performance, browser, and single-path launch gates, it replaces the normal route and every obsolete table, migration, service, worker, contract, mock, and temporary development switch is deleted before first external launch.

Client invite/signup/referral UI remains an Accountable Books-owned dependency rather than a V2 delivery slice. This programme owns the strict Engagement-activation contract those flows call and the capability-gated queue link; external intake cannot activate managed bookkeeping without all required boundaries and responsibilities.

The monthly Close/Catch-up stage must prove Package-deadline propagation to covered open Close/Work rows, Package-only overdue attention, explicit replacement deadlines, reasoned deadline changes, and reassignment without deadline mutation before the queue/SPA gate can pass.

Clock-driven Close transitions use one lightweight hourly set-based recovery sweep, Monday through Friday business-day policy in the client timezone, and idempotent lifecycle commands. Transaction/ledger evaluations remain event-driven. Existing public fiscal close/reopen routes must be unavailable for managed V2 Engagements before this stage can activate.

### Review amendment — complete first-launch scope

These stages manage implementation and verification; they are not release cuts. The first external launch remains blocked on the complete agreed Work, Close, Catch-up, transfer, reopening, oversight, realtime, Finding, and frontend experience rather than a reduced wedge. The exact Finding admission gate and catalogue are recorded with the producer decision in [Full Launch Scope and Evidence-Based Finding Catalogue](../artifacts/full-launch-scope-and-finding-catalogue.md).
