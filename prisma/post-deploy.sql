-- Create pg_cron extension if not already installed
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create ENUM types in one DO block
DO $$
BEGIN
    BEGIN
        CREATE TYPE "DebitCredit" AS ENUM ('DEBIT', 'CREDIT');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        CREATE TYPE "CategorisationStatus" AS ENUM ('AUTO_CATEGORISED', 'CATEGORISED', 'UNCATEGORISED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updatedAt timestamp
DROP TRIGGER IF EXISTS ledgerentry_set_updated_at ON "LedgerEntry";
CREATE TRIGGER ledgerentry_set_updated_at
BEFORE UPDATE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Partitioning for LedgerEntry: if the table exists but isn’t partitioned, convert it;
-- otherwise, create the table if missing.
DO $$
DECLARE
    table_exists BOOLEAN;
    is_partitioned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'LedgerEntry' 
    ) INTO table_exists;

    IF table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = 'public."LedgerEntry"'::regclass AND relkind = 'p'
        ) INTO is_partitioned;

        IF NOT is_partitioned THEN
            BEGIN
                LOCK TABLE "LedgerEntry" IN SHARE UPDATE EXCLUSIVE MODE;
                EXECUTE 'ALTER TABLE "LedgerEntry" RENAME TO "LedgerEntry_old"';
                EXECUTE 'CREATE TABLE "LedgerEntry" (LIKE "LedgerEntry_old" INCLUDING ALL) PARTITION BY RANGE ("fsDate")';

                EXECUTE $p1$
                    CREATE TABLE IF NOT EXISTS ledger_entry_before_2024 
                    PARTITION OF "LedgerEntry"
                    FOR VALUES FROM ('1970-01-01') TO ('2024-01-01')
                $p1$;
                
                EXECUTE $p2$
                    CREATE TABLE IF NOT EXISTS ledger_entry_2024 
                    PARTITION OF "LedgerEntry"
                    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')
                $p2$;

                -- Default LAST
                EXECUTE $p3$
                    CREATE TABLE IF NOT EXISTS ledger_entry_default 
                    PARTITION OF "LedgerEntry" DEFAULT
                $p3$;

                EXECUTE 'INSERT INTO "LedgerEntry" SELECT * FROM "LedgerEntry_old"';
                EXECUTE 'DROP TABLE "LedgerEntry_old" CASCADE';
            EXCEPTION WHEN others THEN
                RAISE WARNING 'LedgerEntry partitioning migration failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        CREATE TABLE "LedgerEntry" (
        id                   UUID NOT NULL,
        ledgerTransactionId  TEXT NOT NULL,
        fsDate               DATE NOT NULL,
        coaId                TEXT NOT NULL,
        transactionSide      "DebitCredit" NOT NULL,
        sourceCurrencyId     TEXT NOT NULL,
        sourceAmount         NUMERIC NOT NULL,
        absoluteSourceAmount NUMERIC NOT NULL,
        systemExchangeRate   NUMERIC NOT NULL,
        customExchangeRate   NUMERIC NOT NULL,
        amount               NUMERIC NOT NULL,
        absoluteAmount       NUMERIC NOT NULL,
        categorisationStatus "CategorisationStatus" NOT NULL DEFAULT 'AUTO_CATEGORISED',
        description          TEXT,
        projectId            TEXT,
        updatedById          TEXT,
        createdAt            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updatedAt            TIMESTAMPTZ NOT NULL DEFAULT now(),
        deletedAt            TIMESTAMPTZ,
        isDeleted            BOOLEAN NOT NULL DEFAULT false,
        CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY (id, fsDate)
        ) PARTITION BY RANGE ("fsDate");
    END IF;
END $$;

-- Ensure base LedgerEntry partitions exist
DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entry_before_2024 PARTITION OF "LedgerEntry"
           FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entry_2024 PARTITION OF "LedgerEntry"
           FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS ledger_entry_default PARTITION OF "LedgerEntry" DEFAULT';
END $$;

-- LedgerEntry indexes (removed duplicate fsDate index)
CREATE INDEX IF NOT EXISTS ledger_entry_coaid_fsdate_idx ON "LedgerEntry" ("coaId", "fsDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_categorisationStatus_idx1" ON "LedgerEntry" ("categorisationStatus");
CREATE INDEX IF NOT EXISTS "LedgerEntry_coaId_isDeleted_idx" ON "LedgerEntry" ("coaId", "isDeleted");
CREATE INDEX IF NOT EXISTS ledger_entry_fsdate_idx ON "LedgerEntry" ("fsDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_ledgerTransactionId_idx" ON "LedgerEntry" ("ledgerTransactionId");

-- Function to create additional LedgerEntry partitions (yearly or monthly after a transition year)
CREATE OR REPLACE FUNCTION create_ledger_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2028;
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
                'CREATE TABLE IF NOT EXISTS ledger_entry_%s PARTITION OF "LedgerEntry"
                 FOR VALUES FROM (%L) TO (%L)',
                to_char(start_date, 'YYYY_MM'),
                start_date,
                end_date
            );
        END LOOP;
    ELSE
        FOR yr IN current_year..(current_year + 10) LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS ledger_entry_%s PARTITION OF "LedgerEntry"
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
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
       OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt"
       OR OLD."updatedAt" IS DISTINCT FROM NEW."updatedAt"
       OR OLD."updatedById" IS DISTINCT FROM NEW."updatedById"
       OR OLD."description" IS DISTINCT FROM NEW."description"
       OR OLD."projectId" IS DISTINCT FROM NEW."projectId" THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Ledger entries are immutable';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_ledger_entry_delete ON "LedgerEntry";
CREATE TRIGGER prevent_ledger_entry_delete
BEFORE DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE PROCEDURE prevent_ledger_modification();


------------------------------------------------
-- Partitioning for BankTransaction
DO $$
DECLARE
    table_exists BOOLEAN;
    is_partitioned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'BankTransaction'
    ) INTO table_exists;

    IF table_exists THEN
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = 'public."BankTransaction"'::regclass AND relkind = 'p'
        ) INTO is_partitioned;

        IF NOT is_partitioned THEN
            BEGIN
                LOCK TABLE "BankTransaction" IN SHARE UPDATE EXCLUSIVE MODE;
                EXECUTE 'ALTER TABLE "BankTransaction" RENAME TO "BankTransaction_old"';
                EXECUTE 'CREATE TABLE "BankTransaction" (LIKE "BankTransaction_old" INCLUDING ALL) PARTITION BY RANGE ("date")';
                EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_default PARTITION OF "BankTransaction" DEFAULT';
                EXECUTE 'INSERT INTO "BankTransaction" SELECT * FROM "BankTransaction_old"';
                EXECUTE 'DROP TABLE "BankTransaction_old" CASCADE';
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'BankTransaction partitioning migration failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        CREATE TABLE "BankTransaction" (
            id                     UUID NOT NULL,
            date                   DATE NOT NULL,
            payee                  TEXT,
            reference              TEXT,
            description            TEXT,
            additionalComments     TEXT,
            transactionSide        "DebitCredit",
            amount                 NUMERIC NOT NULL,
            absoluteAmount         NUMERIC NOT NULL DEFAULT 0,
            systemExchangeRate     NUMERIC NOT NULL,
            categorisationStatus   "CategorisationStatus" NOT NULL DEFAULT 'UNCATEGORISED',
            bankAccountId          TEXT NOT NULL,
            bankTransactionBatchId TEXT,
            ledgerTransactionId    TEXT,
            createdById            TEXT NOT NULL,
            updatedById            TEXT,
            createdAt              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updatedAt              TIMESTAMPTZ NOT NULL DEFAULT now(),
            isDeleted              BOOLEAN NOT NULL DEFAULT false,
            deletedAt              TIMESTAMPTZ,
            CONSTRAINT "BankTransaction_pkey" PRIMARY KEY (id, date)
        ) PARTITION BY RANGE ("date");
    END IF;
END $$;

-- Ensure base BankTransaction partitions exist
DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_before_2024 PARTITION OF "BankTransaction"
           FOR VALUES FROM (''1970-01-01'') TO (''2024-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_2024 PARTITION OF "BankTransaction"
           FOR VALUES FROM (''2024-01-01'') TO (''2025-01-01'')';
  EXECUTE 'CREATE TABLE IF NOT EXISTS bank_transaction_default PARTITION OF "BankTransaction" DEFAULT';
END $$;

-- BankTransaction indexes
CREATE INDEX IF NOT EXISTS banktx_date_idx ON "BankTransaction" ("date");
CREATE INDEX IF NOT EXISTS banktx_categorisation_status_idx ON "BankTransaction" ("categorisationStatus");
CREATE INDEX IF NOT EXISTS banktx_batch_id_idx ON "BankTransaction" ("bankTransactionBatchId");
CREATE INDEX IF NOT EXISTS "BankTransaction_id_date_idx1" ON "BankTransaction" (id, date);
CREATE INDEX IF NOT EXISTS "BankTransaction_ledgerTransactionId_idx1" ON "BankTransaction" ("ledgerTransactionId");

CREATE OR REPLACE FUNCTION create_banktx_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2028;
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
                'CREATE TABLE IF NOT EXISTS bank_transaction_%s PARTITION OF "BankTransaction"
                 FOR VALUES FROM (%L) TO (%L)',
                to_char(start_date, 'YYYY_MM'),
                start_date,
                end_date
            );
        END LOOP;
    ELSE
        FOR yr IN current_year..(current_year + 10) LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS bank_transaction_%s PARTITION OF "BankTransaction"
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
CREATE OR REPLACE FUNCTION prevent_banktx_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bank transactions are immutable';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted"
       OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt"
       OR OLD."updatedAt" IS DISTINCT FROM NEW."updatedAt"
       OR OLD."updatedById" IS DISTINCT FROM NEW."updatedById"
       OR OLD."categorisationStatus" IS DISTINCT FROM NEW."categorisationStatus" THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Bank transactions are immutable';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_banktx_delete ON "BankTransaction";
CREATE TRIGGER prevent_banktx_delete
BEFORE DELETE ON "BankTransaction"
FOR EACH ROW EXECUTE PROCEDURE prevent_banktx_modification();

CREATE OR REPLACE FUNCTION schedule_partition_cron() 
RETURNS void AS $$
BEGIN
    -- Unschedule existing partition jobs if they exist
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-banktx-partitions') THEN
        PERFORM cron.unschedule('create-banktx-partitions');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-ledger-partitions') THEN
        PERFORM cron.unschedule('create-ledger-partitions');
    END IF;

    -- Schedule new partition jobs based on the current date
    PERFORM cron.schedule(
        'create-banktx-partitions',
        CASE 
            WHEN CURRENT_DATE < '2028-01-01' THEN '0 0 1 12 *' 
            ELSE '0 0 1 */3 *'
        END,
        'SELECT create_banktx_partitions();'
    );

    PERFORM cron.schedule(
        'create-ledger-partitions',
        CASE 
            WHEN CURRENT_DATE < '2028-01-01' THEN '0 0 1 12 *' 
            ELSE '0 0 1 */3 *'
        END,
        'SELECT create_ledger_partitions();'
    );
END;
$$ LANGUAGE plpgsql;

SELECT schedule_partition_cron();

-- Ledger Entry Foreign Keys
DO $$
BEGIN
    BEGIN
        ALTER TABLE "LedgerEntry"
            ADD CONSTRAINT fk_ledger_transaction
            FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "LedgerEntry"
            ADD CONSTRAINT fk_ledger_entry_coa
            FOREIGN KEY ("coaId") REFERENCES "Coa" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "LedgerEntry"
            ADD CONSTRAINT fk_ledger_entry_currency
            FOREIGN KEY ("sourceCurrencyId") REFERENCES "Currency" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "LedgerEntry"
            ADD CONSTRAINT fk_ledger_entry_project
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "LedgerEntry"
            ADD CONSTRAINT fk_ledger_entry_updated_by
            FOREIGN KEY ("updatedById") REFERENCES "User" ("id")
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Bank Transaction Foreign Keys

DO $$
BEGIN
    BEGIN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT fk_bank_transaction_bank_account
            FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT fk_bank_transaction_batch
            FOREIGN KEY ("bankTransactionBatchId") REFERENCES "BankTransactionBatch" ("id")
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT fk_bank_transaction_ledger_match
            FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT fk_bank_transaction_created_by
            FOREIGN KEY ("createdById") REFERENCES "User" ("id")
            ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TABLE "BankTransaction"
            ADD CONSTRAINT fk_bank_transaction_updated_by
            FOREIGN KEY ("updatedById") REFERENCES "User" ("id")
            ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;



