import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from './utils/db';
import { financialStatementIds } from './data/ids';
import { isDev } from '../config/env-loader';
import z from 'zod';

const financialStatement = z.object({
  id: z.string().uuid(),
  key: z.string(),
  us_gaap_label: z.string(),
  ifrs_label: z.string(),
  default_label: z.string(),
});
type NewFinancialStatementWithId = z.infer<typeof financialStatement>;

const tableName = 'financial_statements';

export const defaultFinancialStatements: NewFinancialStatementWithId[] = [
  {
    id: financialStatementIds.is,
    key: 'is',
    us_gaap_label: 'Income Statement',
    ifrs_label: 'Statement of Profit or Loss',
    default_label: 'Profit & Loss',
  },
  {
    id: financialStatementIds.bs,
    key: 'bs',
    us_gaap_label: 'Balance Sheet',
    ifrs_label: 'Statement of Financial Position',
    default_label: 'Balance Sheet',
  },
  {
    id: financialStatementIds.cf,
    key: 'cf',
    us_gaap_label: 'Statement of Cash Flows',
    ifrs_label: 'Statement of Cash Flows',
    default_label: 'Cash Flow Statement',
  },
];

const seedFs = async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx(tableName)
      .insert(defaultFinancialStatements)
      .onConflict('key')
      .ignore();

    if (isDev) {
      console.log(
        `Seeded ${defaultFinancialStatements.length} financial statements`,
      );
    }
  });
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.specificType('key', 'fs_key').unique().notNullable();

    table.string('us_gaap_label', 256).notNullable();
    table.string('ifrs_label', 256).notNullable();
    table.string('default_label', 256).notNullable();

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedFs(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
