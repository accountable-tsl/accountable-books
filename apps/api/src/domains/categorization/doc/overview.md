# Transaction Categorization – Core Stages

## 1. Vision & Success Criteria

- Deliver the industry-leading bookkeeping categorization engine that can recommend fully balanced journal entries (debits & credits) for any bank transaction with ≥95% accuracy and complete provenance.
- Emit structured explanations that trace every decision back to rules, statistical evidence, or accounting constraints so accountants can trust or override outcomes quickly.
- Support rapid scaling across countries, industries, and firms by combining deterministic rules, adaptive machine learning, and constraint solving into a single pipeline.

## 2. Constraints & Observations

- **Multi-leg postings:** A single bank transaction may explode into multi-line ledger entries (splits, tax, FX, prepayments). The engine must reason about ledger entry templates, not just single-category labels.
- **Company context:** Each tenant has its own chart of accounts (COA), reporting framework, tax regime, and optionally custom heuristics. Global intelligence must be adaptable per company without retraining the entire model.
- **Known bank leg:** The cash/bank side is implied (direction + linked bank account). Our job is to propose the counter-leg(s) and any adjustments.
- **Accounting basis:** Companies operate on cash or accrual bases. Predictions should be capable of honoring both, choosing the appropriate posting set at runtime.
- **Explainability:** Regulatory-grade traceability is non-negotiable. Every automated or suggested posting must cite the evidence chain (rule match, model features, constraint rationale).

## 3. Conceptual Architecture

```
INGESTION → NORMALIZE/ENRICH → RULES ENGINE → ML INFERENCE → CONSTRAINT SOLVER → REVIEW/POSTING
```

1. **Ingestion:** Bank transactions land in `bank_transactions` (already exists) with provider metadata.
2. **Normalization & enrichment:** Canonicalize descriptions, attach contact/master data, detect FX splits, and encode context features.
3. **Rules engine:** Apply deterministic policies (global, firm, company, user) to propose journal templates when confidence is 100%.
4. **ML inference:** For remaining items, produce ranked journal templates with confidence + explanations.
5. **Constraint solver:** Validate proposals against accounting rules (balance, tax logic, COA constraints) and adjust/flag.
6. **Review/posting:** Surface categorized vs needs-review queues; once approved, create ledger entries and store the explanation trace.

## 4. Data Foundations

- **Account-type metadata:** Each system `account_type` carries flags (`label_role`, `trainable`, `is_contra`, `is_postable_control`). Stage 2/3 use these flags so Model A trains only on semantic types while templates/solver handle mechanical and control accounts.
- **Versioned company context:** COA and company settings stay in normalized tables with version/effective dating. Stage 1 stamps each enrichment with `coa_snapshot_version` and `company_settings_checksum`; no JSON snapshots are stored.
- **Contact feature store:** `bank_transaction_contact_stats` (pre-categorization) and `categorization_feedback_stats` (post-categorization) give deterministic history on contacts for enrichment and learning loops.
- **Shared caches:** Redis (or equivalent) caches company context, COA metadata, and other large structures keyed by version. Python workers fetch on demand; the durable source of truth remains Postgres.

---

## 5. Stage 1 – Ingestion & Enrichment (Implementation Plan)

### 5.1 Overview

**Purpose:** Transform raw bank transactions into clean, standardized, context-rich `EnrichedTransaction` objects that downstream stages can consume without repetitive queries.

**What Happens:**

- Parse and clean descriptions, normalize amounts, and apply pretrained contact embeddings for fuzzy matching.
- Resolve contacts/counterparties using a robust, multi-step process.
- Attach company context (COA, accounting basis, reporting framework, industry, country)
- Add historical features: recurring patterns, contact stats, seasonality, known tax rates

**Output:** An `EnrichedTransaction` object ready for deterministic or statistical reasoning

**Note:** Company context is cached when first transaction arrives; subsequent transactions from the same company access cached data instantly.

### 5.2 When Does Enrichment Run?

1. **Primary trigger – ingestion:** Immediately after `addNewBankTransactions` commits to `bank_transactions`. That flow already knows the bank transaction IDs it inserted; emit a single `transactions.ingested` event with payload `{ companyId, bankAccountId, bankTransactionIds: string[] }`.
2. **Secondary trigger – company/config updates:** When company settings that affect enrichment change (COA revisions, currency settings, accounting basis, reporting framework). Change watchers enqueue a refresh job for affected transactions.
3. **Deletion trigger:** When `bank_transactions.is_deleted` flips to TRUE (user deletes transactions), emit `transaction.deleted` event with `bankTransactionIds` to reverse stats updates and mark enrichment tasks as deleted.
4. **Manual refresh:** Debug endpoint `POST /api/categorization/transactions/enrich` for support or backfills.

**Note:** Bank transactions remain **immutable**. We never edit `bank_transactions` rows after ingestion. User corrections and categorization feedback are captured in ledger entries and used as labeled training data, not as updates to the source transaction.

- **Worker context:** BullMQ queue (`bank-transactions-enrichment`) owned by the API worker so the ingestion API stays responsive and enrichment can be retried. Each job can contain up to `N` transaction IDs (configurable, e.g., 200) to amortize overhead while keeping retries granular.

- **Service layer:** `apps/api/src/domains/categorization/enrichment/enrichment.service.ts` exposes a pure `enrichTransaction(bankTransactionId: string)` function that takes a single transaction ID and returns the enriched DTO. The service is stateless and handles only one transaction at a time for:
  - Testability in isolation
  - Reusability (manual refresh endpoints, testing tools)
  - Clear separation of concerns

- **Worker orchestration:** The worker iterates through the `bankTransactionIds` array, calling the service function for each ID. The worker is responsible for:
  - Batch iteration and progress tracking
  - Collecting successes and failures separately
  - Emitting batched `transaction.enriched` events for successes
  - Granular error handling (continue processing even if one transaction fails)
  - Retry logic for individual failures

- **Data storage:** We **persist** the full enriched payload in Postgres for auditability, versioning, and performance:
  - Create `categorization_tasks` table with `enriched_transaction` JSONB column
  - Store `enrichment_version` for schema evolution tracking
  - Enable audit trail (prove HOW categorization decisions were made)
  - Support replay/debugging with exact historical context
  - Provide ML training data with consistent feature snapshots
  - Avoid expensive recomputation on every Stage 2/3 access

### 5.3 Architecture Components

**Queue:** `bank-transactions-enrichment` (BullMQ)
**Worker:** `apps/api/src/jobs/workers/enrichment.worker.ts`
**Service:** `apps/api/src/domains/categorization/enrichment/enrichment.service.ts`
**Utilities:** `apps/api/src/domains/categorization/enrichment/enrichment.utils.ts`

### 5.4 Processing Flow (How)

0. **Iterate batch:** For each `bankTransactionId` in the job payload run steps 1–7 independently (collect results/errors per id).
1. **Load base transaction:** Fetch `bank_transactions` row plus joins (bank account, company, provider metadata).
2. **Normalize text:** Apply deterministic cleaners (trim, uppercase contact descriptors, strip HTML, collapse whitespace). Use shared utility that we'll import or write at `enrichment.utils.ts`.
3. **Entity resolution:**
   - **Pattern-based contact extraction:** Extract normalized contact name from description using regex patterns (e.g., `UBER *TRIP` → `UBER`, `SQ *COFFEE` → `SQUARE`)
   - **Global contact matching:** Match against static global contact list (loaded from `categorization/data/merchant-patterns.json`) for well-known counterparties (Uber, AWS, Shopify, etc.)
   - **Company contact matching:** Exact match against company's `contacts` table by normalized name
   - **Store results:** Save `contact_id` (if matched), normalized `contact_name`, and `category_hint` (from global contact list) for downstream use
   - **What we DON'T do:** No fuzzy matching, no automatic contact creation, no linking to invoices/projects/A/R (too early in pipeline, belongs in Stage 2/3)
4. **Context attachment:**
   - Company config cache: load from Redis using key `company:{uuid}:categorization-context` (COA, basis, fiscal year, country, reporting currency, reporting framework, tax settings).
   - Bank metadata: include linked COA account for the bank, currency, account type.
5. **Feature computation:**
   - Historical stats: query `bank_transaction_contact_stats` table for contact frequency, rolling averages
   - Pattern flags: detect likely splits (keywords), tax patterns (VAT keywords), FX detection
   - Time features: day-of-week, fiscal quarter, days to period close
6. **Enriched object build:** Construct `EnrichedTransaction` (schema below) with version + timestamps.
7. **Emit event:** Publish `transaction.enriched` events for each successfully processed id (or a batched variant carrying an array) so downstream consumers know Stage 1 completed. Include the DTO payload.
8. **Error handling:** On failure log structured error, increment retry count (BullMQ), exponential backoff; keep per-id failure list so partial successes still emit events. After `N` failures mark the id as `dead-letter` and alert for manual review.

### 5.5 Database Schema

#### Table: `categorization_tasks`

Stores the enriched payload for each bank transaction. One row per transaction (1:1 relationship).

**Design note:** `bank_transaction_id` is unique because bank transactions are immutable. We never edit the source `bank_transactions` table after ingestion. If company settings change (e.g., COA revision), we re-enrich and update the `enriched_transaction` JSONB and `enrichment_version`. User corrections are captured in ledger entries, not here.

```sql
-- Enums for categorization_tasks
CREATE TYPE categorization_task_status AS ENUM (
  'enriched',      -- Successfully enriched
  'partial',       -- Enriched with some missing data
  'failed',        -- Enrichment failed
  'pending'        -- Queued but not yet processed
);

CREATE TYPE categorization_task_source AS ENUM (
  'ingestion',     -- Auto-triggered on bank transaction ingestion
  'backfill',      -- Batch backfill job
  'manual'         -- Manual refresh via API
);

CREATE TABLE categorization_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  bank_transaction_id UUID NOT NULL UNIQUE REFERENCES bank_transactions(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  enriched_transaction JSONB NOT NULL,
  enrichment_version VARCHAR(20) NOT NULL,
  status categorization_task_status NOT NULL DEFAULT 'enriched',
  source categorization_task_source NOT NULL,
  checksum VARCHAR(64), -- SHA256 for change detection
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_cat_tasks_company ON categorization_tasks(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_cat_tasks_status ON categorization_tasks(status) WHERE is_deleted = FALSE;

SELECT create_update_timestamp_trigger('categorization_tasks');
```

#### Table: `bank_transaction_contact_stats`

One row per `(company_id, currency_code, contact_id, contact_fingerprint)`. When `contact_id` is null, `contact_fingerprint` identifies the unmatched merchant. If we later map that fingerprint to a real contact, we migrate the counts once and continue under the contact_id.

**Design notes:**

- **Pre-categorization only:** Stats reflect raw bank transaction data. Categorization history (which COA accounts were used) will be tracked separately in post-categorization tables (Stage 2+)
- **Currency-aware:** Stats tracked per currency to avoid mixing USD + GBP (e.g., Amazon.com vs Amazon.co.uk)
- **Rolling windows (30d/90d):** Handle FX volatility and seasonal patterns
- **Both native and reporting amounts:** Native for same-currency comparison, reporting for cross-account aggregation
- **Partial unique indexes:** Prevent collision of unknown contacts with NULL contact_ids

```sql
CREATE TABLE bank_transaction_contact_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  company_id UUID NOT NULL REFERENCES companies(id),
  contact_id UUID REFERENCES contacts(id),
  contact_fingerprint VARCHAR(255) NOT NULL, -- normalized contact name hash
  normalized_name VARCHAR(255) NOT NULL,
  currency_code VARCHAR(3) NOT NULL, -- ISO 4217 (USD, GBP, NGN, etc.)

  -- All-time statistics
  total_transactions BIGINT DEFAULT 0,
  total_amount_native DECIMAL(20, 2) DEFAULT 0,
  total_amount_reporting DECIMAL(20, 2) DEFAULT 0,
  avg_amount_native DECIMAL(20, 2) DEFAULT 0,
  avg_amount_reporting DECIMAL(20, 2) DEFAULT 0,
  std_dev_amount_native DECIMAL(20, 2) DEFAULT 0,
  std_dev_amount_reporting DECIMAL(20, 2) DEFAULT 0,

  -- Rolling 30-day window (recent behavior, FX-resilient)
  rolling_30d_txn_count BIGINT DEFAULT 0,
  rolling_30d_total_native DECIMAL(20, 2) DEFAULT 0,
  rolling_30d_total_reporting DECIMAL(20, 2) DEFAULT 0,
  rolling_30d_avg_native DECIMAL(20, 2) DEFAULT 0,
  rolling_30d_avg_reporting DECIMAL(20, 2) DEFAULT 0,
  rolling_30d_stddev_native DECIMAL(20, 2) DEFAULT 0,
  rolling_30d_stddev_reporting DECIMAL(20, 2) DEFAULT 0,

  -- Rolling 90-day window (medium-term trends)
  rolling_90d_txn_count BIGINT DEFAULT 0,
  rolling_90d_total_native DECIMAL(20, 2) DEFAULT 0,
  rolling_90d_total_reporting DECIMAL(20, 2) DEFAULT 0,
  rolling_90d_avg_native DECIMAL(20, 2) DEFAULT 0,
  rolling_90d_avg_reporting DECIMAL(20, 2) DEFAULT 0,
  rolling_90d_stddev_native DECIMAL(20, 2) DEFAULT 0,
  rolling_90d_stddev_reporting DECIMAL(20, 2) DEFAULT 0,

  -- Last transaction
  last_transaction_id UUID REFERENCES bank_transactions(id),
  last_transaction_date DATE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,

  UNIQUE(company_id, currency_code, contact_fingerprint, contact_id)
);

-- Partial unique indexes (avoids COALESCE hack, allows multiple NULL contact_ids)
CREATE UNIQUE INDEX idx_contact_stats_known
  ON bank_transaction_contact_stats(company_id, currency_code, contact_id, contact_fingerprint)
  WHERE contact_id IS NOT NULL AND is_deleted = FALSE;

CREATE UNIQUE INDEX idx_contact_stats_unknown
  ON bank_transaction_contact_stats(company_id, currency_code, contact_fingerprint)
  WHERE contact_id IS NULL AND is_deleted = FALSE;

-- Query indexes
CREATE INDEX idx_contact_stats_company ON bank_transaction_contact_stats(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_contact_stats_company_currency
  ON bank_transaction_contact_stats(company_id, currency_code)
  WHERE is_deleted = FALSE;

SELECT create_update_timestamp_trigger('bank_transaction_contact_stats');
```

#### Stats Update Strategy

**Key principle:** `bank_transaction_contact_stats` reflects the **pre-categorization view** from `bank_transactions` only. Ledger adjustments and user corrections are tracked separately for ML feedback, not here.

**Who updates:** The enrichment worker owns all stats updates. After enriching a transaction (steps 1-6), the worker increments or decrements stats before emitting the `transaction.enriched` event.

**When updates happen:**

1. **On enrichment (add):** Immediately after enriching a transaction, before emitting the event:
   - Lookup/create row in `bank_transaction_contact_stats` by `(company_id, currency_code, contact_fingerprint, contact_id)`
   - Increment `total_transactions`, update running totals and averages (all-time)
   - Add transaction to 30d/90d rolling buckets (incremental update)
   - Update `last_transaction_id`, `last_transaction_date`

2. **On re-enrichment (config change):** When company settings change (COA, currency, basis), we re-enrich affected transactions:
   - Update `categorization_tasks.enriched_transaction` with new context
   - Stats remain unchanged (same bank transaction, same amounts)

3. **On deletion (subtract):** When `bank_transactions.is_deleted` flips to TRUE:
   - Change watcher emits `transaction.deleted` event with `bankTransactionIds`
   - Enrichment worker handles deletion:
     - Fetch existing `categorization_tasks` row to get the enriched snapshot
     - Decrement stats in `bank_transaction_contact_stats` (reverse the original add)
     - Subtract from rolling window buckets
     - Mark `categorization_tasks.is_deleted = TRUE` (soft delete, preserve audit trail)

**Rolling windows maintenance:**

- **Incremental updates:** Each transaction adds its contribution to 30d/90d buckets with a `window_expiry_date` (computed as `txn_date + 30d` or `+ 90d`)
- **Aging out:** During each enrichment, check if any contributions have expired (simple date comparison) and subtract them
- **Periodic reconciliation:** Nightly job recalculates rolling windows from scratch for all stats rows to prevent drift (optional safety net)

**Why the enrichment worker owns this:**

- ✅ Already has the transaction loaded and parsed
- ✅ Already knows contact_fingerprint, currency_code, amounts
- ✅ BullMQ retry semantics handle failures
- ✅ No additional job/queue needed (lower latency, fewer failure points)
- ✅ Stats stay synchronized with enrichment state

### 5.6 `EnrichedTransaction` Schema (TypeScript)

```ts
interface EnrichedTransaction {
  version: number;
  snapshot_version: string;
  snapshot_generated_at: string;

  ids: {
    bank_transaction_id: string;
    bank_transaction_batch_id?: string | null;
    company_uuid: string;
    bank_account_id: string;
    bank_account_coa_id: string;
    bank_account_currency_id: string;
    provider_transaction_id?: string | null;
    contact_id?: string | null;
    enrichment_job_id?: string | null;
  };

  raw: {
    date: string; // YYYY-MM-DD
    description: string;
    amount_native: number;
    system_ex_rate: number;
    amount_reporting: number;
    currency_code: string;
    posted_at: string; // YYYY-MM-DD
    direction: 'inflow' | 'outflow';
    source: 'mono' | 'plaid' | 'csv'; // <provider key> | csv"
    metadata: Record<string, any>;
  };

  normalized: {
    description: string;
    description_tokens: string[];
    contact_name: string | null;
    contact_fingerprint: string | null;
    contact_match_confidence: 'high' | 'medium' | 'low' | 'unmatched';
    contact_type:
      | 'vendor'
      | 'customer'
      | 'employee'
      | 'business_owner'
      | 'individual_self'
      | 'unknown';
    inferred_category: string | null;
    normalized_reference?: string | null;
    normalized_payee?: string | null;
    global_contact_id?: string | null;
    global_contact_category_hints?: string[] | null;
  };

  context: {
    industry?: string;
    company_name: string;
    country_code: string;
    accounting_basis: 'modified_cash_basis' | 'modified_accrual_basis';
    reporting_framework: 'ifrs' | 'us_gaap' | 'other';
    reporting_currency_id: string;
    reporting_currency_code: string;
    transaction_currency_id: string;
    transaction_currency_code: string;
    coa_snapshot_version: string;
    company_settings_checksum: string;
    // Once we add jurisdiction, company and tax settings:
    // tax_settings: {
    //   vat_registered: boolean;
    //   vat_rate: number;
    //   wht_applicable: boolean;
    //   wht_rate: number;
    // };
    // jurisdiction: object // for future
  };

  historical: {
    contact_usage_count: number;
    last_seen_at: string | null;
    rolling_30d_txn_count: number;
    rolling_30d_amount_native: number;
    rolling_30d_amount_reporting: number;
    rolling_90d_txn_count: number;
    rolling_90d_amount_native: number;
    rolling_90d_amount_reporting: number;
    avg_amount: number | null;
    std_dev_amount: number | null;
    last_categorized_accounts: Array<{
      coa_id: string;
      usage_count: number;
      last_used_at: string | null;
    }> | null;
    typical_frequency:
      | 'one_time'
      | 'weekly'
      | 'monthly'
      | 'quarterly'
      | 'annual'
      | 'irregular'; // DERIVED: Analyze date gaps between transactions
  };
  signals: {
    likely_split: boolean;
    likely_trf_btw_accounts: boolean;
    likely_tax: boolean;
    likely_fx: boolean;
    likely_prepayment: boolean;
    is_recurring: boolean;
    anomaly_detected: boolean;
    notes: string[];
    requires_vat_check?: boolean;
    requires_fx_review?: boolean;
  };
  temporal: {
    day_of_week: number;
    day_of_month: number;
    month: number;
    quarter: number;
    fiscal_quarter: number;
    days_to_period_close: number;
    is_month_end: boolean;
    is_year_end: boolean;
    fiscal_period: {
      year_start: string; // YYYY-MM-DD
      year_end: string; // YYYY-MM-DD
      quarter_start: string; // YYYY-MM-DD
      quarter_end: string; // YYYY-MM-DD
      month_start: string; // YYYY-MM-DD
      month_end: string; // YYYY-MM-DD
    };
  };
  feedback_summary?: {
    last_posted_at: string | null;
    last_posted_coa_id: string | null;
    acceptance_ratio_90d: number | null;
    custom_exchange_rate?: number | null;
    user_override_contact_id?: string | null;
    user_override_notes?: string | null;
  };
  metadata: {
    source: 'ingestion' | 'backfill' | 'manual';
    enriched_at: string;
    enrichment_latency_ms: number; // for SLA monitoring
    enrichment_version: string; // Hard coded
    status: 'enriched' | 'partial' | 'error';
    error_message?: string | null;
    processing_context?: 'primary' | 'shadow';
  };
}
```

### 5.7 Supporting Infrastructure

#### 5.7.1 Global Contact Patterns File

**Location:** `apps/api/src/domains/categorization/data/merchant-patterns.json`

```json
{
  "version": "1.0.0",
  "patterns": [
    {
      "name": "Uber Technologies Inc.",
      "patterns": ["\\bUBER\\s*\\*", "\\bUBER\\s+EATS\\b"],
      "category_hints": ["Travel & Transportation", "Meals & Entertainment"],
      "countries": ["global"]
    },
    {
      "name": "Amazon Web Services",
      "patterns": [
        "\\bAMAZON\\s+WEB\\s+SERVICES\\b",
        "\\bAMZN\\s+WEB\\s+SERVICES\\b",
        "\\bAMZN\\s*AWS\\b"
      ],
      "category_hints": [
        "Cloud Services",
        "Software & Technology",
        "Cloud Computing"
      ],
      "countries": ["global"]
    }
  ]
}
```

Loaded at service startup into memory for fast pattern matching. Each entry must provide:

- `name`: human-readable brand/merchant identifier.
- `patterns`: array of case-insensitive regex strings targeting bank statement descriptors (word boundaries or explicit settlement tokens encouraged).
- `countries`: ISO 3166-1 alpha-2 codes or the literal `global`.
- `category_hints`: short phrases describing industry, product, or typical spend to guide downstream models (keep them concrete like “Payment Gateway” or “Design Collaboration”).

#### 5.7.2 MCC Reference Catalogue

**Location:** `apps/api/src/domains/categorization/data/mcc-reference.json`

Generated by `pnpm --filter @accountable-books/api exec tsx scripts/generate-mcc-reference.ts`, combining Visa’s MCC standards and Stripe Issuing’s merchant catalogue into a normalized structure:

```json
{
  "version": "2025-02-14",
  "sources": {
    "visa": {
      "dataset": "visa_mcc_codes_description_extended.csv",
      "rows": 889
    },
    "stripe": {
      "dataset": "stripe_issuing_merchant_categories.csv",
      "rows": 292
    }
  },
  "mccs": [
    {
      "mcc": "0742",
      "title": "Veterinary Services",
      "description": "Veterinary Services",
      "category_hints": ["Veterinary Services"],
      "examples": ["Animal Doctors", "Pet Hospitals"],
      "similar_merchants": ["5995 - Pet Shops"],
      "stripe_categories": [
        { "key": "veterinary_services", "label": "Veterinary Services" }
      ],
      "networks": ["visa"],
      "irs_reportable": true
    }
  ]
}
```

Use this dataset to seed MCC-based hints before or alongside regex contact matching. When MCC metadata is present on a transaction, prefer the catalogue’s `category_hints` as a fallback to the merchant patterns.

#### 5.7.3 Company Context Cache

**Redis Key:** `company:{uuid}:categorization-context`
**TTL:** 24 hours
**Invalidation:** On COA/settings changes

**Cached Data:**

- COA accounts (id, code, name, type)
- Accounting basis, reporting framework
- Reporting currency, fiscal year end
- Bank accounts with linked COA IDs
- Company name, country, industry

#### 5.7.3 Design Notes

- **Worker owns iteration** - `enrichment.service.ts` stays single-transaction for testability
- **Enriched payload persisted** - Stored in `categorization_tasks.enriched_transaction` (JSONB, versioned)
- **Contact stats** - Maintained in `bank_transaction_contact_stats` with `contact_fingerprint` for unknowns
- **Contact embeddings** - Pretrained model cached in memory for fuzzy normalization; scores kept with the enrichment snapshot for explainability
- **bank_transactions immutability** - Never modify raw bank feed data; user edits go to ledger records only. This preserves source-of-truth and provides labeled feedback for ML.

**Note on snapshots**

- We do **not** persist **COA** JSON snapshots; COA is referenced by `coa_snapshot_version` and reconstructed from versioned tables.
- We **do** persist the **enriched DTO** JSON for auditability and reproducibility.

---

### 5.8 Reliability & Idempotency

- **Idempotency keys per stage:** `${companyId}:${bankTransactionId}:${stage}:${version}`. All workers must be idempotent on this key.
- **Dead-letter queues:** `enrichment.dlq`, `inference.dlq`, `fusion.dlq`, `constraints.dlq` with max retries and alerting.
- **Exactly-once posting:** Posting endpoint requires a client-supplied `posting_uuid`; database enforces `UNIQUE(posting_uuid)` on ledger batch/table.
- **At-least-once events:** Consumers are idempotent; events may be re-delivered.
- **Checksuming:** `categorization_tasks.checksum` (SHA-256 over enriched DTO) to short-circuit no-op updates.

## Stage 2 – Deterministic Rules Engine

**Purpose:** Apply user-defined and system rules to handle known patterns with 100% certainty and full explainability.

**What Happens:**

- Evaluate layered rules (user → company → firm → system) against the enriched transaction
- Rules output full journal proposals (all legs, memos, basis awareness) plus provenance
- Each rule tags its proposal with the matching semantic account type so downstream ranking stays consistent
- Ships with curated system/industry rule packs and supports user-authored rules

**Deterministic rule validity (confidence = 1.0)**

- A rule may emit confidence=1.0 only if:
  - It specifies **all legs** (including control legs), and
  - It **passes the constraint solver** (balance, basis, tax, COA state) with **zero** violations, and
  - Any amount logic uses explicit matchers (exact, ±tolerance%) declared on the rule.
- Otherwise the rule must emit confidence<1.0 and be treated as a candidate.

**Output:** `LedgerEntryCandidate[]` with confidence = 1.0 and traceable rule metadata (or empty array if no rules match)

---

## Stage 3 – Machine Intelligence Layer

**Purpose:** Cover transactions the rules miss by combining an account-type classifier with a COA-aware ranker.

**What Happens:**

- **Model A – Account-type classifier:** Predicts the semantic `account_type_key` for the non-control side using enriched features + contact history. Mechanical/control types (bank, AP/AR, contras, clearing) are excluded from training.
- **Model B – Account ranker:** Given the predicted type and the tenant’s candidate accounts (metadata, usage priors, policy flags), runs a learning-to-rank model to score the COA options. Uses cached COA snapshots keyed by `coa_snapshot_version`; cold misses hydrate from Postgres via shared cache.
- **Shadow inference:** Both models can run even when a rule already solved the transaction so we continue collecting training data.
- **Artifacts:** Persist top-N account-type scores, account rankings, and feature attributions for explainability.

**Guardrails & training practices:**

- **Label extraction:** From the final journal, select the primary semantic line (largest absolute amount among non-control, non-mechanical legs). Skip samples with no semantic line so controls never become `y`.
- **Class balance:** Track macro-F1 and per-type metrics. Down-weight or cap high-frequency labels (e.g., bank fees) and keep deterministic rules for trivial cases; mask those examples from loss during training.
- **Candidate filtering:** Model B only considers active, postable tenant accounts with `label_role === 'semantic'`. Control legs (`is_postable_control`) are supplied via templates when needed.
- **Fallbacks:** If Model A confidence is low or the tenant’s COA is mis-typed, expand Model B’s search to secondary account types with a penalty, and surface COA hygiene prompts when approvals consistently contradict the stored type.

**Output:** Ranked `LedgerEntryCandidate[]` with predicted account-type labels, account scores, and supporting features.

**Label-role routing (authoritative):**

- `semantic`: trainable=true, candidate=true
- `mechanical`: trainable=false, candidate=false (posted by schedules/close)
- `control`: trainable=false, candidate=true (as bank/AP/AR legs only)
- `fallback`: trainable=false, candidate=true (lowest prior; last resort)
- nca_other / ca_other / cl_other → label_role: 'fallback', trainable: false

**Label-role policy**
| role | trainable | candidate | notes |
|-------------|-----------|-----------|-------|
| semantic | yes | yes | bank-text-resolvable categories |
| mechanical | no | no | posted by schedules/close |
| control | no | yes | bank/AP/AR/tax control legs |
| fallback | no | yes | last-resort posting; never a label |

**Sample explainability artifact persisted per candidate**

```json
{
  "rule_hits": [
    {
      "rule_id": "...",
      "match_fields": ["contact", "amount"],
      "amount_logic": "exact|±x%",
      "evidence": "..."
    }
  ],
  "model_a_topk": [
    {
      "account_type": "exp_opex_software_subscriptions",
      "prob": 0.71,
      "feature_attrib": {
        "contact": 0.42,
        "ngram": 0.18,
        "history": 0.11,
        "amount": 0.06
      }
    }
  ],
  "model_b_topk": [
    {
      "coa_id": "...",
      "score": 0.83,
      "features": { "usage_prior": 0.31, "recency": 0.22, "policy_flags": 0.07 }
    }
  ],
  "basis_scores": { "cash": 0.64, "accrual": 0.81 },
  "constraint_outcome": { "passed": true, "violations": [] },
  "reason_chain": [
    "Matched contact: AWS",
    "History favors software subscriptions",
    "Accrual basis selected"
  ]
}
```

---

## Stage 4 – Candidate Fusion

**Purpose:** Merge rule-based and ML-ranked proposals into a single, annotated candidate set.

**What Happens:**

- Deduplicate identical journal structures while preserving provenance (rule ID vs. model A/B scores).
- Apply precedence: deterministic rule hits first, then ML candidates in the ranker order, followed by any fallback templates.
- Carry forward predicted account-type labels, account scores, and explanation payloads for downstream stages.

**Output:** Unified, priority-ranked `LedgerEntryCandidate[]` with provenance metadata.

---

## Stage 5 – Constraint & Consistency Checks

**Purpose:** Enforce accounting correctness before surfacing anything to users.

**What Happens:**

- Validate each candidate:
  - **Balance Check:** Verify debits equal credits (zero-sum)
  - **COA Validation:** All accounts exist, are active, and appropriate for transaction type
  - **Bank Leg Validation:** Bank account side matches transaction direction and amount
  - **Accounting Basis Compliance:** Cash vs Accrual rules (e.g., no A/R for cash basis)
  - **Framework Adherence:** IFRS vs US GAAP compliance
  - **Tax Logic Validation:** VAT/WHT rates match company's jurisdiction
- Annotate any adjustments or failures with diagnostic notes
- Auto-fix minor rounding errors up to **min($0.01, 1 basis point of the transaction’s absolute amount)**.

- Persist constraint results in `categorization_constraint_violations` to feed the review UI and audit trail

- **Cash basis:** disallow postings to AR/AP/Accrued/Contract assets/liabilities unless an explicit “cash-basis exception” rule fires (e.g., bank loan repayments).
- **Accrual basis:** allow AR/AP/Accrued; if bank text indicates “invoice settlement” ensure counterleg is AR/AP, not revenue/expense directly (unless policy allows shortcuts).
- Model B computes scores for both bases and emits `basis_scores: {cash, accrual}`. The solver selects per-company basis; the UI can show the alternative as a suggestion.
- **Transfers:** detect same-entity bank↔bank/MPOS/Wallet moves via counterparty heuristics & matching engine (amount/date windows, sibling accounts).
- **Refunds/Chargebacks:** detect negative pairs vs prior debit with same vendor/contact and close amount.
- **Intercompany:** if company has related-entity bank accounts, default counterleg to “Due to/from related parties” with entity metadata.

**Output:** `ValidatedLedgerEntryCandidate[]`, each with constraint provenance

---

## Stage 6 – Decision, Presentation & Feedback

**Purpose:** Deliver suggestions to users, capture their actions, and integrate with posting flow.

**What Happens:**

- **Route candidates by confidence:**
  - High confidence (≥90%): Auto-post queue (disabled by default for MVP)
  - Medium confidence (70-89%): Human review queue
  - Low confidence (<70%): Expert review queue
- **Present to users:** Show the predicted account type, ranked account scores, constraint notes, and provenance timeline (rule → Model A → Model B → constraint) so reviewers understand every decision
- **Capture feedback:** When users accept, edit, split, or reject, store those actions as feedback events
- **Create ledger entries:** Only when approved by user (respects auto-post settings, default OFF)
- **Audit logging:** Store full provenance trail for compliance

**Output:** User-facing categorization interface + ledger entries (after approval) + feedback data for learning loop

---

## Operational Layer – Continuous Learning & Monitoring

This is not a sequential stage but an ongoing system operation that runs continuously.

**Purpose:** Ensure the system improves and stays reliable over time.

**What Happens:**

- **Metrics Tracking:** Accuracy (user acceptance rate), precision@1 (top suggestion correct), coverage (% auto-categorizable), rule hit rate
- **Model Updates:** Nightly adapter retraining using captured user feedback and shadow inference results
- **Drift Detection:** Alert when accuracy drops below thresholds (per company, industry, or globally)
- **Active Learning:** Maintain queues for low-confidence or high-drift transactions requiring manual labeling
- **Audit Compliance:** Persist full provenance trails with version control for models and rules
- **Performance Gating:** Only enable auto-posting when company achieves sustained accuracy targets (e.g., 95%+ for 30 days)

**SLO gates & anti-skew**

- Global: macro-F1 ≥ 0.80; top-20 account types each ≥ 0.70.
- “No-bank-fees” accuracy ≥ 0.90 before enabling auto-post for a tenant.
- Cap per-vendor samples; down-weight trivial heads (bank fees) in training; keep rule-first for those cases.

**Output:** Self-improving, well-governed categorization engine with dashboards and alerts

---

## Design Decisions

### Company Context Caching Strategy

Company/COA context is versioned in Postgres. Stage 1 reads the latest `coa_snapshot_version` and `company_settings_checksum`, enriches transactions with those values, and writes them to `categorization_tasks`. A shared cache (Redis) mirrors the derived structures keyed by `(company_id, version)` for fast access, with LRU eviction; cache misses rebuild from the authoritative tables. No COA JSON snapshots are persisted; COA is referenced by `coa_snapshot_version`. The enriched DTO is persisted for auditability.

### COA Delivery to ML

ML workers never connect directly to Postgres. When an inference request references a new `coa_snapshot_version`, the API pushes the serialized COA metadata to the shared cache; Python fetches it on demand and keeps only a hot subset in memory. Subsequent requests send just the version token.

### COA Version History

`coa` keeps a stable primary key per account. A companion table `coa_account_versions` records metadata snapshots with `effective_from`/`effective_to`, so changes (renames, type toggles, policy flags) do not break historical ledger references. Stage 1 stamps `coa_snapshot_version` using this history, and replays reconstruct the exact COA by querying the versions table.

### Explainability Guarantees

Every stage produces structured artifacts: rule hits, account-type scores, ranker outputs, constraint violations, and user feedback. These are joined in the review UI so accountants see the predicted account type, ranked COA choices, embedding match scores, and solver notes before posting.

### Privacy & Multi-Tenancy

ML explanations must never mention other tenants' data. Similarity evidence is scrubbed of cross-tenant identifiers before presentation to users.

### Evaluation & Anti-skew

- Macro-F1, per-type P/R, MCC; publish “no-bank-fees accuracy”
- Down-weight frequent heads (bank fees) and cap per-vendor samples
- Rule-first detection for bank fees; shadow-score; mask from loss

### Basis enforcement

- Cash basis: block AR/AP/Accrued/Contract postings unless an explicit exception rule fires
- Accrual basis: enforce AR/AP on invoice settlements; prevent direct P&L when description indicates settlement
- Model B outputs `{cash, accrual}` scores; solver selects per tenant basis

### Transfers & refunds

- Bank↔bank transfers: sibling-account match by amount/date window; prefer `ca_bank`↔`ca_bank`
- Refunds/chargebacks: negative pair matching against prior debit with same contact and close amount
- Intercompany: if counterpart bank belongs to related entity, `due to/from related parties`

### COA Hygiene

- Linter at create/edit (embedding vs `account_type`, hard warning + fix)
- Posting-time candidate expansion to Model A top-k when top-1 has no viable match
- Re-typing prompts when usage contradicts type

### Model governance

- Registry with semver, feature schema hash, training window; artifacts immutable
- Shadow for N days, then canary (≤10% tenants); automatic rollback on KPI breach
- Config flag to flip versions per-tenant without redeploy

### Consider how to handle changes to account_types

---
