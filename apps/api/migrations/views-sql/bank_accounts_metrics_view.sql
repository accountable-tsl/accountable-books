-- Bank Accounts Metrics View
-- Comprehensive view aggregating all bank account data points for fast querying
-- Includes: balances, transaction counts, categorization status, sync info, etc.

CREATE OR REPLACE VIEW bank_accounts_metrics_view AS
WITH transaction_stats AS (
  -- Aggregate transaction counts per bank account
  SELECT 
    bt.bank_account_id,
    COUNT(*) FILTER (WHERE bt.is_deleted = false)::int as total_transactions,
    COUNT(*) FILTER (
      WHERE bt.is_deleted = false 
        AND bt.ledger_transaction_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM categorization_candidates cc
          WHERE cc.bank_transaction_id = bt.id
            AND cc.is_deleted = false
        )
    )::int as uncategorized_count,
    COUNT(*) FILTER (
      WHERE bt.is_deleted = false 
        AND bt.ledger_transaction_id IS NULL
        AND EXISTS (
          SELECT 1 FROM categorization_candidates cc
          WHERE cc.bank_transaction_id = bt.id
            AND cc.is_deleted = false
        )
    )::int as needs_review_count,
    COUNT(*) FILTER (
      WHERE bt.is_deleted = false 
        AND bt.ledger_transaction_id IS NOT NULL
    )::int as posted_count,
    MAX(bt.transaction_date) FILTER (WHERE bt.is_deleted = false) as last_transaction_date,
    MAX(bt.transaction_at) FILTER (WHERE bt.is_deleted = false) as last_transaction_at
  FROM bank_transactions bt
  GROUP BY bt.bank_account_id
),
balance_stats AS (
  -- Get current balances
  SELECT 
    ba.id as bank_account_id,
    COALESCE(bab.native_balance, 0) as statement_balance_native,
    COALESCE(glb.reporting_currency_balance, 0) as ledger_balance_reporting
  FROM bank_accounts ba
  LEFT JOIN bank_account_current_native_balances bab 
    ON bab.bank_account_id = ba.id 
    AND bab.company_id = ba.company_id
  LEFT JOIN gl_current_balances glb 
    ON glb.coa_id = ba.coa_id 
    AND glb.company_id = ba.company_id
),
exchange_rates_latest AS (
  -- Get latest exchange rates for all currency pairs (optimized to avoid duplicate subqueries)
  SELECT DISTINCT ON (er.base_currency_id, er.price_currency_id)
    er.base_currency_id,
    er.price_currency_id,
    er.rate,
    er.rate_date
  FROM exchange_rates er
  WHERE er.rate_date <= CURRENT_DATE
  ORDER BY er.base_currency_id, er.price_currency_id, er.rate_date DESC
)
SELECT 
  -- Bank Account Core Fields
  ba.id,
  ba.display_name as display_name,
  ba.account_type as account_type,
  ba.coa_id as coa_id,
  ba.currency_id as currency_id,
  ba.bank_id as bank_id,
  ba.company_id as company_id,
  ba.business_or_personal as business_or_personal,
  ba.connection_status as bank_connection_status,
  ba.provider_bank_account_id as provider_bank_account_id,
  ba.connection_credential_id as connection_credential_id,
  ba.account_number_mask as account_number_mask,
  ba.account_number as account_number,
  RIGHT(COALESCE(ba.account_number_mask, ba.account_number), 4) as mask,
  
  -- Bank Details
  b.display_name as bank_name,
  b.logo_url as bank_logo,
  
  -- Currency Details
  cur.name as currency_name,
  cur.symbol as currency_symbol,
  cur.code as currency_code,
  
  -- Reporting Currency
  rc.id as reporting_currency_id,
  rc.name as reporting_currency_name,
  rc.symbol as reporting_currency_symbol,
  rc.code as reporting_currency_code,
  
  -- Chart of Accounts
  coa.name as coa_name,
  coa.code as coa_code,
  
  -- Account Type
  at.label as coa_type_label,
  at.key as coa_type_key,
  
  -- Provider Details
  p.key as provider_key,
  p.display_name as provider_name,
  p.logo_url as provider_logo,
  
  -- Sync Information
  COALESCE(ba.last_sync_at, ba.updated_at) as last_sync_at,
  ba.last_sync_at as last_sync_at_explicit,
  ba.updated_at as updated_at,
  
  -- Balance Information
  COALESCE(bs.statement_balance_native, 0) as statement_balance_native,
  COALESCE(bs.ledger_balance_reporting, 0) as ledger_balance_reporting,
  
  -- Transaction Statistics
  COALESCE(ts.total_transactions, 0) as total_transactions,
  COALESCE(ts.uncategorized_count, 0) as uncategorized_count,
  COALESCE(ts.needs_review_count, 0) as needs_review_count,
  COALESCE(ts.posted_count, 0) as posted_count,
  ts.last_transaction_date,
  ts.last_transaction_at,
  
  -- Exchange Rate (latest available)
  CASE 
    WHEN ba.currency_id = c.reporting_currency_id THEN 1.0
    ELSE COALESCE(erl.rate, 1.0)
  END as latest_exchange_rate,
  
  -- Calculated Fields
  CASE 
    WHEN ba.currency_id = c.reporting_currency_id THEN 
      COALESCE(bs.statement_balance_native, 0)
    ELSE 
      COALESCE(bs.statement_balance_native, 0) * COALESCE(erl.rate, 1.0)
  END as statement_balance_reporting,
  
  -- Health Indicators
  CASE 
    WHEN COALESCE(ts.uncategorized_count, 0) > 0 THEN 'has_uncategorized'
    WHEN COALESCE(ts.needs_review_count, 0) > 0 THEN 'needs_review'
    WHEN COALESCE(ts.posted_count, 0) > 0 THEN 'posted'
    ELSE 'empty'
  END as categorization_status_summary,
  
  -- Timestamps
  ba.created_at,
  ba.is_deleted

FROM bank_accounts ba
INNER JOIN banks b ON ba.bank_id = b.id
INNER JOIN currencies cur ON ba.currency_id = cur.id
INNER JOIN companies c ON ba.company_id = c.id
INNER JOIN currencies rc ON c.reporting_currency_id = rc.id
INNER JOIN coa ON ba.coa_id = coa.id
LEFT JOIN account_types at ON coa.account_type_id = at.id
LEFT JOIN bank_feed_providers p ON ba.provider_id = p.id
LEFT JOIN transaction_stats ts ON ts.bank_account_id = ba.id
LEFT JOIN balance_stats bs ON bs.bank_account_id = ba.id
LEFT JOIN exchange_rates_latest erl ON erl.base_currency_id = ba.currency_id
  AND erl.price_currency_id = c.reporting_currency_id
WHERE ba.is_deleted = false;
