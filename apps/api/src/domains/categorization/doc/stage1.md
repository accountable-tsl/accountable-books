## 5. Stage 1 – Ingestion & Enrichment (Implementation Plan)

### 5.1 Overview

**Purpose:** Transform raw bank transactions into clean, standardized, context-rich `EnrichedTransaction` objects that downstream stages can consume without repetitive queries.

**What Happens:**

- Parse and clean descriptions, normalize amounts.
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
   - Company config cache: load from Redis using key `company:banktx-enrichment:{uuid}` (COA, basis, fiscal year, country, reporting currency, reporting framework, tax settings).
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

**Who updates:** The enrichment worker owns all stats updates. After enriching a transaction (steps 1-6), the worker writes a snapshot into the `categorization_tasks` payload, appends an immutable contribution row, and then refreshes the aggregate stats within the same database transaction before emitting the `transaction.enriched` event.

**When updates happen:**

1. **On enrichment (add):** Immediately after enriching a transaction:
   - Lookup/create row in `bank_transaction_contact_stats` by `(company_id, currency_code, contact_fingerprint, contact_id)` with a `FOR UPDATE` lock
   - Capture the **pre-update** snapshot and embed it into `categorization_tasks.enriched_transaction.historical.bank_contact_stats_snapshot`
   - Insert or upsert a row in `bank_transaction_contact_stats_entries` representing the transaction’s absolute amounts (idempotent on `transaction_id`)
   - Recalculate totals and rolling windows from the entries table (ensuring `window_start <= txn_date <= as_of_date`)
   - Update `bank_transaction_contact_stats` with the new aggregates, `stats_snapshot_checksum`, `stats_replay_seq`, and `last_transaction_*` fields

2. **On re-enrichment (config change):** When company settings change (COA, currency, basis), we re-enrich affected transactions:
   - Recompute the enriched payload and checksum; skip persistence if unchanged (idempotency guard)
   - If a replay was triggered (backfill), an isolate helper replays chronologically from the earliest impacted date, rewrites entries, and bumps `stats_replay_seq`

3. **On deletion (subtract):** When `bank_transactions.is_deleted` flips to TRUE:
   - Change watcher emits `transaction.deleted` event with `bankTransactionIds`
   - Enrichment worker handles deletion:
     - Fetch existing `categorization_tasks` row to get the enriched snapshot
     - Mark the contribution entry as deleted and recalculate aggregates (TODO: pending implementation)
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
  version: string; // structure v20251101-01 (date we updated code last, version of the DTO)

  ids: {
    bank_transaction_id: string;
    bank_transaction_batch_id?: string | null;
    company_uuid: string;
    bank_account_id: string;
    bank_account_coa_id: string;
    contact_id?: string | null;
    enrichment_job_id?: string | null;
    coa_snapshot_version: string; // -pending
    coa_snapshot_id: string;
    company_settings_checksum?: string | null; // -pending
  };

  raw: {
    date: string; // YYYY-MM-DD
    description: string;
    amount_native: number; // signed
    system_exchange_rate: number;
    amount_reporting: number; // signed
    currency_code: string;
    direction: 'inflow' | 'outflow';
    source: string; // <provider key> | csv"
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
    normalized_reference?: string | null;
    global_contact_id?: string | null;
    global_contact_category_hints?: string[] | null;
  };

  context: {
    industry?: string | null;
    company_name: string;
    company_description?: string | null;
    company_website?: string | null;
    country_id: string;
    country_code: string;
    accounting_basis: 'modified_cash_basis' | 'modified_accrual_basis';
    reporting_framework: 'ifrs' | 'us_gaap' | 'other';
    reporting_currency_id: string;
    reporting_currency_code: string;
    transaction_currency_id: string;
    transaction_currency_code: string;
  };

  historical: {
    // contact_usage_count: number;
    // last_seen_at: string | null;
    // Rolling windows and advanced stats now live in bank_transaction_contact_stats / feature store
    bank_contact_stats_snapshot?: {
      stats_row_id: string | null;
      captured_at: string;
      as_of_transaction_id: string | null;
      as_of_transaction_date: string | null;
      stats_replay_seq: number;
      checksum: string;
      totals: {
        transaction_count: number;
        amount_native_sum: number;
        amount_reporting_sum: number;
        avg_amount_native: number;
        avg_amount_reporting: number;
        stddev_amount_native: number;
        stddev_amount_reporting: number;
      };
      rolling_30d: {
        transaction_count: number;
        amount_native_sum: number;
        amount_reporting_sum: number;
        avg_amount_native: number;
        avg_amount_reporting: number;
        stddev_amount_native: number;
        stddev_amount_reporting: number;
      };
      rolling_90d: {
        transaction_count: number;
        amount_native_sum: number;
        amount_reporting_sum: number;
        avg_amount_native: number;
        avg_amount_reporting: number;
        stddev_amount_native: number;
        stddev_amount_reporting: number;
      };
      last_transaction_id: string | null;
      last_transaction_date: string | null;
    } | null;
    // avg_amount: number | null;
    // std_dev_amount: number | null;
    // last_categorized_accounts: Array<{
    //   coa_id: string;
    //   usage_count: number;
    //   last_used_at: string | null;
    // }> | null;
    // typical_frequency:
    //   | 'one_time'
    //   | 'weekly'
    //   | 'monthly'
    //   | 'quarterly'
    //   | 'annual'
    //   | 'irregular'; // DERIVED: Analyze date gaps between transactions
  };
  signals: {
    // Cheap deterministic heuristics only. Advanced signals computed downstream.
    likely_split: boolean;
    likely_trf_btw_accounts: boolean;
    // likely_tax: boolean;
    // likely_fx: boolean;
    // likely_prepayment: boolean;
    // is_recurring: boolean;
    // anomaly_detected: boolean;
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

Loaded at service startup into memory for fast pattern matching. Fields are strictly validated (see `merchantPatternsFileSchema`) to guarantee consistent regex arrays, category hints, and geography lists.

#### 5.7.2 MCC Reference Catalogue

**Location:** `apps/api/src/domains/categorization/data/mcc-reference.json`

Maintained via `pnpm --filter @accountable-books/api exec tsx scripts/generate-mcc-reference.ts`. The script reconciles Visa’s MCC tables with Stripe Issuing categories and produces normalized entries containing:

- `mcc`, `title`, `description`
- `category_hints` (aligned with our merchant hint vocabulary)
- Sample `examples` / `similar_merchants`
- `stripe_categories` (Stripe Issuing key + human label)
- `networks` (currently `["visa"]`)
- Optional metadata (`irs_reportable`, USDA/IRS descriptors)

Load this alongside merchant patterns to supply high-confidence hints when transactions carry raw MCC codes.

#### 5.7.3 Company Context Cache

**Redis Key:** `company:banktx-enrichment:{uuid}`
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
- **bank_transactions immutability** - Never modify raw bank feed data; user edits go to ledger records only. This preserves source-of-truth and provides labeled feedback for ML.

#### Comments

Key reasons to keep Python stateless and DB‑less:

- Security & tenancy: DB access from the model layer opens every multi-tenant audit
  concern. Right now the API worker enforces company-level ACLs and redacts fields
  before inference; giving Python raw SQL bypasses that guardrail.
- Operational simplicity: Stateless services scale elastically, can be rolled back
  independently, and let us swap implementations without coordinating DB migrations.
- API product future: If we expose categorization as a service to partners, a stateless
  inference endpoint is far easier to harden and deploy—no external access to our
  internal schema.

Instead of pushing the entire DTO forever, we can control payload growth:

1. Feature service / adapter: Pre-compute features on the API side (or via a dedicated
   microservice) and send only what the model really needs. As new signals emerge,
   they’re added to the feature spec, not raw context dumps.
2. Versioned feature contracts: Keep the DTO broken into sections (raw, context, stats,
   feedback). The API chooses which sections to send; the model consumes just the ones
   it understands.
3. On-demand lookups via shared cache: For heavy data (full COA list, recurring
   contacts), we push it into a shared cache behind the API. Python fetches by key only
   when required—no DB credentials, no data duplication.
4. Analytical work stays upstream: If we need heavy aggregations, build them where the
   data already lives (Postgres/materialized views) and send the aggregated output to
   the model. Python focuses on inference.

If we ever hit a point where the model genuinely needs raw DB access, we’d treat it
as a new service tier with strict read-only projections (e.g., a denormalized feature
store). Until then, keeping the inference layer stateless keeps us safer, faster to
iterate, and ready for externalization.
