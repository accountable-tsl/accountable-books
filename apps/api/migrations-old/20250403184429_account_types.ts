// import { accountTypes as defaultAccountTypes } from './data/accountTypes.js';
import type { Knex } from 'knex';
import { defaultAccountTypes } from '@accountable-books/contracts/data';

import { isDev } from '../config/env-loader.js';
import {
  addStandardColumns,
  addUserAuditColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from '../migrations/utils/db.js';

const tableName = 'account_types';

const seedAccountTypes = async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx(tableName).insert(defaultAccountTypes).onConflict().ignore();

    if (isDev) {
      console.log(`Seeded ${defaultAccountTypes.length} account types`);
    }
  });
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('label', 256).notNullable();
    table.string('description', 512).nullable();
    table.string('report_code', 64).nullable();

    table
      .uuid('account_element_id')
      .notNullable()
      .references('id')
      .inTable('account_elements')
      .onDelete('RESTRICT');

    table.boolean('default_monetary').notNullable().defaultTo(false);
    table
      .enu('label_role', ['semantic', 'mechanical', 'control', 'fallback'], {
        useNative: true,
        enumName: 'account_type_label_role',
      })
      .notNullable();

    table.boolean('trainable').notNullable();
    table.boolean('is_contra').notNullable().defaultTo(false);
    table.boolean('is_postable_control').notNullable().defaultTo(false);
    table.specificType('accrual_targets', 'TEXT[]').nullable();

    addUserAuditColumns(table);
    addStandardColumns(knex, table);

    table.index(['account_element_id'], 'account_type_element_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedAccountTypes(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS account_type_label_role;`);
}
