CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    CREATE TYPE debit_credit AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Enum debit_credit type already exists, skipping';
END $$;

DO $$
BEGIN
    CREATE TYPE categorization_status AS ENUM ('auto_categorized', 'categorized', 'uncategorized');
EXCEPTION WHEN duplicate_object THEN 
    RAISE NOTICE 'Enum categorization_status type already exists, skipping';
END $$;


-- Partitioning for LedgerEntry: if the table exists but isn’t partitioned, convert it;
-- otherwise, create the table if missing.
DO $$
DECLARE
    table_exists BOOLEAN;
    is_partitioned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ledger_entries' 
    ) INTO table_exists;

    IF table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = 'public.ledger_entries'::regclass AND relkind = 'p'
        ) INTO is_partitioned;

        IF NOT is_partitioned THEN
            BEGIN
                EXECUTE 'ALTER TABLE ledger_entries RENAME TO ledger_entries_old';
                EXECUTE 'CREATE TABLE ledger_entries (LIKE ledger_entries_old INCLUDING ALL) PARTITION BY RANGE (fs_date)';
                EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_default PARTITION OF ledger_entries DEFAULT';
                EXECUTE 'INSERT INTO ledger_entries SELECT * FROM ledger_entries_old';
                EXECUTE 'DROP TABLE ledger_entries_old CASCADE';
                LOCK TABLE ledger_entries IN SHARE UPDATE EXCLUSIVE MODE;
            EXCEPTION WHEN others THEN
                RAISE EXCEPTION 'ledger_entries partitioning migration failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        CREATE TABLE ledger_entries (
        id                      UUID NOT NULL DEFAULT gen_random_uuid(),
        ledger_transaction_id   UUID NOT NULL,
        fs_date                 DATE NOT NULL,
        coa_id                  UUID NOT NULL,
        transaction_side        debit_credit NOT NULL,
        source_currency_id      UUID NOT NULL,
        source_amount           NUMERIC(32, 10) NOT NULL,
        absolute_source_amount  NUMERIC(32, 10) NOT NULL,
        system_exchange_rate    NUMERIC(32, 10) NOT NULL,
        custom_exchange_rate    NUMERIC(32, 10) NOT NULL,
        amount                  NUMERIC(32, 10) NOT NULL,
        absolute_amount         NUMERIC(32, 10) NOT NULL,
        categorization_status   categorization_status NOT NULL DEFAULT 'auto_categorized',
        description             TEXT,
        project_id              UUID,
        updated_by_id           UUID,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at              TIMESTAMPTZ,
        is_deleted              BOOLEAN NOT NULL DEFAULT false,
        CONSTRAINT ledger_entries_pkey PRIMARY KEY (id, fs_date)
        ) PARTITION BY RANGE (fs_date);
    END IF;
END $$;


-- Ensure base LedgerEntry partitions exist
DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_before_2024 PARTITION OF ledger_entries
           FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_2024 PARTITION OF ledger_entries
           FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_default PARTITION OF ledger_entries DEFAULT';
END $$;


-- Indexes
CREATE INDEX IF NOT EXISTS ledger_entries_fs_date_idx ON ledger_entries (fs_date);
CREATE INDEX IF NOT EXISTS ledger_entries_id_fs_date_idx ON ledger_entries (id, fs_date);
CREATE INDEX IF NOT EXISTS ledger_entries_ledger_transaction_id_idx ON ledger_entries (ledger_transaction_id);
CREATE INDEX IF NOT EXISTS ledger_entries_coa_id_is_deleted_idx ON ledger_entries (coa_id, is_deleted);
CREATE INDEX IF NOT EXISTS ledger_entries_categorization_status_idx ON ledger_entries (categorization_status);


-- Function to create additional LedgerEntry partitions (yearly or monthly after a transition year)
CREATE OR REPLACE FUNCTION create_ledger_entries_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2027;
    month_offset INT;
    start_date DATE;
    end_date DATE;
    yr INT;
BEGIN
    IF current_year >= transition_year - 2 THEN
        FOR month_offset IN 0..119 LOOP
            start_date := '2030-01-01'::date + (month_offset || ' months')::interval;
            end_date := start_date + INTERVAL '1 month';
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS ledger_entries_%s PARTITION OF ledger_entries
                 FOR VALUES FROM (%L) TO (%L)',
                to_char(start_date, 'YYYY_MM'),
                start_date,
                end_date
            );
        END LOOP;
    ELSE
        FOR yr IN current_year..2029 LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS ledger_entries_%s PARTITION OF ledger_entries
                 FOR VALUES FROM (%L) TO (%L)',
                yr,
                format('%s-01-01', yr),
                format('%s-01-01', yr + 1)
            );
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- IMMUTABILITY TRIGGERS (NO DELETES/UPDATES)
-- Prevent modifications on LedgerEntry except for allowed soft-delete updates
CREATE OR REPLACE FUNCTION prevent_ledger_entries_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
       OR OLD.updated_at IS DISTINCT FROM NEW.updated_at
       OR OLD.updated_by_id IS DISTINCT FROM NEW.updated_by_id
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Ledger entries are immutable';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create or replace function to set updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the triggers only if they do not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_ledger_entries_delete'
    )   THEN
        CREATE TRIGGER prevent_ledger_entries_delete
        BEFORE DELETE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_modification();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_ledger_entries_updated_at'
    )   THEN
        CREATE TRIGGER set_ledger_entries_updated_at
        BEFORE UPDATE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION schedule_ledger_entries_partition_cron() 
RETURNS void AS $$
BEGIN
    -- Unschedule existing partition jobs if they exist
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create_ledger_entries_partitions') THEN
        PERFORM cron.unschedule('create_ledger_entries_partitions');
    END IF;
    
    -- Run immediately if it's 2025
    IF EXTRACT(YEAR FROM CURRENT_DATE) = 2025 THEN
        PERFORM create_ledger_entries_partitions();
    END IF;


    -- Schedule future runs
    PERFORM cron.schedule(
        'create_ledger_entries_partitions',
        CASE 
            WHEN CURRENT_DATE < '2027-03-01' THEN '0 0 1 12 *' 
            ELSE '0 0 1 */3 *'
        END,
        'SELECT create_ledger_entries_partitions();'
    );
END;
$$ LANGUAGE plpgsql;


SELECT schedule_ledger_entries_partition_cron();


-- Ledger Entry Foreign Keys
DO $$
BEGIN
    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_transaction
            FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_coa
            FOREIGN KEY (coa_id) REFERENCES coa (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_currency
            FOREIGN KEY (source_currency_id) REFERENCES currencies (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_project
            FOREIGN KEY (project_id) REFERENCES projects (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_updated_by
            FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;
END $$;



-- Add composite foreign key for ledger entry
DO $$
BEGIN
    BEGIN
        ALTER TABLE journal_entries
        ADD CONSTRAINT fk_journal_entry_ledger_entry
        FOREIGN KEY (ledger_entry_id, ledger_entry_fs_date)
        REFERENCES ledger_entries(id, fs_date)
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping';
    END;
END$$;


