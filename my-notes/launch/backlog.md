# Post-Launch Backlog

Things we know about and are deliberately NOT doing before launch. When you discover
a new issue mid-workstream, triage it (00-launch-plan.md → Triage rule). If it isn't
"wrong numbers / corruption / security" and isn't already in the plan, it goes here —
one line, keep moving.

## Already triaged (2026-07-19)

### Product capabilities
- Ledger drill-through page + account notes page (stubs hidden at launch)
- Work materializer task types: close_period, reconnect_bank, send_reports, etc.
- Roster extras: assignee column, transaction sparklines, aggregate/weekly analytics
- Batch/CSV client import; chat-driven client invite
- Client-portal experience beyond client_owner login
- Cash flow statement, comparatives, PDF export of statements
- Mono webhook receiver (pull-based sync is the launch behavior)
- Second payment provider + invoices/credits/payout slices (billing README lists them)
- Hard billing entitlement enforcement (soft banners at launch)

### Engineering hygiene
- Delete two unused cat-engine copies (`features/cat-engine-test`,
  `domains-pending-migration/cat-engine`)
- Migrate/retire `domains-pending-migration/` (76 files) and `temp-index.tsx` routing shim
- Circular-dependency ratchet in CI (7 known cycles remain; fail on NEW ones)
- `postLedgerTransactions` consolidation; delete legacy `createLedgerRecord` path
- Dirty-range watermark refactor (two legitimate copies today)
- Bank opening-balance split out of `opening-balance.service.ts` (bank-side anchor vs
  ledger conversion balances — design agreed July 2026, own pass)
- `pg@9` deprecation warnings in test output (client.query during query)
- Headless product-owned data-table module (noted in TODOS by 0462737c)

### Separate track (not this launch)
- web-payroll: free Nigerian payroll tool — top-of-funnel, own release cadence
- Admin app / evaluation system (my-notes/product blueprints)
