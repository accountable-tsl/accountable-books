-- Categorization Transactions View
-- Unifies bank transactions, categorization candidates, and ledger entries
-- for the categorization engine UI. Shows only non-bank legs.

CREATE OR REPLACE VIEW categorization_engine_view AS
WITH uncategorized_txns AS (
  -- Bank transactions without candidates or ledger entries
  SELECT 
    bt.id,
    bt.date,
    bt.date as fs_date,
    bt.amount as bank_amount,
    bt.description as description,
    bt.reference as reference,
    bt.payee as contact_name,
    bt.contact_id,
    bt.contact_type_snapshot as contact_type,
    bt.bank_account_id,
    ba.display_name as bank_account_display_name,
    b.id as bank_id,
    b.display_name as bank_display_name,
    ba.currency_id as bank_currency_id,
    cur.code as bank_currency_code,
    b.logo_url as bank_logo,
    NULL::uuid as coa_id,
    NULL::text as coa_name,
    NULL::text as coa_code,
    NULL::uuid as project_id,
    NULL::text as project_name,

    -- NULL::decimal as amount,
    -- NULL::decimal as exchange_rate,
    bt.system_exchange_rate as system_exchange_rate,
    bt.system_exchange_rate as custom_exchange_rate,  -- No custom rate for uncategorized transactions
    bt.amount as native_amount,
    bt.amount * bt.system_exchange_rate as reporting_amount,

    NULL::uuid as ledger_transaction_id,
    NULL::uuid as candidate_id,
    NULL::decimal as confidence,
    NULL::text as explanation,
    NULL::boolean as human_reviewed,
    NULL::uuid as categorization_candidate_id,
    'uncategorized'::text as categorization_status,
    ba.company_id as company_id,
    
    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = ba.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> bt.date::date
    ) as is_editable

  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  WHERE bt.is_deleted = false
    AND bt.ledger_transaction_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM categorization_candidates cc
      WHERE cc.bank_transaction_id = bt.id
        AND cc.is_deleted = false
    )
),
candidate_txns AS (
  -- Transactions with candidates (not yet posted)
  -- Shows candidate lines (non-bank legs only)
  SELECT 
    bt.id,
    bt.date,
    ccl.fs_date,
    bt.amount as bank_amount,
    ccl.description as description,
    cc.reference as reference,
    contacts.display_name as contact_name,
    ccl.contact_id as contact_id,
    ccl.contact_type as contact_type,

    bt.bank_account_id,
    ba.display_name as bank_account_display_name,
    b.id as bank_id,
    b.display_name as bank_display_name,
    ba.currency_id as bank_currency_id,
    cur.code as bank_currency_code,
    b.logo_url as bank_logo,

    ccl.coa_id,
    coa.name as coa_name,
    coa.code as coa_code,
    ccl.project_id,
    projects.name as project_name,
    ccl.system_exchange_rate as system_exchange_rate,
    ccl.custom_exchange_rate as custom_exchange_rate,

    ccl.signed_native_amount as native_amount,
    ccl.signed_native_amount * ccl.custom_exchange_rate as reporting_amount,

    NULL::uuid as ledger_transaction_id,
    cc.id as candidate_id,
    cc.confidence,
    cc.explanation,
    NULL::boolean as human_reviewed,
    NULL::uuid as categorization_candidate_id,
    'proposed'::text as categorization_status,
    cc.company_id as company_id,

    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = cc.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> ccl.fs_date::date
    ) as is_editable

  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  JOIN categorization_candidates cc ON cc.bank_transaction_id = bt.id
  JOIN categorization_candidate_lines ccl ON ccl.candidate_id = cc.id
  LEFT JOIN contacts ON ccl.contact_id = contacts.id
  LEFT JOIN coa ON ccl.coa_id = coa.id
  LEFT JOIN projects ON ccl.project_id = projects.id
  WHERE bt.is_deleted = false
    AND cc.is_deleted = false
    AND ccl.is_deleted = false
    AND ccl.is_bank_leg = false  -- Exclude bank leg
    AND bt.ledger_transaction_id IS NULL  -- Not yet posted
),
posted_txns AS (
  -- Transactions posted to ledger
  -- Shows ledger entries (non-bank legs only)
  SELECT 
    bt.id,
    bt.date,
    le.fs_date,
    bt.amount as bank_amount,
    le.description as description,
    lt.reference as reference,
    contacts.display_name as contact_name,
    le.contact_id as contact_id,
    le.contact_type as contact_type,
    bt.bank_account_id,
    ba.display_name as bank_account_display_name,
    b.id as bank_id,
    b.display_name as bank_display_name,
    ba.currency_id as bank_currency_id,
    cur.code as bank_currency_code,
    b.logo_url as bank_logo,
    le.coa_id,
    coa.name as coa_name,
    coa.code as coa_code,
    le.project_id,
    projects.name as project_name,

    le.system_exchange_rate as system_exchange_rate,
    le.custom_exchange_rate as custom_exchange_rate,
    le.source_amount as native_amount,
    le.source_amount * le.custom_exchange_rate as reporting_amount,
    
    lt.id as ledger_transaction_id,
    NULL::uuid as candidate_id,
    NULL::decimal as confidence,
    NULL::text as explanation,
    lt.human_reviewed,
    lt.categorization_candidate_id,
    'posted'::text as categorization_status,
    lt.company_id as company_id,
    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = lt.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> le.fs_date::date
    ) as is_editable
  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  JOIN ledger_transactions lt ON lt.source_transaction_id = bt.id
  JOIN ledger_entries le ON le.ledger_transaction_id = lt.id
  LEFT JOIN contacts ON le.contact_id = contacts.id
  LEFT JOIN coa ON le.coa_id = coa.id
  LEFT JOIN projects ON le.project_id = projects.id
  WHERE bt.is_deleted = false
    AND lt.is_deleted = false
    AND le.is_deleted = false
    AND le.is_bank_leg = false  -- Exclude bank leg
)
SELECT * FROM uncategorized_txns
UNION ALL
SELECT * FROM candidate_txns
UNION ALL
SELECT * FROM posted_txns;

