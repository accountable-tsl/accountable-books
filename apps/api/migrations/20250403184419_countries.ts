import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from './utils/db';
import data from './data/countries.json';
import { randomUUID } from 'crypto';
import { isDev } from '../config/env-loader';
import z from 'zod';

const newCountry = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(3)
    .transform((val) => val.toUpperCase()),
  name: z.string(),
  phone_code: z.string().max(10),
  flag: z.string().max(10).nullish(),
  continent: z.string().max(50).nullish(),
});

export type NewCountryInput = z.infer<typeof newCountry>;

export const COUNTRY_MAP = new Map<string, NewCountryInput>(data.map((c) => [c.code, c]));

const tableName = 'countries';

const seedCountries = async function seed(knex: Knex): Promise<void> {
  try {
    const countries: NewCountryInput[] = data;
    const seedData: Array<NewCountryInput> = [];
    let skipped = 0;

    for (const c of countries) {
      const result = newCountry.safeParse(c);

      if (result.success) {
        seedData.push({
          id: result.data.id || randomUUID(),
          code: result.data.code.trim().toUpperCase(),
          name: result.data.name.trim(),
          phone_code: result.data.phone_code,
          ...(result.data.flag && { flag: result.data.flag }),
          ...(result.data.continent && { continent: result.data.continent }),
        });
      } else {
        skipped++;
        console.warn(`Skipped invalid country: ${JSON.stringify(c)}`, result.error);
      }
    }

    if (skipped > 0) {
      throw new Error(`Skipped ${skipped} invalid countries`);
    }

    if (seedData.length === 0) {
      console.warn(`No valid countries found`);
    }

    if (seedData.length > 0) {
      await knex.transaction(async (trx) => {
        await trx(tableName).insert(seedData).onConflict('code').ignore();
      });
    }

    if (isDev) {
      console.log(`Seeded ${seedData.length} countries`);
    }
  } catch (error) {
    console.error('Error seeding countries:', error);
    throw error;
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 3).unique().notNullable();
    table.string('name', 256).notNullable();
    table.string('phone_code', 15).notNullable();
    table.string('flag', 15).nullable();
    table.string('continent', 50).nullable();

    addStandardColumns(knex, table);

    table.index(['code'], 'country_code_idx');
    table.index(['name'], 'country_name_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedCountries(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
