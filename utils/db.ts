import type { Knex } from "knex";
import knexInstance from "../knexClient";

export function addStandardColumns(table: Knex.CreateTableBuilder) {
  table
    .timestamp("created_at", { useTz: true })
    .notNullable()
    .defaultTo(knexInstance.fn.now());

  table
    .timestamp("updated_at", { useTz: true })
    .notNullable()
    .defaultTo(knexInstance.fn.now());

  table.boolean("is_deleted").notNullable().defaultTo(false);
  table.timestamp("deleted_at", { useTz: true }).nullable();
}

export async function createUpdateTimestampTrigger(
  knex: Knex,
  tableName: string
) {
  const quoted = `"${tableName}"`;
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
  tableName: string
) {
  const quoted = `"${tableName}"`;

  await knex.raw(
    `DROP TRIGGER IF EXISTS update_${tableName}_timestamp ON ${quoted};`
  );
}
