# Close readiness workflow implementation plan

Working implementation plan for how modified cash and modified accrual close
should work in Accountable Books.

This note captures target behavior. It is not a claim that every item is
already implemented.

## Acceptance criteria for this design

- The close workflow is organized around the two accounting bases the product
  supports: `modified_cash_basis` and `modified_accrual_basis`.
- The workflow starts before month-end and continues through final close.
- The design explains what the user sees, what the system evaluates, and which
  tables are touched.
- Close checks are structured by severity and section, not as a loose checklist.
- Account elements, account types, COA, ledger entries, bank transactions,
  journals, fiscal calendar, workflow tasks, and balance tables all have clear
  roles.
- The design supports simple users without hiding accounting rigor from users
  who need it.

## Settled implementation direction

We are building a close readiness system, not just a close button.

The implementation should settle on these decisions:

- Keep the two existing accounting bases:
  - `modified_cash_basis`
  - `modified_accrual_basis`
- Use company accounting basis as the default rule pack.
- Add conditional checks based on actual COA/account-type/account-element usage.
- Keep accounting rule logic in code so it is versioned, tested, and reviewable.
- Store company/firm preferences and thresholds in the database.
- Store evaluated findings, blockers, acknowledgements, and close runs in the
  database.
- Use existing workflow/task infrastructure for pre-close work.
- Extend the existing fiscal-period transition service instead of adding a
  second close/reopen/lock path.
- Add `fiscal_period_close_runs` for the final close audit record.
- Do not create monthly close journals.
- Create annual close journals only during annual close.
- Formal close should surface only after the company's fiscal month has ended in
  that company's timezone.
- For firm-managed clients, pre-close nudges should be portfolio summaries
  grouped by client/period, not noisy one-client notifications.
- For owner-managed companies, the same readiness information should surface in
  the company workspace.

Existing fiscal-period functions are the canonical transition path:

- `closeFiscalPeriod`
- `reopenFiscalPeriod`
- `lockFiscalPeriod`
- `validatePeriodClose`

The close readiness evaluator should become the richer validation source used
by `validatePeriodClose`. The close-run write should be added to
`closeFiscalPeriod`. Reopen and lock behavior should remain in the existing
service and be extended where needed. Do not create a parallel
`closeMonthlyPeriod` path that can drift from fiscal-calendar status rules.

Normal application code should not update `fiscal_calendar.status` directly.
Close, reopen, and lock should go through the fiscal-period service so readiness
validation, close-run persistence, audit events, and posting controls stay in
one path. Direct status updates should be limited to bootstrap, migration,
import/admin recovery, or carefully audited support operations.

Known current behavior to fix:

- current validation does not block closing a month when the prior month is
  still open;
- task evaluation currently resolves open monthly periods without checking
  whether the company-local period has ended;
- `close_period` task activation therefore needs an explicit timezone-aware
  gate.

Reopen cascade rule:

- Reopening a monthly period is blocked if any later monthly period in the same
  fiscal year is locked.
- If later monthly periods are closed but not locked, ordinary reopen may
  proceed only through the close system.
- Later closed periods should remain closed for posting-control purposes, but
  they become close-stale until re-confirmed.
- Close-stale later periods should surface a `period_close_stale_due_to_prior_reopen`
  finding and return to the firm's close work queue.
- Annual close and lock should be blocked while any monthly period in the fiscal
  year is close-stale.
- Reclosing the reopened period does not automatically make later close runs
  trustworthy again; each stale later period must be re-evaluated and
  re-confirmed.

## Product posture

The close workflow should not feel like generic accounting software asking every
company every possible question.

It should feel like:

- the system has looked at the books;
- the system knows what kind of company/accounting basis this is;
- the system has grouped the real issues;
- the user is only asked to resolve or confirm things that matter.

The product has two accounting bases:

1. `modified_cash_basis`
2. `modified_accrual_basis`

That is enough. A third "pure cash" or "pure accrual" mode would probably add
more confusion than value at this stage. Real small businesses are often mixed:
a modified cash company may still track taxes, liabilities, fixed assets, and
depreciation; a modified accrual company may still rely heavily on bank feed
activity. The close engine should therefore use accounting basis as the default
rule pack, then add checks based on actual account usage.

## Notification and surfacing model

Close readiness has two audiences:

1. firm/bookkeeper users managing many clients;
2. owner/operator users managing one company directly.

For firm-managed clients, T-7 and T-3 should usually be informational portfolio
views:

- periods ending in the next 7 days;
- grouped by client, fiscal month-end date, and assigned bookkeeper;
- sorted by close risk;
- showing blocker counts, review counts, stale feeds, uncategorized counts, and
  overdue signals;
- delivered as a digest or dashboard cue, not as one notification per client.

For firm-managed clients, close readiness belongs to the firm. Individual
assignees route the work, but they do not own the accounting state. A company can
move from one bookkeeper to another during the close cycle, so notifications and
work queues should resolve the current assignee at display/send time where
possible.

Firm notification behavior:

- firm-level dashboard/work queue is the primary surface;
- assignee-level views group all assigned closes together;
- email/push should be digest-based by user and period, not one email per
  client;
- client/company notification centers may still show company-specific close
  items;
- assignment changes should not create a new close workflow or lose prior
  findings.

For owner-managed companies, the same readiness information appears in the
company workspace:

- close readiness card;
- direct links to unresolved actions;
- short, plain-language prompts.

Formal close should not become actionable until the fiscal month has ended in
the company's timezone.

The sequence is:

- T-7: readiness preview;
- T-3: stronger readiness preview if risk exists;
- period end day: period ending notice;
- D+1: formal close workflow opens;
- D+3: unresolved blockers/reviews reminder;
- D+5 or configured target close day: overdue close;
- D+7: firm/admin escalation;
- D+14: stale books / close health risk signal.

The timing can be configurable later, but the rule should remain timezone-aware
and company-period-aware.

Task activation model:

- Before period end, readiness appears in dashboards/work queues as preview
  state, not as an actionable close task.
- After company-local period end, period close work can appear in the assigned
  bookkeeper's queue.
- The `close_period` task should remain blocked until objective blockers are
  cleared and required reviews/final confirmations are addressed.
- For firm-managed clients, the task belongs to the firm's workflow run. The
  current assignee routes who sees it first, but reassignment should not recreate
  the close cycle.
- For owner-managed companies, the task appears in the company workspace after
  period end.

For V1, a daily scheduled close-readiness sweep is acceptable and sustainable if
it is bounded:

- evaluate active customer companies and active firm assignments;
- look only at monthly periods in the readiness window:
  - ending within the next 7 days;
  - ending today;
  - ended but still open or overdue;
- skip locked periods;
- avoid one job per notification recipient;
- write/update workflow/task/finding state idempotently.

This can build on the existing task-evaluation sweep. A more granular queue can
come later if volume demands it.

## Core mental model

The close workflow has five layers:

1. Period readiness
2. System-detected findings
3. User resolution or acknowledgement
4. Final close run
5. Post-close controls

The system should generate findings from facts, not from a static questionnaire.

Facts come from:

- company accounting basis;
- fiscal calendar period;
- bank account/feed state;
- bank transactions;
- categorization tasks and review state;
- journal batches and journal entries;
- ledger transactions and ledger entries;
- chart of accounts;
- account types;
- account elements;
- recurring journal templates;
- GL balance read models;
- trial balance response/checks;
- task/workflow state;
- future email/document integrations.

## Severity levels

Every close finding should have one of four severity levels.

### Blocker

The period should not close until this is resolved.

Examples:

- prior managed monthly period is still open;
- period trial balance does not balance;
- relevant GL balances are missing or stale;
- uncategorized bank transactions exist in the period;
- required pre-close posting/classification tasks are incomplete;
- draft journals dated in the period remain unresolved;
- hard bank import gaps exist.

### Required review

The period can close only after the user reviews the issue and either resolves
it or explicitly acknowledges it.

Examples:

- fixed asset account increased but no depreciation review exists;
- unusual revenue movement;
- recurring expense appears missing;
- foreign currency balances exist but revaluation is not configured or was
  skipped;
- suspense/clearing account has a balance that the user accepts temporarily.

### Advisory check

The issue is useful but should not prevent close.

Examples:

- account used for the first time;
- transaction volume materially changed from prior months;
- possible duplicate with low or medium confidence;
- large director/current-account movement.

### Final confirmation

Human attestation for things the system cannot know.

Examples:

- no material off-bank transactions need to be recorded;
- all external documents/invoices not captured in the app have been considered;
- management/bookkeeper accepts the period reports.

Final confirmations should be short. They should not duplicate facts the system
can already evaluate.

## Close sections

The UI should group findings into stable sections. Some sections are always
visible; others appear only when relevant.

### Universal sections

These apply to both accounting bases.

- Period sequence
- Bank/data completeness
- Classification and review
- Journals
- Ledger integrity
- Suspense and clearing
- Trial balance and balances
- Analytical review
- Final approval

### Modified cash primary sections

These are normally emphasized for `modified_cash_basis`.

- Cash income
- Cash expenses
- Bank/data completeness
- Owner/director/equity movements
- Taxes paid
- Payroll paid, if detected
- Off-bank cash confirmation

### Modified cash conditional sections

These appear if the company uses relevant accounts or posting patterns.

- Liabilities and payables
- Fixed assets and depreciation
- Tax liabilities
- Payroll liabilities
- Foreign currency
- Recurring journals

This matters because many modified cash businesses still have some accrual-like
behavior. The app should assist when patterns exist, without making those areas
the default burden.

### Modified accrual sections

These are normally emphasized for `modified_accrual_basis`.

- Revenue and receivables
- Expenses and payables
- Accruals
- Prepayments and deferred costs
- Deferred revenue and customer deposits
- Fixed assets and depreciation
- Payroll and payroll liabilities
- Taxes
- Foreign currency and FX revaluation
- Director/current account and equity
- Recurring journals
- Cut-off and unusual movements

## Initial V1 rule catalog

These are the first close readiness rules to implement. The rule names are
deliberate and should be stable enough to appear in tests, findings, and task
blocker projections.

Principle:

- A blocker must be objective, explainable, and clearly resolvable.
- A rule should not be a blocker merely because it is "important accounting."
- If the system is inferring risk from patterns, make it a required review or
  advisory check.
- If a rule depends on configured workflows, only evaluate it when that workflow
  exists for the company.
- If a rule depends on onboarding history, respect the company's conversion date
  and first managed period.

### Universal blocker rules

| Code                                     | Section                    | Severity | What it checks                                                                                                                        |
| ---------------------------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `period_prior_managed_month_open`        | Period sequence            | Blocker  | The immediately preceding managed monthly period is still open. Periods before conversion/first managed period do not block.          |
| `period_close_stale_due_to_prior_reopen` | Period sequence            | Blocker  | This period was closed, but an earlier managed month was reopened after this close. The period must be re-evaluated and re-confirmed. |
| `trial_balance_unbalanced`               | Trial balance and balances | Blocker  | Trial balance debits and credits do not match at accounting precision.                                                                |
| `gl_balances_stale_or_missing`           | Trial balance and balances | Blocker  | Required GL balance materializations are missing or stale for active accounts.                                                        |
| `draft_journals_open`                    | Journals                   | Blocker  | Draft/unposted journals dated in the period remain unresolved.                                                                        |
| `bank_import_hard_gap`                   | Bank/data completeness     | Blocker  | A known bank feed/import gap exists in the period.                                                                                    |
| `uncategorized_transactions_open`        | Classification and review  | Blocker  | Bank transactions in the period remain uncategorized.                                                                                 |
| `required_categorization_reviews_open`   | Classification and review  | Blocker  | Required AI/human categorization reviews remain incomplete where review is required before posting or before close.                   |
| `client_classification_queries_open`     | Classification and review  | Blocker  | Client/bookkeeper queries needed for classification remain unresolved.                                                                |
| `bank_import_duplicate_exact`            | Bank/data completeness     | Blocker  | The same provider/import transaction identity appears more than once and indicates objective duplicate import corruption.             |

`period_not_ended_company_timezone` is not a finding. It is a readiness state
gate. Before the company-local period end, the period is in preview state and
the formal close action is unavailable.

### Universal required-review rules

| Code                             | Section                | Severity        | What it checks                                                                                                                                                                              |
| -------------------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bank_sync_stale_review`         | Bank/data completeness | Required review | Connected bank data is stale beyond the configured threshold for an active connected account. CSV/manual accounts and deliberately closed bank accounts should not trigger this by default. |
| `suspense_activity_review`       | Suspense and clearing  | Required review | Suspense/fallback/uncategorized accounts have period activity or a closing balance that must be cleared or accepted with reason.                                                            |
| `bank_duplicate_possible_review` | Bank/data completeness | Required review | Transactions look like possible duplicates but are not objective duplicate imports.                                                                                                         |

### Modified cash required-review rules

| Code                                           | Section                         | Severity        | What it checks                                                                            |
| ---------------------------------------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `cash_owner_director_equity_review`            | Owner/director/equity movements | Required review | Material owner, director, shareholder, drawings, contribution, or equity movement exists. |
| `cash_tax_payment_review`                      | Taxes paid                      | Required review | Tax-like payments or tax accounts moved in a way worth review.                            |
| `cash_payroll_payment_review`                  | Payroll paid                    | Required review | Payroll-like payments exist.                                                              |
| `cash_fixed_asset_or_liability_pattern_review` | Fixed assets and depreciation   | Required review | Modified cash company used fixed asset, depreciation, liability, or payable accounts.     |
| `cash_foreign_currency_review`                 | Foreign currency                | Required review | Foreign currency balances or FX-like settlements exist.                                   |

### Modified cash final confirmations

| Code                               | Section                    | Severity           | What it confirms                                       |
| ---------------------------------- | -------------------------- | ------------------ | ------------------------------------------------------ |
| `cash_off_bank_activity_confirmed` | Off-bank cash confirmation | Final confirmation | No material off-bank transactions need to be recorded. |
| `cash_reports_ready_confirmed`     | Final approval             | Final confirmation | The user accepts the period reports for close.         |

### Modified accrual blocker rules

| Code                                 | Section                             | Severity | What it checks                                                                                                                                                               |
| ------------------------------------ | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recurring_journal_missing_required` | Recurring journals                  | Blocker  | A configured required recurring journal failed to generate or post.                                                                                                          |
| `expected_accrual_reversal_missing`  | Accruals                            | Blocker  | A system-known expected accrual reversal is missing or failed. This only applies when the original accrual carried reversal metadata or was generated by a tracked workflow. |
| `configured_depreciation_missing`    | Fixed assets and depreciation       | Blocker  | Configured depreciation/amortization did not post.                                                                                                                           |
| `configured_fx_revaluation_missing`  | Foreign currency and FX revaluation | Blocker  | Configured FX revaluation is missing or stale where monetary FX balances exist.                                                                                              |
| `configured_payroll_accrual_missing` | Payroll and payroll liabilities     | Blocker  | Configured payroll accrual workflow is incomplete.                                                                                                                           |
| `subledger_gl_control_mismatch`      | Ledger integrity                    | Blocker  | Dormant for V1. Evaluate only after true AR/AP subledgers exist and are enabled. Locked receivable/payable COA accounts are not subledgers.                                  |

### Modified accrual required-review rules

| Code                                        | Section                                | Severity        | What it checks                                                                                              |
| ------------------------------------------- | -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `revenue_variance_review`                   | Revenue and receivables                | Required review | Revenue movement is materially unusual versus recent periods.                                               |
| `bank_receipt_direct_to_revenue_review`     | Revenue and receivables                | Required review | Bank receipts were posted directly to revenue where receivables/deferred revenue treatment may be expected. |
| `customer_deposit_deferred_revenue_review`  | Deferred revenue and customer deposits | Required review | Customer deposits/prepayments may need deferred revenue treatment.                                          |
| `supplier_payment_direct_to_expense_review` | Expenses and payables                  | Required review | Supplier payments were posted directly to expense where payables/accrual treatment may be expected.         |
| `recurring_expense_missing_review`          | Expenses and payables                  | Required review | A normally recurring expense appears missing.                                                               |
| `accrual_candidate_review`                  | Accruals                               | Required review | Material expense/revenue pattern suggests an accrual may be needed.                                         |
| `prepayment_candidate_review`               | Prepayments and deferred costs         | Required review | Annual, quarterly, or multi-period spend may need prepaid/deferred treatment.                               |
| `fixed_asset_depreciation_review`           | Fixed assets and depreciation          | Required review | Fixed asset activity exists without a clear depreciation/amortization review.                               |
| `payroll_liability_review`                  | Payroll and payroll liabilities        | Required review | Payroll payments or expense activity may need liability/tax review.                                         |
| `tax_liability_movement_review`             | Taxes                                  | Required review | Tax liability/payment movement is unusual or potentially misclassified.                                     |
| `fx_revaluation_decision_review`            | Foreign currency and FX revaluation    | Required review | FX balances exist but no configured revaluation workflow applies.                                           |
| `director_current_account_review`           | Director/current account and equity    | Required review | Director/current-account/equity movement needs review.                                                      |
| `large_unusual_movement_review`             | Analytical review                      | Required review | Account movement is materially unusual by configured threshold.                                             |

### Advisory rules

| Code                          | Section                | Severity       | What it checks                                               |
| ----------------------------- | ---------------------- | -------------- | ------------------------------------------------------------ |
| `first_time_account_use`      | Analytical review      | Advisory check | An account was used for the first time.                      |
| `bank_duplicate_possible`     | Bank/data completeness | Advisory check | Low/medium-confidence possible duplicate transaction exists. |
| `negative_balance_unusual`    | Analytical review      | Advisory check | An account has an unusual negative balance for its type.     |
| `new_vendor_customer_pattern` | Analytical review      | Advisory check | New counterparty/activity pattern may deserve review.        |

### Modified accrual final confirmations

| Code                                              | Section                 | Severity           | What it confirms                                                                     |
| ------------------------------------------------- | ----------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `accrual_revenue_complete_confirmed`              | Revenue and receivables | Final confirmation | All material revenue for the period has been considered.                             |
| `accrual_expenses_liabilities_complete_confirmed` | Expenses and payables   | Final confirmation | All material expenses and liabilities for the period have been considered.           |
| `external_documents_considered_confirmed`         | Final approval          | Final confirmation | External invoices, bills, or documents not captured in the app have been considered. |
| `accrual_reports_ready_confirmed`                 | Final approval          | Final confirmation | The user accepts the period reports for close.                                       |

## Per-transaction close review signals

The required-review and advisory findings above are not rediscovered at close.
The accounting-judgment ones are captured as durable **signals** the moment a
ledger transaction is posted (`close_review_signals`), then summarized at close.
The live objective blockers (trial balance, GL staleness, uncategorized, prior
period open, timezone) stay recompute-only and are not signals.

Signals are computed by a pure evaluator
(`domains/reporting/close-readiness/signals/close-signals.evaluator.ts`) over a
single ledger transaction and its entries. Accounting basis is a lens on shared
structural facts, not a separate engine. Rules are organized by family rather
than by basis.

### Per-transaction signal catalog (V1)

| Code                                    | Family                | Source  | Basis   | What it observes                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bank_offset_to_non_cash_account`       | Wrong destination     | bank    | any     | Bank leg offsets to a non-cash account: depreciation/amortization expense (`exp_opex_depreciation_amortization`), accumulated depreciation (`contra_asset`), or equity (`contributed_capital`/`reserves`/`other_equity`). Essentially always an error. |
| `bank_offset_to_capex`                  | Wrong destination     | bank    | any     | Bank leg offsets to a `non_current_asset`. Legitimate capex, but expects depreciation follow-up.                                                                                                                                                       |
| `posted_to_fallback_account`            | Wrong destination     | bank    | any     | Offset account has `label_role = 'fallback'` (parked, not classified).                                                                                                                                                                                 |
| `journal_to_bank_account`               | Wrong destination     | journal | any     | A manual journal moves a bank/cash-equivalent account directly (`ca_bank`/`ca_cash_equivalent`).                                                                                                                                                       |
| `bank_offset_direct_to_revenue`         | Accrual bypass        | bank    | accrual | Bank receipt posted straight to income/revenue, bypassing receivables/deferred revenue.                                                                                                                                                                |
| `bank_offset_direct_to_expense`         | Accrual bypass        | bank    | accrual | Bank payment posted straight to expense, bypassing payables/accruals. Excludes inherently pay-as-you-go types (`exp_opex_bank_fees`, `exp_nopex_finance_costs`, `exp_nopex_tax`); optional amount gate.                                                |
| `posting_missing_required_contact`      | Metadata completeness | any     | any     | Per-leg: a posting to a counterparty account (trade AR/AP, related party, prepayment, deferred, contract asset) has no contact.                                                                                                                        |
| `posting_missing_supporting_doc`        | Metadata completeness | journal | any     | Once per transaction: a manual journal touches a counterparty account with no document attached. Bank-feed postings routinely lack in-app documents, so this is scoped to journals to avoid noise.                                                     |
| `journal_depreciation_pairing_mismatch` | Journal integrity     | journal | any     | A journal touches accumulated depreciation but pairs with neither depreciation expense nor a fixed asset (likely miscategorized).                                                                                                                      |
| `low_confidence_autopost`               | Quality               | bank    | any     | ML/heuristic autopost below the confidence threshold with no human review of any leg.                                                                                                                                                                  |
| `monetary_fx_leg`                       | Quality               | bank    | any     | Offset leg is monetary; feeds the period-level FX revaluation finding.                                                                                                                                                                                 |

Principle for the `bank_offset_direct_to_expense` noise problem: blanket
direct-to-expense is too broad even for accrual companies. The type exclusions
above remove inherently-cash expenses; finer materiality filtering (amount,
supplier-recurrence) belongs to the surfacing/period layer in reporting
currency, not the per-transaction evaluator.

### Contextual checks that are period-level findings, not signals

These need cross-account or cross-period state, so they are computed at
read/close from GL balances plus the period's signals — not emitted per
transaction:

- `capex_without_depreciation_movement` — capex signals exist but accumulated
  depreciation did not move versus the prior closed period.
- `fx_balances_without_revaluation` — monetary FX balances exist with no
  revaluation entry.
- `tax_expense_with_open_tax_liability` — bank posted to tax expense
  (`exp_nopex_tax`) while a `cl_tax` liability is open.
- `payroll_expense_without_payroll_liability` — payroll expense
  (`exp_opex_employee_benefits`) without a `cl_payroll_payables` movement.
- `loan_repayment_not_split` (advisory) — a payment to a counterparty with a
  debt account posted entirely to finance cost.
- `suspense_open_at_close` — fallback/suspense balance still open at close
  (fed by `posted_to_fallback_account`).

### Not feasible cleanly yet

- **Bank-to-FX-gain/loss**: there is no FX gain/loss P&L account type in the
  catalog (only `eq_oci`). Needs a dedicated account type or a name heuristic.
- **Interbank transfers miscoded as income/expense**: deferred — needs
  transfer-pair detection across the company's bank accounts.
- **Service period / tax type+period / "fully to expense" splits**: depend on
  unstructured text or amount-split inference; the doc-attachment parts are
  feasible, the text parts are heuristic and advisory.

This replaces the earlier config-gated accrual blockers
(`configured_depreciation_missing`, `configured_payroll_accrual_missing`, etc.):
they presumed a configuration system that does not exist. The observation-driven
signals and period findings above work for companies that never set up any
workflow.

## Why account elements and account types matter

The close engine should not depend on account names like "Rent" or "Computer
Equipment" where structured taxonomy exists.

The current schema already has the right foundation:

- `account_elements` define durable reporting buckets such as assets,
  liabilities, income, expenses, gains, and losses.
- `account_types` sit under account elements and drive posting semantics,
  classification, reporting, and accrual targeting.
- `coa` links a company account to an account type.
- `ledger_entries` show actual period movement by COA.

Close rules should mostly evaluate account type/element behavior:

- asset movement can trigger fixed asset or prepayment review;
- liability movement can trigger payable, payroll, tax, or accrual review;
- income movement can trigger revenue review;
- expense movement can trigger recurring cost or accrual review;
- monetary account balances can trigger FX review;
- control or fallback accounts can trigger cleanup review.

Account names can still help display user-friendly explanations, but they should
not be the primary rule engine.

## Tables and responsibilities

### `companies`

Stores `accounting_basis`, fiscal year-end, timezone, reporting currency, and
company context.

The close engine uses this to choose the default rule pack and compute local
period timing.

### `fiscal_calendar`

Stores canonical fiscal periods and status.

The close engine uses this for:

- current period;
- prior-period sequence checks;
- open/closed/locked status;
- posting control;
- monthly and yearly close targets.

### `workflow_runs`

Represents the period workflow before close.

For a monthly bookkeeping close, one workflow run should exist for the company,
period, and domain area.

The workflow run tracks the operating lifecycle:

- not started;
- in progress;
- review requested;
- under review;
- approved;
- sent;
- closed.

This is what powers task lists, reminders, and close progress.

### `engagement_tasks`

Represents actionable work generated by the readiness engine.

Examples:

- categorize transactions;
- review AI categorizations;
- review draft journals;
- prepare period for review;
- approve period;
- send reports;
- close period.

Future close-specific tasks can be added where useful, but the first preference
should be to use generated findings/blockers inside the workflow rather than
creating dozens of static task types.

### `engagement_task_blockers`

Stores task-level blockers and warnings that prevent or qualify task completion.

For close readiness, this should be a projection of open blocker/warning
findings into the task system. It should not be the source of truth for
acknowledgements, not-applicable decisions, or finding invalidation.

For V1, the source of truth for user-addressable transaction review findings is
`close_review_signals` plus append-only `close_review_decisions`. Objective
period checks remain recompute-only until they need durable user decisions.

### `engagement_task_events`

Stores task history.

This matters because close should be explainable:

- when a blocker appeared;
- who completed a review task;
- when due dates or priority changed.

Finding acknowledgement history should live in close review decisions, not only
in task events.

### Bank transaction tables

Bank transactions are the main evidence source for modified cash companies and
still a major source for modified accrual companies.

The close engine uses them for:

- uncategorized transaction counts;
- review status;
- possible duplicates;
- known import gaps;
- stale sync/feed health;
- period activity by source bank account;
- unusual cash movement;
- direct postings to accounts that may need accrual review.

The app does not need full bank reconciliation as a core V1 close concept.
Instead, it needs bank data completeness:

- is the feed/import recent enough?
- are there known gaps?
- are transactions categorized?
- are reviews complete?
- are duplicate imports likely?

### `journal_batches` and `journal_entries`

Journals represent manual and system accounting adjustments.

The close engine uses them for:

- draft/unposted journals in the period;
- recurring journals that should have posted;
- accrual, depreciation, payroll, FX, tax, opening balance, and annual close
  classifications;
- read-only generated journals;
- close-run linkage later.

### `ledger_transactions` and `ledger_entries`

Posted ledger entries are the accounting source of truth.

The close engine uses them for:

- period movement;
- COA/account-type activity;
- trial balance inputs;
- unusual movement analysis;
- annual close journal exclusion from normal reporting;
- GL explorer traceability.

### `recurring_journal_templates`

Recurring templates are evidence of expected monthly accounting entries.

The close engine uses them for:

- missing recurring journals;
- depreciation/amortization cadence;
- rent/software/professional-fee accruals;
- recurring payroll or tax journals where configured.

### GL balance tables

`gl_current_balances`, `gl_daily_balance_snapshots`, and
`gl_period_balances` are derived read models.

The close engine uses them to check:

- balance freshness;
- trial balance readiness;
- opening/movement/closing values;
- whether recalculation is required before close.

### `fiscal_period_close_runs`

This table does not drive the pre-close workflow.

It records the final close event after the workflow is complete:

- who closed;
- when they closed;
- which findings were still acknowledged;
- final checklist responses;
- final trial balance snapshot;
- generated annual close journal/ledger links;
- close metadata.

It is the audit artifact of close, not the task engine.

## Modified cash close flow

This is the expected flow for a company using `modified_cash_basis`.

### T-7 days before period end

The scheduled task evaluation system checks the upcoming monthly period.

The system ensures a `workflow_runs` row exists for the company/month/domain.
The workflow may remain `not_started` if there is nothing urgent yet.

The readiness engine evaluates:

- bank feed/import freshness;
- known bank import gaps;
- uncategorized bank transactions in the period so far;
- AI categorization review queue;
- ask-client/unresolved classification tasks;
- draft journals dated in the period;
- prior period status;
- obvious duplicate bank transactions;
- suspense or fallback account usage.

What the user sees:

- a quiet readiness card or notification;
- "June close is coming";
- count of items needing attention;
- direct links to categorize/review.

No accounting-heavy checklist appears yet.

### T-3 days before period end

The system re-evaluates the same period.

If there are unresolved classification issues, bank import gaps, or stale syncs,
the workflow becomes more prominent.

What the user sees:

- close readiness summary;
- blockers grouped under Bank/data completeness and Classification and review;
- optional advisory checks for unusual movement or possible duplicates.

For modified cash, the system should mostly answer its own questions from bank
data. Human questions remain minimal.

### Period end day

The system does not force close.

It shows that the period is ending and that transactions may still arrive.

What the user sees:

- "June ends today";
- current unresolved blockers;
- likely readiness date based on feed freshness.

### D+1 after period end

The close workflow becomes active.

The readiness engine evaluates the full period.

Blockers for modified cash:

- previous managed monthly period is still open;
- bank feed/import has hard gaps;
- bank transactions remain uncategorized;
- required categorization reviews are incomplete where review is required before
  posting or close;
- unresolved ask-client items block classifications;
- draft journals dated in the period are unresolved;
- trial balance does not balance;
- relevant GL balances are missing or stale;
- exact duplicate import corruption exists.

Required reviews for modified cash:

- stale bank sync/import where an active connected account is expected to be
  current;
- suspense/fallback account activity;
- possible duplicate transactions;
- material owner/director/equity movements;
- tax/payment accounts used in unusual ways;
- payroll-like payments detected;
- fixed asset/liability accounts used despite modified cash basis;
- unusual revenue/expense movement;
- foreign currency balances or FX-like settlements, if relevant.

Final confirmations:

- no material off-bank transactions need to be recorded;
- owner/director/personal transactions have been identified;
- reports are ready to close.

What the user sees:

- a compact close checklist;
- mostly auto-generated status;
- blockers at the top;
- "Review recommended" section only if activity warrants it;
- a close button disabled until blockers are resolved and required reviews are
  acknowledged.

### D+3

If blockers remain, reminders escalate.

What the user sees:

- "June close has 3 blockers";
- direct action buttons.

The system updates `engagement_tasks`, blockers, and workflow metrics.

### D+5 or target close day

If the period is still not close-ready, it becomes overdue.

What the user sees:

- overdue close status;
- firm/admin dashboard signal;
- priority raised for unresolved close task.

### Close action

When the user clicks Close:

1. The service re-runs readiness checks inside a transaction or with a freshness
   guard.
2. If blockers remain, close is rejected with structured reasons.
3. Required reviews and final confirmations are stored in the close payload.
4. A `fiscal_period_close_runs` row is created.
5. The monthly `fiscal_calendar` row is set to `closed`.
6. The `workflow_runs` row is marked `closed`.
7. An audit event is written.

No monthly close journal is generated.

### After close

Normal posting into the closed period is blocked.

If the user needs to change the period:

- they must reopen the period;
- the prior close run is superseded;
- changes are posted;
- balances recalculate;
- the period is closed again with a new close run.

## Modified accrual close flow

This is the expected flow for a company using `modified_accrual_basis`.

### T-7 days before period end

The scheduled task evaluation system checks the upcoming monthly period.

The readiness engine evaluates universal checks plus accrual sections:

- bank/data completeness;
- uncategorized and unreviewed bank transactions;
- draft journals;
- recurring journal templates due in the period;
- prior accrual reversals due;
- account activity by account element/type;
- fixed asset movements;
- liability/payable movements;
- revenue/receivable activity;
- payroll-like activity;
- tax account movements;
- foreign currency balances;
- unusual movement patterns.

What the user sees:

- "June close is coming";
- readiness grouped by section;
- early prompts such as:
  - recurring journals expected;
  - depreciation review may be needed;
  - foreign currency review may be needed;
  - revenue or expense movement looks unusual.

The goal at T-7 is preparation, not pressure.

### T-3 days before period end

The system becomes more explicit.

What the user sees:

- close readiness panel with sections;
- required reviews surfaced ahead of time;
- suggested actions:
  - create journal;
  - review recurring journal;
  - mark not applicable;
  - add note;
  - attach support later.

Examples:

- Fixed assets increased this period. Review depreciation treatment.
- Rent usually appears monthly but has no June posting.
- Payroll payments were detected. Confirm payroll accrual/tax treatment.
- Foreign currency bank balance exists. Review FX revaluation need.

### Period end day

The system shows a period-end readiness state.

It should not imply the books can close instantly. Accrual work often happens
after month-end.

What the user sees:

- current blockers;
- expected close tasks;
- open required reviews.

### D+1 after period end

The formal close workflow begins.

Blockers for modified accrual:

- previous managed monthly period is still open;
- hard bank import gaps exist;
- uncategorized bank transactions remain;
- required categorization reviews remain where review is required before posting
  or close;
- unresolved ask-client items block accounting treatment;
- draft journals dated in the period are unresolved;
- required recurring journals failed to generate/post;
- system-known expected prior-period reversals are missing or failed;
- configured depreciation/amortization journals are missing;
- configured FX revaluation is missing/stale;
- configured payroll accrual workflow is incomplete;
- AR/AP subledger-to-GL checks fail, after true subledgers exist and are
  enabled;
- trial balance does not balance;
- relevant GL balances are missing or stale.

Required reviews for modified accrual:

- revenue unusually high/low;
- bank receipts posted directly to revenue where receivables are used;
- customer deposits/prepayments without deferred revenue treatment;
- supplier payments posted directly to expense where payables are used;
- recurring expenses missing;
- material accrual/prepayment candidates;
- fixed asset purchases or disposals;
- asset balance increased without depreciation review;
- payroll-like payments without payroll-liability review;
- tax liability movement unusual;
- foreign currency balances without explicit revaluation decision;
- suspense/clearing balances;
- director/current account movements;
- large unusual movements by account type.

Advisory checks:

- first-time account usage;
- low-confidence duplicates;
- movement differs from rolling average;
- unusual negative balances where not inherently wrong;
- new vendor/customer pattern.

Final confirmations:

- all material revenue for the period has been considered;
- all material expenses/liabilities for the period have been considered;
- all external invoices/bills/documents outside the app have been considered;
- reports are ready to close.

### D+3

The close workflow should now highlight unresolved accounting reviews, not just
bank/classification issues.

What the user sees:

- sectioned readiness status;
- blockers vs required reviews clearly separated;
- ability to acknowledge a required review with a reason;
- ability to create an adjustment journal from a prompt where supported.

### D+5 or target close day

The period becomes overdue if not closed.

For modified accrual, overdue status should distinguish:

- operational blockers, such as uncategorized bank items;
- accounting reviews, such as accrual/depreciation/FX;
- approval bottlenecks.

This helps firms understand whether the delay is client data, bookkeeping work,
or reviewer approval.

### Close action

When the user clicks Close:

1. The service re-runs readiness checks.
2. Blockers reject close.
3. Required reviews must be resolved or acknowledged with reason.
4. Final confirmations are captured.
5. A `fiscal_period_close_runs` row is created.
6. The monthly `fiscal_calendar` row is set to `closed`.
7. The `workflow_runs` row is marked `closed`.
8. Audit event is written.

No monthly P&L close journal is generated.

### After close

Normal posting into the period is blocked.

Reopening:

- supersedes the previous close run;
- reopens the fiscal period;
- requires reason;
- triggers fresh readiness after changes;
- creates a new close run when closed again.

## Annual close

Annual close is separate from monthly close.

Monthly close is an operational control. Annual close is an accounting event.

Annual close should:

- require all monthly periods in the fiscal year to be closed;
- run annual close readiness;
- compute temporary-account balances;
- generate an annual close journal to retained earnings/equity;
- classify journal and ledger transaction as `annual_close`;
- link generated journal/ledger to the close run;
- recalculate balances;
- close the yearly fiscal calendar row.

Normal reports and trial balance should exclude annual close transactions by
default, while GL explorer and journal history should show them clearly.

## How findings should be represented

The read-only close readiness evaluator should produce structured findings for
the UI. Persistence depends on the finding kind:

- objective blockers stay recompute-only unless they need user decisions;
- per-transaction accounting-review facts live in `close_review_signals`;
- user decisions live in append-only `close_review_decisions`;
- period-level findings can get their own current-fact table later if they need
  acknowledgement/not-applicable behavior.

The UI-facing finding shape should remain close to:

```text
id
company_id
workflow_run_id
period
section
severity
code
title
description
source_table
source_entity_id
related_coa_ids
related_account_type_keys
related_account_element_keys
metadata
```

Read-only evaluation does not need a table.

However, the moment users can acknowledge, mark not applicable, or resolve a
finding manually, user decisions need first-class persistence. Do not store
durable acknowledgements only in `engagement_task_blockers`.

Reason:

- blockers are task constraints; findings are close-readiness facts;
- blockers only model hard/warning pressure, not the close-review decision
  history;
- acknowledgements are durable user/accounting state;
- acknowledgements must survive re-evaluation while the underlying facts remain
  materially the same;
- acknowledgements must be invalidated when the underlying facts materially
  change.

Recommended persistence boundary:

- Live objective blockers: recompute from source data.
- Per-transaction review facts: store current facts in `close_review_signals`.
- User decisions: append to `close_review_decisions`, matched by `fingerprint`
  and `facts_hash`.
- Period-level findings: keep recompute-only until acknowledgement is required;
  then add a period-level current-fact table rather than forcing them into the
  ledger-signal table.
- `engagement_task_blockers` should become a projection of open blocker/warning
  findings into the task system, not the source of truth for close findings.

Current decision model:

```text
signal/finding exists + no matching decision => open
signal/finding exists + matching decision for current facts_hash => addressed
signal/finding disappears => no current finding
signal/finding facts_hash changes => prior decision no longer matches
```

`close_review_signals` stores current per-transaction facts:

```text
id
company_id
fiscal_year
period_number
period_type
code
ledger_transaction_id
ledger_entry_id
coa_id
account_type_key
account_element_key
amount
fingerprint
facts_hash
details
detected_at
```

`close_review_decisions` stores append-only user decisions:

```text
id
company_id
fiscal_year
period_number
period_type
fingerprint
facts_hash
code
finding_scope
ledger_transaction_id
ledger_entry_id
facts_snapshot
decision
reason
decided_by_id
decided_at
```

Stable identity and invalidation:

- `code` identifies the rule.
- `fingerprint` is **stable identity only** — rule + period + transaction +
  account + (for leg-specific signals) the ledger entry as the stable line
  identity. It deliberately **excludes amount**: a changed amount is a changed
  fact, not a different finding.
- `facts_hash` identifies the **material state** behind the current finding,
  including amount, categorization source, and (for period findings) the
  relevant aggregates.
- If the same `fingerprint` appears with the same `facts_hash`, keep any valid
  acknowledgement.
- If the same `fingerprint` appears with a different `facts_hash`, invalidate
  the prior acknowledgement and reopen the finding.
- If a finding no longer appears, it is absent from current readiness.
  Historical decisions remain meaningful because they carry code, scope, ledger
  pointers, and a facts snapshot.

Model boundary (V1): what is implemented is a **current-fact table
(`close_review_signals`) plus an append-only decisions log
(`close_review_decisions`)** — not a full event-sourced signal lifecycle. There
is no `signal_events` table and no materialized lifecycle projection; "open" vs
"acknowledged" is derived at read time. Because signals are hard-deleted as they
reconcile, each decision stores a **self-describing audit snapshot** (`code`,
`finding_scope`, `ledger_transaction_id`, `ledger_entry_id`, `facts_snapshot`)
so it stays meaningful after its signal is gone. Every decision — including
`dismissed` — requires a reason.

- If a period is reopened and reclosed, preserve old findings for audit and
  create/supersede findings as needed for the new close cycle.

## Implementation checklist

This checklist is the working implementation plan. Mark items as complete as the
system moves from design to production behavior.

### Phase 1: Close readiness contract

Purpose: define the domain language before changing persistence or behavior.

Why this matters:

- keeps the implementation from becoming scattered conditional logic;
- gives the UI, service layer, tests, and future notifications one vocabulary;
- makes modified cash and modified accrual behavior explicit.

Actions:

- [x] Create close readiness constants/types in code:
  - sections;
  - severities;
  - finding codes;
  - accounting-basis rule packs;
  - finding status values.
- [x] Define the read-only evaluator response shape.
- [x] Define how findings map to blockers, required reviews, advisory checks,
      and final confirmations.
- [x] Define period activation rules:
  - readiness preview before period end;
  - formal close only after period end in company timezone.
- [x] Define firm-managed vs owner-managed surfacing rules.
- [x] Define the integration contract between the readiness evaluator and
      `validatePeriodClose`.
- [x] Define the prior-period sequencing rule as a hard blocker:
  - a monthly period cannot close while its immediately preceding managed
    monthly period is open;
  - periods before conversion/first managed period do not block;
  - ordinary reopen should not make later closed months appear safely final.
- [x] Define timezone handling rules:
  - use company `default_timezone`;
  - store past events in UTC timestamps;
  - evaluate future/period-local boundaries as local date plus IANA timezone;
  - include DST edge cases in tests.

Acceptance criteria:

- A developer can read the types and know every supported close section,
  severity, and finding code.
- No database writes are required to run a read-only readiness evaluation.
- The evaluator contract distinguishes preview, active close, overdue, and
  closed states.
- The same contract supports firm dashboards and company workspaces.
- `validatePeriodClose` has a clear path to consume evaluator output without
  duplicating rules.
- The managed-period sequencing rule is documented as a correction to current
  behavior, not merely a future enhancement.

### Phase 2: Read-only close readiness evaluator

Purpose: teach the system to inspect a company/period and explain close
readiness without mutating state.

Why this matters:

- lets us test accounting rules before adding close mutations;
- enables dashboard/preview UX;
- gives us confidence before adding close runs.

Actions:

- [x] Implement `evaluateCloseReadiness(companyId, periodSelector)`.
- [x] Load company context from `companies`.
- [x] Resolve fiscal period from `fiscal_calendar`.
- [x] Use company timezone to compute preview/active/overdue state.
- [x] Return whether the formal close action is allowed for the period.
- [x] Return period sequencing findings, including prior managed monthly period
      still open.
- [x] Return close-stale findings for later closed periods affected by a prior
      period reopen.
- [x] Load COA with account type and account element metadata for posted account
      activity reviews.
- [ ] Evaluate universal blockers:
  - [x] prior managed monthly period open;
  - [x] close-stale due to prior period reopen;
  - [x] unposted/draft journals in period;
  - [ ] closed/locked state conflicts;
  - [x] trial balance imbalance;
  - [x] stale or missing GL balances;
  - [ ] exact duplicate import corruption.
- [ ] Evaluate universal required reviews:
  - [ ] stale bank sync/import where active connected accounts are expected to be
        current;
  - [x] suspense/fallback account activity;
  - [ ] possible duplicate transactions.
- [ ] Evaluate bank/data completeness:
  - [ ] hard import gaps;
  - [ ] stale bank sync/import as required review when it is not an objective hard
        data gap;
  - [x] uncategorized transactions;
  - [x] required categorization review where review is required before posting or
        close;
  - [ ] unresolved ask-client classification items;
  - [ ] exact duplicate import corruption.
- [ ] Evaluate modified cash primary checks:
  - [ ] cash income;
  - [ ] cash expenses;
  - [ ] owner/director/equity movements;
  - [ ] tax payments;
  - [ ] payroll-like payments;
  - [x] off-bank cash confirmation.
- [ ] Evaluate modified cash conditional checks when posting patterns exist:
  - [x] liabilities/payables and fixed assets/depreciation as one V1 review;
  - [ ] tax liabilities;
  - [ ] payroll liabilities;
  - [ ] foreign currency;
  - [ ] recurring journals.
- [ ] Evaluate modified accrual checks:
  - [ ] revenue/receivables;
  - [ ] expenses/payables;
  - [ ] accruals;
  - [ ] prepayments/deferred costs;
  - [ ] deferred revenue/customer deposits;
  - [x] fixed assets/depreciation;
  - [ ] payroll liabilities;
  - [ ] taxes;
  - [ ] FX revaluation;
  - [ ] director/current account/equity;
  - [ ] recurring journals;
  - [ ] cut-off and unusual movements.

Acceptance criteria:

- Readiness evaluation returns deterministic findings for a company/period.
- Findings include severity, section, code, title, explanation, and related
  entities where known.
- Modified cash does not show accrual-heavy sections unless account usage makes
  them relevant.
- Modified accrual surfaces accounting review areas without making every review
  a hard blocker.
- A period before company-local month-end returns preview state and does not
  allow formal close.
- A period after company-local month-end can return active close state.
- A month with an open immediately prior managed month returns a blocker.
- A company's first managed period does not fail because pre-conversion history
  is open or absent.
- DST transition tests prove the activation date is based on company-local date,
  not server timezone.
- Tests cover at least one clean period, one blocked modified cash period, and
  one modified accrual period with required reviews.

### Phase 3: Signal persistence and decisions

Purpose: persist per-transaction close review signals and append-only user
decisions before users can acknowledge, dismiss, or mark findings not
applicable.

Why this matters:

- decisions must survive re-evaluation;
- invalidation must be deterministic when underlying facts change;
- close runs need an audit-grade record of what was accepted and why;
- `engagement_task_blockers` cannot carry close-review decisions cleanly.

Actions:

- [x] Add `close_review_signals` for current per-transaction review facts.
- [x] Add `close_review_decisions` for append-only user decisions.
- [x] Store stable rule `code`, `fingerprint`, and `facts_hash`.
- [x] Store acknowledgement/not-applicable/dismissal reasons and actors in
      decisions.
- [x] Define invalidation rules:
  - same fingerprint + same facts hash keeps the decision matched;
  - same fingerprint + changed facts hash leaves the old decision unmatched;
  - missing signal is absent from current readiness;
  - reopened/reclosed periods preserve prior audit state.
- [ ] Add focused tests for decision survival and invalidation once the read
      model joins signals to decisions.

Acceptance criteria:

- User decisions are not lost during normal re-evaluation.
- Material fact changes leave stale decisions unmatched.
- Task blockers can be rebuilt from open blocker/warning findings.
- Close run can later snapshot findings and decisions without scraping
  task blockers.

### Phase 4: Workflow/task integration

Purpose: connect persisted readiness findings to the existing workflow system.

Why this matters:

- firms already need period work grouped by client/month;
- tasks and blockers are the natural operating layer before final close;
- this avoids building a parallel close workflow engine.

Actions:

- [ ] Ensure monthly bookkeeping `workflow_runs` are created for relevant
      company periods.
- [ ] Update task evaluation to call the readiness evaluator.
- [ ] Update current open-period resolution so it does not make `close_period`
      actionable before company-local period end.
- [ ] Persist per-transaction signal evaluator output into
      `close_review_signals`.
- [ ] Project open blocker/warning findings into `engagement_task_blockers`.
- [ ] Ensure `close_period` task is active only after period end in company
      timezone.
- [ ] Add portfolio grouping data for firm-managed clients:
  - client;
  - period end date;
  - assigned bookkeeper;
  - blocker count;
  - required review count;
  - overdue state.
- [ ] Add owner-managed readiness projection for a single company workspace.

Acceptance criteria:

- T-7/T-3 readiness can be shown without opening the formal close action.
- Close task does not become actionable before the company-local period end.
- Existing `task-evaluation.service.ts` behavior is corrected rather than
  bypassed by a new scheduler/path.
- Firm-managed clients can be summarized without one notification per client.
- Existing task/blocker history remains auditable.
- `engagement_task_blockers` is a projection, not the source of truth for close
  review decisions.

### Phase 5: Migration cleanup and close-run foundation

Purpose: add the durable data model needed for real close auditability and
source classification.

Why this matters:

- close must be explainable later;
- annual close journals must be identifiable by source, not description text;
- reports need reliable transaction-source filtering.

Actions:

- [ ] Clean up journal source classifications.
- [ ] Clean up ledger transaction source classifications.
- [ ] Add `annual_close`, `opening_balance`, `fx_revaluation`, and
      `system_adjustment` where appropriate.
- [ ] Add `fiscal_period_close_runs`.
- [ ] Add close-run linkage to generated journal/ledger records where needed.
- [ ] Avoid soft delete fields on close runs.
- [ ] Keep migration fields explicit and schema-qualified.
- [ ] Keep bootstrap work out of migrations.

Acceptance criteria:

- Annual close transactions can be identified directly from
  `ledger_transactions.transaction_source`.
- Annual close journal batches can be identified directly from
  `journal_batches.journal_source`.
- A close run can store who closed, what was checked, what persisted findings
  were acknowledged, final trial balance snapshot, and generated annual close
  links.
- Monthly close can create a close run without creating a journal.

### Phase 6: Monthly close service

Purpose: extend the existing fiscal-period close service once readiness and
persistence are trustworthy.

Why this matters:

- monthly close is the launch-critical control mechanism;
- trial balance, GL explorer, and financial statements all rely on period status
  being meaningful.

Actions:

- [ ] Extend `validatePeriodClose` to consume close readiness evaluator output.
- [ ] Extend `closeFiscalPeriod`; do not create a parallel monthly close path.
- [ ] Re-run readiness checks at close time through the canonical validation
      path.
- [ ] Reject close if blockers remain.
- [ ] Require required reviews to be resolved or acknowledged with reason.
- [ ] Capture final confirmations.
- [ ] Create `fiscal_period_close_runs` row.
- [ ] Mark monthly `fiscal_calendar` row `closed`.
- [ ] Mark related workflow run `closed`.
- [ ] Write audit event.
- [ ] Do not create a monthly close journal.
- [ ] Extend `reopenFiscalPeriod` as needed:
  - require reason;
  - reject ordinary reopen if any later monthly period in the fiscal year is
    locked;
  - supersede prior close run;
  - reopen fiscal calendar row;
  - mark later closed monthly periods as close-stale through findings/workflow
    state;
  - return stale later periods to the firm's close work queue;
  - trigger fresh readiness after changes.
- [ ] Keep `lockFiscalPeriod` as the canonical lock path and preserve
      `open -> closed -> locked`.

Acceptance criteria:

- A clean period can be closed atomically.
- A blocked period cannot be closed.
- Closing October while September is open is rejected.
- Reopening March while April is locked is rejected.
- Reopening March while April is closed marks April close-stale instead of
  silently leaving it clean.
- Reopening a period leaves prior close history intact.
- Posting controls continue to block normal writes into closed periods.
- There is one fiscal-period transition path for close/reopen/lock behavior.

### Phase 7: Annual close service

Purpose: implement year-end accounting close after monthly close is reliable.

Why this matters:

- annual close is where temporary accounts are closed into retained
  earnings/equity;
- it affects trial balance, financial statements, and retained earnings.

Actions:

- [ ] Require all monthly periods in the fiscal year to be closed.
- [ ] Run annual readiness checks.
- [ ] Require a configured retained earnings/equity account.
- [ ] Compute temporary-account balances for the fiscal year.
- [ ] Generate annual close journal batch.
- [ ] Generate annual close ledger transaction.
- [ ] Classify both as annual close.
- [ ] Link generated journal/ledger to the annual close run.
- [ ] Recalculate affected GL balances.
- [ ] Mark yearly fiscal calendar row `closed`.
- [ ] Keep annual close journal visible but read-only in normal journal flows.

Acceptance criteria:

- Annual close creates a balanced journal.
- Annual close is idempotent for a company/fiscal year.
- Normal trial balance/reports exclude annual close transactions by default.
- GL explorer and journal history still show annual close journals clearly.

### Phase 8: Notification delivery and UX polish

Purpose: deliver the right close information to the right user at the right
time.

Why this matters:

- the close workflow should reduce firm workload, not create notification noise;
- users should know what to do next without understanding every accounting
  detail.

Actions:

- [ ] Implement firm portfolio close readiness digest.
- [ ] Implement company workspace readiness card.
- [ ] Add overdue close signals.
- [ ] Add escalation rules for D+7 and stale books signals for D+14.
- [ ] Add UI grouping by severity and section.
- [ ] Add direct actions from findings:
  - categorize;
  - review;
  - create journal;
  - acknowledge with reason;
  - mark not applicable where allowed.

Acceptance criteria:

- Firm users see grouped close readiness by client/month.
- Owner-managed users see a clear company-level close path.
- Notifications do not fire as noisy one-client-per-period blasts.
- The close page shows blockers, required reviews, advisory checks, and final
  confirmations distinctly.

## Immediate next implementation target

Start with Phase 1 and Phase 2.

Do not start by adding the close button.

Do not add acknowledgement/not-applicable behavior until the read model can join
current findings to `close_review_decisions` by `fingerprint` and `facts_hash`.

The first production-grade slice is:

- define close readiness sections, severities, statuses, and finding codes in
  code;
- implement the read-only evaluator contract;
- implement the initial V1 rule catalog far enough to cover core blockers and
  representative modified cash/accrual reviews;
- add focused tests for modified cash, modified accrual, managed prior-period
  sequence, first-managed-period onboarding, and company-timezone activation.

After that slice is clean, move to signal persistence/decisions, then workflow/task
projection, then close-run/source-classification migrations, then monthly close.
