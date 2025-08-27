import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from './utils/db';
import { ROLES } from './data/roles';
import { isDev } from '../config/env-loader';

const tableName = 'roles';
const { PLATFORM_ROLES, FIRM_ROLES, COMPANY_ROLES } = ROLES;

const seedRoles = async function seed(knex: Knex): Promise<void> {
  try {
    // Validate and prepare data
    const seedData = [
      ...PLATFORM_ROLES.map((role) => ({
        ...role,
        scope: 'platform',
      })),
      ...FIRM_ROLES.map((role) => ({ ...role, scope: 'firm' })),
      ...COMPANY_ROLES.map((role) => ({
        ...role,
        scope: 'company',
      })),
    ];

    // Bulk insert
    await knex.transaction(async (trx) => {
      await trx(tableName).insert(seedData).onConflict('key').merge();
    });

    if (isDev) {
      console.log(`Seeded ${seedData.length} roles`);
    }
  } catch (error) {
    console.error(`Error seeding roles:`, error);
    throw error;
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key').unique().notNullable();
    table.string('name', 50).notNullable();
    table.specificType('scope', 'role_scope').notNullable();
    table.string('description', 512).nullable();

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedRoles(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
