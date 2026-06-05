import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';
import z from 'zod';

import { isDev } from '../config/env-loader.js';
import {
  addStandardColumns,
  addUserAuditColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from '../migrations/utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filePath = join(__dirname, './data/currencies.json');
const raw = readFileSync(filePath, 'utf-8');
const data = JSON.parse(raw) as NewCurrencyWithId[];

const currencyWithId = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  symbol: z.string(),
});

type NewCurrencyWithId = z.infer<typeof currencyWithId>;

export const CURRENCY_MAP = new Map<string, NewCurrencyWithId>(
  data.map((c) => [c.code, c]),
);

const tableName = 'currencies';

export async function seedCurrencies(knex: Knex): Promise<void> {
  try {
    const currencies: NewCurrencyWithId[] = data;
    const seedData: Array<NewCurrencyWithId> = [];
    let skipped = 0;

    for (const currency of currencies) {
      const result = currencyWithId.safeParse(currency);

      if (result.success) {
        seedData.push({
          id: result.data.id,
          name: result.data.name.trim(),
          code: result.data.code.trim().toUpperCase(),
          symbol: result.data.symbol.trim(),
        });
      } else {
        skipped++;
        console.warn(
          `Skipped invalid currency: ${JSON.stringify(currency)}`,
          result.error,
        );
      }
    }

    if (skipped > 0) {
      throw new Error(`Skipped ${skipped} invalid currencies`);
    }

    if (seedData.length === 0) {
      console.warn(`No valid currencies to seed`);
    }

    if (seedData.length > 0) {
      await knex.transaction(async (trx) => {
        await trx(tableName).insert(seedData).onConflict('code').ignore();
      });
    }
    if (isDev) {
      console.log(`Seeded ${seedData.length} currencies`);
    }
  } catch (error) {
    console.error(`Error seeding currencies:`, error);
    throw error;
  }
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 4).unique().notNullable(); //ISO Currency Codes
    table.string('name', 50).unique().notNullable();
    table.string('symbol', 5).notNullable();

    addUserAuditColumns(table);
    addStandardColumns(knex, table);

    table.index(['code'], 'currency_code_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);

  await seedCurrencies(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
