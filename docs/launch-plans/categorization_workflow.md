# Bookkeeping Categorization Workflow

This document describes how new transactions flow through the categorization system, how rules and ML interact, and how final ledger postings are created. It explains tables, fields, JSON structures, and responsibilities.

## Overview

**Goal**: Only clean, balanced, auditable entries ever hit the ledger. Suggestions and proposals are stored separately and never pollute the books.

## Design Principles

- **Ledger is immutable and auditable**: Only final, balanced entries are posted
- **Proposals are mutable**: Live outside the ledger
- **Rules are deterministic and ordered**: ML is independent and versioned
- **Replay capability**: Can be done from `predictions.input_snapshot + model_version`. No extra features table needed

## Core Tables

### 1. `bank_transactions`

**Purpose**: Source data from feeds or CSV. Immutable record of what came from the bank.

**Partitioning**: By date

**Key Fields**:

- `id`, `date`
- `amount`, `absolute_amount`, `transaction_side`: Mirror statement amounts
- `description`, `reference`: Reference statement
- `categorization_status`: `'uncategorized' | 'suggested' | 'categorized'`
- `bank_account_id`: Must be linked to a GL account (else categorization will be blocked)
- `ledger_transaction_id`: FK to posted ledger (if categorized and posted)
- `external_id`: Nullable field, for ID of transaction from provider (if not CSV upload)
- `raw_data`: JSON dump of original provider payload
- `system_exchange_rate`: Exchange rate determined at point of entry
- `bank_transaction_batch_id`: Batch of bank transactions this entry relates to

### 2. `categorization_jobs`

**Purpose**: Queue of work to be processed, idempotent per `(company_id, source, source_id)`.

**Why**: Exactly-once processing and clean retries.

**Key Fields**:

- `id`: PK, job identifier
- `company_id` (required)
- `source`: Enum `'bank_transaction'` only (for now)
- `source_id`: FK to `bank_transactions.id` (will detach when handling other categorization types)
- `state`: `'queued' | 'processing' | 'needs_review' | 'error' | 'done'`
- `attempts`: int not null default 0
- `error`
- `created_at`

**Constraints**: `UNIQUE(company_id, source, source_id)`

### 3. `categorization_rules`

**Purpose**: User-defined company rules, platform-defined jurisdiction, and global rules for deterministic categorization.

**Key Fields**:

- `id`, `name`
- `scope`: `'global' | 'jurisdiction' | 'company'`
- `jurisdiction`: JSONB (optional), e.g. `[{ "countryCode": "US", "region": "CA" }]`
- `priority`: int or null (ordering within scope, company rules can be ordered; null means no explicit order)
- `must_run`: boolean, defaults to false
- `active`: boolean, defaults to true
- `valid_from`, `valid_to`
- `requires_approval`: boolean, defaults to false
- `conditions`: JSONB not null
- `actions`: JSONB not null

**Ordering**:

```sql
scope_rank (global=0, jurisdiction=1, company=2)
COALESCE(priority, 2147483647) asc
created_at desc
```

**Merge Rule Effects**: Earlier rules propose fields; later rules fill only unset fields. No short-circuit flag.

#### Rule Conditions JSONB Format

```json
{
  "all_of": [
    { "field": "contact_or_payee", "operator": "contains", "value": "Farhan Logistics" },
    { "field": "any_text_field", "operator": "equals", "value": "Strepsil" },
    { "field": "amount_abs", "operator": "<=", "value": 10000 },
    { "field": "amount_abs", "operator": "is_between", "value": [10000, 18000] }
  ],
  "any_of": []
}
```

**Operators**:

- **Text fields**: `"equals"`, `"contains"`, `"starts_with"`, `"is_blank"`
- **Amount fields**: `"equals"`, `"greater_than"`, `"greater_than_or_equal"`, `"less_than"`, `"less_than_or_equal"`, `"between"`
- **Between operator**: Value is an array of two amounts

#### Rule Actions JSONB Format

```json
{
  "entries": [
    {
      "coa_id": "uuid-expenses-travel",
      "amount_type": "fixed", // percentage, fixed, remainder
      "description": "optional description field",
      "amount_value": -500.0, // 0-1 for percentage, any +ve or -ve integer for fixed (depending on amount in conditions, if any), not defined for remainder
      "explanation": "Travel rule under 10k"
    }
  ]
}

- Only ONE entry can have "amount_type": "remainder"
- Percentages must total ≤ 1
- Fixed amounts only apply if within transaction amount range

```

**Notes**:

- `allocation`: Not required, must be between 0 and 2
- `description`: Optional, defaults to transaction description if not provided
- `amount`: Allowed if amount field is set in conditions and doesn't cause logical/math errors

### 4. `categorization_models` (Model Registry)

**Purpose**: Explicit reference for predictions and postings.

**Key Fields**:

- `id`: UUID PK
- `name`: text not null (e.g. `'acct-categorizer'`)
- `version`: text not null (e.g. `'0.6.1'`)
- `type`: text not null (`'classifier'|'ranker'|'composite'`)
- `created_at`: timestamptz not null default now()
- `notes`: text

### 5. `predictions` (ML Proposals, Inputs Snapshot, Review State)

**Key Fields**:

- `id`: UUID PK
- `company_id`: UUID not null
- `source`: text not null (`'bank_transaction'`)
- `source_id`: UUID not null
- `source_transaction_date`: date not null (copy from `bank_transactions.date` for partition-aligned joins)
- `model_id`: UUID not null
- `model_version`: text not null
- `overall_confidence`: numeric(5,4) null
- `proposed_entries`: JSONB not null (full proposed lines)
- `rationale`: JSONB null
- `input_snapshot`: JSONB null (exact ML request saved for replay)
- `reviewer_action`: text null (`'accepted'|'edited'|'rejected'`)
- `reviewer_id`: UUID null
- `reviewed_at`: timestamptz null
- `edits_diff`: JSONB null
- `predicted_at`: timestamptz not null default now()

#### Proposed Entries JSONB Format

```json
{
  "entries": [
    {
      "coa_id": "uuid-exp-travel",
      "amount": -9800.0,
      "provenance": "company_rules",
      "confidence": 1.0,
      "explanation": "Company travel rule"
    },
    {
      "coa_id": "uuid-bank-linked",
      "amount": 10000.0,
      "provenance": "system_rules",
      "explanation": "Linked bank GL"
    },
    {
      "coa_id": "uuid-bank-fee",
      "amount": -200.0,
      "provenance": "ml",
      "confidence": 0.72,
      "explanation": "Neighbor similarity 0.89"
    }
  ],
  "net": 0.0
}
```

**Provenance Values**: `"system_rules" | "company_rules" | "ml" | "user"`

#### Rationale JSONB Format

```json
{
  "neighbors": [
    { "ledger_transaction_id": "uuid1", "similarity": 0.93, "coa_ids": ["uuid-exp-travel"] },
    {
      "ledger_transaction_id": "uuid2",
      "similarity": 0.89,
      "coa_ids": ["uuid-exp-travel", "uuid-bank-fee"]
    }
  ],
  "top_signals": ["token:DELTA", "mcc:4511", "amount_band:8k-12k"]
}
```

#### Input Snapshot JSONB Format

```json
{
  "schema_version": 1,
  "company_id": "...",
  "source": "bank_transaction",
  "source_id": "uuid",
  "bank_account_coa_id": "...",
  "jurisdiction": { "country_code": "", "region": "" },
  "tx": {
    "date": "yyyy-mm-dd",
    "contact_id": "...",
    "bank_account_id": "...",
    "amount": -10000.0,
    "currency": "USD",
    "exchange_rate": 0.812342,
    "reference": "",
    "description": "...",
    "additionalNotes": ""
  }
}
```

### 6. `ledger_transactions`

**Purpose**: Header rows for actual posted journals. Immutable, auditable. Never stores provisional data.

**Key Fields**:

- `id`, `date`
- `source`: enum (`'bank_transaction' | 'manual_journal' | ...`)
- `company_id`
- `contact_id`

**Design Considerations**:

- Currently tied to `bank_transaction_id` and date, which assumes only bank transactions post ledger transactions
- Consider renaming to `source_transaction_id` for generalization
- Consider unique index: `unique(company_id, source, source_transaction_id)`

**Proposed Addition**: `posting_provenance` JSONB not null default `'{}'::jsonb`

#### Posting Provenance JSONB Format

```json
{
  "rules_applied": [
    { "id": "uuid-rule-1", "name": "Travel under 10k" },
    { "id": "uuid-rule-7", "name": "Bank fee detection" }
  ],
  "model": { "id": "uuid-model", "version": "0.6.1" },
  "assembler_version": "1.0.0",
  "job_id": "uuid-job-1234"
}
```

### 7. `ledger_entries`

**Purpose**: The lines of each posted transaction. Sum of all ledger entries amounts linked to a single ledger transaction must ALWAYS balance to zero (sum DR = sum CR).

**Partitioning**: By `fs_date` (financial statement date from source transaction, unless user/accountant changes for financial reporting purposes)

**Key Fields**:

- `ledger_transaction_id` (FK)
- `coa_id`
- `source_currency_id` (original currency), `source_amount` (original currency amount), `absolute_source_amount`, `system_exchange_rate` (rate determined by system at the point of entering the transaction), `custom_exchange_rate` (same as system_exchange_rate by default but can be overriden by user - custom ex rate is the rate used to convert in the ledger entries table)
- `amount`, `absolute_amount`, `transaction_side`

**Proposed Additions**:

- `provenance`: text not null (`'system_rules'|'company_rules'|'ml'|'user'`)
- `explanation`: text not null default '' (free text for line reasoning)

## End-to-End Workflow

### Step 1: Ingest

1. New bank transaction arrives
2. Insert `bank_transactions` with `categorization_status='uncategorized'`
3. Insert `categorization_jobs` (`company_id`, `'bank_transaction'`, `source_id`, `'queued'`)

**Why**: Fast ingest, idempotent work unit via unique `(company_id, source, source_id)`

### Step 2: Worker

1. BullMQ worker picks queued jobs, sets processing
2. Load `bank_transactions` row
3. Verify bank account → GL account link exists
4. If missing: `categorization_jobs.state='error'`, `error='bank account not linked to any coa'`
5. Stop here

### Step 3: Run Rules

1. Load all active rules (`scope=global|jurisdiction|company`)
2. Sort by `(scope_rank, COALESCE(priority, +∞), created_at desc)`
3. Evaluate rules. Each can propose entries (`coa_id`, `amount`) and flags
4. Merge proposals: earlier defaults, later company rules can fill gaps
5. If everything is resolved → go to assembly. If not → ML

### Step 4: ML Call

1. Build `input_snapshot` (minimal tx + ids)
2. Call Python with `{company_id, source, source_id, input_snapshot}`
3. Python fetches COA/vendors/links via read-only DB and caches by `context_versions`
4. Insert `predictions` with:
   - `model_id`/`model_version`
   - `proposed_entries` (full proposal, including bank leg with `provenance='system_rules'`)
   - `overall_confidence`
   - `rationale`
   - `input_snapshot`
5. Set `bank_transactions.categorization_status='suggested'` (until posted)

### Step 5: Assemble + Validate (Node)

1. **Merge**:
   - Bank leg (deterministic from linked bank transaction)
   - Rule-resolved entries
   - ML-suggested entries

2. **Validate**:
   - Debits = credits (must sum to 0)
   - Account types match
   - FX/VAT math consistent
   - Compute `overall_confidence`

3. **Decision**:
   - If complete, thresholds met, `requires_approval=false`, and `autopost=true`:
     - Insert `ledger_transactions` (with `posting_provenance`) and `ledger_entries` (with `provenance`, `explanation`)
     - Set `bank_transactions.categorization_status='categorized'`
     - Set `categorization_jobs.state='done'`
   - Else:
     - Ledger untouched
     - Keep `predictions.proposed_entries`
     - `categorization_jobs.state='needs_review'`

## Training & Replay

### Training

- Pull posted `ledger_transactions`/`entries`
- Build features offline from immutable `bank_transactions` + current DB context
- Or reuse `predictions.input_snapshot` as inputs when present

### Replay/A/B Testing

- Run new model against saved `input_snapshot` to compare outputs, confidence, and accuracy

## Frontend View

Create a Postgres VIEW that flattens the state for the UI. It joins `bank_transactions`, `predictions`, `ledger_transactions` and `ledger_entries` and shows only the non-bank legs of transactions.

## Implementation Considerations

### Data Integrity & Balances

- **DB-level check for ledger balance**: Trigger on `ledger_entries` to enforce `SUM(amount)=0` per `ledger_transaction_id`
- **Bank account type constraint**: Ensure bank-linked account type matches instrument
- **Numeric scale policy**: Define rounding rules for source vs ledger currency conversions

### Worker Controls

- **BullMQ configuration**:
  - Group key = `company_id` for per-company concurrency
  - Global max concurrency limits
  - Aging SLA policies
  - Retry backoff strategies
- **Dead-letter queue**: Specification and cleanup cadence

### Security & Privacy

- **PII handling**:
  - List of PII fields requiring protection
  - Masking policy in logs
  - Column-level encryption where needed
- **Access control**: Define who can:
  - Create and modify categorization rules
  - Edit posted ledger entries
  - Enable/disable autopost functionality

### Observability

- **Correlation tracking**:
  - Format: `company_id:source:source_id`
  - Log fields at each workflow step
- **Key metrics**:
  - Rule hit rate and effectiveness
  - ML coverage and accuracy
  - Autopost rate and success
  - Review time and accuracy post-review

### API Contracts

- **REST/Queue interfaces** for:
  - Create categorization job
  - Run rules evaluation
  - Call ML service
  - Post to ledger
  - Review actions (accept/edit/reject)
- **Documentation**: Sample payloads and error codes for each endpoint

## Open Questions

- How to keep track of the format of JSONB fields for schema evolution and validation
- Consider adding context version fields to input snapshots for better replay capability

graph TD
A[bank_transaction created] --> B[categorization_job queued]
B --> C{Rules evaluate}
C -->|Fully resolved| D[Create proposal]
C -->|Partial/No match| E[Call ML]
E --> D
D --> F{Confidence check}
F -->|High confidence + autopost| G[Post to ledger]
F -->|Needs review| H[Wait for review]
H -->|Approved| G
H -->|Edited| I[Update proposal]
I --> G
G --> J[Update statuses]
