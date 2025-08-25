-- Purpose: This script ensures that there is only one platform firm and company in the system
-- and prevents accidental removal of the platform flag once it's set.

BEGIN;

-- Clean up existing objects to ensure script is idempotent
DROP TRIGGER IF EXISTS lock_company_platform_flag ON companies;
DROP FUNCTION IF EXISTS prevent_platform_flag_update() CASCADE;
DROP INDEX IF EXISTS only_one_platform_company;


-- -- Add platform flag columns to both tables
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_platform BOOLEAN DEFAULT false;

-- Create partial unique indexes to ensure only one record can be marked as platform
CREATE UNIQUE INDEX only_one_platform_company ON companies (is_platform) WHERE is_platform = true;

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

CREATE TRIGGER lock_company_platform_flag
BEFORE UPDATE ON companies
FOR EACH ROW
WHEN (OLD.is_platform IS TRUE)
EXECUTE FUNCTION prevent_platform_flag_update();

-- Set a platform company if none exists yet
DO $$
DECLARE
  updated_rows integer;
BEGIN
    -- Only set platform flag if no platform company exists
    IF NOT EXISTS (SELECT 1 FROM companies WHERE is_platform = true) THEN
        UPDATE companies 
        SET is_platform = true 
        WHERE id = 'a494b675-fedd-455c-ab6d-00ffdff9a047';

        GET DIAGNOSTICS updated_rows = ROW_COUNT;
        
    IF updated_rows = 0 THEN
      RAISE INFO 'Company with ID a494b675-fedd-455c-ab6d-00ffdff9a047 not found. No platform company was set.';
    ELSE
      RAISE INFO 'Set company a494b675-fedd-455c-ab6d-00ffdff9a047 as platform company';
    END IF;
  END IF;
END;
$$;


COMMIT;