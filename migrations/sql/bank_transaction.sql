CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    BEGIN
        CREATE TYPE debit_credit AS ENUM ('debit', 'credit');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        CREATE TYPE categorization_status AS ENUM ('auto_categorized', 'categorized', 'uncategorized');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- Create or replace function to set updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Partitioning for bank_transaction:
DO $$
DECLARE
    table_exists BOOLEAN;
    is_partitioned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'bank_transaction'
    ) INTO table_exists;

    IF table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = 'public.bank_transaction'::regclass AND relkind = 'p'
        ) INTO is_partitioned;

        IF NOT is_partitioned THEN
            BEGIN
                LOCK TABLE bank_transaction IN SHARE UPDATE EXCLUSIVE MODE;
                EXECUTE 'ALTER TABLE bank_transaction RENAME TO bank_transaction_old';
                EXECUTE 'CREATE TABLE bank_transaction (LIKE bank_transaction_old INCLUDING ALL) PARTITION BY RANGE ("date")';
                EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_default PARTITION OF bank_transaction DEFAULT';
                EXECUTE 'INSERT INTO bank_transaction SELECT * FROM bank_transaction_old';
                EXECUTE 'DROP TABLE bank_transaction_old CASCADE';
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'bank_transaction partitioning migration failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        CREATE TABLE bank_transaction (
            id                      UUID NOT NULL,
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
            created_by_id           UUID NOT NULL,
            updated_by_id           UUID,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            is_deleted              BOOLEAN NOT NULL DEFAULT false,
            deleted_at              TIMESTAMPTZ,
            CONSTRAINT bank_transaction_pkey PRIMARY KEY (id, date)
        ) PARTITION BY RANGE (date);
    END IF;
END $$;

-- Ensure base BankTransaction partitions exist
DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_before_2024 PARTITION OF bank_transaction
           FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_2024 PARTITION OF bank_transaction
           FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_default PARTITION OF bank_transaction DEFAULT';
END $$;

-- BankTransaction indexes
CREATE INDEX IF NOT EXISTS bank_transaction_date_idx ON bank_transaction (date);
CREATE INDEX IF NOT EXISTS bank_transaction_categorization_status_idx ON bank_transaction (categorization_status);
CREATE INDEX IF NOT EXISTS bank_transaction_batch_id_idx ON bank_transaction (bank_transaction_batch_id);
CREATE INDEX IF NOT EXISTS bank_transaction_id_date_idx ON bank_transaction (id, date);
CREATE INDEX IF NOT EXISTS bank_transaction_ledger_transaction_id_idx ON bank_transaction (ledger_transaction_id);

CREATE OR REPLACE FUNCTION create_bank_transaction_partitions()
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
                'CREATE TABLE IF NOT EXISTS bank_transaction_%s PARTITION OF bank_transaction
                 FOR VALUES FROM (%L) TO (%L)',
                to_char(start_date, 'YYYY_MM'),
                start_date,
                end_date
            );
        END LOOP;
    ELSE
        FOR yr IN current_year..2029 LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS bank_transaction_%s PARTITION OF bank_transaction
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
CREATE OR REPLACE FUNCTION prevent_bank_transaction_modification()
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

DROP TRIGGER IF EXISTS prevent_bank_transaction_update ON bank_transaction;
CREATE TRIGGER prevent_bank_transaction_update
BEFORE UPDATE ON bank_transaction
FOR EACH ROW EXECUTE PROCEDURE prevent_bank_transaction_modification();

DROP TRIGGER IF EXISTS prevent_bank_transaction_delete ON bank_transaction;
CREATE TRIGGER prevent_bank_transaction_delete
BEFORE DELETE ON bank_transaction
FOR EACH ROW EXECUTE PROCEDURE prevent_bank_transaction_modification();

CREATE TRIGGER set_bank_transaction_updated_at
BEFORE UPDATE ON bank_transaction
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE OR REPLACE FUNCTION schedule_bank_transaction_partition_cron() 
RETURNS void AS $$
BEGIN
    -- Unschedule existing partition jobs if they exist
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create_bank_transaction_partitions') THEN
        PERFORM cron.unschedule('create_bank_transaction_partitions');
    END IF;

    -- Run immediately if it's 2025
    IF EXTRACT(YEAR FROM CURRENT_DATE) = 2025 THEN
        PERFORM create_bank_transaction_partitions();
    END IF;

    -- Schedule new partition jobs based on the current date
    PERFORM cron.schedule(
        'create_bank_transaction_partitions',
        CASE 
            WHEN CURRENT_DATE < '2027-03-01' THEN '0 0 1 12 *' 
            ELSE '0 0 1 */3 *'
        END,
        'SELECT create_bank_transaction_partitions();'
    );

END;
$$ LANGUAGE plpgsql;

SELECT schedule_bank_transaction_partition_cron();

-- Bank Transaction Foreign Keys
DO $$
BEGIN
    BEGIN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT fk_bank_transaction_bank_account
            FOREIGN KEY (bank_account_id) REFERENCES bank_account (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT fk_bank_transaction_batch
            FOREIGN KEY (bank_transaction_batch_id) REFERENCES bank_transaction_batch (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT fk_bank_transaction_ledger_match
            FOREIGN KEY (ledger_transaction_id) REFERENCES ledger_transaction (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT fk_bank_transaction_created_by
            FOREIGN KEY (created_by_id) REFERENCES user (id)
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT fk_bank_transaction_updated_by
            FOREIGN KEY (updated_by_id) REFERENCES user (id)
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;



