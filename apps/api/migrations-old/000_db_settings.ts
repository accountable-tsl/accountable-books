import type { Knex } from 'knex';

export const config = { transaction: false };

async function getCurrentDatabase(knex: Knex): Promise<string> {
  const result = await knex.raw('select current_database() as db');
  const db = result?.rows?.[0]?.db as string | undefined;
  if (!db) throw new Error('Unable to determine current database name');
  return db;
}

export async function up(knex: Knex): Promise<void> {
  // Set timezone for the current migration session
  await knex.raw(`SET TIME ZONE 'UTC'`);

  // This applies to all future connections (DB default)
  const db = await getCurrentDatabase(knex);
  await knex.raw(
    `
    ALTER DATABASE ??
    SET timezone TO 'UTC';
  `,
    [db],
  );
}

export async function down(knex: Knex): Promise<void> {
  const db = await getCurrentDatabase(knex);
  await knex.raw(
    `
    ALTER DATABASE ??
    RESET timezone;
  `,
    [db],
  );
}
