import type { Knex } from 'knex';

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

function quoteQualifiedName(tableName: string, schemaName?: string): string {
  return schemaName
    ? `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`
    : quoteIdentifier(tableName);
}

export async function createTrgmIndexes(
  knex: Knex,
  tableName: string,
  columns: string[],
  searchFieldName: string = 'search_text',
  schemaName?: string,
): Promise<void> {
  // Validate inputs
  if (!tableName || !columns || columns.length === 0) {
    throw new Error('tableName and columns are required');
  }

  // Validate column names to prevent SQL injection
  const validColumnNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (
    !validColumnNameRegex.test(tableName) ||
    !validColumnNameRegex.test(searchFieldName) ||
    (schemaName !== undefined && !validColumnNameRegex.test(schemaName))
  ) {
    throw new Error('Invalid schema, table, or column name');
  }

  for (const column of columns) {
    if (!validColumnNameRegex.test(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }
  }

  // Create search_text column if it doesn't exist
  const schema = schemaName ? knex.schema.withSchema(schemaName) : knex.schema;
  const searchTextColumnExists = await schema.hasColumn(
    tableName,
    searchFieldName,
  );
  if (!searchTextColumnExists) {
    // Build the generated column expression
    const coalesceExpressions = columns
      .map((column) => `COALESCE(${quoteIdentifier(column)}, '')`)
      .join("||' '||");
    const generatedExpression = `btrim(lower(${coalesceExpressions}))`;

    // Use raw SQL to create the generated column
    await knex.raw(`
      ALTER TABLE ${quoteQualifiedName(tableName, schemaName)}
      ADD COLUMN ${quoteIdentifier(searchFieldName)} TEXT
      GENERATED ALWAYS AS (${generatedExpression}) STORED
    `);
  }

  // Create trigram index on search_text column
  // Ensure index name doesn't exceed PostgreSQL's 63-character limit
  const baseIndexName = `idx_${tableName}_${searchFieldName}_trgm`;
  const indexName =
    baseIndexName.length > 63 ? baseIndexName.slice(0, 63) : baseIndexName;

  const sql = `
    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(indexName)}
    ON ${quoteQualifiedName(tableName, schemaName)}
    USING GIN (${quoteIdentifier(searchFieldName)} gin_trgm_ops)
  `;
  await knex.raw(sql);
}

export async function dropTrgmIndexes(
  knex: Knex,
  tableName: string,
  searchFieldName: string = 'search_text',
  schemaName?: string,
): Promise<void> {
  // Validate inputs
  if (!tableName || !searchFieldName) {
    throw new Error('tableName and searchFieldName are required');
  }

  // Validate names to prevent SQL injection
  const validColumnNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (
    !validColumnNameRegex.test(tableName) ||
    !validColumnNameRegex.test(searchFieldName) ||
    (schemaName !== undefined && !validColumnNameRegex.test(schemaName))
  ) {
    throw new Error('Invalid schema, table, or column name');
  }

  // Drop the trigram index on search_text
  const baseIndexName = `idx_${tableName}_${searchFieldName}_trgm`;
  const indexName =
    baseIndexName.length > 63 ? baseIndexName.slice(0, 63) : baseIndexName;
  await knex.raw(
    `DROP INDEX IF EXISTS ${quoteQualifiedName(indexName, schemaName)}`,
  );
}
