# Full Launch Scope and Evidence-Based Finding Catalogue

## Decision

The first external launch includes the complete agreed Work Queue and Close V2 product: Engagement responsibility and authorization, ordinary Work, monthly Close, Findings and Confirmations, split and same-person approval, Catch-up/Reclose Packages, transfers, cascading reopening and Reopen Requests, firm oversight, bulk commands, realtime invalidation, and the complete projection-driven SPA experience.

Implementation stages are dependency and verification boundaries. They are not release cuts, feature tiers, or permission to launch a partial product. A stage may be demonstrated internally before later stages exist, but first external launch remains blocked until every agreed capability passes its gate and the abandoned paths have been removed.

This rule does not pull deliberately excluded products into launch. User-created tasks, tax workflows, messaging escalation, an ordinary period-locking product, offline-first operation, and a generic workflow DSL remain outside this map because their product policy was never included in the agreed bookkeeping-and-close system.

## 1. Finding admission rule

A code enters the deployed Finding registry only when all of the following are true:

1. **Authoritative inputs** — every fact comes from a named durable Accountable Books domain row, not audit prose, UI state, or an inferred event history.
2. **Reliable evaluator** — the predicate, target grain, affected monthly Fiscal Period, material `facts_hash`, evidence, and clearing condition are deterministic and testable.
3. **Clear reasoning** — the product can show what was detected, why it matters, and the exact transactions, entries, accounts, balances, documents, or dates that produced it.
4. **Legitimate resolution** — the registry names at least one real correcting domain command or an explicitly authorized professional `accepted`/`not_applicable` decision with required reason and evidence. A generic dismissal is never a resolution.
5. **Lifecycle correctness** — changed material facts invalidate an earlier decision; correction clears only after the evaluator confirms it; close submission re-evaluates against current locked facts.
6. **Complete vertical slice** — evaluator, persistence, Work reconciliation, authorization, presentation, workspace actions, audit/outbox effects, and adversarial tests ship together.

Failure of any admission condition means the code is absent from the catalogue. It is not labelled a deferred launch Finding and no dormant registry entry is created.

## 2. Exact launch Finding catalogue

The launch catalogue contains twelve user-facing Finding definitions. Internal evaluator signals such as `posted_to_fallback_account`, `bank_offset_to_capex`, and `monetary_fx_leg` may contribute facts, but they are not separate user obligations.

### 2.1 Bank ingestion

| Finding code | Authoritative inputs and target | User-facing reason | Legitimate resolution |
| --- | --- | --- | --- |
| `transaction_dated_in_closed_period` | Active unmatched/unposted `bank_transaction`, immutable bank date, client Fiscal Period status, later close sequence, and lock state; target the bank transaction. | The transaction is dated inside a closed month and cannot be posted there without an accounting decision. | Safe match that does not change closed-period ledger facts; categorize/match using an authorized open `fs_date` while preserving bank date; or direct/requested cascading reopen. Rejection of a Reopen Request returns the still-unresolved transaction for open-period treatment. |

### 2.2 Transaction and ledger evaluation

| Finding code | Authoritative inputs and target | User-facing reason | Legitimate resolution |
| --- | --- | --- | --- |
| `bank_offset_to_non_cash_account_review` | Posted bank-source ledger transaction/entries and account taxonomy; target the offending ledger transaction or entry at the registry's fixed grain. | A bank movement was offset to depreciation, accumulated depreciation, or equity and may be miscategorized. | Correct/reverse and repost through the appropriate accounting command; or Client Lead-authorized accepted treatment with reason and evidence when genuinely valid. |
| `bank_receipt_direct_to_revenue_review` | Modified-accrual company, posted bank receipt, and revenue/receivable/deferred-revenue account taxonomy. | A receipt went directly to revenue where receivable or deferred-revenue treatment may be required. | Correct the posting/match; or accept the direct treatment with a professional reason and evidence. |
| `supplier_payment_direct_to_expense_review` | Modified-accrual company, posted bank payment, and expense/payable/accrual account taxonomy. | A payment went directly to expense where payable or accrual treatment may be required. | Correct the posting/match; or accept the direct treatment with a professional reason and evidence. |
| `suspense_activity_review` | Posted entry using an account whose durable taxonomy marks it as fallback/suspense. | A temporary fallback account still contains activity that may make the books incomplete. | Reclassify/clear the posting; or accept the remaining treatment with Client Lead-authorized reason and evidence. |
| `receivable_payable_missing_counterparty_review` | Posted entry to a counterparty-tracked receivable, payable, related-party, prepayment, or deferred account with no contact. | The balance cannot be followed by counterparty because the posting has no contact. | Add/correct the counterparty or reclassify the posting; allow `not_applicable` only where the registered account treatment genuinely requires no counterparty and the actor is authorized. |
| `missing_supporting_document_review` | Manual journal, affected counterparty account, and absence of a current `file_attachment`; target the journal/ledger transaction. | A manual journal affecting a counterparty balance has no supporting document. | Attach the document or correct/reverse the journal; an authorized accepted exception requires a reason and evidence of why no document exists. |
| `journal_posted_to_bank_account_review` | Posted manual-journal transaction and bank/cash-equivalent account taxonomy. | A manual journal moved a bank account directly where a feed, transfer, or reconciliation flow is normally expected. | Reverse/correct through the appropriate bank or transfer flow; or accept a supported exceptional journal with reason and evidence. |
| `accumulated_depreciation_unexpected_movement_review` | Posted journal entries and account taxonomy showing accumulated depreciation without depreciation expense or fixed-asset pairing. | The accumulated-depreciation movement lacks the accounting pair expected from depreciation, acquisition, or disposal. | Correct/reverse/repost the journal; or accept a documented valid treatment with reason and evidence. |

These eight definitions adapt the current tested Accountable Books ledger-signal evaluators, but V2 materializes `accounting_findings` and uses the canonical user-facing codes above. The old `close_review_signals` and decision persistence are not launch authorities.

### 2.3 Period evaluation

| Finding code | Authoritative inputs and target | User-facing reason | Legitimate resolution |
| --- | --- | --- | --- |
| `fixed_asset_depreciation_review` | Modified-accrual accounting basis; posted period activity in non-current-asset accounts; depreciation-expense and contra-asset movement; target the Fiscal Period. | Fixed-asset activity exists without a clear depreciation/amortization treatment for the reviewed range. | Create/post or link an appropriate monthly, recurring-with-end-date, annual, or Package-range journal; correct the asset treatment; or record supported `accepted`/`not_applicable` reasoning such as land, disposal timing, or immateriality. Catch-up evaluation considers the whole Package so a valid range entry satisfies the affected monthly evidence without repetitive false alarms. |
| `fx_revaluation_decision_review` | Modified-accrual accounting basis; open `fx_positions`, exposure amounts/accounts, and absence of an applicable `fx_position_movements.source_type = 'period_revaluation'`; target the Fiscal Period. | Open monetary FX exposure exists without a recorded period revaluation decision. | Post a revaluation through a command that records the journal and FX movement together; or record an authorized accepted/not-applicable decision with reason and evidence, such as an evidenced immaterial exposure or policy treatment. |
| `cash_fixed_asset_or_liability_pattern_review` | Modified-cash accounting basis and posted ledger activity in non-current asset, contra-asset, current/non-current liability, or contra-liability accounts; target the Fiscal Period. | Modified-cash books used asset/liability accounts whose treatment deserves an explicit close review; the system is not claiming the activity is wrong. | Drill into the exact accounts and entries, correct any classification/treatment, or accept/not-applicable with a professional reason explaining why the asset or liability accounting is appropriate. Evidence must identify the contributing accounts and entries, not only broad taxonomy labels. |

The three period definitions are grounded in current ledger/account-taxonomy, company accounting-basis, and FX-register data. Their current evaluators and facts-hash tests are reusable evidence, but launch implementation must deliver the stronger V2 evidence and actions described here. In particular, an FX acknowledgement alone is not a substitute for the journal-plus-position-movement command when the user chooses revaluation.

## 3. Catalogue closure

There is no “future launch Finding” list in the producer contract. Unsupported or speculative candidates are neither named nor registered in this plan and create no silent backlog commitment. Any later expansion must pass the admission rule as a new product decision rather than inheriting legitimacy from an old catalogue.

Removing a speculative rule is not a scope cut. The agreed Finding capability—including detection, evidence, correction or professional resolution, Work routing, close blocking, staleness, history, and UI—is fully in launch for every one of the twelve admitted definitions.

## 4. Implementation and verification consequences

- Stage 5 completes the eight transaction/ledger definitions as usable vertical slices, not backend-only detections.
- Stage 6 completes the bank-ingestion and three period definitions with Close, Catch-up, reopening, and transfer semantics.
- A Finding code cannot satisfy a stage gate until its admission proof names actual tables/fields, evaluator tests, evidence DTO, permitted strategy codes, actor capabilities, correcting commands, and clearing/staleness scenarios.
- Catch-up and transfer tests must prove that monthly Finding truth is preserved while the workspace removes repetitive presentation and maintains current-Engagement routing.
- Performance fixtures must include high-volume ledger evaluation and multi-period Catch-up without creating a noisy firm-wide queue.
- First external launch is blocked until all twelve definitions and every other agreed capability pass their relevant gates.

## 5. Accountable Books evidence audited

The current reference implementation already provides the principal source truth used for admission:

- `companies.accounting_basis` distinguishes modified cash and modified accrual;
- posted `ledger_transactions`/`ledger_entries`, contacts, file attachments, account elements/types/label roles, and Fiscal Periods provide deterministic transaction and period facts;
- `fx_positions` and `fx_position_movements` provide durable open-exposure and revaluation facts;
- current close-signal evaluators and tests cover all eight ledger definitions;
- current period evaluators and tests cover fixed-asset/depreciation and FX-revaluation review;
- the modified-cash account-activity evaluator deterministically reads live posted ledger activity;
- current facts-hash/decision matching demonstrates the stale-decision technique that V2 replaces with materialized Findings and immutable Resolutions.

This audit validates source feasibility, not reuse of the old workflow or persistence model. V2 remains a fresh system and must implement the admitted contracts end to end.
