import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { Knex } from 'knex';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Expose feed connected_at on bank_accounts_metrics_view for sync-health
 * freshness (pending vs delayed initial sync).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS bank_accounts_metrics_view;`);
  const viewSql = readFileSync(
    join(__dirname, 'views-sql/bank_accounts_metrics_view.sql'),
    'utf-8',
  );
  await knex.raw(viewSql);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS bank_accounts_metrics_view;`);
  const viewSql = readFileSync(
    join(__dirname, 'views-sql/bank_accounts_metrics_view.sql'),
    'utf-8',
  );
  await knex.raw(viewSql);
}
