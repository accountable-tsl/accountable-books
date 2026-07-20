# Accountable Engage — Design Document (Archived)

> **Archive status:** Historical / future product — not Accountable Books implementation guidance.
> **Original status:** Design phase — not yet implemented
> **Purpose:** CRM and engagement management for accounting firms (separate product concept)
> See [docs index](../../README.md#archive).

## Executive Summary

Accountable Engage is a CRM and engagement management system designed specifically for accounting firms. It handles the complete client lifecycle from lead qualification through engagement delivery, with AI-powered assessment scoring and dynamic pricing.

**Key Capabilities:**

- Lead management and qualification
- Fit assessment with automated scoring
- Service order and engagement management
- Workflow templates with task dependencies
- Dynamic pricing profiles
- Integration with Accountable Books for active clients

**Design Principles:**

- Reuse existing Accountable Books schema patterns (companies, users, contacts)
- Design for seamless Go migration
- API-first architecture for integration
- Opinionated defaults with customization
- EAV pattern for flexible assessment forms

---

## Integration Strategy

### Shared Core Tables (Reused from Accountable Books)

The following tables are **shared** between Accountable Books and Accountable Engage:

- `companies` - Accounting firms and client companies
- `users` - User accounts
- `user_company_roles` - User permissions per company
- `accounting_firms_meta` - Firm metadata
- `client_firm_assignments` - Firm-client relationships
- `contacts` - People (customers, vendors, employees)
- `countries` - Country reference data
- `currencies` - Currency reference data

### Integration Points

1. **Lead → Company Creation**: When lead status becomes `active_client`, create company in Accountable Books
2. **Assessment Data → Company Metadata**: Store assessment scores in company metadata for pricing
3. **Service Orders → Service Tracking**: Track which services use Accountable Books vs external tools
4. **Engagement Tasks → Work Milestones**: Link engagement tasks to bookkeeping milestones

### API Integration Pattern

```
Accountable Engage (Go)  ←→  Accountable Books (Node.js)
         ↓                           ↓
    PostgreSQL (Shared)         PostgreSQL (Shared)
```

- Both services read/write to shared database
- Accountable Engage calls Accountable Books APIs for:
  - Company creation
  - Data synchronization
  - Service status updates

---

## Database Schema Design

### Naming Conventions

Following Accountable Books patterns:

- **Tables**: `snake_case`, plural (e.g., `service_orders`)
- **Columns**: `snake_case` (e.g., `created_at`, `company_id`)
- **Foreign Keys**: `{referenced_table}_id` (e.g., `firm_company_id`)
- **Enums**: `specificType` with PostgreSQL enum types
- **JSONB**: For flexible configuration (e.g., `config_json`, `metadata_json`)
- **Timestamps**: `created_at`, `updated_at` (with timezone)
- **Soft Deletes**: `is_deleted`, `deleted_at`

### Standard Columns Pattern

All tables include:

```sql
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
is_deleted BOOLEAN NOT NULL DEFAULT FALSE
deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
```

Plus audit columns:

```sql
created_by_id UUID REFERENCES users(id) ON DELETE RESTRICT
updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL
```

---

## Enum Types

```sql
-- Lead status tracking
CREATE TYPE lead_status AS ENUM (
  'new',
  'fit_assessment_pending',
  'fit_assessment_complete',
  'qualified_for_discovery_offer',
  'discovery_offer_sent',
  'discovery_accepted',
  'discovery_active',
  'discovery_complete',
  'proposal_sent',
  'active_client',
  'lost'
);

-- Service order status
CREATE TYPE service_order_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'payment_pending',
  'payment_failed',
  'paid',
  'active',
  'cancelled',
  'completed'
);

-- Engagement status
CREATE TYPE engagement_status AS ENUM (
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

-- Task status
CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'blocked',
  'completed',
  'skipped'
);

-- Service type
CREATE TYPE service_type AS ENUM (
  'discovery',
  'cleanup',
  'bookkeeping',
  'cfo_advisory',
  'tax',
  'payroll',
  'audit',
  'custom'
);

-- Billing cycle
CREATE TYPE billing_cycle AS ENUM (
  'one_time',
  'monthly',
  'quarterly',
  'annually'
);

-- Assessment question data type
CREATE TYPE question_data_type AS ENUM (
  'text',
  'number',
  'boolean',
  'enum',
  'json',
  'date'
);

-- Scoring rule operator
CREATE TYPE scoring_operator AS ENUM (
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'between',
  'contains',
  'not_contains'
);

-- Workload/Complexity/Advisory bands
CREATE TYPE assessment_band AS ENUM (
  'low',
  'medium',
  'high'
);

-- Equity activity level
CREATE TYPE equity_activity_level AS ENUM (
  'none',
  'occasional',
  'recurring',
  'frequent'
);
```

---

## Core Tables

### 1. `leads`

Represents sales leads before they become clients.

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Firm ownership (accounting firm that owns this lead)
  firm_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Lead contact information
  contact_id UUID NULLABLE REFERENCES contacts(id) ON DELETE SET NULL,
  company_id UUID NULLABLE REFERENCES companies(id) ON DELETE SET NULL,

  -- Lead metadata
  status lead_status NOT NULL DEFAULT 'new',
  source VARCHAR(100) NULLABLE, -- 'website', 'referral', 'outbound', etc.
  tags TEXT[] NULLABLE DEFAULT '{}',
  notes TEXT NULLABLE,
  fit_rating VARCHAR(50) NULLABLE, -- 'excellent', 'good', 'fair', 'poor'

  -- Assessment linkage
  latest_assessment_id UUID NULLABLE, -- References assessments(id)

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_leads_firm_status ON leads(firm_company_id, status);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
```

**Integration Note**: When `status = 'active_client'`, trigger company creation in Accountable Books.

---

### 2. `assessment_forms`

Templates and firm-specific assessment forms.

```sql
CREATE TABLE assessment_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Template system
  firm_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NULLABLE REFERENCES assessment_forms(id) ON DELETE SET NULL,

  -- Form metadata
  name VARCHAR(256) NOT NULL,
  description TEXT NULLABLE,
  version INTEGER NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  -- Configuration
  config_json JSONB NULLABLE DEFAULT '{}',

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT assessment_forms_template_check CHECK (
    (firm_company_id IS NULL AND template_id IS NULL) OR
    (firm_company_id IS NOT NULL)
  )
);

CREATE INDEX idx_assessment_forms_firm ON assessment_forms(firm_company_id);
CREATE INDEX idx_assessment_forms_template ON assessment_forms(template_id);
CREATE INDEX idx_assessment_forms_default ON assessment_forms(firm_company_id, is_default) WHERE is_default = TRUE;
```

**Note**: `firm_company_id = NULL` means it's a platform template. `template_id` links to the source template when cloned.

---

### 3. `assessment_questions`

Questions belonging to assessment forms.

```sql
CREATE TABLE assessment_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  form_id UUID NOT NULL REFERENCES assessment_forms(id) ON DELETE CASCADE,

  -- Question definition
  label TEXT NOT NULL,
  key VARCHAR(100) NOT NULL, -- Unique within form (e.g., 'bank_acct_count')
  data_type question_data_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL,

  -- Configuration
  options_json JSONB NULLABLE, -- For enum types: ["option1", "option2"]
  validation_json JSONB NULLABLE DEFAULT '{}', -- Min/max, patterns, etc.
  help_text TEXT NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT assessment_questions_form_key_unique UNIQUE (form_id, key)
);

CREATE INDEX idx_assessment_questions_form ON assessment_questions(form_id, display_order);
```

---

### 4. `assessment_scoring_rules`

Rules that map assessment answers to scores/bands.

```sql
CREATE TABLE assessment_scoring_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  form_id UUID NOT NULL REFERENCES assessment_forms(id) ON DELETE CASCADE,

  -- Rule definition
  score_key VARCHAR(100) NOT NULL, -- 'workload_band', 'complexity_band', 'advisory_band'
  operator scoring_operator NOT NULL,
  question_key VARCHAR(100) NOT NULL, -- References assessment_questions.key
  value_json JSONB NOT NULL, -- Can be number, string, array, etc.
  output_json JSONB NOT NULL, -- Can be band, score, or complex value

  -- Rule metadata
  rule_order INTEGER NOT NULL DEFAULT 0, -- For rule precedence
  description TEXT NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_assessment_scoring_rules_form ON assessment_scoring_rules(form_id, score_key, rule_order);
```

**Example Rule Data:**

```json
{
  "form_id": "...",
  "score_key": "workload_band",
  "operator": "greater_than",
  "question_key": "monthly_tx_count",
  "value_json": 1000,
  "output_json": "heavy"
}
```

---

### 5. `assessments`

Completed or in-progress assessment instances.

```sql
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES assessment_forms(id) ON DELETE RESTRICT,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  completed_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_assessments_lead ON assessments(lead_id);
CREATE INDEX idx_assessments_form ON assessments(form_id);
CREATE INDEX idx_assessments_status ON assessments(status);
```

---

### 6. `assessment_answers`

Individual answers for each question in an assessment.

```sql
CREATE TABLE assessment_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE RESTRICT,

  -- Answer value (flexible data type)
  value_json JSONB NOT NULL, -- Stores text, number, boolean, array, object

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT assessment_answers_assessment_question_unique UNIQUE (assessment_id, question_id)
);

CREATE INDEX idx_assessment_answers_assessment ON assessment_answers(assessment_id);
CREATE INDEX idx_assessment_answers_question ON assessment_answers(question_id);
```

**Example Value Data:**

```json
// For number type
{"value": 150}

// For boolean type
{"value": true}

// For enum type
{"value": "occasional"}

// For array type (advanced_accounting_features)
{"value": ["inventory", "revenue_recognition"]}
```

---

### 7. `assessment_scores`

Computed results from scoring rules.

```sql
CREATE TABLE assessment_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,

  -- Score metadata
  score_key VARCHAR(100) NOT NULL, -- 'workload_band', 'complexity_band', 'advisory_band', 'total_complexity_score'
  value_json JSONB NOT NULL, -- Can be band ('low', 'medium', 'high') or numeric score

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT assessment_scores_assessment_key_unique UNIQUE (assessment_id, score_key)
);

CREATE INDEX idx_assessment_scores_assessment ON assessment_scores(assessment_id);
CREATE INDEX idx_assessment_scores_key ON assessment_scores(score_key);
```

---

### 8. `service_order_templates`

Templates for service orders (discovery, cleanup, bookkeeping, etc.).

```sql
CREATE TABLE service_order_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Template ownership
  firm_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NULLABLE REFERENCES service_order_templates(id) ON DELETE SET NULL,

  -- Template definition
  service_type service_type NOT NULL,
  name VARCHAR(256) NOT NULL,
  description TEXT NULLABLE,

  -- Default pricing
  default_price DECIMAL(15, 2) NULLABLE,
  default_currency_id UUID NULLABLE REFERENCES currencies(id) ON DELETE RESTRICT,
  default_duration_days INTEGER NULLABLE,
  billing_cycle billing_cycle NOT NULL DEFAULT 'one_time',

  -- Terms and configuration
  terms_json JSONB NULLABLE DEFAULT '{}',
  config_json JSONB NULLABLE DEFAULT '{}',

  -- Template settings
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_service_order_templates_firm ON service_order_templates(firm_company_id, service_type);
CREATE INDEX idx_service_order_templates_default ON service_order_templates(firm_company_id, is_default) WHERE is_default = TRUE;
```

---

### 9. `service_orders`

Billable or contractual engagements (proposals, contracts).

```sql
CREATE TABLE service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Ownership
  firm_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NULLABLE REFERENCES leads(id) ON DELETE SET NULL,
  client_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE SET NULL,
  client_contact_id UUID NULLABLE REFERENCES contacts(id) ON DELETE SET NULL,

  -- Service definition
  service_type service_type NOT NULL,
  template_id UUID NULLABLE REFERENCES service_order_templates(id) ON DELETE SET NULL,

  -- Status and pricing
  status service_order_status NOT NULL DEFAULT 'draft',
  price DECIMAL(15, 2) NOT NULL,
  currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE RESTRICT,
  billing_cycle billing_cycle NOT NULL,

  -- Dates
  start_date DATE NULLABLE,
  end_date DATE NULLABLE,
  sent_at TIMESTAMP WITH TIME ZONE NULLABLE,
  accepted_at TIMESTAMP WITH TIME ZONE NULLABLE,
  paid_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Documents and terms
  terms_json JSONB NULLABLE DEFAULT '{}',
  pdf_url VARCHAR(512) NULLABLE,
  pdf_key VARCHAR(512) NULLABLE,

  -- Payment tracking
  payment_provider VARCHAR(100) NULLABLE, -- 'stripe', 'paystack', etc.
  payment_intent_id VARCHAR(256) NULLABLE,
  payment_failure_reason TEXT NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_service_orders_firm ON service_orders(firm_company_id, status);
CREATE INDEX idx_service_orders_lead ON service_orders(lead_id);
CREATE INDEX idx_service_orders_client ON service_orders(client_company_id);
CREATE INDEX idx_service_orders_status ON service_orders(status);
```

---

### 10. `pricing_profiles`

Pricing configuration for each service type.

```sql
CREATE TABLE pricing_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Ownership
  firm_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NULLABLE REFERENCES pricing_profiles(id) ON DELETE SET NULL,

  -- Profile definition
  service_type service_type NOT NULL,
  name VARCHAR(256) NOT NULL,
  description TEXT NULLABLE,

  -- Pricing configuration (JSONB for flexibility)
  config_json JSONB NOT NULL,
  config_version INTEGER NOT NULL DEFAULT 1,
  config_fingerprint VARCHAR(64) NOT NULL, -- SHA-256 hash of config_json

  -- Profile settings
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT pricing_profiles_config_valid CHECK (jsonb_typeof(config_json) = 'object')
);

CREATE INDEX idx_pricing_profiles_firm ON pricing_profiles(firm_company_id, service_type);
CREATE INDEX idx_pricing_profiles_default ON pricing_profiles(firm_company_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_pricing_profiles_fingerprint ON pricing_profiles(config_fingerprint);
```

**Example Config JSON (Bookkeeping):**

```json
{
  "base_price": 300,
  "size_breakpoints": [
    { "min_revenue": 0, "max_revenue": 50000, "multiplier": 1.0 },
    { "min_revenue": 50000, "max_revenue": 250000, "multiplier": 1.5 },
    { "min_revenue": 250000, "max_revenue": 1000000, "multiplier": 2.0 },
    { "min_revenue": 1000000, "max_revenue": null, "multiplier": 3.0 }
  ],
  "complexity_breakpoints": [
    { "min_triggers": 0, "max_triggers": 1, "multiplier": 1.0 },
    { "min_triggers": 2, "max_triggers": 3, "multiplier": 1.3 },
    { "min_triggers": 4, "max_triggers": null, "multiplier": 1.6 }
  ],
  "advisory_levels": {
    "none": 1.0,
    "basic": 1.2,
    "advanced": 1.5
  },
  "minimum_fee": 300
}
```

---

### 11. `firm_services`

Tracks which services each firm offers.

```sql
CREATE TABLE firm_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  firm_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_type service_type NOT NULL,

  -- Service configuration
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_enable_discovery BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSONB NULLABLE DEFAULT '{}',

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT firm_services_unique UNIQUE (firm_company_id, service_type)
);

CREATE INDEX idx_firm_services_firm ON firm_services(firm_company_id, is_enabled);
```

---

### 12. `workflow_templates`

Defines workflows for each service type (steps, tasks, dependencies).

```sql
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Template ownership
  firm_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID NULLABLE REFERENCES workflow_templates(id) ON DELETE SET NULL,

  -- Workflow definition
  service_type service_type NOT NULL,
  name VARCHAR(256) NOT NULL,
  description TEXT NULLABLE,

  -- Workflow structure (JSONB for flexibility)
  steps_json JSONB NOT NULL, -- Array of steps with tasks, dependencies, etc.
  deliverables_json JSONB NULLABLE DEFAULT '[]',
  duration_days INTEGER NULLABLE,

  -- Template settings
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT workflow_templates_steps_valid CHECK (jsonb_typeof(steps_json) = 'array')
);

CREATE INDEX idx_workflow_templates_firm ON workflow_templates(firm_company_id, service_type);
CREATE INDEX idx_workflow_templates_default ON workflow_templates(firm_company_id, is_default) WHERE is_default = TRUE;
```

**Example Steps JSON:**

```json
[
  {
    "step_id": "step_1",
    "name": "Initial Setup",
    "order": 1,
    "tasks": [
      {
        "task_id": "task_1",
        "name": "Collect bank statements",
        "order": 1,
        "depends_on": [],
        "can_run_parallel": true,
        "estimated_hours": 2
      },
      {
        "task_id": "task_2",
        "name": "Review chart of accounts",
        "order": 2,
        "depends_on": ["task_1"],
        "can_run_parallel": false,
        "estimated_hours": 1
      }
    ]
  }
]
```

---

### 13. `engagements`

Active service delivery engagements.

```sql
CREATE TABLE engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  -- Ownership
  firm_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_order_id UUID NULLABLE REFERENCES service_orders(id) ON DELETE SET NULL,
  client_company_id UUID NULLABLE REFERENCES companies(id) ON DELETE SET NULL,
  lead_id UUID NULLABLE REFERENCES leads(id) ON DELETE SET NULL,

  -- Engagement definition
  service_type service_type NOT NULL,
  workflow_template_id UUID NULLABLE REFERENCES workflow_templates(id) ON DELETE SET NULL,

  -- Status
  status engagement_status NOT NULL DEFAULT 'draft',
  started_at TIMESTAMP WITH TIME ZONE NULLABLE,
  completed_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Integration tracking
  accountable_books_company_id UUID NULLABLE, -- References companies(id) in Accountable Books
  external_tool_name VARCHAR(100) NULLABLE, -- 'qbo', 'xero', etc.
  external_tool_id VARCHAR(256) NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_engagements_firm ON engagements(firm_company_id, status);
CREATE INDEX idx_engagements_client ON engagements(client_company_id);
CREATE INDEX idx_engagements_service_order ON engagements(service_order_id);
CREATE INDEX idx_engagements_accountable_books ON engagements(accountable_books_company_id) WHERE accountable_books_company_id IS NOT NULL;
```

---

### 14. `engagement_tasks`

Individual tasks within an engagement.

```sql
CREATE TABLE engagement_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  -- Task definition
  task_key VARCHAR(100) NOT NULL, -- From workflow template
  name VARCHAR(256) NOT NULL,
  description TEXT NULLABLE,

  -- Status and assignment
  status task_status NOT NULL DEFAULT 'pending',
  assigned_to_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NULLABLE,
  completed_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Dependencies (stored as array for query efficiency)
  depends_on_task_ids UUID[] NULLABLE DEFAULT '{}',

  -- Task data
  data_json JSONB NULLABLE DEFAULT '{}',
  estimated_hours DECIMAL(5, 2) NULLABLE,
  actual_hours DECIMAL(5, 2) NULLABLE,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE
);

CREATE INDEX idx_engagement_tasks_engagement ON engagement_tasks(engagement_id, status);
CREATE INDEX idx_engagement_tasks_assigned ON engagement_tasks(assigned_to_id, status);
CREATE INDEX idx_engagement_tasks_dependencies ON engagement_tasks USING GIN(depends_on_task_ids);
```

---

### 15. `engagement_data`

Structured data collected during engagement (discovery findings, etc.).

```sql
CREATE TABLE engagement_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  -- Data definition
  data_key VARCHAR(100) NOT NULL, -- 'final_workload_band', 'cleanup_scope', etc.
  value_json JSONB NOT NULL,

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT engagement_data_engagement_key_unique UNIQUE (engagement_id, data_key)
);

CREATE INDEX idx_engagement_data_engagement ON engagement_data(engagement_id);
```

---

### 16. `engagement_assignments`

Team member assignments to engagements (join table for many-to-many).

```sql
CREATE TABLE engagement_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),

  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Assignment metadata
  role VARCHAR(100) NULLABLE, -- 'lead', 'contributor', 'reviewer'

  -- Standard columns
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NULLABLE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE NULLABLE,

  -- Constraints
  CONSTRAINT engagement_assignments_unique UNIQUE (engagement_id, user_id)
);

CREATE INDEX idx_engagement_assignments_engagement ON engagement_assignments(engagement_id);
CREATE INDEX idx_engagement_assignments_user ON engagement_assignments(user_id);
```

---

## Integration Points with Accountable Books

### 1. Lead → Company Creation

**Trigger**: When `leads.status` changes to `'active_client'`

**Action**:

1. Create company in Accountable Books via API
2. Link via `engagements.accountable_books_company_id`
3. Copy assessment scores to company metadata

**API Endpoint** (Accountable Books):

```
POST /api/companies
{
  "legal_name": "...",
  "display_name": "...",
  "type": "business",
  "country_id": "...",
  "metadata": {
    "workload_band": "medium",
    "complexity_band": "low",
    "advisory_band": "none",
    "source_lead_id": "..."
  }
}
```

### 2. Assessment Data → Company Configuration

**Use Case**: When creating company, use assessment data to:

- Pre-configure chart of accounts
- Set workload expectations
- Initialize pricing

**Data Flow**:

```
assessment_scores → company.metadata_json → Accountable Books config
```

### 3. Service Order → Service Tracking

**Tracking**: Which services use Accountable Books vs external tools

**Fields**:

- `engagements.accountable_books_company_id` - Links to Accountable Books company
- `engagements.external_tool_name` - 'qbo', 'xero', etc.
- `engagements.external_tool_id` - External system ID

### 4. Engagement Tasks → Work Milestones

**Integration**: Link engagement tasks to bookkeeping milestones

**Future Enhancement**: Sync task completion to Accountable Books milestones

---

## API Design Considerations (Go Migration)

### RESTful Endpoints Structure

```
/api/v1/leads
/api/v1/leads/:id/assessments
/api/v1/assessments/:id/answers
/api/v1/assessments/:id/scores
/api/v1/service-orders
/api/v1/engagements
/api/v1/engagements/:id/tasks
/api/v1/pricing-profiles
/api/v1/workflow-templates
```

### Response Format

Following Accountable Books pattern:

```json
{
  "success": true,
  "message": "Lead created successfully",
  "data": { ... }
}
```

### Error Handling

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "errors": [ ... ]
}
```

### Authentication

- JWT tokens (shared with Accountable Books)
- Company-scoped access (via `firm_company_id`)
- Role-based permissions (via `user_company_roles`)

---

## Migration Strategy

### Phase 1: Database Setup

1. Create enum types
2. Create core tables (leads, assessments, service_orders, engagements)
3. Create indexes
4. Set up triggers for `updated_at`

### Phase 2: Seed Data

1. Create platform assessment form templates
2. Create default service order templates
3. Create default workflow templates
4. Create default pricing profiles

### Phase 3: API Development (Go)

1. Implement CRUD operations
2. Implement assessment scoring engine
3. Implement pricing calculator
4. Implement workflow engine

### Phase 4: Integration

1. Set up API communication with Accountable Books
2. Implement company creation webhook
3. Implement data sync mechanisms

---

## Key Design Decisions

### 1. Reuse Existing Tables

**Decision**: Use `companies`, `users`, `contacts` from Accountable Books

**Rationale**:

- Avoids data duplication
- Ensures referential integrity
- Simplifies integration

### 2. EAV Pattern for Assessments

**Decision**: Use `assessment_questions` + `assessment_answers` (EAV)

**Rationale**:

- Flexible question types
- Easy to add new questions without schema changes
- Supports template cloning

### 3. JSONB for Flexible Configs

**Decision**: Use JSONB for `config_json`, `steps_json`, `terms_json`

**Rationale**:

- Flexible pricing models
- Complex workflow definitions
- Easy to version and validate

### 4. Soft Deletes

**Decision**: All tables use `is_deleted` + `deleted_at`

**Rationale**:

- Audit trail
- Data recovery
- Consistent with Accountable Books

### 5. Template System

**Decision**: `template_id` + `firm_company_id` pattern

**Rationale**:

- Platform templates (`firm_company_id = NULL`)
- Firm-specific customizations
- Template versioning

---

## Future Enhancements

1. **Assessment Versioning**: Track form version changes and migrate existing assessments
2. **Pricing Calculator Service**: Separate microservice for complex pricing calculations
3. **Workflow Engine**: State machine for task dependencies and parallel execution
4. **Integration Hub**: Webhook system for external tool integrations
5. **Analytics**: Dashboard for lead conversion, pricing optimization, engagement metrics

---

## Notes for Go Implementation

### Database Access

- Use `database/sql` or `sqlx` for PostgreSQL
- Consider `gorm` for ORM (optional)
- Use connection pooling
- Implement transaction management

### JSONB Handling

- Use `json.RawMessage` or custom types
- Validate JSONB with JSON Schema
- Use `jsonb_typeof()` in queries

### UUID Generation

- Use `uuid_generate_v7()` (PostgreSQL function)
- Or generate in Go using `github.com/google/uuid`

### Timestamps

- Use `time.Time` with timezone
- Store as `TIMESTAMP WITH TIME ZONE`
- Use `NOW()` for defaults

### Soft Deletes

- Always filter `WHERE is_deleted = FALSE`
- Use `deleted_at IS NULL` for active records
- Implement restore functionality

---

## Conclusion

This design document provides a complete blueprint for Accountable Engage that:

- ✅ Reuses existing Accountable Books schema patterns
- ✅ Designs for seamless Go migration
- ✅ Ensures API-first integration
- ✅ Supports both standalone and suite deployment
- ✅ Maintains data consistency and referential integrity

When ready to implement, this document serves as the single source of truth for database schema, relationships, and integration points.
