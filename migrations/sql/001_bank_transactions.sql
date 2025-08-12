-- Create required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;

-- Create custom enum types
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

-- Create or migrate bank_transactions table with partitioning
DO $$
DECLARE
    table_exists BOOLEAN;
    is_partitioned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'bank_transactions'
    ) INTO table_exists;

    IF table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = 'public.bank_transactions'::regclass AND relkind = 'p'
        ) INTO is_partitioned;

        IF NOT is_partitioned THEN
            BEGIN
                EXECUTE 'ALTER TABLE bank_transactions RENAME TO bank_transactions_old';
                EXECUTE 'CREATE TABLE bank_transactions (LIKE bank_transactions_old INCLUDING ALL) PARTITION BY RANGE ("date")';
                EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_default PARTITION OF bank_transactions DEFAULT';
                EXECUTE 'INSERT INTO bank_transactions SELECT * FROM bank_transactions_old';
                EXECUTE 'DROP TABLE bank_transactions_old CASCADE';
                LOCK TABLE bank_transactions IN SHARE UPDATE EXCLUSIVE MODE;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'bank_transactions partitioning migration failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        CREATE TABLE bank_transactions (
            id                      UUID NOT NULL DEFAULT uuid_generate_v7(),
            date                    DATE NOT NULL,
            payee                   TEXT,
            reference               TEXT,
            description             TEXT,
            additional_comments     TEXT,
            transaction_side        debit_credit,
            amount                  NUMERIC(32, 10) NOT NULL,
            absolute_amount         NUMERIC(32, 10) NOT NULL DEFAULT 0,
            system_exchange_rate    NUMERIC(32, 10) NOT NULL,
            categorization_status   categorization_status NOT NULL DEFAULT 'uncategorized',
            bank_account_id         UUID NOT NULL,
            bank_transaction_batch_id  UUID,
            ledger_transaction_id   UUID,
            external_id             TEXT NOT NULL,
            raw_data                JSONB,
            created_by_id           UUID NOT NULL,
            updated_by_id           UUID,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            is_deleted              BOOLEAN NOT NULL DEFAULT false,
            deleted_at              TIMESTAMPTZ,
            CONSTRAINT bank_transactions_pkey PRIMARY KEY (id, date),
            CONSTRAINT bank_transactions_account_external_id_date_unique UNIQUE (bank_account_id, external_id, date)
        ) PARTITION BY RANGE (date);
    END IF;
END $$;

-- Create base partitions
DO $$
BEGIN
    EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_before_2024 PARTITION OF bank_transactions
             FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
    EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_2024 PARTITION OF bank_transactions
             FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
    EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_default PARTITION OF bank_transactions DEFAULT';
END $$;

-- Create partitioned indexes on parent table
CREATE INDEX IF NOT EXISTS bt_account_date_idx ON bank_transactions (bank_account_id, date DESC);
CREATE INDEX IF NOT EXISTS bt_status_idx ON bank_transactions (categorization_status);
CREATE INDEX IF NOT EXISTS bt_batch_idx ON bank_transactions (bank_transaction_batch_id);
CREATE INDEX IF NOT EXISTS bt_ledger_idx ON bank_transactions (ledger_transaction_id);

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
        WHERE inhparent = 'public.bank_transactions'::regclass
    LOOP
        -- Create hash for partition name to avoid length issues
        part_hash := substr(md5(part::text), 1, 8);
        
        -- account+date index
        base := 'bt_account_date_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (bank_account_id, date DESC)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- status index
        base := 'bt_status_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (categorization_status)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- batch index
        base := 'bt_batch_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (bank_transaction_batch_id)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;

        -- ledger index
        base := 'bt_ledger_idx';
        idx := base || '_' || part_hash;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (ledger_transaction_id)', idx, part);
        BEGIN 
            EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
        EXCEPTION WHEN duplicate_object THEN NULL; 
        END;
    END LOOP;
END $$;

-- Function to create bank transaction partitions
CREATE OR REPLACE FUNCTION create_bank_transactions_partitions()
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
            part_name := 'bank_transactions_' || to_char(start_date, 'YYYY_MM');
            part_hash := substr(md5(part_name), 1, 8);
            
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF bank_transactions
                 FOR VALUES FROM (%L) TO (%L)',
                part_name,
                start_date,
                end_date
            );
            
            -- Create child indexes for the new partition
            -- account+date index
            base := 'bt_account_date_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (bank_account_id, date DESC)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- status index
            base := 'bt_status_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (categorization_status)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- batch index
            base := 'bt_batch_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (bank_transaction_batch_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- ledger index
            base := 'bt_ledger_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ledger_transaction_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;
        END LOOP;
    ELSE
        FOR yr IN current_year..2029 LOOP
            part_name := 'bank_transactions_' || yr;
            part_hash := substr(md5(part_name), 1, 8);
            
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF bank_transactions
                 FOR VALUES FROM (%L) TO (%L)',
                part_name,
                format('%s-01-01', yr),
                format('%s-01-01', yr + 1)
            );
            
            -- Create child indexes for the new partition
            -- account+date index
            base := 'bt_account_date_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (bank_account_id, date DESC)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- status index
            base := 'bt_status_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (categorization_status)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- batch index
            base := 'bt_batch_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (bank_transaction_batch_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;

            -- ledger index
            base := 'bt_ledger_idx';
            idx := base || '_' || part_hash;
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ledger_transaction_id)', idx, part_name);
            BEGIN 
                EXECUTE format('ALTER INDEX %I ATTACH PARTITION %I', base, idx); 
            EXCEPTION WHEN duplicate_object THEN NULL; 
            END;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to guard bank transaction updates (allow only specific fields)
CREATE OR REPLACE FUNCTION guard_bank_transactions_update()
RETURNS TRIGGER AS $$
DECLARE
    allowed text[] := ARRAY['is_deleted','deleted_at','updated_by_id','categorization_status','updated_at'];
BEGIN
    NEW.updated_at = now();
    IF (to_jsonb(NEW) - allowed) = (to_jsonb(OLD) - allowed) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Bank transactions are immutable (only % may be updated)', array_to_string(allowed, ', ');
END;
$$ LANGUAGE plpgsql;

-- Function to prevent bank transaction deletes
CREATE OR REPLACE FUNCTION prevent_bank_transactions_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Bank transactions are immutable';
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS guard_bank_transactions_update ON bank_transactions;
CREATE TRIGGER guard_bank_transactions_update
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION guard_bank_transactions_update();

DROP TRIGGER IF EXISTS prevent_bank_transactions_delete ON bank_transactions;
CREATE TRIGGER prevent_bank_transactions_delete
    BEFORE DELETE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_bank_transactions_delete();

-- Function to schedule partition creation cron jobs
CREATE OR REPLACE FUNCTION schedule_bank_transactions_partition_cron() 
RETURNS void AS $$
BEGIN
    -- Unschedule existing partition jobs if they exist
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create_bank_transactions_partitions') THEN
        PERFORM cron.unschedule('create_bank_transactions_partitions');
    END IF;

    -- Run immediately if it's 2025
    IF EXTRACT(YEAR FROM CURRENT_DATE) = 2025 THEN
        PERFORM create_bank_transactions_partitions();
    END IF;

    -- Schedule new partition jobs based on the current date
    PERFORM cron.schedule(
        'create_bank_transactions_partitions',
        CASE 
            WHEN CURRENT_DATE < '2027-03-01' THEN '0 0 1 12 *' 
            ELSE '0 0 1 */3 *'
        END,
        'SELECT create_bank_transactions_partitions();'
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule the partition creation cron job
SELECT schedule_bank_transactions_partition_cron();

-- Add foreign key constraints
DO $$
BEGIN
    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_bank_account
            FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_bank_transaction_bank_account already exists, skipping';
    END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_batch
            FOREIGN KEY (bank_transaction_batch_id) REFERENCES bank_transaction_batches (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_bank_transaction_batch already exists, skipping';
    END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_ledger_match
            FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_bank_transaction_ledger_match already exists, skipping';
    END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_created_by
            FOREIGN KEY (created_by_id) REFERENCES "users" (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_bank_transaction_created_by already exists, skipping';
    END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_updated_by
            FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_bank_transaction_updated_by already exists, skipping';
    END;
END $$;

-- Add composite foreign key from ledger_transactions to bank_transactions
DO $$
BEGIN
    BEGIN
        ALTER TABLE ledger_transactions
            ADD CONSTRAINT fk_ledger_transaction_to_bank_transaction
            FOREIGN KEY (bank_transaction_id, bank_transaction_date)
            REFERENCES bank_transactions (id, date)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key fk_ledger_transaction_to_bank_transaction already exists, skipping';
    END;
END $$;




