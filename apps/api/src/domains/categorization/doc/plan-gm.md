# Plan for an Advanced Transaction Categorization Engine (v2)

**Author:** Gemini (synthesized from plans by CC, CX, and GM)
**Status:** Proposed

## 1. Core Philosophy & Guiding Principles

The vision is to create the world's most accurate, explainable, and automated bookkeeping engine, achieving **>95% accuracy** with **full explainability**.

1.  **Explainability First:** Every suggestion must be fully traceable to a rule, model feature, or accounting constraint.
2.  **Hybrid Intelligence:** Combine deterministic rules for certainty with adaptive machine learning for novel patterns.
3.  **Completeness and Balance:** The atomic unit of output is a balanced ledger entry candidate, not a single category.
4.  **Context is King:** Intelligence must adapt to each company's unique COA, accounting basis, industry, and history.
5.  **Continuous Learning:** The system must learn from every user interaction.

## 2. Unified System Architecture: The Categorization Pipeline

A raw bank transaction is processed through a multi-stage, asynchronous pipeline, orchestrated via BullMQ queues.

```
[Bank Tx] -> [Stage 1: Enrich] -> [Stage 2: Rules Engine] -> [Stage 3: ML] -> [Stage 4: Synthesize] -> [Stage 5: Validate] -> [Stage 6: Present]
```

---

## Stage 1: Data Ingestion & Enrichment

**Objective:** Transform raw bank transactions into a clean, context-rich `EnrichedTransaction` object. This process is asynchronous and handled by a dedicated BullMQ worker.

-   **Trigger:** A `transaction.ingested` event is emitted to the `categorization-enrichment` queue.
-   **Orchestration:** An `enrichment.worker.ts` processes jobs by calling `enrichment.service.ts`.
-   **Persistence:** A new `categorization_tasks` table will be created to store the state and the final `EnrichedTransaction` JSONB payload for auditability and reprocessing, as detailed in `plan-cc.md`.

### How Stage 1 Happens:

1.  **Load Base Data:** Fetch the raw `bank_transactions` row with related company, bank account, and provider data in a single query.
2.  **Normalize & Extract:**
    -   Clean the description (trim, uppercase, collapse whitespace).
    -   Extract the vendor using a multi-step strategy: exact match on `companies_vendors`, then fuzzy match, then pattern-based extraction. Create a `pending_review` vendor if a new one is found.
3.  **Load Company Context (with Multi-level Caching):**
    -   Fetch the company's full context (COA, basis, framework, tax settings, etc.).
    -   **Caching Strategy:** Use a Local In-Memory Cache -> Redis -> Database query fallback to ensure high performance (<5ms on a warm cache). The cache is invalidated when company settings (like COA) change.
4.  **Compute Historical Features:**
    -   Query a `mv_vendor_transaction_stats` materialized view (to be created) to get vendor frequency, average amount, last-used accounts, etc. This avoids expensive real-time aggregations.
5.  **Detect Pattern Signals:**
    -   Flag the transaction with boolean signals: `likely_split`, `likely_tax`, `likely_fx`, `is_recurring`, `anomaly_detected`.
6.  **Build & Persist `EnrichedTransaction`:**
    -   Assemble the final, versioned `EnrichedTransaction` object.
    -   Save it to the `enriched_transaction` JSONB column in the `categorization_tasks` table.
7.  **Emit Event:** Publish a `transaction.enriched` event to the next queue (`categorization-rules`) with the `task_id`.

### `EnrichedTransaction` Schema (v1)

*Adopting the comprehensive schema from `plan-cc.md`.*

```typescript
interface EnrichedTransaction {
  version: number;
  ids: { bank_transaction_id: string; company_id: string; vendor_id: string | null; };
  raw: { description: string; amount: number; currency_id: string; posted_at: string; };
  normalized: { description: string; description_tokens: string[]; vendor_name: string | null; };
  context: { accounting_basis: string; reporting_framework: string; reporting_currency_id: string; coa_snapshot_version: string; tax_settings: object; };
  historical: { vendor_usage_count: number; last_seen_at: string | null; last_categorized_accounts: string[]; avg_amount: number | null; std_dev_amount: number | null; typical_frequency: string; };
  signals: { likely_split: boolean; likely_tax: boolean; likely_fx: boolean; is_recurring: boolean; anomaly_detected: boolean; notes: string[]; };
  temporal: { day_of_week: number; month: number; quarter: number; is_month_end: boolean; };
  metadata: { enriched_at: string; enrichment_latency_ms: number; status: 'enriched' | 'partial' | 'error'; };
}
```

---

## Stage 2: Deterministic Rules Engine

**Objective:** Apply explicit, layered rules to generate 100% confidence `LedgerEntryCandidate`s for known patterns.

-   **Trigger:** Consumes `transaction.enriched` events from the `categorization-rules` queue.
-   **Rule Storage:** Rules will be stored in a `categorization_rules` table with a JSONB `conditions` and `actions` schema.
-   **Hierarchy:** Rules are evaluated in a specific order of precedence: `User` -> `Company` -> `Firm` -> `System`.

### How Stage 2 Happens:

1.  **Load Rules:** Fetch all active rules for the company, using a caching layer similar to Stage 1.
2.  **Evaluate Conditions:** A `ConditionEvaluator` class iterates through the rules and evaluates the `conditions` against the `EnrichedTransaction` object. It supports operators like `CONTAINS`, `GREATER_THAN`, `REGEX_MATCH`, etc.
3.  **Execute Actions:** If a rule matches, an `ActionExecutor` generates a `LedgerEntryCandidate` based on the `actions` defined in the rule, which can create complex multi-leg journal entries.
4.  **Output:** If a match is found, a candidate is generated with `confidence: 1.0` and a clear explanation. The result is passed to the Synthesis stage. If no rule matches, the task is passed to the Machine Intelligence stage.

---

## Stage 3: Machine Intelligence Layer

**Objective:** For transactions not caught by rules, predict a ranked list of `LedgerEntryCandidate`s with confidence scores and explanations.

-   **Trigger:** Consumes events from the rules engine when no rule was matched.
-   **Approach:** A structured prediction model, as proposed in `plan-cx.md`.
    1.  **Template Selection:** A global model (e.g., Gradient Boosted Tree or Transformer) selects the most likely journal entry *template* (e.g., `(Bank, Expense)`, `(Bank, Expense, Tax Payable)`).
    2.  **Per-Company Adapters:** A lightweight adapter layer, fine-tuned on company-specific data, adjusts the probabilities of templates and accounts.
    3.  **Amount Allocation:** A secondary regression model predicts the split of the total amount between the legs of the chosen template.
-   **Explainability:** Feature importance (e.g., using SHAP) will be stored to explain predictions (e.g., "Suggested 'Travel' because vendor is 'Uber' and amount is similar to 12 past trips").

---

## Stage 4: Synthesis & Ranking

**Objective:** Combine outputs from the Rules and ML engines into a single, ranked list.

-   **Process:**
    1.  Merge candidates from Stage 2 (Rules) and Stage 3 (ML).
    2.  **Prioritize:** Rule-based candidates are always ranked highest.
    3.  **Rank:** ML-based candidates are ranked by their confidence scores.
    4.  **Deduplicate:** Remove any duplicate or near-duplicate candidates.

---

## Stage 5: Constraint Validation & Correction

**Objective:** Ensure all candidates are compliant with accounting principles before being shown to the user. This is a critical addition from `plan-cx.md`.

-   **Process:** Each candidate is checked against a series of deterministic validators:
    1.  **Balance Check:** `SUM(debits)` must equal `SUM(credits)`.
    2.  **COA Validation:** All accounts must exist and be active in the company's COA.
    3.  **Basis/Framework Compliance:** Entries must respect the company's accounting basis (Cash vs. Accrual) and reporting framework.
    4.  **Tax Logic:** If tax is involved, validate the accounts and rates.
-   **Output:** A final, clean, and valid list of `LedgerEntryCandidate`s. Invalid candidates are dropped or flagged.

---

## Stage 6: Decision Routing & User Presentation

**Objective:** Route the final candidates for user action.

-   **Process:**
    1.  **High-Confidence:** If the top candidate has a confidence > 95% (and other criteria are met), it can be routed to an "auto-posted" queue.
    2.  **Medium-Confidence:** Suggestions are presented in the main UI for user approval.
    3.  **Low-Confidence:** Transactions are flagged for manual review.
-   **Feedback Loop:** All user actions (approvals, edits, re-categorizations) are logged to a `categorization_rule_matches` or similar table to provide training data for refining rules and ML models.