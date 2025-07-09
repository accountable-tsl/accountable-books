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


-- Partitioning for bank_transactions:
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
            id                      UUID NOT NULL DEFAULT gen_random_uuid(),
            date                    DATE NOT NULL,
            payee                   TEXT,
            reference               TEXT,
            description             TEXT,
            additional_comments     TEXT,
            transaction_side        debit_credit,
            amount                  NUMERIC NOT NULL,
            absolute_amount         NUMERIC NOT NULL DEFAULT 0,
            system_exchange_rate    NUMERIC NOT NULL,
            categorization_status   categorization_status NOT NULL DEFAULT 'uncategorized',
            bank_account_id         UUID NOT NULL,
            bank_transaction_batch_id  UUID,
            ledger_transaction_id   UUID,
            external_id             TEXT,
            created_by_id           UUID NOT NULL,
            updated_by_id           UUID,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            is_deleted              BOOLEAN NOT NULL DEFAULT false,
            deleted_at              TIMESTAMPTZ,
            CONSTRAINT bank_transactions_pkey PRIMARY KEY (id, date)
        ) PARTITION BY RANGE (date);
    END IF;
END $$;

-- Ensure base BankTransaction partitions exist
DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_before_2024 PARTITION OF bank_transactions
           FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_2024 PARTITION OF bank_transactions
           FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transactions_default PARTITION OF bank_transactions DEFAULT';
END $$;

-- BankTransaction indexes
CREATE INDEX IF NOT EXISTS bank_transaction_date_idx ON bank_transactions (date);
CREATE INDEX IF NOT EXISTS bank_transaction_categorization_status_idx ON bank_transactions (categorization_status);
CREATE INDEX IF NOT EXISTS bank_transaction_batch_id_idx ON bank_transactions (bank_transaction_batch_id);
CREATE INDEX IF NOT EXISTS bank_transaction_id_date_idx ON bank_transactions (id, date);
CREATE INDEX IF NOT EXISTS bank_transaction_ledger_transaction_id_idx ON bank_transactions (ledger_transaction_id);

CREATE OR REPLACE FUNCTION create_bank_transactions_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2027;
    month_offset INT;
    start_date DATE;
    end_date DATE;
    yr INT;
BEGIN
    IF current_year >= transition_year THEN
        FOR month_offset IN 0..119 LOOP
            start_date := date_trunc('month', CURRENT_DATE) + (month_offset || ' months')::interval;
            end_date := start_date + INTERVAL '1 month';
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS bank_transactions_%s PARTITION OF bank_transactions
                 FOR VALUES FROM (%L) TO (%L)',
                to_char(start_date, 'YYYY_MM'),
                start_date,
                end_date
            );
        END LOOP;
    ELSE
        FOR yr IN current_year..2029 LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS bank_transactions_%s PARTITION OF bank_transactions
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
-- Allow updates to specific fields for soft deletes
CREATE OR REPLACE FUNCTION prevent_bank_transactions_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bank transactions are immutable';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
       OR OLD.updated_at IS DISTINCT FROM NEW.updated_at
       OR OLD.updated_by_id IS DISTINCT FROM NEW.updated_by_id
       OR OLD.categorization_status IS DISTINCT FROM NEW.categorization_status THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Bank transactions are immutable';
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
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_bank_transactions_update'
  ) THEN
    CREATE TRIGGER prevent_bank_transactions_update
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_bank_transactions_modification();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_bank_transactions_delete'
  ) THEN
    CREATE TRIGGER prevent_bank_transactions_delete
    BEFORE DELETE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_bank_transactions_modification();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_bank_transactions_updated_at'
  ) THEN
    CREATE TRIGGER set_bank_transactions_updated_at
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;



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

SELECT schedule_bank_transactions_partition_cron();

-- Bank Transaction Foreign Keys
DO $$
BEGIN
    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_bank_account
            FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_batch
            FOREIGN KEY (bank_transaction_batch_id) REFERENCES bank_transaction_batches (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_ledger_match
            FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transactions (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_created_by
            FOREIGN KEY (created_by_id) REFERENCES "users" (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;

    BEGIN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transaction_updated_by
            FOREIGN KEY (updated_by_id) REFERENCES "users" (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping'; END;
END $$;


-- Add bank_transactions composite fk to ledger_transaction here
-- to prevent sequencing issues with the bank_transactions table
DO $$
BEGIN
    BEGIN
        ALTER TABLE ledger_transactions
        ADD CONSTRAINT fk_ledger_transaction_to_bank_transaction
        FOREIGN KEY (bank_transaction_id, bank_transaction_date)
        REFERENCES bank_transactions (id, date)
        ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'Foreign key already exists, skipping';
    END;
END $$;




