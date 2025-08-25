CREATE TABLE public.ledger_entries (
    id                      UUID NOT NULL DEFAULT uuid_generate_v7(),
    ledger_transaction_id   UUID NOT NULL,
    fs_date                 DATE NOT NULL,
    coa_id                  UUID NOT NULL,
    source_currency_id      UUID NOT NULL,
    source_amount           NUMERIC(32, 10) NOT NULL,
    absolute_source_amount  NUMERIC(32, 10) GENERATED ALWAYS AS (abs(source_amount)) STORED,
    system_exchange_rate    NUMERIC(32, 10) NOT NULL,
    custom_exchange_rate    NUMERIC(32, 10) NOT NULL,
    amount                  NUMERIC(32, 10) GENERATED ALWAYS AS ((source_amount * custom_exchange_rate)::NUMERIC(32, 10)) STORED,
    absolute_amount         NUMERIC(32, 10) GENERATED ALWAYS AS ((abs(source_amount * custom_exchange_rate))::NUMERIC(32, 10)) STORED,
    transaction_side        debit_credit GENERATED ALWAYS AS (
        CASE
            WHEN source_amount > 0 THEN 'debit'::debit_credit
            WHEN source_amount < 0 THEN 'credit'::debit_credit
            ELSE NULL::debit_credit
        END
    ) STORED,
    categorization_status   categorization_status NOT NULL DEFAULT 'suggested',
    description             TEXT,
    project_id              UUID,
    updated_by_id           UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    is_deleted              BOOLEAN NOT NULL DEFAULT false,
    search_text             TEXT GENERATED ALWAYS AS (
        trim(both ' ' from lower(coalesce(description, '')))
    ) STORED,
    CONSTRAINT ledger_entries_nonzero_amount_chk CHECK (amount <> 0),
    CONSTRAINT ledger_entries_exchange_rates_positive CHECK (system_exchange_rate > 0 AND custom_exchange_rate > 0),
    CONSTRAINT ledger_entries_delete_consistency CHECK (
        (is_deleted = false AND deleted_at IS NULL) OR
        (is_deleted = true AND deleted_at IS NOT NULL)
    ),
    CONSTRAINT ledger_entries_pkey PRIMARY KEY (id, fs_date)
) PARTITION BY RANGE (fs_date);

-- Partitioned indexes on the parent (partitioned and later attached on leaves)
CREATE INDEX IF NOT EXISTS le_live_status_date_idx
  ON ledger_entries (is_deleted, categorization_status, fs_date DESC)
  INCLUDE (amount, description);

CREATE INDEX IF NOT EXISTS le_live_coa_date_idx
  ON ledger_entries (is_deleted, coa_id, fs_date DESC)
  INCLUDE (amount, description);

CREATE INDEX IF NOT EXISTS gin_le_search_live_trgm_idx
  ON ledger_entries
  USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops);

-- Optional general indexes
CREATE INDEX IF NOT EXISTS ledger_entries_fs_date_idx ON ledger_entries (fs_date);
CREATE INDEX IF NOT EXISTS ledger_entries_ledger_transaction_id_idx ON ledger_entries (ledger_transaction_id);
CREATE INDEX IF NOT EXISTS ledger_entries_coa_id_is_deleted_idx ON ledger_entries (coa_id, is_deleted);

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

-- Helpers to create & ATTACH indexes on leaf partitions
CREATE OR REPLACE FUNCTION ensure_le_leaf_indexes_for_year(y int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  leaf text := format('public.ledger_entries_%s_default', y);

  idx_live_status text := format('le_live_status_date_%s_def_idx', y);
  idx_live_coa    text := format('le_live_coa_date_%s_def_idx', y);
  idx_search      text := format('gin_le_search_live_trgm_%s_def_idx', y);

  idx_fs_date     text := format('ledger_entries_fs_date_%s_def_idx', y);
  idx_ledger_txn  text := format('ledger_entries_ledger_txn_%s_def_idx', y);
  idx_coa_del     text := format('ledger_entries_coa_del_%s_def_idx', y);
BEGIN
  -- Only proceed if the partition table exists
  IF to_regclass(leaf) IS NULL THEN
    RAISE NOTICE 'Partition table % does not exist, skipping index creation', leaf;
    RETURN;
  END IF;

  -- BTREEs that mirror the parent partitioned indexes
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, categorization_status, fs_date DESC) INCLUDE (amount, description)', idx_live_status, leaf);
    PERFORM safe_attach_partition_index('le_live_status_date_idx', idx_live_status);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_status, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, coa_id, fs_date DESC) INCLUDE (amount, description)', idx_live_coa, leaf);
    PERFORM safe_attach_partition_index('le_live_coa_date_idx', idx_live_coa);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_coa, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (fs_date)', idx_fs_date, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_fs_date_idx', idx_fs_date);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_fs_date, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx_ledger_txn, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_ledger_transaction_id_idx', idx_ledger_txn);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_ledger_txn, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (coa_id, is_deleted)', idx_coa_del, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_coa_id_is_deleted_idx', idx_coa_del);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_coa_del, SQLERRM;
  END;

  -- GIN trigram (live-only) - must match parent exactly
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops)', idx_search, leaf);
    PERFORM safe_attach_partition_index('gin_le_search_live_trgm_idx', idx_search);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_search, SQLERRM;
  END;
END$$;

CREATE OR REPLACE FUNCTION ensure_le_leaf_indexes_before_2024()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  leaf text := 'public.ledger_entries_before_2024';

  idx_live_status text := 'le_live_status_date_before_2024_idx';
  idx_live_coa    text := 'le_live_coa_date_before_2024_idx';
  idx_search      text := 'gin_le_search_live_trgm_before_2024_idx';

  idx_fs_date     text := 'ledger_entries_fs_date_before_2024_idx';
  idx_ledger_txn  text := 'ledger_entries_ledger_txn_before_2024_idx';
  idx_coa_del     text := 'ledger_entries_coa_del_before_2024_idx';
BEGIN
  -- Only proceed if the partition table exists
  IF to_regclass(leaf) IS NULL THEN
    RAISE NOTICE 'Partition table % does not exist, skipping index creation', leaf;
    RETURN;
  END IF;

  -- Use the safe_attach_partition_index function for all indexes
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, categorization_status, fs_date DESC) INCLUDE (amount, description)', idx_live_status, leaf);
    PERFORM safe_attach_partition_index('le_live_status_date_idx', idx_live_status);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_status, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (is_deleted, coa_id, fs_date DESC) INCLUDE (amount, description)', idx_live_coa, leaf);
    PERFORM safe_attach_partition_index('le_live_coa_date_idx', idx_live_coa);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_live_coa, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (fs_date)', idx_fs_date, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_fs_date_idx', idx_fs_date);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_fs_date, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx_ledger_txn, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_ledger_transaction_id_idx', idx_ledger_txn);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_ledger_txn, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (coa_id, is_deleted)', idx_coa_del, leaf);
    PERFORM safe_attach_partition_index('ledger_entries_coa_id_is_deleted_idx', idx_coa_del);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_coa_del, SQLERRM;
  END;

  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s USING GIN ((CASE WHEN is_deleted=false THEN search_text END) gin_trgm_ops)', idx_search, leaf);
    PERFORM safe_attach_partition_index('gin_le_search_live_trgm_idx', idx_search);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create/attach index %: %', idx_search, SQLERRM;
  END;
END$$;

-- Base partitions (historical + current year parent with year-default LEAF)
CREATE TABLE IF NOT EXISTS ledger_entries_before_2024
  PARTITION OF ledger_entries
  FOR VALUES FROM ('1970-01-01') TO ('2024-01-01');

-- Current year parent (sub-partitioned) + its year-default LEAF, so the year can accept rows now
DO $$
DECLARE y int := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s
    PARTITION OF ledger_entries
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (fs_date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s_default
    PARTITION OF public.ledger_entries_%s DEFAULT
  $sql$, y, y);
END$$;

-- Global DEFAULT partition (safety net)
CREATE TABLE IF NOT EXISTS ledger_entries_default
  PARTITION OF ledger_entries DEFAULT;

-- Ensure leaf indexes exist & are attached
SELECT ensure_le_leaf_indexes_before_2024();
SELECT ensure_le_leaf_indexes_for_year(EXTRACT(YEAR FROM CURRENT_DATE)::int);

-- Monthly helper (dormant for now; used when you flip to monthly later)
CREATE OR REPLACE FUNCTION ensure_ledger_month_partition(d date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  y int := EXTRACT(YEAR FROM d);
  start_date date := date_trunc('month', d)::date;
  end_date   date := (start_date + INTERVAL '1 month')::date;
BEGIN
  IF y < 2024 THEN
    RETURN;
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s
    PARTITION OF ledger_entries
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (fs_date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s_%s
    PARTITION OF public.ledger_entries_%s
    FOR VALUES FROM (%L) TO (%L)
  $sql$, y, to_char(start_date,'MM'), y, start_date, end_date);
END$$;

-- Year parent + year-default LEAF creator (year-only mode)
CREATE OR REPLACE FUNCTION ensure_ledger_year_partition(y int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF y < 2024 THEN
    RETURN;
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s
    PARTITION OF ledger_entries
    FOR VALUES FROM (%L) TO (%L)
    PARTITION BY RANGE (fs_date)
  $sql$, y, to_char(make_date(y,1,1),'YYYY-MM-DD'), to_char(make_date(y+1,1,1),'YYYY-MM-DD'));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.ledger_entries_%s_default
    PARTITION OF public.ledger_entries_%s DEFAULT
  $sql$, y, y);

  PERFORM ensure_le_leaf_indexes_for_year(y);
END$$;

-- Create a rolling window of YEAR parents (no months)
CREATE OR REPLACE FUNCTION create_ledger_entries_partitions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cy int := EXTRACT(YEAR FROM CURRENT_DATE);
  y  int;
BEGIN
  FOR y IN (cy-2) .. (cy+2) LOOP
    PERFORM ensure_ledger_year_partition(y);
  END LOOP;
END$$;

-- Before-insert trigger (year-only ensure; no months yet)
CREATE OR REPLACE FUNCTION le_ensure_partition_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  y int := EXTRACT(YEAR FROM NEW.fs_date);
  rel_year text := format('public.ledger_entries_%s', y);
BEGIN
  IF y < 2024 THEN
    RETURN NEW;
  END IF;

  IF to_regclass(rel_year) IS NULL THEN
    IF pg_try_advisory_lock(43, y) THEN
      PERFORM ensure_ledger_year_partition(y);
      PERFORM pg_advisory_unlock(43, y);
    END IF;
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS le_ensure_partition_before_insert ON ledger_entries;
CREATE TRIGGER le_ensure_partition_before_insert
  BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION le_ensure_partition_before_insert();

-- Drain GLOBAL DEFAULT into correct YEAR leaves (explicit column list; exclude generated cols)
CREATE OR REPLACE FUNCTION drain_ledger_entries_default()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  min_y int;
  max_y int;
  y int;
BEGIN
  SELECT MIN(EXTRACT(YEAR FROM fs_date))::int, MAX(EXTRACT(YEAR FROM fs_date))::int
  INTO min_y, max_y
  FROM ledger_entries_default;

  IF min_y IS NULL THEN
    RETURN;
  END IF;

  FOR y IN min_y .. max_y LOOP
    IF y >= 2024 THEN
      PERFORM ensure_ledger_year_partition(y);
    END IF;

    WITH moved AS (
      INSERT INTO ledger_entries (
        id, ledger_transaction_id, fs_date, coa_id, source_currency_id,
        source_amount, system_exchange_rate, custom_exchange_rate,
        categorization_status, description, project_id, updated_by_id,
        created_at, updated_at, deleted_at, is_deleted
      )
      SELECT
        id, ledger_transaction_id, fs_date, coa_id, source_currency_id,
        source_amount, system_exchange_rate, custom_exchange_rate,
        categorization_status, description, project_id, updated_by_id,
        created_at, updated_at, deleted_at, is_deleted
      FROM ledger_entries_default
      WHERE fs_date >= make_date(y,1,1) AND fs_date < make_date(y+1,1,1)
      ON CONFLICT DO NOTHING
      RETURNING id, fs_date
    )
    DELETE FROM ledger_entries_default d
    USING moved m
    WHERE d.id = m.id AND d.fs_date = m.fs_date;
  END LOOP;
END$$;

-- Cron scheduler (year-only maintenance)
CREATE OR REPLACE FUNCTION schedule_ledger_entries_partition_cron()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'le_ensure_and_drain') THEN
    PERFORM cron.unschedule('le_ensure_and_drain');
  END IF;

  PERFORM cron.schedule(
    'le_ensure_and_drain',
    '15 0 * * *',
    $cmd$SELECT create_ledger_entries_partitions();
      SELECT drain_ledger_entries_default();$cmd$
  );
END$$;

-- Call once to (re)schedule, cancelling for now because of pg_cron
-- SELECT schedule_ledger_entries_partition_cron();

-- Update/Delete guards
CREATE OR REPLACE FUNCTION guard_ledger_entries_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();

  IF (NEW.is_deleted IS DISTINCT FROM OLD.is_deleted)
     OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     OR (NEW.updated_by_id IS DISTINCT FROM OLD.updated_by_id)
     OR (NEW.categorization_status IS DISTINCT FROM OLD.categorization_status)
     OR (NEW.description IS DISTINCT FROM OLD.description)
     OR (NEW.project_id IS DISTINCT FROM OLD.project_id)
  THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'Ledger entries are immutable. Only is_deleted, deleted_at, updated_by_id, categorization_status, description, project_id may change.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_ledger_entries_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_ledger_entries_update ON ledger_entries;
CREATE TRIGGER guard_ledger_entries_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION guard_ledger_entries_update();

DROP TRIGGER IF EXISTS prevent_ledger_entries_delete ON ledger_entries;
CREATE TRIGGER prevent_ledger_entries_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_delete();

-- Foreign keys
DO $$
BEGIN
  BEGIN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT fk_ledger_entry_transaction
      FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_entry_transaction exists, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT fk_ledger_entry_coa
      FOREIGN KEY (coa_id) REFERENCES coa (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_entry_coa exists, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT fk_ledger_entry_currency
      FOREIGN KEY (source_currency_id) REFERENCES currencies (id)
      ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_entry_currency exists, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT fk_ledger_entry_project
      FOREIGN KEY (project_id) REFERENCES projects (id)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_entry_project exists, skipping';
  END;

  BEGIN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT fk_ledger_entry_updated_by
      FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_ledger_entry_updated_by exists, skipping';
  END;
END$$;

-- Composite FK from journal_entries → ledger_entries (id, fs_date)
DO $$
BEGIN
  BEGIN
    ALTER TABLE journal_entries
      ADD CONSTRAINT fk_journal_entry_ledger_entry
      FOREIGN KEY (ledger_entry_id, ledger_entry_fs_date)
      REFERENCES ledger_entries (id, fs_date)
      ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'fk_journal_entry_ledger_entry exists, skipping';
  END;
END$$;