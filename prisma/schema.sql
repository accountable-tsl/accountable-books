ALTER TABLE "LedgerEntry" RENAME TO "LedgerEntry_old";

CREATE TABLE "LedgerEntry" (
    LIKE "LedgerEntry_old" INCLUDING ALL  -- Copy structure from old table
) PARTITION BY RANGE ("fsDate");

CREATE TABLE ledger_entry_2024 PARTITION OF "LedgerEntry"
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE ledger_entry_default PARTITION OF "LedgerEntry" DEFAULT;

CREATE TABLE ledger_entry_before_2024 PARTITION OF "LedgerEntry"
FOR VALUES FROM ('1970-01-01') TO ('2024-01-01');

INSERT INTO "LedgerEntry" 
SELECT * FROM "LedgerEntry_old";

DROP TABLE "LedgerEntry_old" CASCADE;

CREATE INDEX ledger_entry_fsdate_idx ON "LedgerEntry" ("fsDate");
CREATE INDEX ledger_entry_coaid_fsdate_idx ON "LedgerEntry" ("coaId", "fsDate");

CREATE OR REPLACE FUNCTION create_ledger_partitions()
RETURNS void AS $$
DECLARE 
    current_year INT := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'UTC');
    transition_year INT := 2028;
BEGIN
    -- Create yearly partitions
    FOR year IN current_year..(current_year + 10) LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS ledger_entry_%s PARTITION OF "LedgerEntry"
            FOR VALUES FROM (%L) TO (%L);',
            year,
            format('%s-01-01', year),
            format('%s-01-01', year + 1)
        );
    END LOOP;

    -- Create monthly partitions after transition year
    IF current_year >= transition_year THEN
        FOR month_offset IN 0..59 LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS ledger_entry_%s PARTITION OF "LedgerEntry"
                FOR VALUES FROM (%L) TO (%L);',
                to_char(CURRENT_DATE + (month_offset || ' months')::interval, 'YYYY_MM'),
                date_trunc('month', CURRENT_DATE) + (month_offset || ' months')::interval,
                date_trunc('month', CURRENT_DATE) + ((month_offset + 1) || ' months')::interval
            );
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. SCHEDULE PARTITION CREATION
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION schedule_partition_cron() 
RETURNS void AS $$

BEGIN
    -- Delete any existing cron job with the same name to prevent duplicates
    EXECUTE 'DELETE FROM cron.job WHERE jobname = ''create-ledger-partitions''';

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

-- IMMUTABILITY TRIGGERS (NO DELETES/UPDATES)
-- Allow updates to specific fields for soft deletes
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        RETURN NULL;  -- Prevent deletion by returning NULL
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (
            OLD."isDeleted" IS DISTINCT FROM NEW."isDeleted" OR
            OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt" OR
            OLD."updatedAt" IS DISTINCT FROM NEW."updatedAt" OR
            OLD."updatedById" IS DISTINCT FROM NEW."updatedById" OR
            OLD."description" IS DISTINCT FROM NEW."description" OR
            OLD."projectId" IS DISTINCT FROM NEW."projectId"
        ) THEN
            RETURN NEW;
        ELSE
            -- RAISE EXCEPTION 'Ledger entries are immutable';
            RETURN NULL;  -- Ignore invalid updates without throwing an exception
        END IF;
    END IF;
    RETURN NULL;
END; 
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_ledger_entry_update ON "LedgerEntry";
CREATE TRIGGER prevent_ledger_entry_update
BEFORE UPDATE ON "LedgerEntry"
FOR EACH ROW EXECUTE PROCEDURE prevent_ledger_modification();

DROP TRIGGER IF EXISTS prevent_ledger_entry_delete ON "LedgerEntry";
CREATE TRIGGER prevent_ledger_entry_delete
BEFORE DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE PROCEDURE prevent_ledger_modification();


