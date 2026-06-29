-- Categorization Transactions View
-- Unifies bank transactions, categorization candidates, and ledger entries
-- for the categorization engine UI. Shows only non-bank legs.

CREATE OR REPLACE VIEW categorization_engine_view AS
WITH uncategorized_txns AS (
  -- Bank transactions without candidates or ledger entries
  SELECT 
    bt.id,
    bt.transaction_date as date,
    bt.transaction_date as fs_date,
    bt.amount as bank_amount,
    bt.description as description,
    bt.reference as reference,
    bt.payee as contact_name,
    NULL::uuid as contact_id,
    NULL as contact_type,
    bt.bank_account_id,
    ba.display_name as bank_account_display_name,
    b.id as bank_id,
    b.display_name as bank_display_name,
    ba.currency_id as bank_currency_id,
    cur.code as bank_currency_code,
    b.logo_url as bank_logo,
    ba.coa_id as bank_account_coa_id,
    ba_coa.name as bank_account_coa_name,
    ba_coa.code as bank_account_coa_code,
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
    NULL::uuid as ledger_entry_id,
    NULL::uuid as candidate_id,
    NULL::uuid as candidate_line_id,
    NULL::decimal as confidence,
    NULL::text as explanation,
    NULL::boolean as human_reviewed,
    NULL::uuid as categorization_candidate_id,
    'uncategorized'::text as categorization_status,
    ba.company_id as company_id,
    
    -- Reporting Currency
    rc.id as reporting_currency_id,
    rc.code as reporting_currency_code,
    rc.name as reporting_currency_name,
    rc.symbol as reporting_currency_symbol,
    
    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = ba.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> bt.transaction_date
    ) as is_editable,

    NULL::text as review_notes,
    NULL::jsonb as ledger_metadata,  -- No metadata for uncategorized transactions
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', tf_bank.id,
          'name', tf_bank.name,
          'key', tf_bank.key,
          'bucket_name', tf_bank.bucket_name,
          'url', tf_bank.url,
          'type', tf_bank.mime_type,
          'size_bytes', tf_bank.size_bytes
        )
      ) FILTER (WHERE tf_bank.id IS NOT NULL),
      '[]'::jsonb
    ) as files

  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  LEFT JOIN coa ba_coa ON ba.coa_id = ba_coa.id
  JOIN companies c ON ba.company_id = c.id
  LEFT JOIN currencies rc ON c.reporting_currency_id = rc.id
  LEFT JOIN file_attachments fa_bank ON fa_bank.source = 'bank'
    AND fa_bank.transaction_id = bt.id
    AND fa_bank.entry_id IS NULL
    AND fa_bank.is_deleted = false
  LEFT JOIN files tf_bank ON tf_bank.id = fa_bank.file_id
    AND tf_bank.is_deleted = false
  WHERE bt.is_deleted = false
    AND bt.ledger_transaction_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM categorization_candidates cc
      WHERE cc.bank_transaction_id = bt.id
        AND cc.is_deleted = false
        AND cc.review_state = 'pending_review'
    )
  GROUP BY bt.id, bt.transaction_date, bt.amount, bt.description, bt.reference, bt.payee,
    bt.bank_account_id, ba.display_name, b.id, b.display_name,
    ba.currency_id, cur.code, b.logo_url, ba.coa_id, ba_coa.name, ba_coa.code, 
    bt.system_exchange_rate, ba.company_id, rc.id, rc.code, rc.name, rc.symbol
),
candidate_txns AS (
  -- Transactions with candidates (not yet posted)
  -- Shows candidate lines (non-bank legs only)
  SELECT 
    bt.id,
    bt.transaction_date as date,
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
    ba.coa_id as bank_account_coa_id,
    ba_coa.name as bank_account_coa_name,
    ba_coa.code as bank_account_coa_code,

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
    NULL::uuid as ledger_entry_id,
    cc.id as candidate_id,
    ccl.id as candidate_line_id,
    cc.confidence,
    cc.explanation,
    NULL::boolean as human_reviewed,
    NULL::uuid as categorization_candidate_id,
    'proposed'::text as categorization_status,
    cc.company_id as company_id,

    -- Reporting Currency
    rc.id as reporting_currency_id,
    rc.code as reporting_currency_code,
    rc.name as reporting_currency_name,
    rc.symbol as reporting_currency_symbol,

    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = cc.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> ccl.fs_date::date
    ) as is_editable,

    NULL::text as review_notes,
    NULL::jsonb as ledger_metadata,  -- No metadata for candidate transactions
    '[]'::jsonb as files

  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  LEFT JOIN coa ba_coa ON ba.coa_id = ba_coa.id
  JOIN categorization_candidates cc ON cc.bank_transaction_id = bt.id
  JOIN categorization_candidate_lines ccl ON ccl.candidate_id = cc.id
  JOIN companies c ON cc.company_id = c.id
  LEFT JOIN currencies rc ON c.reporting_currency_id = rc.id
  LEFT JOIN contacts ON ccl.contact_id = contacts.id
  LEFT JOIN coa ON ccl.coa_id = coa.id
  LEFT JOIN projects ON ccl.project_id = projects.id
  WHERE bt.is_deleted = false
    AND cc.is_deleted = false
    AND cc.review_state = 'pending_review'
    AND ccl.is_deleted = false
    AND ccl.is_bank_leg = false  -- Exclude bank leg
    AND bt.ledger_transaction_id IS NULL  -- Not yet posted
),
posted_txns AS (
  -- Transactions posted to ledger
  -- Shows ledger entries (non-bank legs only)
  SELECT 
    bt.id,
    bt.transaction_date as date,
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
    ba.coa_id as bank_account_coa_id,
    ba_coa.name as bank_account_coa_name,
    ba_coa.code as bank_account_coa_code,
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
    le.id as ledger_entry_id,
    NULL::uuid as candidate_id,
    NULL::uuid as candidate_line_id,
    NULL::decimal as confidence,
    NULL::text as explanation,
    le.human_reviewed,
    lt.categorization_candidate_id,
    'posted'::text as categorization_status,
    lt.company_id as company_id,
    
    -- Reporting Currency
    rc.id as reporting_currency_id,
    rc.code as reporting_currency_code,
    rc.name as reporting_currency_name,
    rc.symbol as reporting_currency_symbol,
    
    -- Check if fs_date falls in a closed/locked period
    NOT EXISTS (
      SELECT 1 FROM fiscal_calendar fc
      WHERE fc.company_id = lt.company_id
        AND fc.period_type = 'monthly'
        AND fc.status IN ('closed', 'locked')
        AND fc.period_span @> le.fs_date::date
    ) as is_editable,

    le.review_notes,
    le.metadata as ledger_metadata,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'id', COALESCE(tf_entry.id, tf_txn.id),
          'name', COALESCE(tf_entry.name, tf_txn.name),
          'key', COALESCE(tf_entry.key, tf_txn.key),
          'bucket_name', COALESCE(tf_entry.bucket_name, tf_txn.bucket_name),
          'url', COALESCE(tf_entry.url, tf_txn.url),
          'type', COALESCE(tf_entry.mime_type, tf_txn.mime_type),
          'size_bytes', COALESCE(tf_entry.size_bytes, tf_txn.size_bytes)
        )
      ) FILTER (WHERE COALESCE(tf_entry.id, tf_txn.id) IS NOT NULL),
      '[]'::jsonb
    ) as files

  FROM bank_transactions bt
  JOIN bank_accounts ba ON bt.bank_account_id = ba.id
  JOIN banks b ON ba.bank_id = b.id
  JOIN currencies cur ON ba.currency_id = cur.id
  LEFT JOIN coa ba_coa ON ba.coa_id = ba_coa.id
  JOIN ledger_transactions lt
    ON lt.company_id = ba.company_id
    AND lt.transaction_source = 'bank_transaction'
    AND lt.source_transaction_id = bt.id
    AND lt.status = 'posted'
  JOIN ledger_entries le ON le.ledger_transaction_id = lt.id
  JOIN companies c ON lt.company_id = c.id
  LEFT JOIN currencies rc ON c.reporting_currency_id = rc.id
  LEFT JOIN contacts ON le.contact_id = contacts.id
  LEFT JOIN coa ON le.coa_id = coa.id
  LEFT JOIN projects ON le.project_id = projects.id
  -- Join files via file_attachments: prioritize entry-level files, fallback to transaction-level
  LEFT JOIN file_attachments fa_entry ON fa_entry.source = 'ledger'
    AND fa_entry.transaction_id = lt.id
    AND fa_entry.entry_id = le.id
    AND fa_entry.is_deleted = false
  LEFT JOIN files tf_entry ON tf_entry.id = fa_entry.file_id
    AND tf_entry.is_deleted = false
  LEFT JOIN file_attachments fa_txn ON fa_txn.source = 'ledger'
    AND fa_txn.transaction_id = lt.id
    AND fa_txn.entry_id IS NULL
    AND fa_txn.is_deleted = false
  LEFT JOIN files tf_txn ON tf_txn.id = fa_txn.file_id
    AND tf_txn.is_deleted = false
  WHERE bt.is_deleted = false
    AND le.is_bank_leg = false  -- Exclude bank leg
  GROUP BY bt.id, bt.transaction_date, bt.amount, bt.bank_account_id, ba.display_name, b.id, b.display_name,
    ba.currency_id, cur.code, b.logo_url, ba.coa_id, ba_coa.name, ba_coa.code,
    le.fs_date, le.description, lt.reference, contacts.display_name, le.contact_id, 
    le.contact_type, le.coa_id, coa.name, coa.code, le.project_id, projects.name,
    le.system_exchange_rate, le.custom_exchange_rate, le.source_amount, 
    lt.id, le.id, lt.categorization_candidate_id, lt.company_id, rc.id, rc.code, 
    rc.name, rc.symbol, le.human_reviewed, le.review_notes, le.metadata
)
SELECT * FROM uncategorized_txns
UNION ALL
SELECT * FROM candidate_txns
UNION ALL
SELECT * FROM posted_txns;
