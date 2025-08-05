import type { Knex } from "knex";

export async function createTrgmIndexes(
  knex: Knex,
  tableName: string,
  columns: string[]
): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  for (const column of columns) {
    const indexName = `idx_${tableName}_${column}_trgm`;
    const sql = `
      CREATE INDEX IF NOT EXISTS ${indexName}
      ON ${tableName}
      USING GIN (LOWER(${column}) gin_trgm_ops)
    `;
    await knex.raw(sql);
  }
}

export async function dropTrgmIndexes(
  knex: Knex,
  tableName: string,
  columns: string[]
): Promise<void> {
  for (const column of columns) {
    const indexName = `idx_${tableName}_${column}_trgm`;
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }
}
