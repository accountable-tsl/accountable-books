-- Create required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;

-- Enum - debitcredit and categorization_status should already exist
-- Otherwise, break
DO $$ BEGIN
  ALTER TYPE categorization_status ADD VALUE IF NOT EXISTS 'suggested';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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
            id                      UUID NOT NULL DEFAULT uuid_generate_v7(),
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
            categorization_status   categorization_status NOT NULL DEFAULT 'suggested',
            description             TEXT,
            project_id              UUID,
            updated_by_id           UUID,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at              TIMESTAMPTZ,
            is_deleted              BOOLEAN NOT NULL DEFAULT false,
            CONSTRAINT ledger_entries_pkey PRIMARY KEY (id, fs_date),
            CONSTRAINT ledger_entries_absolute_amount_check CHECK (absolute_amount = abs(amount)),
            CONSTRAINT ledger_entries_absolute_source_amount_check CHECK (absolute_source_amount = abs(source_amount)),
            CONSTRAINT ledger_entries_exchange_rates_positive CHECK (system_exchange_rate > 0 AND custom_exchange_rate > 0)
        ) PARTITION BY RANGE (fs_date);
    END IF;
END $$;

-- Create base partitions
DO $$
BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_before_2024 PARTITION OF ledger_entries
             FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
    EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_2024 PARTITION OF ledger_entries
             FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
    EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entries_default PARTITION OF ledger_entries DEFAULT';
END $$;

-- Create partitioned indexes on parent table
CREATE INDEX IF NOT EXISTS le_txid_idx ON ledger_entries (ledger_transaction_id);
CREATE INDEX IF NOT EXISTS le_coa_del_idx ON ledger_entries (coa_id, is_deleted);
CREATE INDEX IF NOT EXISTS le_status_idx ON ledger_entries (categorization_status);

-- Create and attach child indexes for existing partitions
DO $$
DECLARE
    part regclass;
    base text;
    idx text;
    part_hash text;
BEGIN
    FOR part IN
        SELECT inhrelid::regclass
        FROM pg_inherits
        WHERE inhparent = 'public.ledger_entries'::regclass
    LOOP
        -- Create hash for partition name to avoid length issues
        part_hash := substr(md5(part::text), 1, 8);
        
        -- ledger_transaction_id index
        base := 'le_txid_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- coa_id_is_deleted index
        base := 'le_coa_del_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (coa_id, is_deleted)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- categorization_status index
        base := 'le_status_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (categorization_status)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- coa_date_active partial index (no parent, standalone)
        idx := 'le_coa_date_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (coa_id, fs_date) WHERE NOT is_deleted', idx, part);
    END LOOP;
END $$;

-- Function to create ledger entry partitions
CREATE OR REPLACE FUNCTION create_ledger_entries_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2027;
    month_offset INT;
    start_date DATE;
    end_date DATE;
    yr INT;
    part_name text;
    base text;
    idx text;
    part_hash text;
BEGIN
    IF current_year >= transition_year THEN
        FOR month_offset IN 0..119 LOOP
            start_date := date_trunc('month', CURRENT_DATE) + (month_offset || ' months')::interval;
            end_date := start_date + INTERVAL '1 month';
            part_name := 'ledger_entries_' || to_char(start_date, 'YYYY_MM');
            part_hash := substr(md5(part_name), 1, 8);
            
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF ledger_entries
                 FOR VALUES FROM (%L) TO (%L)',
                part_name,
                start_date,
                end_date
            );
            
            -- Create child indexes for the new partition
            -- ledger_transaction_id index
            base := 'le_txid_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ledger_transaction_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- coa_id_is_deleted index
            base := 'le_coa_del_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (coa_id, is_deleted)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- categorization_status index
            base := 'le_status_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (categorization_status)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- coa_date_active partial index (no parent, standalone)
            idx := 'le_coa_date_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (coa_id, fs_date) WHERE NOT is_deleted', idx, part_name);
        END LOOP;
    ELSE
        FOR yr IN current_year..2029 LOOP
            part_name := 'ledger_entries_' || yr;
            part_hash := substr(md5(part_name), 1, 8);
            
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF ledger_entries
                 FOR VALUES FROM (%L) TO (%L)',
                part_name,
                format('%s-01-01', yr),
                format('%s-01-01', yr + 1)
            );
            
            -- Create child indexes for the new partition
            -- ledger_transaction_id index
            base := 'le_txid_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ledger_transaction_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- coa_id_is_deleted index
            base := 'le_coa_del_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (coa_id, is_deleted)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- categorization_status index
            base := 'le_status_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (categorization_status)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- coa_date_active partial index (no parent, standalone)
            idx := 'le_coa_date_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (coa_id, fs_date) WHERE NOT is_deleted', idx, part_name);
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- Function to update timestamp on changes
CREATE OR REPLACE FUNCTION touch_ledger_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to prevent hard deletes
CREATE OR REPLACE FUNCTION prevent_ledger_entries_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Hard deletes are not allowed; use is_deleted';
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS touch_ledger_entries_updated_at ON ledger_entries;
CREATE TRIGGER touch_ledger_entries_updated_at
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION touch_ledger_entries_updated_at();

DROP TRIGGER IF EXISTS prevent_ledger_entries_delete ON ledger_entries;
CREATE TRIGGER prevent_ledger_entries_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entries_delete();

-- Function to schedule partition creation cron jobs
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

    -- Schedule new partition jobs based on the current date
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

-- Schedule the partition creation cron job
SELECT schedule_ledger_entries_partition_cron();

-- Add foreign key constraints
DO $$
BEGIN
    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_transaction
            FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_entry_transaction already exists, skipping';
    END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_coa
            FOREIGN KEY (coa_id) REFERENCES coa (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_entry_coa already exists, skipping';
    END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_currency
            FOREIGN KEY (source_currency_id) REFERENCES currencies (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_entry_currency already exists, skipping';
    END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_project
            FOREIGN KEY (project_id) REFERENCES projects (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_entry_project already exists, skipping';
    END;

    BEGIN
        ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_ledger_entry_updated_by
            FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_entry_updated_by already exists, skipping';
    END;
END $$;

-- Add composite foreign key from journal_entries to ledger_entries
DO $$
BEGIN
    BEGIN
        ALTER TABLE journal_entries
            ADD CONSTRAINT fk_journal_entry_ledger_entry
            FOREIGN KEY (ledger_entry_id, ledger_entry_fs_date)
            REFERENCES ledger_entries (id, fs_date)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_journal_entry_ledger_entry already exists, skipping';
    END;
END $$;


