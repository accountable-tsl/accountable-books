# Resolve retroactive facts and cross-engagement reopening

- Status: closed
- Claimed by: Codex
- Type: grilling
- Blocked by: `002`, `003`, `004`, `005`, `006`, `008`, `009`
- Blocks: none

## Question

Who owns a Period Close across firm changes, and how should late bank transactions dated inside closed periods be routed through open-period treatment, reopening requests, direct cascading reopen, immutable historical evidence, Work, and authorization without making accounting actions impossible or corrupting predecessor-firm history?

## Resolution

Resolved in [retroactive-facts-and-cross-engagement-reopening.md](../artifacts/retroactive-facts-and-cross-engagement-reopening.md).

Period Close is now client-owned by company and monthly Fiscal Period; each numbered Period Close Version carries immutable Engagement attribution. Transfer leaves closed months/evidence untouched and supersedes only unfinished Versions/Work. A later client-scoped cascading reopen may cross predecessor attribution after the current Engagement accepts the historical scope, preserving old Versions while creating new drafts under the current firm. Former-firm access is restricted to frozen Version evidence and never exposes current books.

A bank transaction dated inside a closed month produces `transaction_dated_in_closed_period` Finding Work rather than impossible ordinary categorization Work. It may be safely matched without ledger mutation, recorded using an authorized open `fs_date`, reopened directly by a capable actor, or escalated through the durable `period_reopen_requests` identity. One request may cover several current registered retroactive Findings; the optional initiating Finding records provenance. One Client Lead Work occurrence uses the active frontier deadline and appears through the client's single Close row/request workspace, not a duplicate ordinary group. Rejection returns every still-unresolved covered Finding with a required note; approval runs the complete current-hash cascade. The corrected architecture has twelve authoritative tables and eight Work Types.
