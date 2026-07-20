const DEFAULT_ENUM_SCHEMA = 'app';

export function createEnumIfNotExists(
  typeName: string,
  values: string[],
  schemaName: string = DEFAULT_ENUM_SCHEMA,
) {
  const formattedValues = values
    .map((value) => `'${value.replace(/'/g, "''")}'`)
    .join(', ');
  const qualifiedName = `"${schemaName}"."${typeName}"`;

  return `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = '${typeName}'
          AND n.nspname = '${schemaName}'
      ) THEN
        CREATE TYPE ${qualifiedName} AS ENUM (${formattedValues});
      END IF;
    END
    $$;
  `;
}

export function dropEnumIfExists(
  typeName: string,
  schemaName: string = DEFAULT_ENUM_SCHEMA,
) {
  return `DROP TYPE IF EXISTS "${schemaName}"."${typeName}"`;
}
