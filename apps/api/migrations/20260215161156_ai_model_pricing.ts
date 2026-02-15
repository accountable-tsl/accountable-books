import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'ai_model_pricing';

const PROVIDERS = ['openai'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .string('provider', 32)
      .notNullable()
      .checkIn(PROVIDERS, 'ai_model_pricing_provider_check');
    table.text('model').notNullable();

    // Micro-dollars per 1M tokens (USD * 1e6 per 1e6 tokens).
    // This keeps costs exact and makes estimation integer-only.
    table.bigInteger('input_usd_micros_per_1m_tokens').notNullable();
    table.bigInteger('output_usd_micros_per_1m_tokens').notNullable();

    table
      .timestamp('effective_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.jsonb('metadata').notNullable().defaultTo('{}');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE INDEX ai_model_pricing_provider_model_effective_at_desc_idx
      ON ${tableName} (provider, model, effective_at DESC)
      WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
