const DEFAULT_SCHEMA = 'app';

function formatAllowedValues(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

export function createDomainIfNotExists(
  domainName: string,
  baseType: string,
  allowedValues: readonly string[],
  schemaName: string = DEFAULT_SCHEMA,
) {
  const qualifiedName = `"${schemaName}"."${domainName}"`;
  const checkClause = `VALUE IN (${formatAllowedValues(allowedValues)})`;

  return `
  DO $$
  BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = '${domainName}'
    AND n.nspname = '${schemaName}'
    AND t.typtype = 'd'
    ) THEN
    CREATE DOMAIN ${qualifiedName} AS ${baseType}
    CHECK (${checkClause});
    END IF;
    END
    $$;
    `;
}

export function dropDomainIfExists(
  domainName: string,
  schemaName: string = DEFAULT_SCHEMA,
) {
  return `DROP DOMAIN IF EXISTS "${schemaName}"."${domainName}"`;
}

export const CONTACT_TYPES = [
  'customer',
  'vendor',
  'employee',
  'contractor',
  'director',
  'owner',
  'government',
  'internal',
  'banker',
  'other',
] as const;

export function createContactTypeDomain() {
  return createDomainIfNotExists('contact_type', 'TEXT', CONTACT_TYPES);
}

export const FISCAL_PERIOD_TYPES = ['monthly', 'quarterly', 'yearly'] as const;

export function createFiscalPeriodTypeDomain() {
  return createDomainIfNotExists(
    'fiscal_period_type',
    'TEXT',
    FISCAL_PERIOD_TYPES,
  );
}
