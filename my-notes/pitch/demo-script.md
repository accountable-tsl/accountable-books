# Investor Demo Script (5-7 minutes)

Goal: show this is real software with real accounting invariants, not mockups.

## Setup (before the call)

- Use a seeded demo company with imported bank transactions and a chart of accounts.
- Ensure at least:
  - a few unresolved transactions
  - a few candidate (suggested) transactions
  - a few posted ledger entries
  - at least one manual journal + one recurring template

## Demo flow

1. Open Dashboard / entry surface

- Show "Action clarity" framing: what needs attention, what is healthy (even if mock).

2. Go to Accounting Workspace

- Show connected bank accounts and last sync.
- Show uncategorized / needs review counts.

3. Open Categorization Engine

- Explain the three states: unresolved -> candidate -> posted.
- Pick one unresolved transaction:
  - categorize it (select account, confirm double-entry)
  - show it becomes posted (ledger is source of truth)
- Pick one candidate:
  - adjust a field that changes accounting meaning
  - mention versioning behavior (old lines superseded, new lines inserted)

4. Open Journals

- Show a posted journal, drill into lines.
- Show recurring template journal exists (if in data).

5. Reporting credibility (today)

- Mention trial balance exists in backend (even if UI not shipped yet).
- Optional: show the endpoint in Swagger or a simple curl in a terminal:
  - `/api/:companyId/balances/trial-balance?...` (adapt to actual route)

6. Close with roadmap

- Show the Workbench v1 contract:
  - Close hub + trial balance UI
  - P&L/BS with drill-through
  - role-aware dashboards and client action center

## What not to do

- Do not claim measured ML accuracy unless you have an evaluation dashboard.
- Do not show placeholder pages that are obviously broken; keep the demo on working flows.
