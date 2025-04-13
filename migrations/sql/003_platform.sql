ALTER TABLE accounting_firm ADD COLUMN is_platform BOOLEAN DEFAULT false;
ALTER TABLE company ADD COLUMN is_platform BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX only_one_platform_company ON accounting_firm (is_platform) WHERE is_platform = true;
CREATE UNIQUE INDEX only_one_platform_firm ON company (is_platform) WHERE is_platform = true;

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

