import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.ts';
import { adminUser } from './20250403184441_users.ts';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.ts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const filePath = join(__dirname, './data/banks.json');
const raw = readFileSync(filePath, 'utf-8');
const bankData = JSON.parse(raw) as any[];

const tableName = 'banks';

export const countryMap = new Map<string, any>();

const seedBanks = async function seed(knex: Knex): Promise<void> {
  const adminUserId = adminUser.id;
  if (!adminUserId) throw new Error('adminUserId is required');
  const countries = await knex('countries').select('id', 'code');
  if (!countries.length) throw new Error('No countries found');
  countries.forEach((country) => {
    countryMap.set(country.code, country);
  });

  const banks = bankData.map((bank) => {
    const country = countryMap.get(bank.country);
    if (!country) throw new Error(`Country ${bank.country} not found`);
    return {
      id: bank.id,
      key: bank.key,
      display_name: bank.display_name,
      official_name: bank.official_name,
      swift_code: bank.swift_code || null,
      local_code: bank.local_code || null,
      local_code_type: bank.local_code_type || null,
      secondary_reference: bank.secondary_reference || null,
      website: bank.website || null,
      logo_url: bank.logo_url || null,
      country_id: country.id,
      created_by_id: adminUserId,
      updated_by_id: adminUserId,
    };
  });

  const res = await knex.batchInsert(tableName, banks, 100);
  console.log(`Successfully created ${banks.length} banks`);
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key').notNullable();
    table.string('display_name').notNullable();
    table.string('official_name').nullable();

    table.string('swift_code').nullable();
    table.string('local_code').nullable(); // We use NIP code for Nigeria
    table
      .enu(
        'local_code_type',
        [
          'sort_code',
          'routing',
          'bank_code',
          'nip_code',
          'ifsc',
          'blz',
          'zengin_code',
          'cnaps',
        ],
        {
          enumName: 'bank_local_code_type',
          useNative: false,
        },
      )
      .nullable(); // value: e.g., 'sort_code'
    table.string('secondary_reference').nullable();

    table.string('website').nullable();

    table.string('logo_url').nullable();
    table.string('logo_key').nullable();
    table.jsonb('raw_data').nullable().defaultTo('{}');

    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable('countries')
      .onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.unique(['key', 'country_id']);
    table.index(['key', 'country_id']);
    table.index(['display_name', 'country_id']);
    table.index(['display_name']);
    table.index(['country_id']);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await createTrgmIndexes(knex, tableName, ['display_name', 'official_name']);

  await seedBanks(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS bank_local_code_type;`);
}
