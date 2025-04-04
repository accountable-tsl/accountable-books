import type { Knex } from "knex";

exports.up = async (knex: Knex) => {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW."updatedAt" = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER ledgerentry_set_updated_at
    BEFORE UPDATE ON "LedgerEntry"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

    CREATE TRIGGER prevent_ledger_entry_delete
    BEFORE DELETE ON "LedgerEntry"
    FOR EACH ROW EXECUTE PROCEDURE prevent_ledger_modification();

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

    CREATE TRIGGER prevent_banktx_delete
    BEFORE DELETE ON "BankTransaction"
    FOR EACH ROW EXECUTE PROCEDURE prevent_banktx_modification();

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
  `);
};

exports.down = async (knex: Knex) => {
  await knex.raw(`
    DROP TRIGGER IF EXISTS ledgerentry_set_updated_at ON "LedgerEntry" CASCADE;
    DROP FUNCTION IF EXISTS set_updated_at CASCADE;
    DROP TRIGGER IF EXISTS prevent_ledger_entry_delete ON "LedgerEntry" CASCADE;
    DROP FUNCTION IF EXISTS prevent_ledger_modification CASCADE;
    DROP TRIGGER IF EXISTS prevent_banktx_delete ON "BankTransaction" CASCADE;
    DROP FUNCTION IF EXISTS prevent_banktx_modification CASCADE;
    DROP FUNCTION IF EXISTS create_ledger_partitions CASCADE;
    DROP FUNCTION IF EXISTS create_banktx_partitions CASCADE;
  `);
};
