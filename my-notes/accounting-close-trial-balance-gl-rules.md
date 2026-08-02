# Accounting close, trial balance, and GL rules

Working decision note for fiscal-period close, annual close journals, date-range
trial balance, GL explorer, and accounting exports.

This note captures target behavior. It is not a claim that every item is already
implemented.

---

## Guiding principle

The accounting model should follow the job each workflow is meant to do.

- Posted ledger entries are the accounting source of truth.
- Balance tables are derived read models for speed and UX.
- Fiscal calendar controls the company's canonical posting periods.
- Reporting overlays can present alternate ranges without mutating canonical
  books.
- Close actions must be explainable, auditable, and reversible until deliberately
  locked.
- Normal trial balance and reports should show operational/accounting
  performance, excluding annual close journals by default.

---

## Fiscal calendar authority

Each company has one canonical fiscal calendar. It governs:

- posting controls;
- monthly, quarterly, and yearly period status;
- fiscal-period trial balance;
- financial statement periods;
- close, reopen, and lock workflows.

Alternate reporting ranges, group reporting years, investor packs, lender
requests, and exports are reporting lenses. They should not become alternate
posting-control calendars unless a separate consolidation module is intentionally
built later.

---

## Fiscal period lifecycle

Allowed normal lifecycle:

1. `open`
2. `closed`
3. `locked`

`closed` means normal users cannot post accounting-impacting records into that
period without a reopen or controlled post-close adjustment workflow.

`locked` is stronger. It means the period is final for normal application
workflows. Unlocking should require privileged administrative action, a reason,
and an audit trail.

The product should not move directly from `open` to `locked` in ordinary flows.

---

## Closing months out of sequence

If September is open and a user tries to close October, the ordinary workflow
should not allow October to be closed by itself.

Reason:

- monthly close is a chronological control process;
- later month balances depend on prior month balances;
- skipping an earlier month makes stale adjustments and missed reconciliation
  work harder to detect;
- close status becomes less meaningful if October is "closed" while September is
  still unresolved;
- annual close depends on every month in the fiscal year having passed review.

Best UX:

- tell the user September must be closed first;
- offer a guided catch-up flow: "Close September, then October";
- for many open months, offer a bulk close wizard that closes each month in
  chronological order and shows checks/warnings per month;
- do not make users hunt for the earlier month manually.

Exception:

- data import, onboarding, or migration flows may need a privileged bulk
  historical close path, but that path should still process periods in
  chronological order and record the close run for each period.

---

## Close run records

`fiscal_calendar` stores the period status. It is not enough to store the close
workflow itself.

We should add a close-run table for production close workflow auditability.

Target table concept:

```text
fiscal_period_close_runs
- id
- company_id
- fiscal_year
- period_type
- period_number
- close_type: monthly | annual
- status: completed | superseded | failed
- closed_by_id
- closed_at
- checklist_responses jsonb
- warnings jsonb
- report_snapshot_id nullable
- trial_balance_snapshot jsonb nullable
- generated_journal_batch_id nullable
- generated_ledger_transaction_id nullable
- metadata jsonb
- created_at
```

The close run answers:

- who closed the period;
- which checks were run;
- which warnings were accepted;
- what the trial balance/report looked like at close time;
- whether a system journal was generated;
- which ledger transaction represents that system journal.

If a period is reopened and closed again, create a new close run. Do not rewrite
history. The current fiscal period status points to the latest effective state,
while close runs preserve the audit story.

---

## Monthly close

Monthly close is an operational control. It is not a P&L zero-out event.

When a monthly period is closed:

- run the monthly close checklist;
- verify derived balances are fresh for the period;
- verify trial balance equality at accounting precision;
- record a close run;
- set the monthly fiscal calendar row to `closed`;
- block normal accounting-impacting writes dated inside the period.

Monthly close does not:

- zero revenue, expense, gain, or loss accounts;
- transfer profit or loss to retained earnings;
- create an annual close journal.

### Monthly close checklist

The close workflow should eventually guide users through:

- uncategorized bank transactions;
- unreconciled bank activity;
- draft or unposted journals;
- failed, stale, or missing GL recalculation jobs;
- suspense, uncategorized, or clearing-account balances;
- missing FX rates for posted foreign-currency activity;
- FX revaluation needs for monetary positions;
- unusual negative balances where likely unexpected;
- trial balance equality;
- material movement review;
- required notes or confirmations.

The checklist can become configurable later, but defaults should be opinionated
enough to help non-expert users close clean books.

---

## Annual close

Annual close is an accounting event.

For a January 1 to December 31 fiscal year, annual close is the close of the
year ending December 31. For other companies, it is the close of the final month
in their own fiscal year.

Annual close should:

- require all months in the fiscal year to be closed, or guide the user through
  closing them first;
- run final-month close checks;
- run annual close checks;
- verify GL balances and trial balance are fresh;
- verify the yearly trial balance is balanced;
- compute net income or loss for the fiscal year;
- create a close run with `close_type = annual`;
- post an explicit annual close journal from temporary accounts to retained
  earnings or the configured equity account;
- link the close run to the generated journal batch and ledger transaction;
- recalculate affected balances from the close date onward;
- close the yearly fiscal calendar row;
- optionally lock the year after final review.

Annual close should not be a hidden mutation. It should leave an auditable
journal and ledger transaction.

---

## Annual close journals

Annual close journals should be real journal batches and real ledger
transactions.

They should be:

- system-generated;
- clearly classified as annual close;
- read-only in normal journal editing;
- visible in journal history and GL explorer;
- reversible only through an annual-close reopen/reversal workflow;
- linked to the close run that generated them.

They should not be identified by description text, reference patterns, or loose
metadata alone.

Target classification:

```text
journal_batches.journal_source:
- manual
- recurring_template
- annual_close
- opening_balance
- fx_revaluation
- system_adjustment
```

```text
ledger_transactions.transaction_source:
- manual_journal
- bank_transaction
- annual_close
- opening_balance
- fx_revaluation
- system_adjustment
```

Annual close-specific linkage:

```text
close_run_id
close_type = annual
close_fiscal_year = 2025
```

The `close_run_id` should be a real foreign key on at least the generated
journal batch. It is also useful on the ledger transaction because report queries
often read ledger rows directly.

---

## Reporting treatment of annual close journals

Default reporting basis: operational or adjusted reporting.

Normal trial balance and reports should exclude annual close ledger transactions
by default. This preserves operating P&L activity and prevents revenue and
expense accounts from appearing zero simply because year-end close journals were
posted.

Important: exclude the entire annual close ledger transaction, not only its P&L
lines.

Reason:

- a closing journal is balanced as a whole;
- excluding only P&L lines while keeping the retained earnings line would make
  trial balance totals fail;
- excluding the whole annual close transaction keeps date-range trial balance
  balanced and shows operating performance.

Implication:

- default trial balance is a reporting view of operational performance;
- GL explorer still shows annual close journals, clearly labelled;
- journal history still shows annual close journals, clearly labelled;
- formal post-closing mode is not needed for now.

Financial statements may need separate presentation logic:

- income statement excludes annual close journals;
- balance sheet can present retained earnings and current-year earnings
  intentionally;
- after annual close, retained earnings ledger balance includes the close
  journal in ledger-actual views;
- normal operating reports should not double count closed-year profit by showing
  both annual close retained earnings movement and the P&L activity that created
  it.

---

## Opening and conversion balance journals

The product may support users entering opening balances at the start of using
the app, including comparative years.

These should also be explicit system or guided journal types, not ordinary
manual journals hidden in the ledger.

Target classification:

- `opening_balance`
- optionally `conversion_balance` if we want to distinguish first-use migration
  balances from normal opening balances.

Rules:

- opening/conversion journals are real journals and ledger transactions;
- they should be visible and auditable;
- they should be clearly labelled in journal history and GL explorer;
- they should be included in balance sheet carry-forward calculations;
- they should be treated carefully in P&L reports so imported comparative
  balances do not masquerade as operating activity.

This classification matters for date-range trial balance, financial statement
comparatives, and accountant/auditor exports.

---

## Account behavior

### Balance sheet accounts

Balance sheet accounts are permanent accounts.

For date-range reporting:

- opening balance is the account balance as of the day before the range start;
- movement is activity during the selected range;
- closing balance is the account balance as of the effective range end.

Cash at February 28 already includes January and February activity. A report for
February should show the balance as at February 28, not only February's cash
movement.

### P&L accounts

Revenue, expense, gain, and loss accounts are temporary accounts.

For date-range reporting:

- they measure activity during a period;
- opening balance should normally be zero or de-emphasized;
- movement is the key figure;
- prior fiscal year P&L balances should not be carried into a new fiscal year;
- annual close journals are excluded by default.

For fiscal-period materialization today, P&L daily balances reset at fiscal-year
start. That gives fiscal-year-to-date P&L closing balances. For arbitrary date
range reporting, the UI should emphasize selected-range P&L activity rather than
P&L closing position.

---

## Date-range trial balance semantics

Date-range trial balance should support arbitrary ranges after fiscal-period
trial balance is stable.

Request:

```text
fromDate
toDate
```

Response should include:

```text
requestedStartDate
requestedEndDate
effectiveStartDate
effectiveEndDate
isFutureRange
isOpenRange
basis
currency
accounts
totals
checks
freshness
```

Default basis:

```text
operational
```

Meaning:

- include posted operating ledger transactions;
- exclude annual close ledger transactions;
- include opening/conversion balances according to reporting rules;
- do not mutate accounting state during read.

For balance sheet accounts:

- opening = balance as of `fromDate - 1`;
- movement = net ledger activity from `fromDate` to `effectiveEndDate`;
- closing = balance as of `effectiveEndDate`.

For P&L accounts:

- opening = zero or suppressed in default UI;
- movement = activity from `fromDate` to `effectiveEndDate`;
- closing can be shown but should not be treated as a carried permanent balance.

Trial balance checks must remain explicit:

- opening debit equals opening credit;
- movement debit equals movement credit;
- closing debit equals closing credit.

If the report basis excludes entire annual close transactions, the trial balance
can remain balanced.

---

## Future and open range behavior

If a user requests a range that ends after today, do not silently pretend the
future has complete data.

Example on June 14, 2026:

```text
Requested: June 1, 2026 to June 30, 2026
Effective: June 1, 2026 to June 14, 2026
```

The UI should show:

- requested range;
- effective data-through date;
- open or in-progress badge;
- tooltip explaining that only posted transactions through the effective date
  are included.

Today as end date includes posted transactions for today so far. The accounting
date is the ledger entry `fs_date`; the report includes posted entries with
`fs_date <= effectiveEndDate`.

Freshness still matters. If derived balances have not caught up, the response
should say `stale` or `missing`, and the UI can offer refresh.

---

## Date scenario expectations

Assume:

- fiscal year is January 1 to December 31;
- today is June 14, 2026;
- default reporting basis is operational;
- annual close journals are excluded by default.

### June 1 to June 14, 2026

- requested range equals effective range;
- balance sheet opening is May 31;
- balance sheet closing is June 14;
- P&L activity is June 1 to June 14;
- include posted transactions dated June 14 so far.

### YTD 2026

- default range is January 1 to June 14, 2026;
- balance sheet opening is December 31, 2025;
- balance sheet closing is June 14, 2026;
- P&L activity is January 1 to June 14, 2026.

### June 1 to June 30, 2026

- requested end is June 30;
- effective end is June 14 unless future-dated posted entries are explicitly
  allowed and present;
- show open/in-progress badge;
- balance sheet opening is May 31;
- balance sheet closing is June 14 effective;
- P&L activity is June 1 to June 14 effective.

### May 1 to May 30, 2026

- requested range excludes May 31;
- balance sheet opening is April 30;
- balance sheet closing is May 30;
- P&L activity is May 1 to May 30.

### February 10 to April 26, 2026

- crosses months but not fiscal years;
- balance sheet opening is February 9;
- balance sheet closing is April 26;
- P&L activity is February 10 to April 26.

### December 1, 2025 to January 31, 2026

- crosses fiscal years;
- balance sheet opening is November 30, 2025;
- balance sheet closing is January 31, 2026;
- P&L activity includes December 2025 activity and January 2026 activity;
- prior-year P&L is not carried into January;
- if FY 2025 has annual close journals, exclude those close transactions by
  default.

### January 1, 2025 to December 31, 2026

- multi-year custom range;
- balance sheet opening is December 31, 2024;
- balance sheet closing is December 31, 2026 if available, otherwise effective
  data-through date;
- P&L activity should be segmented by fiscal year and also totaled;
- annual close journals are excluded by default;
- UI should disclose fiscal-year boundaries.

### July 1, 2025 to June 30, 2026

- custom/group-style reporting range;
- balance sheet opening is June 30, 2025;
- balance sheet closing is June 30, 2026 or effective data-through date;
- P&L activity spans two company fiscal years;
- UI should label it as custom range, not company fiscal year;
- annual close journals are excluded by default.

---

## Comparable periods

Comparable periods are useful and should be supported later.

Examples:

- June 1 to June 14, 2026 vs June 1 to June 14, 2025;
- May 2026 vs April 2026;
- YTD 2026 vs YTD 2025;
- custom range vs previous equivalent range.

Semantics:

- balance sheet comparison uses closing balance at each range's effective end;
- P&L comparison uses activity during each range;
- comparison ranges should have their own requested/effective dates and
  freshness;
- annual close journals are excluded from both ranges by default.

---

## Trial balance UI

Default UI should be readable first, accountant-grade when expanded.

Default columns:

```text
Account
Opening
Movement
Closing
Freshness/status
```

Users should be able to toggle:

- debit/credit split columns;
- compact view;
- expanded account metadata;
- account type or financial statement grouping;
- source movement breakdown;
- comparable period columns.

P&L rows should emphasize movement. Balance sheet rows should emphasize closing
balance.

Stale or missing rows should show a clear status and offer refresh where
appropriate.

---

## Movement by source

It is valuable to show movement composition:

```text
Opening | Bank A | Bank B | Bank C | Manual Journals | Other/System | Closing
```

This should be an expanded analysis view or drilldown, not the default trial
balance table.

Needed source classes:

- bank transaction journals;
- manual journals;
- recurring journals;
- opening/conversion balances;
- FX revaluation;
- annual close;
- system adjustments;
- imports/API.

This source classification should be shared by trial balance, GL explorer,
financial statements, and exports.

---

## GL explorer implications

GL explorer needs ledger detail, not only period balance rows.

It should support:

- opening balance before selected range;
- every posted ledger entry inside the selected range;
- deterministic ordering within a day;
- transaction-level running balances;
- fiscal period status badges;
- clear labels for annual close, opening/conversion, FX, bank, and manual
  entries;
- filters for source type;
- stale/freshness indicators where derived anchors are used.

Efficient model:

- use `gl_daily_balance_snapshots` as opening anchors;
- stream posted ledger entries for the range;
- compute running balances in deterministic order;
- use fiscal calendar metadata to label periods and boundaries.

---

## Exports

CSV is useful for simple one-table exports, but not enough for accountant-grade
multi-sheet packs.

V1 target:

- clean XLSX export for trial balance and GL where feasible;
- include report metadata: company, currency, requested range, effective range,
  basis, generated time, freshness;
- CSV can remain available for simple table exports.

Future or premium target:

- formula-linked XLSX workbook;
- Google Sheets export;
- tabs for trial balance, GL, journals, P&L, balance sheet, notes, mappings;
- statement lines linked back to trial balance rows by formulas;
- traceable/accountant/auditor export mode.

---

## Currency and rounding

Accounting logic should not assume every currency has two decimal places.

Rules:

- store reporting-currency GL balances at internal accounting precision;
- use the current `numeric(18, 3)` GL balance scale unless intentionally changed;
- perform equality checks at stored accounting precision;
- format display/export amounts using company reporting currency `minor_unit`;
- avoid hard-coded `2dp` in accounting logic;
- avoid allowing display rounding to create or hide imbalance.

---

## Implementation direction

Near-term order:

1. Keep fiscal-period trial balance production-grade.
2. Document and test arbitrary date-range semantics before implementing.
3. Add explicit journal/ledger source classification for annual close,
   opening/conversion, FX revaluation, and system adjustments.
4. Add close-run table and close workflow services.
5. Add date-range trial balance behind focused tests.
6. Build GL explorer using daily snapshots as anchors plus ledger entries.
7. Add annual close journal generation after monthly close workflow is solid.
8. Add accountant-grade XLSX/Google Sheets exports after core reports are stable.

---

## Test matrix seed

Tests should cover at least:

- normal same-month range;
- YTD range;
- future/open range with effective end date;
- partial month range;
- multi-month range;
- cross-fiscal-year range;
- multi-year range;
- custom group-style range;
- closed year with annual close journal excluded;
- balance sheet carry-forward;
- P&L range activity;
- opening/conversion balance treatment;
- stale/missing freshness;
- comparable period semantics when added.
