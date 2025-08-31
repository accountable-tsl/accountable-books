-- Enums & extensions are already created 

-- Create table
CREATE TABLE public.bank_transactions (
    id                      UUID NOT NULL DEFAULT uuid_generate_v7(),
    date                    DATE NOT NULL,
    payee                   TEXT,
    reference               TEXT,
    description             TEXT,
    additional_notes        TEXT,
    amount                  NUMERIC(32, 10) NOT NULL,
    absolute_amount         NUMERIC(32, 10) NOT NULL GENERATED ALWAYS AS (abs(amount)) STORED,
    system_exchange_rate    NUMERIC(32, 10) NOT NULL,
    -- Different from regular accounting convention, this just mirrors user bank statement
    transaction_side        debit_credit GENERATED ALWAYS AS (
        CASE
            WHEN amount > 0 THEN 'credit'::debit_credit
            WHEN amount < 0 THEN 'debit' ::debit_credit
            ELSE NULL::debit_credit
        END
    ) STORED,
    categorization_status   categorization_status NOT NULL DEFAULT 'uncategorized',
    bank_account_id         UUID NOT NULL,
    bank_transaction_batch_id  UUID,
    ledger_transaction_id   UUID,
    external_id             TEXT,
    raw_data                JSONB,
    created_by_id           UUID NOT NULL,
    updated_by_id           UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted              BOOLEAN NOT NULL DEFAULT false,
    deleted_at              TIMESTAMPTZ,
    search_text TEXT GENERATED ALWAYS AS (
    trim(both ' ' from lower(
        coalesce(payee, '') || ' ' || coalesce(description, '') || ' ' || coalesce(reference, '')
    ))
    ) STORED,
    CONSTRAINT system_exchange_rate_chk CHECK (system_exchange_rate > 0),
    CONSTRAINT bank_transactions_nonzero_amount_chk CHECK (amount <> 0),
    CONSTRAINT bank_transactions_delete_consistency CHECK (
        (is_deleted = false AND deleted_at IS NULL) OR
        (is_deleted = true AND deleted_at IS NOT NULL)
    ),
    CONSTRAINT bank_transactions_pkey PRIMARY KEY (id, date),
    CONSTRAINT bank_transactions_account_external_id_date_unique UNIQUE (bank_account_id, external_id, date)
) PARTITION BY RANGE (date);

-- Partitioned indexes on the parent
CREATE INDEX IF NOT EXISTS bt_live_status_date_idx
  ON bank_transactions (is_deleted, categorization_status, date DESC)
  INCLUDE (amount, payee);

CREATE INDEX IF NOT EXISTS bt_live_account_date_idx
  ON bank_transactions (is_deleted, bank_account_id, date DESC)
  INCLUDE (amount, payee);

CREATE INDEX IF NOT EXISTS gin_bt_search_live_trgm_idx
  ON bank_transactions
  USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS bank_transaction_batch_idx  ON bank_transactions (bank_transaction_batch_id);
CREATE INDEX IF NOT EXISTS bank_transaction_ledger_idx ON bank_transactions (ledger_transaction_id);

-- Helper function to safely attach partition index
CREATE OR REPLACE FUNCTION safe_attach_partition_index(parent_idx text, child_idx text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  -- Check if the child index exists and is not already attached
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = child_idx
    AND n.nspname = 'public'
    AND c.relkind = 'i'
    AND NOT EXISTS (
      SELECT 1 FROM pg_inherits i
      JOIN pg_class pc ON i.inhparent = pc.oid
      WHERE i.inhrelid = c.oid AND pc.relname = parent_idx
    )
  ) THEN
    BEGIN
      EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', parent_idx, child_idx);
      RETURN true;
    EXCEPTION 
      WHEN duplicate_object THEN 
        RAISE NOTICE 'Index % is already attached to %', child_idx, parent_idx;
        RETURN false;
      WHEN undefined_object THEN 
        RAISE NOTICE 'Parent index % or child index % does not exist', parent_idx, child_idx;
        RETURN false;
      WHEN OTHERS THEN
        RAISE NOTICE 'Failed to attach % to %: %', child_idx, parent_idx, SQLERRM;
        RETURN false;
    END;
  END IF;
  RETURN false;
END$$;

-- Helpers to create & ATTACH indexes on leaves
CREATE OR REPLACE FUNCTION ensure_bt_leaf_indexes_for_year(y int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  leaf text := format('public.bank_transactions_%s_default', y);
  idx_live_status text := format('bt_live_status_date_%s_def_idx', y);
  idx_live_acct   text := format('bt_live_account_date_%s_def_idx', y);
  idx_batch       text := format('bank_transaction_batch_%s_def_idx', y);
  idx_ledger      text := format('bank_transaction_ledger_%s_def_idx', y);
  idx_search      text := format('gin_bt_search_live_trgm_%s_def_idx', y);
BEGIN
  -- Only proceed if the partition table exists
  IF to_regclass(leaf) IS NULL THEN
    RAISE NOTICE 'Partition table % does not exist, skipping index creation', leaf;
    RETURN;
  END IF;

  -- BTREEs - Create indexes with exact same structure as parent
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, categorization_status, date DESC) INCLUDE (amount, payee)', idx_live_status, leaf);
    PERFORM safe_attach_partition_index('bt_live_status_date_idx', idx_live_status);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_status, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, bank_account_id, date DESC) INCLUDE (amount, payee)', idx_live_acct, leaf);
    PERFORM safe_attach_partition_index('bt_live_account_date_idx', idx_live_acct);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_acct, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (bank_transaction_batch_id)', idx_batch, leaf);
    PERFORM safe_attach_partition_index('bank_transaction_batch_idx', idx_batch);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_batch, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx_ledger, leaf);
    PERFORM safe_attach_partition_index('bank_transaction_ledger_idx', idx_ledger);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_ledger, SQLERRM;
  END;

  -- GIN trigram (live-only) - must match parent exactly
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops)', idx_search, leaf);
    PERFORM safe_attach_partition_index('gin_bt_search_live_trgm_idx', idx_search);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_search, SQLERRM;
  END;
END$$;

CREATE OR REPLACE FUNCTION ensure_bt_leaf_indexes_before_2024()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  leaf text := 'public.bank_transactions_before_2024';
  idx_live_status text := 'bt_live_status_date_before_2024_idx';
  idx_live_acct   text := 'bt_live_account_date_before_2024_idx';
  idx_batch       text := 'bank_transaction_batch_before_2024_idx';
  idx_ledger      text := 'bank_transaction_ledger_before_2024_idx';
  idx_search      text := 'gin_bt_search_live_trgm_before_2024_idx';
BEGIN
  -- Only proceed if the partition table exists
  IF to_regclass(leaf) IS NULL THEN
    RAISE NOTICE 'Partition table % does not exist, skipping index creation', leaf;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, categorization_status, date DESC) INCLUDE (amount, payee)', idx_live_status, leaf);
    PERFORM safe_attach_partition_index('bt_live_status_date_idx', idx_live_status);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_status, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, bank_account_id, date DESC) INCLUDE (amount, payee)', idx_live_acct, leaf);
    PERFORM safe_attach_partition_index('bt_live_account_date_idx', idx_live_acct);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_acct, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (bank_transaction_batch_id)', idx_batch, leaf);
    PERFORM safe_attach_partition_index('bank_transaction_batch_idx', idx_batch);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_batch, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx_ledger, leaf);
    PERFORM safe_attach_partition_index('bank_transaction_ledger_idx', idx_ledger);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_ledger, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops)', idx_search, leaf);
    PERFORM safe_attach_partition_index('gin_bt_search_live_trgm_idx', idx_search);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_search, SQLERRM;
  END;
END$$;

-- Base partitions (year-only now)
CREATE TABLE IF NOT EXISTS bank_transactions_before_2024
  PARTITION OF bank_transactions
  FOR VALUES FROM ('1970-01-01') TO ('2024-01-01');

-- Current year parent (sub-partitioned) + its year-default LEAF, so the year can accept rows now
DO $$
DECLARE y int := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s
    PARTITION OF bank_transactions
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s_default
    PARTITION OF public.bank_transactions_%s DEFAULT
  $sql$, y, y);
END$$;

-- Global DEFAULT partition (for any out-of-window dates)
CREATE TABLE IF NOT EXISTS bank_transactions_default
  PARTITION OF bank_transactions DEFAULT;

-- Ensure indexes exist on the known leaves and are attached
SELECT ensure_bt_leaf_indexes_before_2024();
SELECT ensure_bt_leaf_indexes_for_year(EXTRACT(YEAR FROM CURRENT_DATE)::int);

-- Monthly helper (dormant for now; used when you flip to monthly later)
CREATE OR REPLACE FUNCTION ensure_month_partition(d date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  y int := EXTRACT(YEAR FROM d);
  start_date date := date_trunc('month', d)::date;
  end_date   date := (start_date + INTERVAL '1 month')::date;
BEGIN
  IF y < 2024 THEN
    RETURN;
  END IF;

  -- Ensure year parent exists (it already has a year-default leaf)
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s
    PARTITION OF bank_transactions
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  -- Create the month LEAF under the year parent
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s_%s
    PARTITION OF public.bank_transactions_%s
    FOR VALUES FROM (%L) TO (%L)
  $sql$, y, to_char(start_date,'MM'), y, start_date, end_date);
END$$;

-- Year parent + year-default LEAF creator (year-only mode)
CREATE OR REPLACE FUNCTION ensure_year_partition(y int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF y < 2024 THEN
    RETURN;
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s
    PARTITION OF bank_transactions
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.bank_transactions_%s_default
    PARTITION OF public.bank_transactions_%s DEFAULT
  $sql$, y, y);

  PERFORM ensure_bt_leaf_indexes_for_year(y);
END$$;

-- Create a rolling window of YEAR parents (no months)
CREATE OR REPLACE FUNCTION create_bank_transactions_partitions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cy int := EXTRACT(YEAR FROM CURRENT_DATE);
  y  int;
BEGIN
  FOR y IN (cy-2) .. (cy+2) LOOP
    PERFORM ensure_year_partition(y);
  END LOOP;
END$$;

-- Before-insert trigger (year-only ensure; no months yet)
CREATE OR REPLACE FUNCTION bt_ensure_partition_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  y int := EXTRACT(YEAR FROM NEW.date);
  rel_year text := format('public.bank_transactions_%s', y);
BEGIN
  IF y < 2024 THEN
    RETURN NEW;
  END IF;

  IF to_regclass(rel_year) IS NULL THEN
    IF pg_try_advisory_lock(42, y) THEN
      PERFORM ensure_year_partition(y);
      PERFORM pg_advisory_unlock(42, y);
    END IF;
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS bt_ensure_partition_before_insert ON bank_transactions;
CREATE TRIGGER bt_ensure_partition_before_insert
  BEFORE INSERT ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION bt_ensure_partition_before_insert();

-- Drain GLOBAL DEFAULT into correct YEAR leaves (explicit column list; generated cols excluded)
CREATE OR REPLACE FUNCTION drain_bank_transactions_default()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  min_y int;
  max_y int;
  y int;
BEGIN
  SELECT MIN(EXTRACT(YEAR FROM date))::int, MAX(EXTRACT(YEAR FROM date))::int
  INTO min_y, max_y
  FROM bank_transactions_default;

  IF min_y IS NULL THEN
    RETURN;
  END IF;

  FOR y IN min_y .. max_y LOOP
    IF y >= 2024 THEN
      PERFORM ensure_year_partition(y);
    END IF;

    WITH moved AS (
      INSERT INTO bank_transactions (
        id, date, payee, reference, description, additional_comments,
        amount, system_exchange_rate, categorization_status,
        bank_account_id, bank_transaction_batch_id, ledger_transaction_id,
        external_id, raw_data, created_by_id, updated_by_id,
        created_at, updated_at, is_deleted, deleted_at
      )
      SELECT
        id, date, payee, reference, description, additional_comments,
        amount, system_exchange_rate, categorization_status,
        bank_account_id, bank_transaction_batch_id, ledger_transaction_id,
        external_id, raw_data, created_by_id, updated_by_id,
        created_at, updated_at, is_deleted, deleted_at
      FROM bank_transactions_default
      WHERE date >= make_date(y,1,1) AND date < make_date(y+1,1,1)
      ON CONFLICT DO NOTHING
      RETURNING id, date
    )
    DELETE FROM bank_transactions_default d
    USING moved m
    WHERE d.id = m.id AND d.date = m.date;
  END LOOP;
END$$;

-- Cron scheduler (year-only maintenance right now)
CREATE OR REPLACE FUNCTION schedule_bank_transactions_partition_cron()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bt_ensure_and_drain') THEN
    PERFORM cron.unschedule('bt_ensure_and_drain');
  END IF;

  PERFORM cron.schedule(
    'bt_ensure_and_drain',
    '10 0 * * *',
    $cmd$SELECT create_bank_transactions_partitions();
      SELECT drain_bank_transactions_default();$cmd$
  );
END$$;

-- Call once to (re)schedule, cancelling for now because of pg_cron
-- SELECT schedule_bank_transactions_partition_cron();

-- Update/Delete guards
CREATE OR REPLACE FUNCTION guard_bank_transactions_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();

  IF (NEW.is_deleted IS DISTINCT FROM OLD.is_deleted)
     OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     OR (NEW.updated_by_id IS DISTINCT FROM OLD.updated_by_id)
     OR (NEW.categorization_status IS DISTINCT FROM OLD.categorization_status)
     OR (NEW.system_exchange_rate IS DISTINCT FROM OLD.system_exchange_rate)
  THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'Bank transactions are immutable. Only is_deleted, deleted_at, updated_by_id, categorization_status, system_exchange_rate may change.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_bank_transactions_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Bank transactions are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_bank_transactions_update ON bank_transactions;
CREATE TRIGGER guard_bank_transactions_update
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION guard_bank_transactions_update();

DROP TRIGGER IF EXISTS prevent_bank_transactions_delete ON bank_transactions;
CREATE TRIGGER prevent_bank_transactions_delete
  BEFORE DELETE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_bank_transactions_delete();

-- Foreign keys
DO $$
BEGIN
  BEGIN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT fk_bank_transaction_bank_account
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_bank_transaction_bank_account exists, skipping';
  END;

  BEGIN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT fk_bank_transaction_batch
      FOREIGN KEY (bank_transaction_batch_id) REFERENCES bank_transaction_batches (id)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_bank_transaction_batch exists, skipping';
  END;

  BEGIN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT fk_bank_transaction_ledger_match
      FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_bank_transaction_ledger_match exists, skipping';
  END;

  BEGIN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT fk_bank_transaction_created_by
      FOREIGN KEY (created_by_id) REFERENCES "users" (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_bank_transaction_created_by exists, skipping';
  END;

  BEGIN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT fk_bank_transaction_updated_by
      FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_bank_transaction_updated_by exists, skipping';
  END;
END$$;

-- Composite FK from ledger_transactions → bank_transactions (id, date)
DO $$
BEGIN
  BEGIN
    ALTER TABLE ledger_transactions ALTER COLUMN bank_transaction_id   DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'ledger_transactions.bank_transaction_id missing, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_transactions ALTER COLUMN bank_transaction_date DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'ledger_transactions.bank_transaction_date missing, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_transactions
      ADD CONSTRAINT ledger_bt_pair_null_ck
      CHECK (
        (bank_transaction_id IS NULL AND bank_transaction_date IS NULL)
        OR (bank_transaction_id IS NOT NULL AND bank_transaction_date IS NOT NULL)
      );
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'ledger_bt_pair_null_ck exists, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_transactions
      ADD CONSTRAINT fk_ledger_transaction_to_bank_transaction
      FOREIGN KEY (bank_transaction_id, bank_transaction_date)
      REFERENCES bank_transactions (id, date)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_transaction_to_bank_transaction exists, skipping';
  END;
END$$;