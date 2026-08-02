# 02 — Financial Statements Backend (Income Statement + Balance Sheet)

Goal: the dashboard's Income and Balance tabs — the deliverable a firm hands its
clients — show real ledger numbers. This is the single highest-visibility gap: it is
the first screen after login and it currently shows demo data.

## Current state (verified 2026-07-19)

**Frontend: done and frozen.**
- Contract: `packages/contracts/accountable_contracts/schema/source/accounting/financial-statements.ts`
  (139 lines, Zod). Four response shapes: `IncomeStatementResponse`,
  `BalanceSheetResponse` (recursive `StatementLine` tree with `tone:
  normal|subtotal|total`, notes), `StatementLineDetailResponse` (accounts under a
  line), `StatementLineAccountTransactionsResponse` (cursor-paginated transactions).
- UI: `apps/web/src/features/accounting/dashboard-client/` — tabs, period picker,
  IFRS/US-GAAP nomenclature, drill-through sheets. All hooks are real react-query
  hooks (`apps/web/src/modules/accounting/reporting/model/hooks.ts`).
- The ONLY fake part: `apps/web/src/modules/accounting/reporting/api/index.ts` builds
  responses from local data instead of calling HTTP. `DemoDataBadge` marks it honest.

**Backend: all ingredients exist, no dish.**
- `apps/api/src/domains/reporting/reports/` is where it belongs; nothing exists there
  today (fiscal-calendar and close-readiness are sibling modules to copy patterns from).
- Account → statement mapping already in the data model:
  `apps/api/src/bootstrap/catalogs/accounting/account-elements.ts` maps every account
  element to `financial_statement_key: 'bs' | 'is'` with a full hierarchy (assets →
  current/non-current/contra, revenue/cost-of-sales/opex/non-opex, etc.), and
  `app.financial_statements` carries `us_gaap_label` / `ifrs_label`.
- Balances: `apps/api/src/domains/balances/` has `gl_current_balances`,
  `gl_daily_balance_snapshots`, GL period balances, and a working trial-balance service
  (`GET /api/:companyId/balances/trial-balance`). The outbox keeps these fresh after
  every posting.
- Periods: fiscal calendar service provides period bounds
  (`apps/api/src/domains/reporting/fiscal-calendar/`).
- Transactions for drill-through: ledger entry queries live in
  `apps/api/src/domains/ledgers/`.

## Design decisions (made — do not re-litigate)

1. **New module** `apps/api/src/domains/reporting/reports/` with routes mounted in
   `app.ts` under `/api/:companyId/reports/...` behind `checkCompanyId` (follow
   `balances.routes.ts` as the pattern).
2. **Contract is law.** Responses must parse with the Zod schemas from
   `@accountable-books/contracts`. Write the route tests by literally calling
   `incomeStatementResponse.parse(body)` etc.
3. **Statement structure comes from the element catalog**, not a new config system:
   walk accounts → account elements → element hierarchy → statement (`is`/`bs`),
   summing GL balances into the `StatementLine` tree. Labels: company's reporting
   framework picks `ifrs_label`/`us_gaap_label` (the UI already sends
   `framework`).
4. **Period semantics:** Income statement = activity within `[startDate, endDate]`.
   Balance sheet = cumulative as of `endDate`. The balance sheet MUST include a
   current-period net income line inside equity so it balances — derive it from the
   same run, do not post anything. (Accounting invariant: Assets = Liabilities +
   Equity including period result.)
5. **Line detail** = the accounts under that element with their balances for the same
   period. **Transactions** = ledger entries for account + period, cursor-paginated
   exactly as the contract's `nextCursor`/`hasMore` describe (the mock in the web api
   file shows the intended cursor behavior — offset-style is acceptable v1).
6. **No caching layer, no snapshot persistence, no new tables.** Compute from GL
   balances + ledger entries per request. If it is slow later, that is a post-launch
   problem with a measurable trigger.
7. Web swap: replace the four functions in
   `apps/web/src/modules/accounting/reporting/api/index.ts` with HTTP calls following
   the existing client pattern (see `apps/web/src/modules/banking/accounts` api for the
   house style). Delete the mock `data/` builders and the `DemoDataBadge` usage from
   income/balance tabs in the same PR. The overview tab is workstream 04's concern.

## Steps

1. Read the contract file and the mock api file end to end first — they are the spec.
2. Build a pure "statement assembler" service: inputs (companyId, period, framework) →
   loads COA accounts + element catalog + GL balances → returns the `StatementLine`
   tree with subtotal/total tones matching the section orders the UI uses
   (`apps/web/src/features/accounting/dashboard-client/statement-section-order.ts` —
   mirror its ordering server-side so labels/ids line up).
3. Income statement endpoint, then balance sheet endpoint (shares the assembler; adds
   net-income-in-equity handling).
4. Line detail endpoint, then transactions endpoint (reuse ledger entry queries).
5. Route tests against demo seed data (`make db-seed` fixtures; the API test harness
   provisions isolated sandboxes — follow any `*.routes.test.ts` in balances/journals
   for the pattern). Include the balance invariant test: for the demo company and a
   period with activity, BS assets total = liabilities + equity total, and IS net
   income equals the equity line shown.
6. Cross-check against trial balance: sum of IS+BS leaf lines reconciles with
   `getTrialBalance` for the same period (write this as an e2e test — it is the test
   that makes the numbers trustworthy).
7. Swap the web fetch layer; run the app locally (`make dev`) against the demo company
   and eyeball every tab, drill-through, both frameworks, and a period with no data
   (empty states already exist in the UI).

## Success criteria

- [ ] All four endpoints exist under `/api/:companyId/reports/...`, behind
      `checkCompanyId`, and their responses parse with the frozen contract schemas.
- [ ] E2e test proves: balance sheet balances; IS net income = BS equity net income
      line; totals reconcile with the trial balance endpoint for the same period.
- [ ] Posting a new journal changes the statements on next fetch (outbox recalc
      already handles freshness — test posts, waits for outbox drain, refetches).
- [ ] Web: `grep -r "MOCK_\|/data/income-statement-data\|balance-sheet-data" apps/web/src/modules/accounting/reporting` returns nothing;
      demo badge removed from income/balance tabs; tabs render the demo company's real
      numbers locally and on staging.
- [ ] Empty company shows the existing empty states, not zeros or crashes.
- [ ] Smoke flow re-run on staging includes checking one IS number against the trial
      balance by hand, recorded in `my-notes/launch/smoke-runs.md`.

## Out of scope

Cash flow statement, comparatives column, PDF/export, per-line notes editing,
consolidation, statement caching/persistence, custom statement layouts.
