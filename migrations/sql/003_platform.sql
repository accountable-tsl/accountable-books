-- Purpose: This script ensures that there is only one platform firm and company in the system
-- and prevents accidental removal of the platform flag once it's set.

BEGIN;

-- Clean up existing objects to ensure script is idempotent
DROP TRIGGER IF EXISTS lock_firm_platform_flag ON accounting_firm;
DROP TRIGGER IF EXISTS lock_company_platform_flag ON company;
DROP FUNCTION IF EXISTS prevent_platform_flag_update() CASCADE;
DROP INDEX IF EXISTS only_one_platform_firm;
DROP INDEX IF EXISTS only_one_platform_company;


-- Add platform flag columns to both tables
ALTER TABLE accounting_firm ADD COLUMN IF NOT EXISTS is_platform BOOLEAN DEFAULT false;
ALTER TABLE company ADD COLUMN IF NOT EXISTS is_platform BOOLEAN DEFAULT false;

-- Create partial unique indexes to ensure only one record can be marked as platform
CREATE UNIQUE INDEX only_one_platform_firm ON accounting_firm (is_platform) WHERE is_platform = true;
CREATE UNIQUE INDEX only_one_platform_company ON company (is_platform) WHERE is_platform = true;

-- Create function to prevent removing the platform flag once set
CREATE FUNCTION prevent_platform_flag_update()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_platform IS TRUE AND NEW.is_platform IS FALSE THEN
    RAISE EXCEPTION 'Cannot unset is_platform flag on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lock_firm_platform_flag
BEFORE UPDATE ON accounting_firm
FOR EACH ROW
WHEN (OLD.is_platform IS TRUE)
EXECUTE FUNCTION prevent_platform_flag_update();

CREATE TRIGGER lock_company_platform_flag
BEFORE UPDATE ON company
FOR EACH ROW
WHEN (OLD.is_platform IS TRUE)
EXECUTE FUNCTION prevent_platform_flag_update();

-- Optional: Set a platform firm if none exists yet

COMMIT;