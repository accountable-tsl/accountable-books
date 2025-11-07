# Transaction Categorization System - Comprehensive Implementation Plan

## Executive Summary

This document outlines a world-class AI-powered transaction categorization system designed to achieve **95%+ accuracy consistently** with **full explainability** for any given transaction across any company, industry, country, and accounting framework.

### Core Philosophy

**Context-Aware Multi-Stage Pipeline**: Enrichment → Rules → ML → Synthesis → Validation → Review

The system combines:

- **Data Enrichment** to transform raw transactions into intelligence-ready formats
- **Deterministic Rules** for known patterns (tax codes, recurring vendors, account mappings)
- **Structured ML** (template selector + account mapper + amount allocator) with global models + per-company adapters
- **Constraint Validation** ensuring accounting integrity (zero-sum, basis compliance, framework adherence)
- **Full Explainability** with natural language reasoning and confidence breakdowns

### Key Capabilities

1. **Complex Transaction Handling**: Splits, bulk payments, tax (VAT/WHT), FX adjustments, discounts, prepayments, accruals
2. **Context Intelligence**: Company COA, accounting basis (cash/accrual), industry, country, reporting framework (IFRS/US GAAP), vendor history
3. **Per-Company Adaptation**: Global model + company-specific patterns (no retraining needed)
4. **Auditability**: Every decision logged with reasoning, confidence scores, and rule/model attribution
5. **Continuous Learning**: User corrections feed back into rules and training data

### Success Metrics

- **Accuracy**: 95%+ consistent prediction accuracy across all companies
- **Explainability**: 100% of predictions include natural language reasoning
- **Coverage**: Handle 90%+ of transactions automatically (minimal human review)
- **Performance**: <500ms prediction latency for 95th percentile
- **Adaptability**: New company achieves 90%+ accuracy within 30 transactions

---

## Pipeline Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  BANK TRANSACTION INPUT                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: Data Ingestion & Enrichment                           │
│  Clean → Extract → Enrich → Add Context                         │
│  Output: EnrichedTransaction                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: Deterministic Rules Engine                            │
│  Evaluate Rules (User → Company → Industry → System)            │
│  Output: LedgerEntryCandidate[] (confidence = 1.0) OR []        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3: Machine Intelligence Layer                            │
│  Template Selection → Account Mapping → Amount Allocation       │
│  (Runs even when rules match - shadow inference)                │
│  Output: LedgerEntryCandidate[] (ranked by confidence)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 4: Synthesis & Ranking                                   │
│  Merge Rules + ML → Prioritize → Deduplicate                    │
│  Output: Single ranked LedgerEntryCandidate[]                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 5: Constraint Validation & Correction                    │
│  Balance Check → COA Validation → Basis/Framework Compliance    │
│  Output: Validated LedgerEntryCandidate[]                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 6: Decision Routing & User Presentation                  │
│  Route by Confidence → Present to User → Capture Feedback       │
│  Output: UI Queues + Ledger Entries (after approval)            │
└─────────────────────────────────────────────────────────────────┘
```

---

# STAGE 1: Data Ingestion & Enrichment

## 1.1 Purpose

Transform raw bank transactions into clean, standardized, context-rich `EnrichedTransaction` objects that downstream stages can consume without repetitive queries or complex data fetching.

**Key Objectives:**

- **Normalize** messy provider data into consistent formats
- **Extract** entities (vendors, amounts, dates, currencies)
- **Enrich** with company context (COA, accounting basis, industry, framework)
- **Compute** historical features and pattern signals
- **Cache** company context for performance
- **Ensure** idempotency and error resilience

---

## 1.2 When Does Stage 1 Happen?

### Trigger 1: Primary - Transaction Ingestion (Real-time)

**Event:** `transaction.ingested`

**Flow:**

```
Bank Provider Webhook/Poll
  → apps/api/src/domains/bankTransactions/bankTransactions.model.ts
    → createBankTransactions()
      → Persist to bank_transactions table
        → Emit event: { type: 'transaction.ingested', data: { bank_transaction_id } }
          → BullMQ Queue: 'categorization-enrichment'
            → enrichmentWorker.ts processes job
              → enrichmentService.enrich(bank_transaction_id)
```

**Timing:** Async, non-blocking. Transaction ingestion returns immediately; enrichment happens in background worker.

**Latency Target:** <500ms for enrichment to complete.

### Trigger 2: Secondary - Data Updates (Background)

**Event:** `company.coa.updated` or `transaction.amended`

**Flow:**

```
Company updates COA / User edits transaction description
  → Emit event: { type: 'company.coa.updated', data: { company_id } }
    → BullMQ Queue: 'categorization-enrichment-refresh'
      → Re-enrich all uncategorized transactions for company
```

**Use Case:** COA changes, vendor master updates, currency rate corrections.

**Timing:** Batched background job, rate-limited.

### Trigger 3: Manual - Admin Refresh (On-demand)

**Endpoint:** `POST /api/categorization/enrich/:bank_transaction_id/refresh`

**Flow:**

```
Admin UI → API call
  → enrichmentService.refresh(bank_transaction_id)
    → Enqueue job with priority
```

**Use Case:** Troubleshooting, backfilling historical data, testing new enrichment logic.

---

## 1.3 Where Does Stage 1 Happen?

### File Structure

```
apps/api/src/domains/categorization/
├── enrichment.service.ts        # Main orchestration logic
├── enrichment.worker.ts         # BullMQ worker process
├── enrichment.cache.ts          # Company context caching
├── enrichment.parsers.ts        # Description cleaning, entity extraction
├── enrichment.features.ts       # Historical feature computation
├── enrichment.signals.ts        # Pattern detection (splits, tax, FX)
├── enrichment.types.ts          # TypeScript interfaces
└── enrichment.test.ts           # Unit tests
```

### Integration Points

- **Reads from:** `bank_transactions`, `companies`, `coa`, `bank_accounts`, `companies_vendors`, historical ledger data
- **Writes to:** `categorization_tasks` table (new) or JSONB column `bank_transactions.enriched_data`
- **Emits:** `transaction.enriched` event after successful enrichment
- **Consumes:** `transaction.ingested`, `company.coa.updated` events

### Worker Configuration

**File:** `apps/api/src/jobs/workers/categorization-enrichment.worker.ts`

```typescript
import { categorizationEnrichmentQueue } from '../queues';
import { enrichmentService } from '../../domains/categorization/enrichment.service';

categorizationEnrichmentQueue.process(async (job) => {
  const { bank_transaction_id } = job.data;

  return await enrichmentService.enrich(bank_transaction_id);
});
```

**Queue Definition:** `apps/api/src/jobs/queues/categorization-enrichment.queue.ts`

```typescript
import { Queue } from 'bullmq';
import { redisConnection } from '../../config/redis';

export const categorizationEnrichmentQueue = new Queue(
  'categorization-enrichment',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  },
);
```

---

## 1.4 How Does Stage 1 Happen? (Step-by-Step)

### Step 1: Load Base Transaction Data

**Purpose:** Fetch raw transaction with related data in a single optimized query.

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.service.ts

async function loadBaseTransaction(
  bankTransactionId: string,
): Promise<RawTransactionData> {
  const result = await db('bank_transactions as bt')
    .select(
      'bt.*',
      'ba.coa_id as bank_coa_id',
      'ba.currency_id as bank_currency_id',
      'c.company_id',
      'c.accounting_basis',
      'c.reporting_framework',
      'c.reporting_currency_id',
      'c.fiscal_year_end',
      'c.industry',
      'c.country_id',
      'country.code as country_code',
      'bt.provider_transaction_data', // JSONB from Plaid/TrueLayer/etc
    )
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.bank_account_id')
    .join('companies as c', 'ba.company_id', 'c.company_id')
    .join('countries as country', 'c.country_id', 'country.country_id')
    .where('bt.bank_transaction_id', bankTransactionId)
    .first();

  if (!result) {
    throw new Error(`Transaction ${bankTransactionId} not found`);
  }

  return result;
}
```

**Performance:** Single query with JOINs. Indexed by `bank_transaction_id` (PK).

---

### Step 2: Normalize Text & Extract Entities

**Purpose:** Clean description text, extract vendor names, detect patterns.

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.parsers.ts

interface NormalizedData {
  description: string;
  descriptionTokens: string[];
  vendorName: string | null;
  vendorId: string | null;
  counterpartyType: 'vendor' | 'customer' | 'employee' | 'unknown';
  inferredCategory: string | null; // e.g., "UTILITIES" from description keywords
}

function normalizeDescription(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/[<>]/g, '') // Remove HTML artifacts
    .toUpperCase(); // Normalize case
}

function tokenizeDescription(normalized: string): string[] {
  const stopwords = new Set([
    'THE',
    'AND',
    'OR',
    'FOR',
    'TO',
    'FROM',
    'AT',
    'IN',
    'ON',
  ]);

  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

async function extractVendor(
  description: string,
  companyId: string,
): Promise<{ vendorName: string | null; vendorId: string | null }> {
  // Strategy 1: Exact match against company vendors table
  const exactMatch = await db('companies_vendors')
    .where({ company_id: companyId })
    .where(db.raw('UPPER(vendor_name) = ?', [description.substring(0, 100)]))
    .first();

  if (exactMatch) {
    return {
      vendorName: exactMatch.vendor_name,
      vendorId: exactMatch.vendor_id,
    };
  }

  // Strategy 2: Fuzzy match (Levenshtein distance < 3)
  const fuzzyMatch = await db('companies_vendors')
    .where({ company_id: companyId })
    .select('*')
    .then((vendors) => {
      for (const vendor of vendors) {
        const distance = levenshteinDistance(
          description.substring(0, 100).toUpperCase(),
          vendor.vendor_name.toUpperCase(),
        );
        if (distance < 3) return vendor;
      }
      return null;
    });

  if (fuzzyMatch) {
    return {
      vendorName: fuzzyMatch.vendor_name,
      vendorId: fuzzyMatch.vendor_id,
    };
  }

  // Strategy 3: Extract from description using NER or patterns
  const extracted = extractVendorFromDescription(description);

  if (extracted) {
    // Create pending vendor entry for review
    const pendingVendor = await db('companies_vendors')
      .insert({
        company_id: companyId,
        vendor_name: extracted,
        status: 'pending_review',
      })
      .returning('*')
      .then((rows) => rows[0]);

    return { vendorName: extracted, vendorId: pendingVendor.vendor_id };
  }

  return { vendorName: null, vendorId: null };
}

function extractVendorFromDescription(description: string): string | null {
  // Common patterns: "PAYMENT TO VENDOR_NAME" or "VENDOR_NAME INVOICE"
  const patterns = [
    /PAYMENT TO ([A-Z\s]+)/,
    /([A-Z\s]+) INVOICE/,
    /([A-Z\s]+) \d{2}\/\d{2}/, // Vendor followed by date
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}
```

---

### Step 3: Load Company Context (with Caching)

**Purpose:** Attach company-specific configuration without querying DB every time.

**Caching Strategy:**

```typescript
// apps/api/src/domains/categorization/enrichment.cache.ts

import { Redis } from 'ioredis';
import NodeCache from 'node-cache';

const redisClient = new Redis(process.env.REDIS_URL);
const localCache = new NodeCache({ stdTTL: 3600 }); // 1 hour local cache

interface CompanyContext {
  company_id: string;
  accounting_basis: 'modified_cash_basis' | 'modified_accrual_basis';
  reporting_framework: 'ifrs' | 'us_gaap';
  reporting_currency_id: string;
  fiscal_year_end: string; // YYYY-MM-DD
  industry: string;
  country_code: string;
  coa_snapshot_version: string; // Incremented when COA changes
  coa_accounts: Array<{
    coa_id: string;
    account_code: string;
    account_name: string;
    account_type_key: string;
    account_element: string;
  }>;
  tax_settings: {
    vat_registered: boolean;
    vat_rate: number;
    wht_applicable: boolean;
    wht_rate: number;
  };
}

async function getCompanyContext(companyId: string): Promise<CompanyContext> {
  const cacheKey = `company:${companyId}:categorization-context`;

  // Level 1: Local in-memory cache (fastest)
  const localCached = localCache.get<CompanyContext>(cacheKey);
  if (localCached) {
    return localCached;
  }

  // Level 2: Redis cache (shared across instances)
  const redisCached = await redisClient.get(cacheKey);
  if (redisCached) {
    const parsed = JSON.parse(redisCached);
    localCache.set(cacheKey, parsed);
    return parsed;
  }

  // Level 3: Database query
  const context = await buildCompanyContext(companyId);

  // Cache in Redis (1 hour TTL)
  await redisClient.setex(cacheKey, 3600, JSON.stringify(context));

  // Cache locally
  localCache.set(cacheKey, context);

  return context;
}

async function buildCompanyContext(companyId: string): Promise<CompanyContext> {
  // Fetch company details
  const company = await db('companies')
    .select(
      'company_id',
      'accounting_basis',
      'reporting_framework',
      'reporting_currency_id',
      'fiscal_year_end',
      'industry',
      'country_id',
    )
    .join('countries', 'companies.country_id', 'countries.country_id')
    .select('countries.code as country_code')
    .where('companies.company_id', companyId)
    .first();

  // Fetch COA
  const coaAccounts = await db('coa')
    .select(
      'coa_id',
      'account_code',
      'account_name',
      'account_type_key',
      'account_element',
    )
    .where({ company_id: companyId, active: true })
    .orderBy('account_code');

  // Fetch tax settings
  const taxSettings = await db('company_tax_settings')
    .where({ company_id: companyId })
    .first();

  // Generate COA snapshot version (hash of COA IDs)
  const coaVersion = crypto
    .createHash('md5')
    .update(coaAccounts.map((a) => a.coa_id).join(','))
    .digest('hex')
    .substring(0, 8);

  return {
    company_id: companyId,
    accounting_basis: company.accounting_basis,
    reporting_framework: company.reporting_framework,
    reporting_currency_id: company.reporting_currency_id,
    fiscal_year_end: company.fiscal_year_end,
    industry: company.industry,
    country_code: company.country_code,
    coa_snapshot_version: coaVersion,
    coa_accounts: coaAccounts,
    tax_settings: {
      vat_registered: taxSettings?.vat_registered ?? false,
      vat_rate: taxSettings?.vat_rate ?? 0,
      wht_applicable: taxSettings?.wht_applicable ?? false,
      wht_rate: taxSettings?.wht_rate ?? 0,
    },
  };
}

// Cache invalidation on COA changes
async function invalidateCompanyContext(companyId: string): Promise<void> {
  const cacheKey = `company:${companyId}:categorization-context`;
  await redisClient.del(cacheKey);
  localCache.del(cacheKey);
}
```

**Performance Benefits:**

- **Local cache hit:** <1ms
- **Redis cache hit:** ~5ms
- **Database query:** ~50-100ms

**First transaction:** 100ms (cold cache)
**Subsequent transactions:** <5ms (warm cache)

---

### Step 4: Compute Historical Features

**Purpose:** Provide context about vendor patterns, transaction frequency, typical amounts.

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.features.ts

interface HistoricalFeatures {
  vendor_usage_count: number; // How many times has this vendor appeared?
  last_seen_at: string | null; // When was last transaction with this vendor?
  last_categorized_accounts: string[]; // Which COA accounts were used last time?
  avg_amount: number | null; // Average transaction amount for this vendor
  std_dev_amount: number | null; // Standard deviation (detect anomalies)
  typical_frequency:
    | 'one_time'
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'annual'
    | 'irregular';
}

async function computeHistoricalFeatures(
  vendorId: string | null,
  companyId: string,
  description: string,
): Promise<HistoricalFeatures> {
  if (!vendorId) {
    // No vendor identified, use description-based matching
    return await getDescriptionBasedFeatures(companyId, description);
  }

  // Query historical transactions for this vendor
  const stats = await db('bank_transactions as bt')
    .select(
      db.raw('COUNT(*) as usage_count'),
      db.raw('MAX(bt.posted_at) as last_seen'),
      db.raw('AVG(bt.amount) as avg_amount'),
      db.raw('STDDEV(bt.amount) as std_dev'),
    )
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.bank_account_id')
    .where({
      'ba.company_id': companyId,
      'bt.vendor_id': vendorId,
    })
    .first();

  // Get last categorized accounts
  const lastCategorized = await db('ledgers as l')
    .select('l.coa_id')
    .join('bank_transactions as bt', 'l.source_id', 'bt.bank_transaction_id')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.bank_account_id')
    .where({
      'ba.company_id': companyId,
      'bt.vendor_id': vendorId,
      'l.source_type': 'bank_transaction',
    })
    .orderBy('l.created_at', 'desc')
    .limit(3)
    .then((rows) => rows.map((r) => r.coa_id));

  // Determine frequency pattern
  const frequency = await determineFrequency(companyId, vendorId);

  return {
    vendor_usage_count: parseInt(stats.usage_count) || 0,
    last_seen_at: stats.last_seen,
    last_categorized_accounts: lastCategorized,
    avg_amount: stats.avg_amount ? parseFloat(stats.avg_amount) : null,
    std_dev_amount: stats.std_dev ? parseFloat(stats.std_dev) : null,
    typical_frequency: frequency,
  };
}

async function determineFrequency(
  companyId: string,
  vendorId: string,
): Promise<
  'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'
> {
  const dates = await db('bank_transactions as bt')
    .select('bt.posted_at')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.bank_account_id')
    .where({
      'ba.company_id': companyId,
      'bt.vendor_id': vendorId,
    })
    .orderBy('bt.posted_at')
    .limit(10);

  if (dates.length < 2) return 'one_time';

  // Calculate intervals between transactions
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const days = Math.abs(
      (new Date(dates[i].posted_at).getTime() -
        new Date(dates[i - 1].posted_at).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    intervals.push(days);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  if (avgInterval < 10) return 'weekly';
  if (avgInterval >= 10 && avgInterval < 40) return 'monthly';
  if (avgInterval >= 80 && avgInterval < 120) return 'quarterly';
  if (avgInterval >= 350 && avgInterval < 380) return 'annual';
  return 'irregular';
}
```

**Performance Optimization:**

Use materialized view for frequently queried stats:

```sql
-- Migration: Create materialized view for vendor stats
CREATE MATERIALIZED VIEW mv_vendor_transaction_stats AS
SELECT
  ba.company_id,
  bt.vendor_id,
  COUNT(*) as transaction_count,
  MAX(bt.posted_at) as last_seen_at,
  AVG(bt.amount) as avg_amount,
  STDDEV(bt.amount) as std_dev_amount,
  ARRAY_AGG(DISTINCT l.coa_id ORDER BY l.created_at DESC) FILTER (WHERE l.coa_id IS NOT NULL) as recent_coa_ids
FROM bank_transactions bt
JOIN bank_accounts ba ON bt.bank_account_id = ba.bank_account_id
LEFT JOIN ledgers l ON l.source_id = bt.bank_transaction_id AND l.source_type = 'bank_transaction'
WHERE bt.vendor_id IS NOT NULL
GROUP BY ba.company_id, bt.vendor_id;

CREATE UNIQUE INDEX idx_mv_vendor_stats_company_vendor
ON mv_vendor_transaction_stats(company_id, vendor_id);

-- Refresh nightly
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vendor_transaction_stats;
```

Then query becomes:

```typescript
const stats = await db('mv_vendor_transaction_stats')
  .where({ company_id: companyId, vendor_id: vendorId })
  .first();
```

**Performance:** ~2-5ms instead of ~50-100ms for complex aggregation.

---

### Step 5: Detect Pattern Signals

**Purpose:** Flag likely splits, tax, FX, prepayments before categorization logic runs.

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.signals.ts

interface PatternSignals {
  likely_split: boolean;
  likely_tax: boolean;
  likely_fx: boolean;
  likely_prepayment: boolean;
  is_recurring: boolean;
  anomaly_detected: boolean;
  notes: string[];
}

function detectPatterns(
  transaction: RawTransactionData,
  normalized: NormalizedData,
  historical: HistoricalFeatures,
  context: CompanyContext,
): PatternSignals {
  const signals: PatternSignals = {
    likely_split: false,
    likely_tax: false,
    likely_fx: false,
    likely_prepayment: false,
    is_recurring: false,
    anomaly_detected: false,
    notes: [],
  };

  // Detect splits
  if (detectSplitKeywords(normalized.description)) {
    signals.likely_split = true;
    signals.notes.push(
      'Description contains split keywords: "incl tax", "with VAT", "plus fee"',
    );
  }

  // Detect tax
  if (
    context.tax_settings.vat_registered &&
    detectVATAmount(transaction.amount, context.tax_settings.vat_rate)
  ) {
    signals.likely_tax = true;
    signals.notes.push(
      `Amount suggests ${context.tax_settings.vat_rate * 100}% VAT inclusion`,
    );
  }

  if (detectTaxKeywords(normalized.description)) {
    signals.likely_tax = true;
    signals.notes.push(
      'Description contains tax keywords: "VAT", "WHT", "tax"',
    );
  }

  // Detect FX
  if (transaction.currency_id !== context.reporting_currency_id) {
    signals.likely_fx = true;
    signals.notes.push(
      `Transaction currency (${transaction.currency_id}) differs from reporting currency`,
    );
  }

  // Detect prepayment
  if (
    detectPrepaymentPattern(
      transaction.amount,
      normalized.description,
      historical.typical_frequency,
    )
  ) {
    signals.likely_prepayment = true;
    signals.notes.push('Large amount + annual pattern suggests prepayment');
  }

  // Detect recurring
  if (
    ['weekly', 'monthly', 'quarterly', 'annual'].includes(
      historical.typical_frequency,
    )
  ) {
    signals.is_recurring = true;
    signals.notes.push(
      `Recurring pattern detected: ${historical.typical_frequency}`,
    );
  }

  // Detect anomalies
  if (historical.avg_amount && historical.std_dev_amount) {
    const zScore = Math.abs(
      (transaction.amount - historical.avg_amount) / historical.std_dev_amount,
    );
    if (zScore > 3) {
      signals.anomaly_detected = true;
      signals.notes.push(
        `Amount ${transaction.amount} is ${zScore.toFixed(1)} std devs from average ${historical.avg_amount}`,
      );
    }
  }

  return signals;
}

function detectSplitKeywords(description: string): boolean {
  const splitKeywords = [
    'INCL TAX',
    'WITH VAT',
    'PLUS TAX',
    'PLUS FEE',
    'INCLUDING',
    'TOTAL WITH',
    'GROSS AMOUNT',
  ];
  return splitKeywords.some((keyword) => description.includes(keyword));
}

function detectTaxKeywords(description: string): boolean {
  const taxKeywords = ['VAT', 'WHT', 'TAX', 'WITHHOLDING', 'SALES TAX'];
  return taxKeywords.some((keyword) => description.includes(keyword));
}

function detectVATAmount(amount: number, vatRate: number): boolean {
  if (vatRate === 0) return false;

  // Check if amount is likely VAT-inclusive
  // E.g., for 20% VAT, amount should be divisible by 1.20 to some precision
  const netAmount = amount / (1 + vatRate);
  const reconstructed = netAmount * (1 + vatRate);

  // Allow 1 cent rounding error
  return Math.abs(amount - reconstructed) < 0.01;
}

function detectPrepaymentPattern(
  amount: number,
  description: string,
  frequency: string,
): boolean {
  const prepaymentKeywords = ['ANNUAL', 'YEARLY', 'SUBSCRIPTION', 'INSURANCE'];
  const hasKeyword = prepaymentKeywords.some((keyword) =>
    description.includes(keyword),
  );
  const isLargeAmount = amount > 1000; // Threshold for considering prepayment
  const isAnnual = frequency === 'annual';

  return hasKeyword && isLargeAmount && isAnnual;
}
```

---

### Step 6: Build EnrichedTransaction Object

**Purpose:** Assemble all enriched data into final structured object.

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.types.ts

/**
 * EnrichedTransaction: Context-rich representation of a bank transaction
 *
 * IMPORTANT: This is a PURE FUNCTION OUTPUT - never persisted to database.
 * Computed on-demand for each categorization request to avoid data duplication and staleness.
 *
 * Purpose: Provides all necessary context for Rules Engine (Stage 2) and ML Layer (Stage 3)
 */
interface EnrichedTransaction {
  // Hard-coded to 1 for now; increment when schema changes
  version: number;

  // ============================================================================
  // IDS: Entity references for lookups and joins
  // ============================================================================
  ids: {
    bank_transaction_id: string; // FROM: bank_transactions.bank_transaction_id
    company_id: string; // FROM: bank_accounts.company_id (JOIN via bank_account_id)
    bank_account_id: string; // FROM: bank_transactions.bank_account_id
    provider_transaction_id: string | null; // FROM: bank_transactions.provider_transaction_id (Plaid/TrueLayer ID)
    vendor_id: string | null; // DERIVED: Lookup in companies_vendors or fuzzy match on description
  };

  // ============================================================================
  // RAW: Unmodified source data from bank provider
  // ============================================================================
  raw: {
    description: string; // FROM: bank_transactions.description (original, untouched)
    amount: number; // FROM: bank_transactions.amount (preserve sign)
    currency_id: string; // FROM: bank_transactions.currency_id
    posted_at: string; // FROM: bank_transactions.posted_at (ISO 8601 string)
    direction: 'inflow' | 'outflow'; // DERIVED: amount >= 0 ? 'inflow' : 'outflow'
    provider_data: Record<string, any>; // FROM: bank_transactions.provider_transaction_data (JSONB passthrough)
  };

  // ============================================================================
  // NORMALIZED: Cleaned data for consistent matching
  // ============================================================================
  normalized: {
    description: string; // DERIVED: UPPER(TRIM(REGEXP_REPLACE(raw.description, '\s+', ' ')))
    description_tokens: string[]; // DERIVED: Split on whitespace, remove stop words ["THE", "INC", "LLC"]
    vendor_name: string | null; // DERIVED: Extracted vendor name (from companies_vendors or NER parsing)
    counterparty_type: 'vendor' | 'customer' | 'employee' | 'unknown'; // DERIVED: Infer from direction + keywords
    inferred_category: string | null; // DERIVED: Best-guess category from keyword patterns (e.g., "SOFTWARE", "MEALS")
  };

  // ============================================================================
  // CONTEXT: Company-specific accounting settings (cached for performance)
  // ============================================================================
  context: {
    accounting_basis: 'modified_cash_basis' | 'modified_accrual_basis'; // FROM: companies.accounting_basis
    reporting_framework: 'ifrs' | 'us_gaap'; // FROM: companies.reporting_framework
    reporting_currency_id: string; // FROM: companies.reporting_currency_id
    fiscal_year_end: string; // FROM: companies.fiscal_year_end (MM-DD format, e.g., "12-31")
    industry: string; // FROM: companies.industry (e.g., "Technology", "Healthcare")
    country_code: string; // FROM: countries.code (JOIN via companies.country_id)
    bank_coa_account_id: string; // FROM: bank_accounts.coa_id (bank account's ledger account)
    coa_snapshot_version: string; // FROM: companies.coa_version or timestamp (for invalidation when COA changes)
    tax_settings: {
      vat_registered: boolean; // FROM: companies.vat_registered (or tax_settings table)
      vat_rate: number; // FROM: companies.default_vat_rate (e.g., 16 for 16%)
      wht_applicable: boolean; // FROM: companies.wht_applicable (withholding tax flag)
      wht_rate: number; // FROM: companies.default_wht_rate (e.g., 5 for 5%)
    };
  };

  // ============================================================================
  // HISTORICAL: Past transaction patterns for this vendor (for ML features)
  // ============================================================================
  historical: {
    vendor_usage_count: number; // FROM: COUNT(*) WHERE vendor_id = X AND company_id = Y
    last_seen_at: string | null; // FROM: MAX(posted_at) WHERE vendor_id = X
    last_categorized_accounts: string[]; // FROM: ledgers.coa_id WHERE source_id IN (past bank_transaction_ids with same vendor)
    avg_amount: number | null; // FROM: AVG(amount) WHERE vendor_id = X (for anomaly detection)
    std_dev_amount: number | null; // FROM: STDDEV(amount) WHERE vendor_id = X (for Z-score calculation)
    typical_frequency:
      | 'one_time'
      | 'weekly'
      | 'monthly'
      | 'quarterly'
      | 'annual'
      | 'irregular'; // DERIVED: Analyze date gaps between transactions
  };

  // ============================================================================
  // SIGNALS: Detected patterns requiring special treatment
  // ============================================================================
  signals: {
    likely_split: boolean; // DERIVED: Description has "incl", "with tax", "+" OR round amount + suspected tax
    likely_tax: boolean; // DERIVED: Keywords "VAT", "GST", "TAX" OR amount ~= prev_amount * tax_rate
    likely_fx: boolean; // DERIVED: currency_id != reporting_currency_id OR keywords "FX", "EXCHANGE"
    likely_prepayment: boolean; // DERIVED: Large amount + annual frequency + keywords "annual", "subscription"
    is_recurring: boolean; // DERIVED: vendor_usage_count > 3 AND typical_frequency != 'one_time'
    anomaly_detected: boolean; // DERIVED: |amount - avg_amount| / std_dev_amount > 3 (Z-score outlier)
    notes: string[]; // DERIVED: Human-readable explanations ["New vendor", "Unusually large amount"]
  };
  // ============================================================================
  // TEMPORAL: Time-based features for seasonality and period-close logic
  // ============================================================================
  temporal: {
    day_of_week: number; // 0=Sunday .. 6=Saturday
    day_of_month: number; // 1-31
    calendar_month: number; // 1-12
    calendar_quarter: number; // 1-4
    fiscal_month: number; // 1-12 relative to fiscal year
    fiscal_quarter: number; // 1-4 relative to fiscal year
    is_month_end: boolean; // true when txn date == fiscal period month_end
    is_year_end: boolean; // true when txn date == fiscal year_end
    fiscal_period: {
      year_start: string; // YYYY-MM-DD
      year_end: string; // YYYY-MM-DD
      quarter_start: string; // YYYY-MM-DD
      quarter_end: string; // YYYY-MM-DD
      month_start: string; // YYYY-MM-DD
      month_end: string; // YYYY-MM-DD
    };
  };

  // ============================================================================
  // METADATA: Processing info for debugging and monitoring
  // ============================================================================
  metadata: {
    source: 'ingestion' | 'backfill' | 'manual';
    enriched_at: string; // ISO timestamp
    enrichment_latency_ms: number; // Wall-clock duration
    enrichment_version: string; // Semantic version
    status: 'enriched' | 'partial' | 'error';
    error_message: string | null;
    processing_context?: 'primary' | 'shadow';
    stats_replay_seq?: number; // >0 when replay rebuilt stats
    stats_snapshot_checksum?: string; // Hash of historical snapshot payload
  };
}

// apps/api/src/domains/categorization/enrichment.service.ts

async function buildEnrichedTransaction(
  raw: RawTransactionData,
  normalized: NormalizedData,
  context: CompanyContext,
  historical: HistoricalFeatures,
  signals: PatternSignals,
): Promise<EnrichedTransaction> {
  const startTime = Date.now();

  const postedDate = new Date(raw.posted_at);
  const fiscalYearEnd = new Date(context.fiscal_year_end);

  const enriched: EnrichedTransaction = {
    version: 1,

    ids: {
      bank_transaction_id: raw.bank_transaction_id,
      company_id: raw.company_id,
      bank_account_id: raw.bank_account_id,
      provider_transaction_id:
        raw.provider_transaction_data?.transaction_id || null,
      vendor_id: normalized.vendorId,
    },

    raw: {
      description: raw.description,
      amount: raw.amount,
      currency_id: raw.currency_id,
      posted_at: raw.posted_at,
      direction: raw.amount >= 0 ? 'inflow' : 'outflow',
      provider_data: raw.provider_transaction_data || {},
    },

    normalized: {
      description: normalized.description,
      description_tokens: normalized.descriptionTokens,
      vendor_name: normalized.vendorName,
      counterparty_type: normalized.counterpartyType,
      inferred_category: normalized.inferredCategory,
    },

    context: {
      accounting_basis: context.accounting_basis,
      reporting_framework: context.reporting_framework,
      reporting_currency_id: context.reporting_currency_id,
      fiscal_year_end: context.fiscal_year_end,
      industry: context.industry,
      country_code: context.country_code,
      bank_coa_account_id: raw.bank_coa_id,
      coa_snapshot_version: context.coa_snapshot_version,
      tax_settings: context.tax_settings,
    },

    historical: {
      vendor_usage_count: historical.vendor_usage_count,
      last_seen_at: historical.last_seen_at,
      last_categorized_accounts: historical.last_categorized_accounts,
      avg_amount: historical.avg_amount,
      std_dev_amount: historical.std_dev_amount,
      typical_frequency: historical.typical_frequency,
    },

    signals,

    temporal: {
      day_of_week: postedDate.getDay(),
      day_of_month: postedDate.getDate(),
      month: postedDate.getMonth() + 1,
      quarter: Math.floor(postedDate.getMonth() / 3) + 1,
      is_month_end: isLastDayOfMonth(postedDate),
      is_quarter_end: isLastDayOfQuarter(postedDate),
      is_year_end:
        postedDate.getMonth() === fiscalYearEnd.getMonth() &&
        postedDate.getDate() === fiscalYearEnd.getDate(),
      days_to_period_close: calculateDaysToPeriodClose(
        postedDate,
        fiscalYearEnd,
      ),
    },

    metadata: {
      enriched_at: new Date().toISOString(),
      enrichment_latency_ms: Date.now() - startTime,
      enrichment_version: process.env.GIT_COMMIT || 'dev',
      status: 'enriched',
      error_message: null,
    },
  };

  return enriched;
}
```

---

### Step 7: Return Enriched Transaction (Pure Function)

**Purpose:** Return the computed `EnrichedTransaction` object for immediate use by downstream stages.

**Design Decision:** EnrichedTransaction is **NOT persisted** to avoid:

- Data duplication (all fields are derivable from existing tables)
- Storage bloat (30+ fields × millions of transactions)
- Cache staleness (if source data changes, enriched cache becomes invalid)

**Implementation:**

```typescript
// apps/api/src/domains/categorization/enrichment.service.ts

/**
 * Pure function: Enriches a bank transaction with context, features, and signals
 *
 * @param bankTransactionId - The bank transaction to enrich
 * @returns EnrichedTransaction object (in-memory only, not persisted)
 */
export async function enrichTransaction(
  bankTransactionId: string,
): Promise<EnrichedTransaction> {
  const startTime = performance.now();

  try {
    // Step 1: Load base data
    const raw = await loadBaseTransaction(bankTransactionId);

    // Step 2: Normalize & extract
    const normalized = await normalizeAndExtract(raw);

    // Step 3: Load company context (cached)
    const context = await getCompanyContext(raw.company_id);

    // Step 4: Compute historical features
    const historical = await computeHistoricalFeatures(
      normalized.vendorId,
      raw.company_id,
      raw.description,
    );

    // Step 5: Detect patterns
    const signals = detectPatterns(raw, normalized, historical, context);

    // Step 6: Build enriched object
    const enriched = await buildEnrichedTransaction(
      raw,
      normalized,
      context,
      historical,
      signals,
    );

    // Track metrics
    const latency = performance.now() - startTime;
    metrics.histogram('categorization.enrichment.latency_ms', latency);
    metrics.increment('categorization.enrichment.success');

    return enriched;
  } catch (error) {
    metrics.increment('categorization.enrichment.error', {
      error_type: error.constructor.name,
    });

    logger.error('Enrichment failed', {
      bank_transaction_id: bankTransactionId,
      error: error.message,
      stack: error.stack,
    });

    // Return partial enrichment or throw based on severity
    if (error instanceof NonFatalEnrichmentError) {
      return error.partialEnrichment; // Return what we have
    }

    throw error; // Fatal error, let BullMQ retry
  }
}
```

**Usage in Categorization Pipeline:**

```typescript
// apps/api/src/domains/categorization/categorization.worker.ts

import Queue from 'bullmq';

const categorizationQueue = new Queue('categorization', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
});

categorizationQueue.process(async (job) => {
  const { bank_transaction_id } = job.data;

  // Stage 1: Enrich (pure function, no persistence)
  const enriched = await enrichTransaction(bank_transaction_id);

  // Stage 2: Rules
  const ruleCandidates = await evaluateRules(enriched);

  // Stage 3: ML (if rules didn't match)
  const mlCandidates =
    ruleCandidates.length === 0 ? await runMLInference(enriched) : [];

  // Stage 4: Synthesize & Rank
  const ranked = await rankCandidates([...ruleCandidates, ...mlCandidates]);

  // Stage 5: Validate
  const validated = await validateCandidate(ranked[0]);

  // Stage 6: Present (persist final candidate only)
  await presentSuggestion(bank_transaction_id, validated);
});
```

---

## 1.5 Database Schema for Stage 1

**Design Decision:** We do **NOT** create a `categorization_tasks` table for storing enriched transactions.

**Rationale:**

1. **EnrichedTransaction is ephemeral** - computed on-demand, not state that needs persistence
2. **BullMQ provides job tracking** - handles idempotency, retries, and status
3. **Avoid data duplication** - all enriched fields are derivable from existing tables
4. **Reduce DB bloat** - millions of JSONB objects with 30+ fields each

**What we DO persist:**

### Option A: Store ONLY final candidates (recommended)

Final categorization suggestions are stored in the existing `ledgers` table with `status = 'suggested'`:

```sql
-- No schema changes needed! Use existing ledgers table:
-- INSERT INTO ledgers (source_type, source_id, coa_id, amount, direction, status, metadata)
-- VALUES ('bank_transaction', '...', '...', 100, 'DEBIT', 'suggested', '{"confidence": 0.95, "source": "UserRule"}')
```

### Option B: Minimal workflow tracking (if needed later)

If we need operational visibility (e.g., "how many transactions are stuck in categorization?"), add a lightweight tasks table **without storing enriched data**:

```sql
CREATE TABLE categorization_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id UUID NOT NULL UNIQUE REFERENCES bank_transactions(bank_transaction_id) ON DELETE CASCADE,

  -- Workflow state only (no data payload)
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'categorized', 'posted'
  current_stage INTEGER DEFAULT 1, -- 1=Enrich, 2=Rules, 3=ML, 4=Synthesis, 5=Validate, 6=Present

  -- Retry & error tracking
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categorization_tasks_status ON categorization_tasks(status) WHERE status = 'pending';
```

**When to use Option B:**

- Users need real-time progress indicators ("Categorizing... Stage 2/6")
- We need operational metrics ("10% of tasks failing at Stage 3")
- We implement partial failure recovery (retry from Stage N, not Stage 1)

**Start with Option A.** Only add Option B if user feedback or ops requirements demand it.

---

## 1.6 Performance & Scalability

### Performance Targets

| Metric                   | Target       | Notes                         |
| ------------------------ | ------------ | ----------------------------- |
| Enrichment latency (p50) | <300ms       | Typical case with warm cache  |
| Enrichment latency (p95) | <500ms       | Cold cache or complex queries |
| Enrichment latency (p99) | <1000ms      | Worst case                    |
| Cache hit rate           | >90%         | Company context cache         |
| Throughput               | 100 txns/sec | Single worker instance        |
| Error rate               | <0.1%        | Retry-able errors excluded    |

### Optimization Strategies

**1. Caching (Already Implemented)**

- Local in-memory cache (1 hour TTL)
- Redis cache (1 hour TTL)
- Database as last resort

**2. Batching**

```typescript
// Process multiple transactions in batch
async function enrichBatch(
  bankTransactionIds: string[],
): Promise<EnrichedTransaction[]> {
  // Load all transactions in single query
  const rawTransactions = await db('bank_transactions')
    .whereIn('bank_transaction_id', bankTransactionIds)
    .join(/* ... */);

  // Group by company to batch context loading
  const byCompany = groupBy(rawTransactions, 'company_id');

  const results: EnrichedTransaction[] = [];

  for (const [companyId, transactions] of Object.entries(byCompany)) {
    // Load context once per company
    const context = await getCompanyContext(companyId);

    // Process all transactions for this company
    for (const txn of transactions) {
      const enriched = await enrichSingle(txn, context);
      results.push(enriched);
    }
  }

  return results;
}
```

**3. Materialized Views**

Already implemented for `mv_vendor_transaction_stats`. Refresh nightly:

```typescript
// apps/api/src/jobs/scheduled/refresh-materialized-views.ts

import { scheduleJob } from 'node-schedule';

scheduleJob('0 2 * * *', async () => {
  // 2 AM daily
  await db.raw(
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vendor_transaction_stats',
  );
  logger.info('Refreshed mv_vendor_transaction_stats');
});
```

**4. Async Processing**

Enrichment runs in BullMQ worker, not blocking API response:

```
User/System triggers ingestion
  → API returns 201 Created immediately
    → BullMQ enqueues enrichment job
      → Worker processes in background
        → Emits event when done
```

**5. Horizontal Scaling**

Multiple worker instances can process jobs in parallel:

```bash
# Start 4 worker instances
node dist/workers/categorization-enrichment.worker.js &
node dist/workers/categorization-enrichment.worker.js &
node dist/workers/categorization-enrichment.worker.js &
node dist/workers/categorization-enrichment.worker.js &
```

BullMQ distributes jobs across workers automatically.

---

## 1.7 Error Handling & Resilience

### Retry Strategy

**BullMQ Configuration:**

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000 // Start at 2 seconds, double each retry
  }
}
```

**Retry Schedule:**

- Attempt 1: Immediate
- Attempt 2: After 2 seconds
- Attempt 3: After 4 seconds
- Attempt 4: After 8 seconds (then fail)

### Error Categories

| Error Type               | Retry? | Action                       |
| ------------------------ | ------ | ---------------------------- |
| Database connection lost | Yes    | Retry with backoff           |
| Vendor extraction failed | No     | Continue with null vendor    |
| Cache unavailable        | Yes    | Fall back to DB              |
| Context query timeout    | Yes    | Retry with increased timeout |
| Invalid transaction data | No     | Flag for manual review       |
| Concurrent modification  | Yes    | Retry with fresh data        |

### Partial Enrichment

If some steps fail but others succeed, save partial enrichment:

```typescript
try {
  // Attempt full enrichment
  const enriched = await enrich(bankTransactionId);
} catch (error) {
  if (error instanceof PartialEnrichmentError) {
    // Save what we got
    await db('categorization_tasks').insert({
      bank_transaction_id: bankTransactionId,
      enriched_transaction: error.partialData,
      enrichment_status: 'partial',
      enrichment_error: error.message,
    });
  }
}
```

Downstream stages can still use partial data (e.g., missing historical features but have normalized description).

---

## 1.8 Monitoring & Observability

### Metrics to Track

```typescript
// apps/api/src/domains/categorization/enrichment.metrics.ts

import { metrics } from '../../lib/metrics';

export const enrichmentMetrics = {
  // Latency
  recordLatency: (ms: number) => {
    metrics.histogram('categorization.enrichment.latency_ms', ms);
  },

  // Success/failure rates
  recordSuccess: () => {
    metrics.increment('categorization.enrichment.success');
  },

  recordError: (errorType: string) => {
    metrics.increment('categorization.enrichment.error', {
      error_type: errorType,
    });
  },

  // Cache performance
  recordCacheHit: (layer: 'local' | 'redis') => {
    metrics.increment('categorization.enrichment.cache_hit', { layer });
  },

  recordCacheMiss: () => {
    metrics.increment('categorization.enrichment.cache_miss');
  },

  // Data quality
  recordVendorExtracted: (method: 'exact' | 'fuzzy' | 'ner' | 'none') => {
    metrics.increment('categorization.enrichment.vendor_extraction', {
      method,
    });
  },

  recordSignalDetection: (signal: string) => {
    metrics.increment('categorization.enrichment.signal_detected', { signal });
  },
};
```

### Logging Structure

```typescript
import { logger } from '../../lib/logger';

logger.info('Enrichment started', {
  bank_transaction_id: bankTransactionId,
  company_id: companyId,
  trace_id: req.traceId,
});

logger.info('Enrichment completed', {
  bank_transaction_id: bankTransactionId,
  company_id: companyId,
  trace_id: req.traceId,
  latency_ms: enriched.metadata.enrichment_latency_ms,
  vendor_extracted: !!enriched.ids.vendor_id,
  signals_detected: enriched.signals.notes.length,
  cache_hit: cacheHit,
});
```

### Dashboards (Grafana)

**Panel 1: Enrichment Throughput**

```promql
rate(categorization_enrichment_success_total[5m])
```

**Panel 2: Latency Percentiles**

```promql
histogram_quantile(0.50, categorization_enrichment_latency_ms_bucket)  # p50
histogram_quantile(0.95, categorization_enrichment_latency_ms_bucket)  # p95
histogram_quantile(0.99, categorization_enrichment_latency_ms_bucket)  # p99
```

**Panel 3: Error Rate**

```promql
rate(categorization_enrichment_error_total[5m])
```

**Panel 4: Cache Hit Rate**

```promql
sum(rate(categorization_enrichment_cache_hit_total[5m])) /
(sum(rate(categorization_enrichment_cache_hit_total[5m])) + sum(rate(categorization_enrichment_cache_miss_total[5m])))
```

---

## 1.9 Testing Strategy

### Unit Tests

```typescript
// apps/api/src/domains/categorization/__tests__/enrichment.service.test.ts

describe('Enrichment Service', () => {
  describe('normalizeDescription', () => {
    it('should trim and uppercase description', () => {
      const result = normalizeDescription('  payment to AWS  ');
      expect(result).toBe('PAYMENT TO AWS');
    });

    it('should collapse whitespace', () => {
      const result = normalizeDescription('PAYMENT    TO    AWS');
      expect(result).toBe('PAYMENT TO AWS');
    });
  });

  describe('extractVendor', () => {
    it('should find exact match', async () => {
      // Mock database
      db.mockResolvedValueOnce([{ vendor_id: '123', vendor_name: 'AWS' }]);

      const result = await extractVendor('AWS', 'company-1');
      expect(result.vendorId).toBe('123');
    });

    it('should find fuzzy match', async () => {
      db.mockResolvedValueOnce([]) // No exact match
        .mockResolvedValueOnce([
          { vendor_id: '456', vendor_name: 'AMAZON WEB SERVICES' },
        ]);

      const result = await extractVendor('AWS', 'company-1');
      expect(result.vendorId).toBe('456');
    });
  });

  describe('detectPatterns', () => {
    it('should detect VAT inclusion', () => {
      const signals = detectPatterns(
        { amount: 120, currency_id: 'GBP' },
        { description: 'PURCHASE WITH VAT' },
        {},
        { tax_settings: { vat_registered: true, vat_rate: 0.2 } },
      );

      expect(signals.likely_tax).toBe(true);
      expect(signals.notes).toContain('Amount suggests 20% VAT inclusion');
    });
  });
});
```

### Integration Tests

```typescript
describe('Enrichment Integration', () => {
  it('should enrich transaction end-to-end', async () => {
    // Setup: Create test transaction
    const txn = await db('bank_transactions')
      .insert({
        description: 'PAYMENT TO AWS',
        amount: -250.0,
        bank_account_id: testBankAccount.bank_account_id,
        posted_at: '2025-01-15',
      })
      .returning('*')
      .then((rows) => rows[0]);

    // Execute
    const enriched = await enrichmentService.enrich(txn.bank_transaction_id);

    // Assert
    expect(enriched.version).toBe(1);
    expect(enriched.normalized.description).toBe('PAYMENT TO AWS');
    expect(enriched.ids.vendor_id).toBeTruthy();
    expect(enriched.context.accounting_basis).toBe('modified_accrual_basis');
    expect(enriched.metadata.status).toBe('enriched');
  });

  it('should cache company context', async () => {
    const spy = jest.spyOn(db, 'select');

    // First call: cache miss
    await getCompanyContext('company-1');
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call: cache hit
    await getCompanyContext('company-1');
    expect(spy).toHaveBeenCalledTimes(1); // No additional DB call
  });
});
```

### Load Tests

```typescript
// apps/api/src/domains/categorization/__tests__/enrichment.load.test.ts

import { performance } from 'perf_hooks';

describe('Enrichment Load Tests', () => {
  it('should process 100 transactions within 30 seconds', async () => {
    const txnIds = Array.from({ length: 100 }, () => generateTestTransaction());

    const start = performance.now();
    await Promise.all(txnIds.map((id) => enrichmentService.enrich(id)));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(30000); // 30 seconds
  });

  it('should maintain p95 latency under 500ms', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 100; i++) {
      const txnId = generateTestTransaction();
      const start = performance.now();
      await enrichmentService.enrich(txnId);
      latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    expect(p95).toBeLessThan(500);
  });
});
```

---

## 1.10 Stage 1 Deliverables & Success Criteria

### Deliverables

- [ ] `enrichment.service.ts` - Main enrichment orchestration
- [ ] `enrichment.worker.ts` - BullMQ worker process
- [ ] `enrichment.cache.ts` - Company context caching
- [ ] `enrichment.parsers.ts` - Text normalization, entity extraction
- [ ] `enrichment.features.ts` - Historical feature computation
- [ ] `enrichment.signals.ts` - Pattern detection
- [ ] `enrichment.types.ts` - TypeScript interfaces
- [ ] Migration for `categorization_tasks` table
- [ ] Migration for `mv_vendor_transaction_stats` materialized view
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] Load tests
- [ ] Monitoring dashboards
- [ ] Documentation

### Success Criteria

| Criterion                   | Target        | Measurement                  |
| --------------------------- | ------------- | ---------------------------- |
| **Performance**             |               |                              |
| Enrichment latency (p95)    | <500ms        | Prometheus metrics           |
| Throughput                  | >100 txns/sec | Load tests                   |
| Cache hit rate              | >90%          | Metrics dashboard            |
| **Quality**                 |               |                              |
| Vendor extraction accuracy  | >85%          | Manual review of 100 samples |
| Pattern detection precision | >90%          | Confusion matrix on test set |
| Error rate                  | <0.1%         | Error logs                   |
| **Operations**              |               |                              |
| Worker uptime               | >99.9%        | Monitoring alerts            |
| Failed job retry success    | >95%          | BullMQ dashboard             |
| **Testing**                 |               |                              |
| Unit test coverage          | >80%          | Jest coverage report         |
| Integration tests passing   | 100%          | CI/CD pipeline               |
| Load tests passing          | 100%          | CI/CD pipeline               |

---

This completes the comprehensive implementation plan for **Stage 1: Data Ingestion & Enrichment**.

The next stages (2-6) will consume the `EnrichedTransaction` object produced by Stage 1, ensuring clean separation of concerns and optimal performance.

---

# STAGE 2: Deterministic Rules Engine

## 2.1 Purpose

The Deterministic Rules Engine provides **speed, certainty, and direct user control** over transaction categorization. It executes explicitly defined logic to generate high-confidence journal entry candidates **before** attempting any probabilistic machine learning methods.

### Key Objectives

1. **Immediate Certainty**: For transactions matching user-defined rules, provide instant, 100% confidence categorizations
2. **User Control**: Allow companies to codify their unique accounting practices and vendor relationships
3. **Explainability**: Every rule-based suggestion is fully traceable to the specific rule that triggered it
4. **Layered Priority**: Support hierarchical rule evaluation (user → company → firm → system) with configurable priority
5. **Complex Scenarios**: Handle splits, tax calculations, FX conversions, and multi-leg entries declaratively
6. **Rapid Iteration**: Enable accountants to create/modify rules without code changes

### Why Rules Before ML?

- **Speed**: Rules execute in <10ms vs ML inference at ~50-200ms
- **Accuracy**: For known patterns, explicit logic is 100% reliable
- **Transparency**: Users understand "why" without black-box explanations
- **Control**: Companies maintain sovereignty over their accounting logic
- **Training Signal**: Rule outcomes become high-quality training data for ML

---

## 2.2 When Does Stage 2 Happen?

### Trigger: Immediately After Stage 1 Enrichment

**Event Flow:**

```
Stage 1: enrichmentService.enrich(bank_transaction_id)
  → Persist EnrichedTransaction to categorization_tasks table
    → Emit event: { type: 'transaction.enriched', data: { bank_transaction_id, task_id } }
      → BullMQ Queue: 'categorization-rules'
        → rulesWorker.ts processes job
          → rulesService.evaluate(task_id)
```

**Timing:**

- **Latency Target**: <50ms (p95)
- **Mode**: Synchronous within categorization pipeline (async from user perspective)
- **Parallelism**: Can run concurrently with Stage 3 (ML) in "shadow mode" for learning

### Three Execution Modes

#### Mode 1: Standard (Default)

- Stage 2 runs first
- If rule matches → Stage 3 skipped
- If no match → Stage 3 (ML) runs

#### Mode 2: Shadow Inference (Learning Mode)

- Stage 2 and Stage 3 run in parallel
- Rule result shown to user
- ML result logged for comparison and training
- Enables ML to learn from rule-based decisions

#### Mode 3: Manual Re-evaluation

- Endpoint: `POST /api/categorization/rules/evaluate/:task_id`
- Used when user updates rules and wants to re-categorize historical transactions

---

## 2.3 Where Does Stage 2 Happen?

### File Structure

```
apps/api/src/domains/categorization/
├── rules.service.ts          # Main orchestration: rule loading, evaluation, candidate generation
├── rules.worker.ts           # BullMQ worker for async rule processing
├── rules.engine.ts           # Core evaluation logic: condition matching, action execution
├── rules.conditions.ts       # Condition evaluators (CONTAINS, EQUALS, GREATER_THAN, etc.)
├── rules.actions.ts          # Action executors (CREATE_JOURNAL, APPLY_SPLIT, etc.)
├── rules.priorities.ts       # Priority resolution across rule layers
├── rules.cache.ts            # Rule caching per company
├── rules.types.ts            # TypeScript interfaces
├── rules.system-packs.ts     # Pre-built system/industry rule packs
└── rules.test.ts             # Unit tests

apps/api/src/domains/categorization/rules-ui/
├── rules-api.controller.ts   # REST endpoints for rule CRUD
├── rules-validation.ts       # Schema validation for user-created rules
└── rules-templates.ts        # Pre-built rule templates for users
```

### Database Tables

**Primary Table: `categorization_rules`**

```sql
CREATE TABLE categorization_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership & Scope
  company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
  firm_id UUID REFERENCES firms(firm_id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(user_id),

  -- Rule Metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  layer VARCHAR(50) NOT NULL CHECK (layer IN ('system', 'firm', 'company', 'user')),
  priority INTEGER NOT NULL DEFAULT 100,  -- Lower number = higher priority

  -- Rule Logic (JSONB for flexibility)
  conditions JSONB NOT NULL,  -- The "IF" logic
  actions JSONB NOT NULL,     -- The "THEN" logic

  -- State & Control
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,  -- System rules cannot be deleted by users

  -- Usage Tracking
  match_count INTEGER DEFAULT 0,
  last_matched_at TIMESTAMPTZ,

  -- Versioning
  version INTEGER DEFAULT 1,
  parent_rule_id UUID REFERENCES categorization_rules(rule_id),  -- For rule history

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_categorization_rules_company_active
  ON categorization_rules(company_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_categorization_rules_priority
  ON categorization_rules(company_id, layer, priority)
  WHERE is_active = true AND deleted_at IS NULL;
```

**Tracking Table: `categorization_rule_matches`**

```sql
CREATE TABLE categorization_rule_matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES categorization_tasks(task_id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES categorization_rules(rule_id) ON DELETE SET NULL,
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(bank_transaction_id) ON DELETE CASCADE,

  -- Match Details
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence DECIMAL(5,4) DEFAULT 1.0,  -- Always 1.0 for deterministic rules

  -- User Feedback (for learning)
  user_accepted BOOLEAN,  -- Did user accept this suggestion?
  user_modified BOOLEAN,  -- Did user edit before accepting?
  user_feedback_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_matches_task ON categorization_rule_matches(task_id);
CREATE INDEX idx_rule_matches_rule ON categorization_rule_matches(rule_id);
```

---

## 2.4 How Does Stage 2 Happen?

### Step 1: Load Active Rules for Company

The rules engine first fetches all applicable rules for the transaction's company, ordered by priority.

```typescript
// apps/api/src/domains/categorization/rules.cache.ts

import NodeCache from 'node-cache';
import { Redis } from 'ioredis';

const localRuleCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes
const redisClient = new Redis(process.env.REDIS_URL);

interface Rule {
  rule_id: string;
  name: string;
  layer: 'system' | 'firm' | 'company' | 'user';
  priority: number;
  conditions: RuleConditions;
  actions: RuleActions;
  is_active: boolean;
}

interface RuleConditions {
  operator: 'AND' | 'OR'; // How to combine multiple conditions
  conditions: Condition[];
}

interface Condition {
  field: string; // e.g., "normalized.description", "raw.amount"
  operator: ConditionOperator; // e.g., "CONTAINS", "EQUALS", "GREATER_THAN"
  value: any; // e.g., "AWS", 1000
  case_sensitive?: boolean; // For string comparisons
  negate?: boolean; // For NOT conditions
}

type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'
  | 'IN'
  | 'NOT_IN'
  | 'IS_NULL'
  | 'IS_NOT_NULL'
  | 'REGEX_MATCH'
  | 'DATE_BETWEEN';

interface RuleActions {
  action_type: 'CREATE_JOURNAL' | 'APPLY_SPLIT' | 'DEFER_TO_ML';
  journal_entries?: JournalEntryTemplate[];
  split_strategy?: SplitStrategy;
}

interface JournalEntryTemplate {
  coa_id?: string; // Can be explicit or computed
  coa_selector?: {
    // Alternative: select account dynamically
    type: 'VENDOR_DEFAULT' | 'INDUSTRY_STANDARD' | 'QUERY';
    params?: Record<string, any>;
  };
  direction: 'DEBIT' | 'CREDIT';
  amount: AmountStrategy;
  memo?: string; // Template string with variables
  tax_code?: string;
  tracking_categories?: Record<string, string>;
}

interface AmountStrategy {
  type: 'PERCENTAGE' | 'FIXED' | 'CALCULATED';
  value?: number; // For PERCENTAGE (0-100) or FIXED
  formula?: string; // For CALCULATED: e.g., "raw.amount * 0.16" (for VAT)
}

async function getCompanyRules(companyId: string): Promise<Rule[]> {
  const cacheKey = `rules:company:${companyId}`;

  // Level 1: Local cache
  const localCached = localRuleCache.get<Rule[]>(cacheKey);
  if (localCached) return localCached;

  // Level 2: Redis cache
  const redisCached = await redisClient.get(cacheKey);
  if (redisCached) {
    const rules = JSON.parse(redisCached);
    localRuleCache.set(cacheKey, rules);
    return rules;
  }

  // Level 3: Database query
  const rules = await db('categorization_rules')
    .where({ company_id: companyId, is_active: true })
    .whereNull('deleted_at')
    .orderBy([
      { column: 'layer', order: 'asc' }, // system < firm < company < user
      { column: 'priority', order: 'asc' }, // Lower number runs first
    ])
    .select('*');

  // Cache results
  await redisClient.setex(cacheKey, 1800, JSON.stringify(rules));
  localRuleCache.set(cacheKey, rules);

  return rules;
}

// Invalidate cache when rules are updated
export async function invalidateRuleCache(companyId: string): Promise<void> {
  const cacheKey = `rules:company:${companyId}`;
  localRuleCache.del(cacheKey);
  await redisClient.del(cacheKey);
}
```

---

### Step 2: Evaluate Conditions Against EnrichedTransaction

For each rule, the engine evaluates its conditions against the enriched transaction data.

```typescript
// apps/api/src/domains/categorization/rules.conditions.ts

import { get } from 'lodash'; // For safe nested property access

export class ConditionEvaluator {
  /**
   * Evaluate a single condition against enriched transaction data
   */
  static evaluate(
    condition: Condition,
    enrichedTxn: EnrichedTransaction,
  ): boolean {
    // Extract the field value from enriched transaction
    const fieldValue = get(enrichedTxn, condition.field);

    // Evaluate based on operator
    let result = this.evaluateOperator(
      condition.operator,
      fieldValue,
      condition.value,
      condition.case_sensitive,
    );

    // Apply negation if specified
    if (condition.negate) {
      result = !result;
    }

    return result;
  }

  /**
   * Evaluate complex condition groups (AND/OR)
   */
  static evaluateGroup(
    ruleConditions: RuleConditions,
    enrichedTxn: EnrichedTransaction,
  ): boolean {
    const results = ruleConditions.conditions.map((cond) =>
      this.evaluate(cond, enrichedTxn),
    );

    if (ruleConditions.operator === 'AND') {
      return results.every((r) => r === true);
    } else {
      return results.some((r) => r === true);
    }
  }

  /**
   * Operator-specific evaluation logic
   */
  private static evaluateOperator(
    operator: ConditionOperator,
    fieldValue: any,
    conditionValue: any,
    caseSensitive: boolean = false,
  ): boolean {
    // Handle null checks first
    if (operator === 'IS_NULL') return fieldValue == null;
    if (operator === 'IS_NOT_NULL') return fieldValue != null;

    // If field is null for other operators, return false
    if (fieldValue == null) return false;

    switch (operator) {
      case 'EQUALS':
        return caseSensitive
          ? fieldValue === conditionValue
          : String(fieldValue).toLowerCase() ===
              String(conditionValue).toLowerCase();

      case 'NOT_EQUALS':
        return caseSensitive
          ? fieldValue !== conditionValue
          : String(fieldValue).toLowerCase() !==
              String(conditionValue).toLowerCase();

      case 'CONTAINS':
        return caseSensitive
          ? String(fieldValue).includes(String(conditionValue))
          : String(fieldValue)
              .toLowerCase()
              .includes(String(conditionValue).toLowerCase());

      case 'NOT_CONTAINS':
        return caseSensitive
          ? !String(fieldValue).includes(String(conditionValue))
          : !String(fieldValue)
              .toLowerCase()
              .includes(String(conditionValue).toLowerCase());

      case 'STARTS_WITH':
        return caseSensitive
          ? String(fieldValue).startsWith(String(conditionValue))
          : String(fieldValue)
              .toLowerCase()
              .startsWith(String(conditionValue).toLowerCase());

      case 'ENDS_WITH':
        return caseSensitive
          ? String(fieldValue).endsWith(String(conditionValue))
          : String(fieldValue)
              .toLowerCase()
              .endsWith(String(conditionValue).toLowerCase());

      case 'GREATER_THAN':
        return Number(fieldValue) > Number(conditionValue);

      case 'LESS_THAN':
        return Number(fieldValue) < Number(conditionValue);

      case 'GREATER_THAN_OR_EQUAL':
        return Number(fieldValue) >= Number(conditionValue);

      case 'LESS_THAN_OR_EQUAL':
        return Number(fieldValue) <= Number(conditionValue);

      case 'IN':
        return (
          Array.isArray(conditionValue) && conditionValue.includes(fieldValue)
        );

      case 'NOT_IN':
        return (
          Array.isArray(conditionValue) && !conditionValue.includes(fieldValue)
        );

      case 'REGEX_MATCH':
        const regex = new RegExp(conditionValue, caseSensitive ? '' : 'i');
        return regex.test(String(fieldValue));

      case 'DATE_BETWEEN':
        const date = new Date(fieldValue);
        const [start, end] = conditionValue; // Expected: [startDate, endDate]
        return date >= new Date(start) && date <= new Date(end);

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }
}
```

**Example Condition Evaluation:**

```typescript
// Rule: "If description contains 'AWS' and amount > 100, categorize as Cloud Hosting"

const rule: Rule = {
  rule_id: 'rule-123',
  name: 'AWS Cloud Expenses',
  conditions: {
    operator: 'AND',
    conditions: [
      {
        field: 'normalized.description',
        operator: 'CONTAINS',
        value: 'AWS',
        case_sensitive: false,
      },
      {
        field: 'raw.amount',
        operator: 'GREATER_THAN',
        value: 100,
      },
    ],
  },
  actions: {
    /* ... */
  },
};

const enrichedTxn: EnrichedTransaction = {
  normalized: { description: 'AWS WEB SERVICES' },
  raw: { amount: 250.0 },
  // ...
};

const matches = ConditionEvaluator.evaluateGroup(rule.conditions, enrichedTxn);
// Result: true (both conditions match)
```

---

### Step 3: Execute Actions for Matched Rule

When a rule's conditions match, the engine executes its actions to generate a `LedgerEntryCandidate`.

```typescript
// apps/api/src/domains/categorization/rules.actions.ts

interface LedgerEntryCandidate {
  candidate_id: string;
  source: 'UserRule' | 'CompanyRule' | 'FirmRule' | 'SystemRule';
  source_id: string; // rule_id
  confidence: number; // Always 1.0 for rules
  explanation: string;

  journal_entries: LedgerEntry[];

  metadata: {
    rule_name: string;
    rule_layer: string;
    matched_conditions: string[];
    generation_latency_ms: number;
  };
}

interface LedgerEntry {
  coa_id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  currency_id: string;
  memo?: string;
  tax_code?: string;
  tracking_categories?: Record<string, string>;
}

export class ActionExecutor {
  /**
   * Execute rule actions to generate journal entry candidate
   */
  static async execute(
    rule: Rule,
    enrichedTxn: EnrichedTransaction,
    companyContext: CompanyContext,
  ): Promise<LedgerEntryCandidate> {
    const startTime = performance.now();

    const journalEntries: LedgerEntry[] = [];

    // Execute each entry template in the rule
    for (const template of rule.actions.journal_entries) {
      const entry = await this.processEntryTemplate(
        template,
        enrichedTxn,
        companyContext,
      );
      journalEntries.push(entry);
    }

    // Validate balance (debits must equal credits)
    this.validateBalance(journalEntries);

    // Generate explanation
    const explanation = this.generateExplanation(rule, enrichedTxn);

    return {
      candidate_id: `candidate-${Date.now()}-${Math.random().toString(36)}`,
      source: this.mapLayerToSource(rule.layer),
      source_id: rule.rule_id,
      confidence: 1.0,
      explanation,
      journal_entries: journalEntries,
      metadata: {
        rule_name: rule.name,
        rule_layer: rule.layer,
        matched_conditions: this.extractMatchedFields(rule.conditions),
        generation_latency_ms: performance.now() - startTime,
      },
    };
  }

  /**
   * Process a single journal entry template
   */
  private static async processEntryTemplate(
    template: JournalEntryTemplate,
    enrichedTxn: EnrichedTransaction,
    companyContext: CompanyContext,
  ): Promise<LedgerEntry> {
    // Resolve COA ID (either explicit or dynamic)
    const coaId =
      template.coa_id ||
      (await this.resolveDynamicCoa(
        template.coa_selector,
        enrichedTxn,
        companyContext,
      ));

    // Calculate amount
    const amount = this.calculateAmount(
      template.amount,
      enrichedTxn.raw.amount,
      enrichedTxn,
    );

    // Resolve memo template variables
    const memo = template.memo
      ? this.resolveMemoTemplate(template.memo, enrichedTxn)
      : enrichedTxn.raw.description;

    return {
      coa_id: coaId,
      direction: template.direction,
      amount,
      currency_id: enrichedTxn.raw.currency_id,
      memo,
      tax_code: template.tax_code,
      tracking_categories: template.tracking_categories,
    };
  }

  /**
   * Calculate entry amount based on strategy
   */
  private static calculateAmount(
    strategy: AmountStrategy,
    baseAmount: number,
    enrichedTxn: EnrichedTransaction,
  ): number {
    switch (strategy.type) {
      case 'PERCENTAGE':
        return (baseAmount * strategy.value) / 100;

      case 'FIXED':
        return strategy.value;

      case 'CALCULATED':
        // Safe evaluation of formula (using a sandboxed evaluator)
        return this.evaluateFormula(strategy.formula, enrichedTxn);

      default:
        throw new Error(`Unknown amount strategy: ${strategy.type}`);
    }
  }

  /**
   * Safely evaluate amount formula
   */
  private static evaluateFormula(
    formula: string,
    enrichedTxn: EnrichedTransaction,
  ): number {
    // Create safe context for formula evaluation
    const context = {
      amount: enrichedTxn.raw.amount,
      vat_rate: enrichedTxn.context.tax_settings.vat_rate,
      wht_rate: enrichedTxn.context.tax_settings.wht_rate,
    };

    // Example formulas:
    // - "amount * 0.16" -> VAT calculation
    // - "amount * (1 + vat_rate / 100)" -> Gross amount
    // - "amount * wht_rate / 100" -> WHT calculation

    // Use a safe evaluator (e.g., expr-eval library)
    const { Parser } = require('expr-eval');
    const parser = new Parser();
    const result = parser.evaluate(formula, context);

    return Number(result.toFixed(2));
  }

  /**
   * Resolve dynamic COA selection
   */
  private static async resolveDynamicCoa(
    selector: JournalEntryTemplate['coa_selector'],
    enrichedTxn: EnrichedTransaction,
    companyContext: CompanyContext,
  ): Promise<string> {
    if (!selector) {
      throw new Error('No COA ID or selector provided');
    }

    switch (selector.type) {
      case 'VENDOR_DEFAULT':
        // Look up vendor's default expense account
        if (enrichedTxn.ids.vendor_id) {
          const vendor = await db('companies_vendors')
            .where({ vendor_id: enrichedTxn.ids.vendor_id })
            .first();

          if (vendor?.default_expense_coa_id) {
            return vendor.default_expense_coa_id;
          }
        }
        throw new Error('Vendor has no default expense account');

      case 'INDUSTRY_STANDARD':
        // Map to industry-standard account
        // e.g., "Software subscription" -> COA type "Software Expense"
        return this.findIndustryStandardAccount(
          selector.params.category,
          companyContext,
        );

      case 'QUERY':
        // Execute a custom query (be careful with security!)
        return this.executeDynamicQuery(selector.params, companyContext);

      default:
        throw new Error(`Unknown COA selector type: ${selector.type}`);
    }
  }

  /**
   * Validate that journal entries balance (zero-sum)
   */
  private static validateBalance(entries: LedgerEntry[]): void {
    const debits = entries
      .filter((e) => e.direction === 'DEBIT')
      .reduce((sum, e) => sum + e.amount, 0);

    const credits = entries
      .filter((e) => e.direction === 'CREDIT')
      .reduce((sum, e) => sum + e.amount, 0);

    const diff = Math.abs(debits - credits);

    // Allow for minor rounding errors (<1 cent)
    if (diff > 0.01) {
      throw new Error(
        `Journal entries do not balance. Debits: ${debits}, Credits: ${credits}, Diff: ${diff}`,
      );
    }
  }

  /**
   * Generate human-readable explanation
   */
  private static generateExplanation(
    rule: Rule,
    enrichedTxn: EnrichedTransaction,
  ): string {
    const conditions = rule.conditions.conditions
      .map((c) => {
        const value = get(enrichedTxn, c.field);
        return `${c.field} ${c.operator} ${c.value} (actual: ${value})`;
      })
      .join(` ${rule.conditions.operator} `);

    return `Matched ${rule.layer} rule "${rule.name}": ${conditions}`;
  }

  private static mapLayerToSource(
    layer: string,
  ): LedgerEntryCandidate['source'] {
    const mapping = {
      system: 'SystemRule',
      firm: 'FirmRule',
      company: 'CompanyRule',
      user: 'UserRule',
    };
    return mapping[layer] || 'UserRule';
  }

  private static extractMatchedFields(conditions: RuleConditions): string[] {
    return conditions.conditions.map((c) => c.field);
  }
}
```

**Example: Simple 1-to-1 Transaction**

```typescript
// Rule: "Transactions containing 'STARBUCKS' categorize as Meals & Entertainment"

const rule: Rule = {
  rule_id: 'rule-starbucks',
  name: 'Starbucks Expenses',
  layer: 'user',
  priority: 10,
  conditions: {
    operator: 'AND',
    conditions: [
      {
        field: 'normalized.description',
        operator: 'CONTAINS',
        value: 'STARBUCKS',
      },
    ],
  },
  actions: {
    action_type: 'CREATE_JOURNAL',
    journal_entries: [
      {
        // Debit: Meals & Entertainment
        coa_id: 'coa-meals-uuid',
        direction: 'DEBIT',
        amount: { type: 'PERCENTAGE', value: 100 },
      },
      {
        // Credit: Bank Account (automatic)
        coa_id: enrichedTxn.context.bank_coa_account_id,
        direction: 'CREDIT',
        amount: { type: 'PERCENTAGE', value: 100 },
      },
    ],
  },
};

// Execution Result:
const candidate: LedgerEntryCandidate = {
  candidate_id: 'candidate-xyz',
  source: 'UserRule',
  source_id: 'rule-starbucks',
  confidence: 1.0,
  explanation:
    'Matched user rule "Starbucks Expenses": normalized.description CONTAINS STARBUCKS',
  journal_entries: [
    {
      coa_id: 'coa-meals-uuid',
      direction: 'DEBIT',
      amount: 15.5,
      currency_id: 'USD',
      memo: 'STARBUCKS #1234',
    },
    {
      coa_id: 'coa-bank-uuid',
      direction: 'CREDIT',
      amount: 15.5,
      currency_id: 'USD',
      memo: 'STARBUCKS #1234',
    },
  ],
};
```

**Example: Split Transaction with Tax**

```typescript
// Rule: "AWS invoices > $1000 should split into Cloud Hosting (84%) and VAT (16%)"

const rule: Rule = {
  rule_id: 'rule-aws-vat',
  name: 'AWS with VAT',
  conditions: {
    operator: 'AND',
    conditions: [
      { field: 'normalized.description', operator: 'CONTAINS', value: 'AWS' },
      { field: 'raw.amount', operator: 'GREATER_THAN', value: 1000 },
      {
        field: 'context.tax_settings.vat_registered',
        operator: 'EQUALS',
        value: true,
      },
    ],
  },
  actions: {
    action_type: 'CREATE_JOURNAL',
    journal_entries: [
      {
        // Debit: Cloud Hosting (net amount)
        coa_id: 'coa-cloud-hosting-uuid',
        direction: 'DEBIT',
        amount: { type: 'CALCULATED', formula: 'amount / 1.16' }, // Remove VAT
        tax_code: 'VAT-STD',
      },
      {
        // Debit: VAT Input (tax amount)
        coa_id: 'coa-vat-input-uuid',
        direction: 'DEBIT',
        amount: { type: 'CALCULATED', formula: 'amount * 0.16 / 1.16' },
      },
      {
        // Credit: Bank Account
        coa_id: enrichedTxn.context.bank_coa_account_id,
        direction: 'CREDIT',
        amount: { type: 'PERCENTAGE', value: 100 },
      },
    ],
  },
};

// For a $1,160 transaction, this generates:
// DR Cloud Hosting: $1,000
// DR VAT Input: $160
// CR Bank Account: $1,160
// (Balanced ✓)
```

---

### Step 4: Early Exit on Match (Standard Mode)

In standard execution mode, the rules engine stops after the first rule matches.

```typescript
// apps/api/src/domains/categorization/rules.engine.ts

export class RulesEngine {
  /**
   * Evaluate all rules for a transaction and return first match
   */
  static async evaluate(
    taskId: string,
    executionMode: 'standard' | 'shadow' | 'all' = 'standard',
  ): Promise<LedgerEntryCandidate[]> {
    const startTime = performance.now();

    // Load task and enriched transaction
    const task = await db('categorization_tasks')
      .where({ task_id: taskId })
      .first();

    if (!task) throw new Error(`Task ${taskId} not found`);

    const enrichedTxn: EnrichedTransaction = task.enriched_transaction;
    const companyContext = await getCompanyContext(enrichedTxn.ids.company_id);

    // Load all active rules for company
    const rules = await getCompanyRules(enrichedTxn.ids.company_id);

    const candidates: LedgerEntryCandidate[] = [];

    for (const rule of rules) {
      try {
        // Evaluate conditions
        const matches = ConditionEvaluator.evaluateGroup(
          rule.conditions,
          enrichedTxn,
        );

        if (matches) {
          // Execute actions to generate candidate
          const candidate = await ActionExecutor.execute(
            rule,
            enrichedTxn,
            companyContext,
          );

          candidates.push(candidate);

          // Track rule match
          await this.recordRuleMatch(taskId, rule.rule_id, candidate);

          // Update rule statistics
          await this.updateRuleStats(rule.rule_id);

          // In standard mode, stop after first match
          if (executionMode === 'standard') {
            break;
          }
        }
      } catch (error) {
        // Log error but continue evaluating other rules
        logger.error('Rule evaluation error', {
          rule_id: rule.rule_id,
          task_id: taskId,
          error: error.message,
        });
      }
    }

    // Emit metrics
    const duration = performance.now() - startTime;
    metrics.histogram('categorization.rules.evaluation_latency_ms', duration);
    metrics.histogram(
      'categorization.rules.candidates_generated',
      candidates.length,
    );

    return candidates;
  }

  /**
   * Record rule match for audit and learning
   */
  private static async recordRuleMatch(
    taskId: string,
    ruleId: string,
    candidate: LedgerEntryCandidate,
  ): Promise<void> {
    await db('categorization_rule_matches').insert({
      task_id: taskId,
      rule_id: ruleId,
      bank_transaction_id: (
        await db('categorization_tasks').where({ task_id: taskId }).first()
      ).bank_transaction_id,
      confidence: candidate.confidence,
      matched_at: new Date(),
    });
  }

  /**
   * Update rule usage statistics
   */
  private static async updateRuleStats(ruleId: string): Promise<void> {
    await db('categorization_rules')
      .where({ rule_id: ruleId })
      .increment('match_count', 1)
      .update({ last_matched_at: new Date() });
  }
}
```

---

### Step 5: Persist Candidates to Database

Rule-generated candidates are persisted for Stage 4 (Synthesis & Ranking).

```typescript
// Update categorization_tasks table with rule candidates

await db('categorization_tasks')
  .where({ task_id: taskId })
  .update({
    rule_candidates: JSON.stringify(candidates),
    rule_evaluation_completed_at: new Date(),
    categorization_status:
      candidates.length > 0 ? 'rules_matched' : 'rules_no_match',
    updated_at: new Date(),
  });

// Emit event for next stage
if (candidates.length > 0) {
  await eventBus.emit('categorization.rules.matched', {
    task_id: taskId,
    bank_transaction_id: enrichedTxn.ids.bank_transaction_id,
    candidate_count: candidates.length,
  });
} else {
  // No rule matched, proceed to ML stage
  await eventBus.emit('categorization.rules.no_match', {
    task_id: taskId,
    bank_transaction_id: enrichedTxn.ids.bank_transaction_id,
  });
}
```

---

## 2.5 System Rule Packs

The categorization system ships with pre-built rule packs covering common scenarios across industries.

```typescript
// apps/api/src/domains/categorization/rules.system-packs.ts

export const SYSTEM_RULE_PACKS = {
  /**
   * Bank Fees & Charges
   */
  BANK_FEES: {
    name: 'Bank Fees',
    description:
      'Automatically categorize bank service fees and interest charges',
    rules: [
      {
        name: 'Bank Service Fee',
        conditions: {
          operator: 'OR',
          conditions: [
            {
              field: 'normalized.description',
              operator: 'CONTAINS',
              value: 'BANK FEE',
            },
            {
              field: 'normalized.description',
              operator: 'CONTAINS',
              value: 'SERVICE CHARGE',
            },
            {
              field: 'normalized.description',
              operator: 'CONTAINS',
              value: 'MONTHLY FEE',
            },
          ],
        },
        actions: {
          action_type: 'CREATE_JOURNAL',
          journal_entries: [
            {
              coa_selector: {
                type: 'INDUSTRY_STANDARD',
                params: { category: 'Bank Fees' },
              },
              direction: 'DEBIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
            {
              coa_id: '{{bank_account_coa_id}}', // Template variable
              direction: 'CREDIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
          ],
        },
      },
      {
        name: 'Interest Income',
        conditions: {
          operator: 'AND',
          conditions: [
            {
              field: 'normalized.description',
              operator: 'CONTAINS',
              value: 'INTEREST',
            },
            { field: 'raw.direction', operator: 'EQUALS', value: 'inflow' },
          ],
        },
        actions: {
          action_type: 'CREATE_JOURNAL',
          journal_entries: [
            {
              coa_id: '{{bank_account_coa_id}}',
              direction: 'DEBIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
            {
              coa_selector: {
                type: 'INDUSTRY_STANDARD',
                params: { category: 'Interest Income' },
              },
              direction: 'CREDIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
          ],
        },
      },
    ],
  },

  /**
   * Payroll Processing
   */
  PAYROLL: {
    name: 'Payroll',
    description: 'Categorize payroll transactions from major providers',
    rules: [
      {
        name: 'Gusto Payroll',
        conditions: {
          operator: 'OR',
          conditions: [
            {
              field: 'normalized.description',
              operator: 'CONTAINS',
              value: 'GUSTO',
            },
            {
              field: 'normalized.vendor_name',
              operator: 'EQUALS',
              value: 'Gusto',
            },
          ],
        },
        actions: {
          action_type: 'CREATE_JOURNAL',
          journal_entries: [
            {
              coa_selector: {
                type: 'INDUSTRY_STANDARD',
                params: { category: 'Payroll Expense' },
              },
              direction: 'DEBIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
            {
              coa_id: '{{bank_account_coa_id}}',
              direction: 'CREDIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
          ],
        },
      },
      // Similar rules for ADP, Paychex, QuickBooks Payroll, etc.
    ],
  },

  /**
   * Tax Payments
   */
  TAX_PAYMENTS: {
    name: 'Tax Payments',
    description: 'Categorize tax authority payments',
    rules: [
      {
        name: 'VAT/GST Payment',
        conditions: {
          operator: 'AND',
          conditions: [
            {
              field: 'normalized.description',
              operator: 'REGEX_MATCH',
              value: '(HMRC|VAT|GST|TAX AUTHORITY)',
            },
            { field: 'signals.likely_tax', operator: 'EQUALS', value: true },
          ],
        },
        actions: {
          action_type: 'CREATE_JOURNAL',
          journal_entries: [
            {
              coa_selector: {
                type: 'INDUSTRY_STANDARD',
                params: { category: 'VAT Payable' },
              },
              direction: 'DEBIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
            {
              coa_id: '{{bank_account_coa_id}}',
              direction: 'CREDIT',
              amount: { type: 'PERCENTAGE', value: 100 },
            },
          ],
        },
      },
    ],
  },

  /**
   * Software Subscriptions (SaaS)
   */
  SAAS_SUBSCRIPTIONS: {
    name: 'SaaS Subscriptions',
    description: 'Common software subscription services',
    rules: [
      'AWS',
      'Google Cloud',
      'Microsoft Azure',
      'GitHub',
      'Slack',
      'Zoom',
      'Dropbox',
      'Adobe',
      'Salesforce',
      'HubSpot',
    ].map((vendor) => ({
      name: `${vendor} Subscription`,
      conditions: {
        operator: 'AND',
        conditions: [
          {
            field: 'normalized.description',
            operator: 'CONTAINS',
            value: vendor.toUpperCase(),
          },
          { field: 'historical.is_recurring', operator: 'EQUALS', value: true },
        ],
      },
      actions: {
        action_type: 'CREATE_JOURNAL',
        journal_entries: [
          {
            coa_selector: {
              type: 'INDUSTRY_STANDARD',
              params: { category: 'Software Expense' },
            },
            direction: 'DEBIT',
            amount: { type: 'PERCENTAGE', value: 100 },
            memo: `${vendor} subscription - {{raw.posted_at | format:'MMM YYYY'}}`,
          },
          {
            coa_id: '{{bank_account_coa_id}}',
            direction: 'CREDIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
        ],
      },
    })),
  },
};

/**
 * Install system rule packs for a company
 */
export async function installSystemRulePacks(
  companyId: string,
  packs: string[] = Object.keys(SYSTEM_RULE_PACKS),
): Promise<void> {
  for (const packKey of packs) {
    const pack = SYSTEM_RULE_PACKS[packKey];

    for (const ruleTemplate of pack.rules) {
      await db('categorization_rules').insert({
        company_id: companyId,
        name: ruleTemplate.name,
        description: pack.description,
        layer: 'system',
        priority: 1000, // System rules have lower priority than user rules
        conditions: ruleTemplate.conditions,
        actions: ruleTemplate.actions,
        is_active: true,
        is_system: true,
      });
    }
  }

  // Invalidate rule cache for this company
  await invalidateRuleCache(companyId);
}
```

---

## 2.6 User Interface for Rule Management

The rules engine includes a comprehensive UI for accountants to create, test, and manage rules without code.

### REST API Endpoints

```typescript
// apps/api/src/domains/categorization/rules-ui/rules-api.controller.ts

import { Router } from 'express';

const router = Router();

/**
 * GET /api/categorization/rules
 * List all rules for current company
 */
router.get('/rules', authenticate, async (req, res) => {
  const { companyId } = req.user;

  const rules = await db('categorization_rules')
    .where({ company_id: companyId })
    .whereNull('deleted_at')
    .orderBy([
      { column: 'layer', order: 'asc' },
      { column: 'priority', order: 'asc' },
    ])
    .select('*');

  res.json({ rules });
});

/**
 * POST /api/categorization/rules
 * Create a new rule
 */
router.post('/rules', authenticate, validateRuleSchema, async (req, res) => {
  const { companyId, userId } = req.user;
  const { name, description, conditions, actions, priority } = req.body;

  // Validate COA accounts exist
  await validateCoaReferences(actions, companyId);

  const [ruleId] = await db('categorization_rules')
    .insert({
      company_id: companyId,
      created_by_user_id: userId,
      name,
      description,
      layer: 'user',
      priority: priority || 100,
      conditions,
      actions,
      is_active: true,
    })
    .returning('rule_id');

  // Invalidate cache
  await invalidateRuleCache(companyId);

  res.status(201).json({ rule_id: ruleId });
});

/**
 * PUT /api/categorization/rules/:ruleId
 * Update existing rule
 */
router.put(
  '/rules/:ruleId',
  authenticate,
  validateRuleSchema,
  async (req, res) => {
    const { companyId } = req.user;
    const { ruleId } = req.params;
    const updates = req.body;

    // Verify ownership
    const rule = await db('categorization_rules')
      .where({ rule_id: ruleId, company_id: companyId })
      .first();

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    if (rule.is_system) {
      return res.status(403).json({ error: 'Cannot modify system rules' });
    }

    // Create new version (for audit trail)
    await db('categorization_rules').insert({
      ...rule,
      rule_id: undefined, // Generate new ID
      parent_rule_id: ruleId,
      version: rule.version + 1,
      ...updates,
      updated_at: new Date(),
    });

    // Soft-delete old version
    await db('categorization_rules')
      .where({ rule_id: ruleId })
      .update({ deleted_at: new Date() });

    await invalidateRuleCache(companyId);

    res.json({ success: true });
  },
);

/**
 * POST /api/categorization/rules/:ruleId/test
 * Test a rule against sample transactions
 */
router.post('/rules/:ruleId/test', authenticate, async (req, res) => {
  const { companyId } = req.user;
  const { ruleId } = req.params;
  const { sample_transaction_ids } = req.body;

  const rule = await db('categorization_rules')
    .where({ rule_id: ruleId, company_id: companyId })
    .first();

  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const results = [];

  for (const txnId of sample_transaction_ids) {
    const task = await db('categorization_tasks')
      .where({ bank_transaction_id: txnId })
      .first();

    const enrichedTxn: EnrichedTransaction = task.enriched_transaction;

    // Test condition matching
    const matches = ConditionEvaluator.evaluateGroup(
      rule.conditions,
      enrichedTxn,
    );

    let candidate = null;
    if (matches) {
      const companyContext = await getCompanyContext(companyId);
      candidate = await ActionExecutor.execute(
        rule,
        enrichedTxn,
        companyContext,
      );
    }

    results.push({
      transaction_id: txnId,
      description: enrichedTxn.raw.description,
      amount: enrichedTxn.raw.amount,
      matched: matches,
      candidate,
    });
  }

  res.json({ test_results: results });
});

/**
 * POST /api/categorization/rules/install-packs
 * Install system rule packs
 */
router.post('/rules/install-packs', authenticate, async (req, res) => {
  const { companyId } = req.user;
  const { packs } = req.body; // e.g., ['BANK_FEES', 'PAYROLL']

  await installSystemRulePacks(companyId, packs);

  res.json({ success: true, installed: packs });
});

export default router;
```

---

## 2.7 Performance & Scalability

### Latency Targets

| Metric                | Target | P50  | P95  | P99   |
| --------------------- | ------ | ---- | ---- | ----- |
| Rule loading (cached) | <5ms   | 2ms  | 4ms  | 8ms   |
| Condition evaluation  | <10ms  | 5ms  | 15ms | 30ms  |
| Action execution      | <30ms  | 15ms | 40ms | 80ms  |
| End-to-end (Stage 2)  | <50ms  | 25ms | 60ms | 120ms |

### Optimization Strategies

1. **Rule Caching**: 3-tier cache (local → Redis → DB) with 30min TTL
2. **Early Exit**: Stop after first match in standard mode
3. **Lazy Loading**: Only load COA data when needed for dynamic selectors
4. **Batch Processing**: Process multiple transactions in parallel
5. **Index Optimization**: Compound indexes on `(company_id, is_active, layer, priority)`

### Scalability

- **Throughput**: >200 rules evaluated per second per worker
- **Concurrency**: BullMQ workers scale horizontally
- **Rule Limit**: Support up to 1000 active rules per company
- **Complexity**: Support up to 20 conditions per rule (AND/OR nesting)

---

## 2.8 Error Handling & Edge Cases

### Rule Evaluation Errors

```typescript
// Graceful degradation: if a rule fails, continue to next rule

try {
  const matches = ConditionEvaluator.evaluateGroup(
    rule.conditions,
    enrichedTxn,
  );
  // ...
} catch (error) {
  logger.error('Rule condition evaluation failed', {
    rule_id: rule.rule_id,
    rule_name: rule.name,
    task_id: taskId,
    error: error.message,
    stack: error.stack,
  });

  // Emit metric for monitoring
  metrics.increment('categorization.rules.evaluation_errors', {
    rule_id: rule.rule_id,
    error_type: error.constructor.name,
  });

  // Continue to next rule
  continue;
}
```

### Action Execution Errors

```typescript
// If action execution fails, do not generate candidate

try {
  const candidate = await ActionExecutor.execute(
    rule,
    enrichedTxn,
    companyContext,
  );
  candidates.push(candidate);
} catch (error) {
  logger.error('Rule action execution failed', {
    rule_id: rule.rule_id,
    task_id: taskId,
    error: error.message,
  });

  // Alert user if their custom rule is broken
  if (rule.layer === 'user') {
    await notificationService.send({
      user_id: rule.created_by_user_id,
      type: 'rule_execution_failed',
      data: {
        rule_name: rule.name,
        error_message: error.message,
      },
    });
  }
}
```

### Validation Failures

- **Missing COA Account**: If referenced account doesn't exist, reject rule creation
- **Unbalanced Entries**: If journal doesn't balance, throw error during action execution
- **Circular References**: Detect and prevent rules that reference each other
- **Formula Errors**: Validate amount calculation formulas during rule creation

---

## 2.9 Monitoring & Observability

### Key Metrics

```typescript
// Prometheus metrics

// Rule evaluation performance
metrics.histogram('categorization.rules.evaluation_latency_ms', duration, {
  company_id: companyId,
  execution_mode: 'standard',
});

// Rule match rate
metrics.increment('categorization.rules.matches', 1, {
  rule_id: rule.rule_id,
  rule_layer: rule.layer,
});

// Rule execution errors
metrics.increment('categorization.rules.errors', 1, {
  rule_id: rule.rule_id,
  error_type: 'condition_evaluation_failed',
});

// Candidate generation
metrics.histogram(
  'categorization.rules.candidates_generated',
  candidates.length,
  {
    company_id: companyId,
  },
);

// Cache performance
metrics.increment('categorization.rules.cache_hit', 1, {
  cache_level: 'local' | 'redis' | 'db',
});
```

### Logging

```typescript
// Structured logging with context

logger.info('Rule evaluation started', {
  task_id: taskId,
  company_id: companyId,
  transaction_amount: enrichedTxn.raw.amount,
  active_rules_count: rules.length,
});

logger.info('Rule matched', {
  task_id: taskId,
  rule_id: rule.rule_id,
  rule_name: rule.name,
  rule_layer: rule.layer,
  confidence: candidate.confidence,
  journal_entries_count: candidate.journal_entries.length,
});

logger.warn('No rules matched', {
  task_id: taskId,
  company_id: companyId,
  description: enrichedTxn.normalized.description,
  amount: enrichedTxn.raw.amount,
});
```

### Dashboards

**Grafana Dashboard: Rules Engine Performance**

- Rule evaluation latency (p50, p95, p99)
- Match rate by rule layer (system, firm, company, user)
- Top 10 most-matched rules
- Rule evaluation errors by type
- Cache hit rate by level
- Candidate generation distribution

---

## 2.10 Testing Strategy

### Unit Tests

```typescript
// apps/api/src/domains/categorization/__tests__/rules.engine.test.ts

describe('ConditionEvaluator', () => {
  describe('CONTAINS operator', () => {
    it('should match case-insensitive by default', () => {
      const condition: Condition = {
        field: 'normalized.description',
        operator: 'CONTAINS',
        value: 'AWS',
      };

      const txn: EnrichedTransaction = {
        normalized: { description: 'aws web services' },
      };

      expect(ConditionEvaluator.evaluate(condition, txn)).toBe(true);
    });

    it('should respect case_sensitive flag', () => {
      const condition: Condition = {
        field: 'normalized.description',
        operator: 'CONTAINS',
        value: 'AWS',
        case_sensitive: true,
      };

      const txn: EnrichedTransaction = {
        normalized: { description: 'aws web services' },
      };

      expect(ConditionEvaluator.evaluate(condition, txn)).toBe(false);
    });
  });

  describe('AND/OR groups', () => {
    it('should evaluate AND correctly', () => {
      const conditions: RuleConditions = {
        operator: 'AND',
        conditions: [
          { field: 'raw.amount', operator: 'GREATER_THAN', value: 100 },
          {
            field: 'normalized.description',
            operator: 'CONTAINS',
            value: 'AWS',
          },
        ],
      };

      const txn: EnrichedTransaction = {
        raw: { amount: 250 },
        normalized: { description: 'AWS WEB SERVICES' },
      };

      expect(ConditionEvaluator.evaluateGroup(conditions, txn)).toBe(true);
    });
  });
});

describe('ActionExecutor', () => {
  it('should generate balanced journal entries', async () => {
    const rule: Rule = {
      actions: {
        journal_entries: [
          {
            coa_id: 'expense-uuid',
            direction: 'DEBIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
          {
            coa_id: 'bank-uuid',
            direction: 'CREDIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
        ],
      },
    };

    const txn: EnrichedTransaction = {
      raw: { amount: 150, currency_id: 'USD' },
    };

    const candidate = await ActionExecutor.execute(rule, txn, mockContext);

    const debits = candidate.journal_entries
      .filter((e) => e.direction === 'DEBIT')
      .reduce((sum, e) => sum + e.amount, 0);

    const credits = candidate.journal_entries
      .filter((e) => e.direction === 'CREDIT')
      .reduce((sum, e) => sum + e.amount, 0);

    expect(debits).toBe(credits);
  });

  it('should handle split transactions with tax', async () => {
    // Test VAT split calculation
    const rule: Rule = {
      actions: {
        journal_entries: [
          {
            coa_id: 'expense-uuid',
            direction: 'DEBIT',
            amount: { type: 'CALCULATED', formula: 'amount / 1.16' },
          },
          {
            coa_id: 'vat-uuid',
            direction: 'DEBIT',
            amount: { type: 'CALCULATED', formula: 'amount * 0.16 / 1.16' },
          },
          {
            coa_id: 'bank-uuid',
            direction: 'CREDIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
        ],
      },
    };

    const txn: EnrichedTransaction = {
      raw: { amount: 116, currency_id: 'GBP' },
      context: { tax_settings: { vat_rate: 16 } },
    };

    const candidate = await ActionExecutor.execute(rule, txn, mockContext);

    expect(candidate.journal_entries[0].amount).toBeCloseTo(100, 2); // Net
    expect(candidate.journal_entries[1].amount).toBeCloseTo(16, 2); // VAT
    expect(candidate.journal_entries[2].amount).toBe(116); // Gross
  });
});
```

### Integration Tests

```typescript
// Test full pipeline from enriched transaction to candidate generation

describe('Rules Engine Integration', () => {
  it('should evaluate rules and generate candidate for matching transaction', async () => {
    // Setup: Create test company, rule, and transaction
    const companyId = await createTestCompany();
    const ruleId = await createTestRule(companyId, {
      name: 'Test AWS Rule',
      conditions: {
        operator: 'AND',
        conditions: [
          {
            field: 'normalized.description',
            operator: 'CONTAINS',
            value: 'AWS',
          },
        ],
      },
      actions: {
        journal_entries: [
          {
            coa_id: 'cloud-expense-uuid',
            direction: 'DEBIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
          {
            coa_id: 'bank-uuid',
            direction: 'CREDIT',
            amount: { type: 'PERCENTAGE', value: 100 },
          },
        ],
      },
    });

    const taskId = await createTestTask(companyId, {
      enriched_transaction: {
        normalized: { description: 'AWS WEB SERVICES' },
        raw: { amount: 250, currency_id: 'USD' },
      },
    });

    // Execute
    const candidates = await RulesEngine.evaluate(taskId, 'standard');

    // Assert
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe('UserRule');
    expect(candidates[0].source_id).toBe(ruleId);
    expect(candidates[0].confidence).toBe(1.0);
    expect(candidates[0].journal_entries).toHaveLength(2);
  });

  it('should skip to ML stage when no rules match', async () => {
    // Test no-match scenario
    const taskId = await createTestTask(companyId, {
      enriched_transaction: {
        normalized: { description: 'UNKNOWN VENDOR' },
        raw: { amount: 50 },
      },
    });

    const candidates = await RulesEngine.evaluate(taskId, 'standard');

    expect(candidates).toHaveLength(0);

    // Verify event emitted for ML stage
    expect(eventBus).toHaveEmitted('categorization.rules.no_match');
  });
});
```

---

## 2.11 Stage 2 Deliverables & Success Criteria

### Deliverables

- [ ] `rules.service.ts` - Main orchestration
- [ ] `rules.worker.ts` - BullMQ worker
- [ ] `rules.engine.ts` - Core evaluation engine
- [ ] `rules.conditions.ts` - Condition evaluators
- [ ] `rules.actions.ts` - Action executors
- [ ] `rules.priorities.ts` - Priority resolution
- [ ] `rules.cache.ts` - Rule caching
- [ ] `rules.system-packs.ts` - Pre-built rule packs
- [ ] `rules.types.ts` - TypeScript interfaces
- [ ] `rules-api.controller.ts` - REST API endpoints
- [ ] `rules-validation.ts` - Schema validation
- [ ] Migration for `categorization_rules` table
- [ ] Migration for `categorization_rule_matches` table
- [ ] Unit tests (>85% coverage)
- [ ] Integration tests
- [ ] API documentation
- [ ] User guide for rule creation

### Success Criteria

| Criterion                         | Target              | Measurement                   |
| --------------------------------- | ------------------- | ----------------------------- |
| **Performance**                   |                     |                               |
| Rule evaluation latency (p95)     | <50ms               | Prometheus metrics            |
| Throughput                        | >200 rules/sec      | Load tests                    |
| Cache hit rate                    | >95%                | Metrics dashboard             |
| **Quality**                       |                     |                               |
| Rule match accuracy               | 100%                | By definition (deterministic) |
| Balance validation pass rate      | 100%                | Automated tests               |
| User acceptance rate              | >90%                | User feedback tracking        |
| **Coverage**                      |                     |                               |
| System rule pack coverage         | >50 common patterns | Manual review                 |
| Transactions categorized by rules | >40%                | Analytics dashboard           |
| **Operations**                    |                     |                               |
| Worker uptime                     | >99.9%              | Monitoring alerts             |
| Rule execution error rate         | <0.5%               | Error logs                    |
| **Testing**                       |                     |                               |
| Unit test coverage                | >85%                | Jest coverage report          |
| Integration tests passing         | 100%                | CI/CD pipeline                |

---

This completes the comprehensive implementation plan for **Stage 2: Deterministic Rules Engine**.
