import type { Knex } from 'knex';

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

function quoteQualifiedName(tableName: string, schemaName?: string): string {
  return schemaName
    ? `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`
    : quoteIdentifier(tableName);
}

export function addStandardColumns(knex: Knex, table: Knex.CreateTableBuilder) {
  table
    .timestamp('created_at', { useTz: true })
    .notNullable()
    .defaultTo(knex.fn.now());

  table
    .timestamp('updated_at', { useTz: true })
    .notNullable()
    .defaultTo(knex.fn.now());

  table.boolean('is_deleted').notNullable().defaultTo(false);
  table.timestamp('deleted_at', { useTz: true }).nullable();
}

export function addUserAuditColumns(
  table: Knex.CreateTableBuilder,
  options?: {
    includeDeletedBy?: boolean;
  },
) {
  const includeDeletedBy = options?.includeDeletedBy ?? true;

  const createdBy = table.uuid('created_by_id').notNullable();
  createdBy.references('id').inTable('users').onDelete('RESTRICT');

  const updatedBy = table.uuid('updated_by_id').nullable();
  updatedBy.references('id').inTable('users').onDelete('SET NULL');

  if (includeDeletedBy) {
    const deletedBy = table.uuid('deleted_by_id').nullable();
    deletedBy.references('id').inTable('users').onDelete('SET NULL');
  }
}

export async function createUpdateTimestampTrigger(
  knex: Knex,
  tableName: string,
  schemaName?: string,
) {
  const quoted = quoteQualifiedName(tableName, schemaName);
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create the trigger for the specific table
  await knex.raw(`
    CREATE TRIGGER update_${tableName}_timestamp
    BEFORE UPDATE ON ${quoted}
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  `);
}

export async function dropUpdateTimestampTrigger(
  knex: Knex,
  tableName: string,
  schemaName?: string,
) {
  const quoted = quoteQualifiedName(tableName, schemaName);

  await knex.raw(
    `DROP TRIGGER IF EXISTS update_${tableName}_timestamp ON ${quoted};`,
  );
}

export async function preventUpdateOrDelete(
  knex: Knex,
  tableName: string,
  schemaName?: string,
) {
  const quoted = quoteQualifiedName(tableName, schemaName);
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_update_or_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Updates or deletions are not allowed on table: %', TG_TABLE_NAME;
    END;
    $$ LANGUAGE plpgsql;
    `);

  // Create the trigger for the specific table
  await knex.raw(`
    CREATE TRIGGER prevent_update_or_delete_${tableName}
    BEFORE UPDATE OR DELETE ON ${quoted}
    FOR EACH ROW
    EXECUTE FUNCTION prevent_update_or_delete();
  `);
}
