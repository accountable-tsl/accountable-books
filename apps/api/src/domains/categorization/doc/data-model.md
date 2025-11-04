## Categorization Data Model Snapshot

### Stage 1 – Ingestion & Enrichment

#### `categorization_tasks`
- **Purpose:** Persist Stage 1 `EnrichedTransaction` snapshot per bank transaction.
- **Key fields:**  
  `id`, `bank_transaction_id` (unique FK), `company_id`, `enriched_transaction` (JSONB), `enrichment_version`, `status`, `source`, `checksum`, `created_at`, `updated_at`, `is_deleted`.

#### `bank_transaction_contact_stats`
- **Purpose:** Pre-categorization contact stats derived from bank data only.
- **Key fields:**  
  `id`, `company_id`, `contact_id` (nullable), `contact_fingerprint`, `normalized_name`, `currency_code`, lifetime metrics (`total_transactions`, `total_amount_native/reporting`, `avg_amount_*`, `std_dev_amount_*`), rolling 30d/90d metrics, `last_transaction_id`, `last_transaction_date`, `created_at`, `updated_at`, `is_deleted`.

### Stage 2 – Rules Engine

#### `categorization_rules`
- **Purpose:** Store deterministic rule definitions with scope and priority.
- **Key fields:**  
  `rule_id`, `company_id` (nullable for global), `layer`, `priority`, `name`, `description`, `conditions` (JSONB), `actions` (JSONB), `confidence`, `effective_from`, `effective_to`, `is_active`, `created_by_id`, `created_at`, `updated_at`.

#### `categorization_rule_hits`
- **Purpose:** Audit every rule that matched a transaction.
- **Key fields:**  
  `id`, `rule_id`, `bank_transaction_id`, `company_id`, `hit_payload` (JSONB), `confidence`, `matched_at`.

### Stage 3 – ML Inference

#### `categorization_predictions`
- **Purpose:** Envelope for each proposed journal bundle (rules or ML).
- **Key fields:**  
  `id`, `bank_transaction_id`, `company_id`, `source` (`rule|ml`), `rank`, `is_primary`, `confidence`, `model_version`, `prediction_group_id`, `status`, `input_checksum`, `created_at`.

#### `categorization_prediction_lines`
- **Purpose:** Debit/credit legs belonging to a prediction.
- **Key fields:**  
  `id`, `prediction_id` (FK), `line_rank`, `coa_id`, `project_id`, `source_currency_id`, `source_amount`, `system_exchange_rate`, `custom_exchange_rate`, `description`, `rationale`, `created_at`.

### Stage 4 – Constraint Solver

#### `categorization_candidates`
- **Purpose:** Solver-approved bundles ready for review/posting.
- **Key fields:**  
  `id`, `prediction_id` (FK), `bank_transaction_id`, `company_id`, `status`, `posting_date`, `contact_id`, `description`, `reference`, `solver_notes`, `assignee_id`, `created_at`, `updated_at`.

#### `categorization_constraint_violations`
- **Purpose:** Record issues detected or auto-corrected during constraint checks.
- **Key fields:**  
  `id`, `candidate_id` (FK), `violation_type`, `message`, `severity`, `resolved` (bool), `created_at`.

### Stage 5/6 – Presentation & Feedback

#### `categorization_feedback_events`
- **Purpose:** Immutable log of user actions on candidates.
- **Key fields:**  
  `id`, `candidate_id`, `bank_transaction_id`, `company_id`, `event_type`, `actor_id`, `payload_before` (JSONB), `payload_after` (JSONB), `created_at`.

#### `categorization_feedback_stats`
- **Purpose:** Aggregated post-categorization outcomes for model training.
- **Key fields:**  
  `id`, `company_id`, `contact_id` (nullable), `contact_fingerprint`, `contact_normalized_name`, `currency_code`,
  lifetime activity (`total_events`, `accepted_count`, `rejected_count`, `auto_posted_count`),  
  monetary totals (`total_amount_native`, `total_amount_reporting`),  
  outcome snapshot (`last_posted_at`, `last_posted_coa_id`, `last_posted_contact_id`, `last_custom_exchange_rate`, `last_user_id`),  
  rolling windows (`rolling_30d_events`, `rolling_30d_accept_count`, `rolling_30d_amount_reporting`, `rolling_90d_events`, `rolling_90d_accept_count`, `rolling_90d_amount_reporting`),  
  override markers (`has_contact_override`, `has_fx_override`, `has_split_history`),  
  `created_at`, `updated_at`, `is_deleted`.

### Posting Targets (Existing Accounting Tables)

#### `ledger_transactions`
- **Purpose:** Journal headers created when a candidate is posted.
- **Key fields:**  
  `id`, `company_id`, `date`, `source`, `description`, `reference`, `note`, `contact_id`, `bank_transaction_id`, `bank_transaction_date`, `created_by_id`, `updated_by_id`, standard timestamps.

#### `ledger_entries`
- **Purpose:** Journal line items linked to `ledger_transactions`.
- **Key fields:**  
  `id`, `ledger_transaction_id`, `fs_date`, `coa_id`, `source_currency_id`, `source_amount`, `system_exchange_rate`, `custom_exchange_rate`, generated `amount`, `transaction_side`, `description`, `project_id`, `categorization_status`, `created_at`, `updated_at`.
