# Categorization Strategy (CX Plan)

## 1. Vision & Success Criteria
- Deliver the industry-leading bookkeeping categorization engine that can recommend fully balanced journal entries (debits & credits) for any bank transaction with ≥95% accuracy and complete provenance.
- Emit structured explanations that trace every decision back to rules, statistical evidence, or accounting constraints so accountants can trust or override outcomes quickly.
- Support rapid scaling across countries, industries, and firms by combining deterministic rules, adaptive machine learning, and constraint solving into a single pipeline.

## 2. Constraints & Observations
- **Multi-leg postings:** A single bank transaction may explode into multi-line ledger entries (splits, tax, FX, prepayments). The engine must reason about ledger entry templates, not just single-category labels.
- **Company context:** Each tenant has its own chart of accounts (COA), reporting framework, tax regime, and optionally custom heuristics. Global intelligence must be adaptable per company without retraining the entire model.
- **Known bank leg:** The cash/bank side is implied (direction + linked bank account). Our job is to propose the counter-leg(s) and adjustments.
- **Accounting basis:** Companies operate on cash or accrual bases. Predictions should be capable of honoring both, choosing the appropriate posting set at runtime.
- **Explainability:** Regulatory-grade traceability is non-negotiable. Every automated or suggested posting must cite the evidence chain (rule match, model features, constraint rationale).

## 3. Conceptual Architecture
```
INGESTION → NORMALIZE/ENRICH → RULES ENGINE → ML INFERENCE → CONSTRAINT SOLVER → REVIEW/POSTING
```
1. **Ingestion:** Bank transactions land in `bank_transactions` (already exists) with provider metadata.
2. **Normalization & enrichment:** Canonicalize descriptions, attach vendor/master data, detect FX splits, and encode context features.
3. **Rules engine:** Apply deterministic policies (global, firm, company, user) to propose journal templates when confidence is 100%.
4. **ML inference:** For remaining items, produce ranked journal templates with confidence + explanations.
5. **Constraint solver:** Validate proposals against accounting rules (balance, tax logic, COA constraints) and adjust/flag.
6. **Review/posting:** Surface categorized vs needs-review queues; once approved, create ledger entries and store the explanation trace.

## 4. Data Foundations
- **Canonical transaction envelope:** Extend/normalize `bank_transactions` (or create `categorization_tasks`) to store enriched metadata (vectorized description tokens, vendor ids, currency context, historical stats, bank account attributes).
- **Journal template schema:** Define a structure describing candidate postings:
  ```ts
  interface JournalProposal {
    id: string; // UUID per proposal
    source_transaction_id: string;
    legs: Array<{ accountId: string; debit: number; credit: number; memo?: string; dimension?: string }>;
    basis: 'cash' | 'accrual';
    confidence: number;
    provenance: ProvenanceStep[]; // rule ids, model id, constraint notes
  }
  ```
- **Feedback capture:** Track user overrides, accepted suggestions, and manual splits to feed back into both rules (auto-rule generation) and ML fine-tuning.
- **Feature store:** Stand up a lightweight feature store (initially materialized view) capturing rolling vendor spend, seasonality, historical category frequencies, counterparties, etc. Reason: richer features markedly improve ML accuracy and rule expressiveness.

## 5. Stage 1 – Ingestion & Enrichment (Implementation Plan)

### 5.1 Objectives
- Convert raw rows in `bank_transactions` (and related provider payloads) into context-rich records the downstream stages can consume without re-querying everything per request.
- Guarantee that enrichment happens exactly once per transaction (idempotent) but can be refreshed if upstream data changes (e.g., vendor master updates).
- Keep latency low so transaction ingestion remains near real-time.

### 5.2 When Does Enrichment Run?
1. **Primary trigger – ingestion:** Immediately after `addNewBankTransactions` commits to `bank_transactions`. That flow already knows the bank transaction IDs it inserted; emit a single `transactions.ingested` event with payload `{ companyId, bankAccountId, bankTransactionIds: string[] }`.
2. **Secondary trigger – updates:** When we detect a change to key fields (amount, description, posted_at, bank account, currency) or company settings (COA/basis update). Change watchers enqueue a refresh job.
3. **Manual refresh:** Debug endpoint `POST /api/categorization/transactions/:id/enrich` for support or backfills.

- **Worker context:** BullMQ queue (`categorization-enrichment`) owned by the API worker so the ingestion API stays responsive and enrichment can be retried. Each job can contain up to `N` transaction IDs (configurable, e.g., 200) to amortize overhead while keeping retries granular.
- **Service layer:** `apps/api/src/domains/categorization/enrichment.service.ts` exposes a pure `enrichTransaction(bankTransactionId)` function returning the DTO. The worker simply iterates the incoming `bankTransactionIds` array, calls the function per id, batches events, and handles retries.
- **Data storage:** Do **not** persist the full enriched payload in Postgres. Instead:
  - Store lightweight job metadata only (status, attempts, last error) in Redis/BullMQ.
  - Emit the enriched DTO with the `transaction.enriched` event so downstream stages can consume it immediately.
  - If Stage 2/3 need to re-fetch the DTO later, they call the same enrichment function (idempotent, cached context ensures low latency).

### 5.4 Processing Flow (How)
0. **Iterate batch:** For each `bankTransactionId` in the job payload run steps 1–7 independently (collect results/errors per id).
1. **Load base transaction:** Fetch `bank_transactions` row plus joins (bank account, company, provider metadata).
2. **Normalize text:** Apply deterministic cleaners (trim, uppercase vendor, strip HTML, collapse whitespace). Use shared utility under `packages/utils`.
3. **Entity resolution:**
   - Vendor lookup: match against `companies_vendors` table; if not found run heuristic (fuzzy match, alias table).
   - Counterparty detection: attempt to link to contacts, projects, invoices using existing domains.
4. **Context attachment:**
   - Company config cache: load from Redis/local LRU using key `company:{id}:categorization-context` (COA, basis, fiscal year, currency, reporting framework, tax settings).
   - Bank metadata: include linked COA account for the bank, currency, account type.
5. **Feature computation:**
   - Historical stats: query materialized view `mv_transaction_history` (to build later) for vendor frequency, average amount, last categorized account.
   - Pattern flags: detect likely splits (keywords, ratio), tax patterns (VAT keywords, rate matches), FX detection (currency != base).
   - Time features: day-of-week, month, quarter, proximity to period close.
6. **Enriched object build:** Construct `EnrichedTransaction` (schema below) with version + timestamps.
7. **Emit event:** Publish `transaction.enriched` events for each successfully processed id (or a batched variant carrying an array) so downstream consumers know Stage 1 completed. Include the DTO payload.
8. **Error handling:** On failure log structured error, increment retry count (BullMQ), exponential backoff; keep per-id failure list so partial successes still emit events. After `N` failures mark the id as `dead-letter` and alert for manual review.

### 5.5 `EnrichedTransaction` Schema (TypeScript)
```ts
interface EnrichedTransaction {
  version: number; // schema version for forward compatibility
  ids: {
    bankTransactionId: string;
    companyId: string;
    bankAccountId: string;
    providerTransactionId?: string;
  };
  raw: {
    description: string;
    amount: number;
    currencyId: string;
    postedAt: string;
    direction: 'inflow' | 'outflow';
  };
  normalized: {
    description: string;
    descriptionTokens: string[];
    vendorName?: string;
    vendorId?: string;
    counterpartyType?: 'vendor' | 'customer' | 'employee' | 'unknown';
    counterpartyId?: string;
  };
  context: {
    accountingBasis: 'cash' | 'accrual';
    reportingFramework: 'ifrs' | 'us_gaap' | 'other';
    reportingCurrencyId: string;
    fiscalYearEnd: string; // YYYY-MM-DD
    industry?: string;
    countryCode: string;
    bankCoaAccountId: string;
    companyCoaSnapshotVersion: string;
  };
  history: {
    vendorUsageCount: number;
    lastSeenAt?: string;
    lastLedgerAccounts?: string[]; // top N accounts previously used
    avgAmount?: number;
    stdDevAmount?: number;
  };
  signals: {
    likelySplit: boolean;
    likelyTax: boolean;
    likelyFx: boolean;
    likelyPrepayment: boolean;
    recurring: boolean;
    notes?: string[];
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: 'ingestion' | 'backfill' | 'manual';
  };
}
```

### 5.6 Supporting Tables & Caches
- No new persistence table required for the enriched payload itself. The existing `bank_transactions` table keeps source of truth.
- `company_categorization_context` cache: keyed by company id (Redis/LRU). Holds COA ids, accounting basis, fiscal year, tax settings; populated via existing domain services. Cache invalidated on relevant mutations.
- Materialized views:
  - `mv_transaction_history`: aggregated stats by (company, vendor, description hash).
  - `mv_vendor_similarity`: optional for fast lookup.
- Use Turbo tasks to refresh materialized views nightly or after significant changes.

### 5.7 Operational Considerations
- **Idempotency:** use transaction id + version check before overwriting to prevent race conditions.
- **Performance:** target enrichment SLA < 500ms per transaction; prefetch company context; use batched queries where possible.
- **Observability:** instrument metrics (`enrichment_latency_ms`, `enrichment_failures_total`, `cache_hit_rate`). Capture structured logs with trace ids.
- **Security:** ensure no PII leaks in logs; respect tenant isolation when fetching context/invoices.
- **Testing:** create fixtures for various providers, currencies, and edge cases (FX, splits). Unit + integration tests for the service; add contract tests for cache invalidation.

### 5.8 Stage 1 Deliverables & Milestones
1. **Schema setup:** add necessary materialized views; no new table for payload required.
2. **Context cache service:** implement `getCompanyCategorizationContext(companyId)` with caching & invalidation hooks.
3. **Enrichment worker:** implement BullMQ queue + processor that calls the pure enrichment function; add retries, instrumentation.
4. **APIs/events:** emit/consume `transaction.ingested` and `transaction.enriched` events; expose manual refresh endpoint; document payload contract.
5. **Backfill job:** script to enqueue enrichment for existing transactions (page through `bank_transactions`, enqueue IDs in chunks with rate limiting).
6. **QA & rollout:** load test with sample data, monitor metrics, roll out per environment (dev → staging → prod).

## 6. Deterministic Rules Layer
### 6.1 Goals
- Cover high-confidence scenarios (payroll processors, tax authorities, recurring vendor subscriptions) without invoking ML.
- Provide a UI/DSL for accountants to encode policies by company/firm/global scope.

### 6.2 Rule Model
- **Hierarchy:** `system` (Accountable-maintained) → `country` → `firm` → `company` → `user`. Higher precedence rules override lower levels.
- **Conditions:** Amount ranges (exact, tolerance bands), currency, posting direction, vendor/payee, bank account, description regex, provider metadata, time windows, prior occurrences, company attributes (industry, basis).
- **Actions:**
  - Emit one or more journal legs referencing COA accounts.
  - Optionally perform computed splits (e.g., VAT extraction, fee detection).
  - Attach descriptive memos and Explanation steps (`{ type: 'RULE', ruleId, matchedFields }`).
- **Execution:** Evaluate rules synchronously after a transaction is ingested or edited.
- **Conflict handling:** Use rule priority scores and default to ML when multiple rules compete or confidence <100%.
- **Traceability:** Persist rule metadata, matched fields, and outputs so downstream layers can justify results.

### 6.3 Implementation Notes
- Start with JSON-based rule schema stored in Postgres (`categorization_rules` table) with versioning + audit columns.
- Build evaluator as TypeScript service producing `JournalProposal` objects. Keep engine pure for deterministic behavior.
- Provide `rule_simulation` endpoint to test new rules before activation.
- Later upgrade to a DSL (e.g., YAML expression) or UI builder; initial version can rely on JSON schemas edited via admin UI.

## 7. Machine Intelligence Layer
### 7.1 Problem Framing
- Predict the non-bank journal legs (accounts + amounts) and justification given transaction context.
- Multi-output nature (splits) suggests modeling as **structured prediction**. For v1, treat as selecting from a library of journal templates, then regress split ratios.

### 7.2 Modeling Approach
1. **Template catalog:** Mine historical postings to derive frequent journal templates per industry/country (e.g., `(Bank, Expense)`, `(Bank, Expense, Tax Payable)`, `(Bank, A/R, Revenue)`). Reason: reduces combinatorial explosion for first version.
2. **Global encoder:** Train a gradient boosted tree or transformer encoder over transaction features (amount, currency, description embeddings, vendor, day-of-month, bank account, previous categories, industry, basis). Reason: fast iteration and explainable feature importances.
3. **Adapter layer:** For each company, learn a lightweight adapter (e.g., logistic regression on top of encoder outputs) that re-weights template probabilities. Reason: company-specific behavior influences the mapping; adapters allow personalization without retraining global model.
4. **Amount allocation:** Once a template is chosen, use regression (or heuristics from history) to estimate split percentages/tax amounts. For v1, rely on deterministic heuristics (e.g., VAT rate tables) with ML fallback for residuals.
5. **Confidence & calibration:** Output calibrated probabilities (Platt scaling or isotonic regression) to reach reliable 95% threshold gating autop-posting vs review.
6. **Explainability:**
   - Store top contributing features (SHAP for tree model, attention weights for transformer) in `provenance`. Reason: auditors need to see "Vendor=Uber (60%), Amount≈$25 (20%), Day=Friday (10%)".
   - Provide similarity matches (“Most similar prior transaction: 2024-12-01, ledger entry X”).

### 7.3 Learning Loop
- **Training data:** Use existing ledger postings + manual categorizations. Build ETL job that aligns bank transactions with ledger journals.
- **Feedback incorporation:** When users override, log the delta as training example; update adapters nightly.
- **Cold-start strategy:** For new companies, rely on global model + industry/country priors until sufficient local data accrues; optionally prompt accountants to import policy templates.
- **Evaluation:** Maintain offline metrics per company (accuracy, precision@top1, calibration). Flag drifts when accuracy falls below thresholds.

## 8. Constraint & Consistency Engine
### 8.1 Purpose
- Guarantee that proposals are valid before surfacing to users or posting.

### 8.2 Checks
1. **Double-entry balance:** Sum(debits) = Sum(credits). Auto-fix rounding by adjusting smallest leg when variance < tolerance.
2. **COA guardrails:** Only use accounts active for the company, allowed for the chosen basis/ reporting framework.
3. **Tax logic:** Validate VAT/GST accounts align with jurisdictions; cross-verify amount ratio vs known tax rate. Flag mismatches for review.
4. **Currency integrity:** Ensure FX gains/losses legs are present when transaction currency differs from base.
5. **Accrual vs cash:** When company basis is accrual, enforce creation of receivable/payable legs for recognized revenue/expense; for cash basis, optionally compute accrual suggestion but mark as informational.
6. **Policy constraints:** Check company-defined limits (e.g., CapEx threshold). If violated, downgrade to manual review.

### 8.3 Implementation
- Implement as deterministic module consuming `JournalProposal` and emitting either `ValidatedProposal` or `ConstraintFailure` with reasons.
- Use linear constraints solved via straightforward algebra (no heavy solver required v1) given low-dimensional cases.
- Persist constraint diagnostics in provenance to support explainability.

## 9. Explainability Framework
- **Provenance graph:** Each proposal carries ordered steps (rule, model, constraint, human review) with payloads summarizing evidence.
- **Human-readable narratives:** Auto-generate text such as: "Matched Company Rule `Recurring SaaS` because vendor Adobe + $54.99 monthly. Model agreed with 92% confidence. Constraint engine added VAT leg at 7.5%."
- **Audit storage:** Persist full provenance in `categorization_events` table for regulatory audit and analytics.

## 10. Workflow States & UX Implications
- **States:** `auto-posted`, `suggested`, `needs-review`, `awaiting-context`, `rejected`.
- **UI:**
  - Categorization queue groups by state with inline explanations.
  - Allow users to edit proposals; changes feed rule/ML learner.
  - Provide per-transaction timeline showing rule hits, ML scores, constraint adjustments.

## 11. Implementation Roadmap (First Version)
1. **Discovery & Schema (Week 1-2):**
   - Design `categorization_tasks`, `categorization_proposals`, `categorization_rules`, `categorization_events` tables.
   - Build enrichment job to populate canonical transaction envelope.
2. **Rules Engine MVP (Week 3-4):**
   - Implement JSON-based rule evaluator + precedence logic.
   - Seed with system rules (bank fees, card processors, payroll).
   - Expose admin endpoints/testing harness.
3. **Constraint Engine Core (Week 4-5):**
   - Build deterministic check module (balance, COA validation, tax skeleton).
   - Integrate with rules output and bank ingestion flow.
4. **ML Baseline (Week 5-8):**
   - Construct training dataset + template catalog generator.
   - Train initial gradient boosted model + calibration routine.
   - Implement inference service with adapter hooks (adapters stubbed with identity until enough data).
5. **Feedback & Provenance (Week 8-9):**
   - Persist provenance chain, user override capture, evaluation metrics.
6. **UI & API Integration (Week 9-10):**
   - Surface proposals in CatEngine UI (show explanations, confidence, constraint notes).
   - Add actions for accepting, splitting, creating rules from transactions.
7. **Pilot & Iteration (Week 11+):**
   - Run with internal/friendly firms, measure accuracy, refine rule templates, adjust models.
   - Begin designing UI for custom rule authoring.

## 12. Long-Term Enhancements
- **Advanced ML:** Transition to sequence-to-sequence models that output journal graphs directly, with graph neural network adapters per company.
- **Auto-rule generation:** When ML confidence > threshold and accountant approves, auto-suggest new deterministic rules for recurring patterns.
- **Continuous learning:** On-device (per company) adapters updated in near real-time with Bayesian updating for rapid personalization.
- **Scenario simulation:** Allow accountants to test hypothetical changes (new tax rates, upcoming vendor) against the engine.
- **External data infusion:** Integrate invoice/PO feeds and knowledge of vendor categories from shared registries to improve cold-start predictions.

## 13. Risks & Mitigations
- **Data sparsity for new companies:** Mitigate via industry priors + rule templates + similarity to firm-level data.
- **Explainability gaps in ML:** Choose inherently interpretable models initially; log SHAP values.
- **Compliance drift:** Maintain versioned models and rules with rollback; monitor accuracy dashboards per company.
- **Performance:** Batch inference or pre-compute proposals to avoid blocking UI; use BullMQ for async processing.

## 14. Non-Functional Considerations
- **Security & segregation:** Ensure multi-tenant isolation; rules restricted by scope.
- **Observability:** Metrics for rule hit rate, ML accuracy, constraint failure types, auto-post percentage.
- **Governance:** Require approvals before auto-posting for new companies until accuracy metrics prove stable.

Reasoning across layers ensures deterministic guardrails (rules), adaptive intelligence (ML), and rock-solid accounting correctness (constraints), delivering a best-in-class categorization pipeline with full traceability and scalability.
