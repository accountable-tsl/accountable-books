import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
  preventUpdateOrDelete,
} from './utils/db';
import { AccountElementWithRequiredReportCode } from '../src/core/types/db.types';
import { accountElementIds, financialStatementIds } from './data/ids';
import { NODE_ENV } from '../src/config/env';

const parentAccountElements: AccountElementWithRequiredReportCode[] = [
  {
    id: accountElementIds.assets,
    label: 'Assets',
    key: 'assets',
    default_side: 'debit',
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: 'All asset accounts',
    report_code: 'BS.ASS',
  },
  {
    id: accountElementIds.liabilities,
    label: 'Liabilities',
    key: 'liabilities',
    default_side: 'credit',
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: 'All liability accounts',
    report_code: 'BS.LIA',
  },
  {
    id: accountElementIds.equity,
    label: 'Equity',
    key: 'equity',
    default_side: 'credit',
    parent_id: null,
    financial_statement_id: financialStatementIds.bs,
    description: 'Ownership interests',
    report_code: 'BS.EQU',
  },
  {
    id: accountElementIds.income,
    label: 'Income',
    key: 'income',
    default_side: 'credit',
    parent_id: null,
    financial_statement_id: financialStatementIds.is,
    description: 'All income and revenue accounts',
    report_code: 'IS.INC',
  },
  {
    id: accountElementIds.expenses,
    label: 'Expenses',
    key: 'expenses',
    default_side: 'debit',
    parent_id: null,
    financial_statement_id: financialStatementIds.is,
    description: 'All expenses, cost of sales, etc',
    report_code: 'IS.EXP',
  },
];

const childrenAccountElements: AccountElementWithRequiredReportCode[] = [
  {
    id: accountElementIds.nonCurrentAsset,
    key: 'non_current_asset',
    label: 'Non-current Asset',
    default_side: 'debit',
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description: 'Long-term assets such as property, equipment, investments, and intangibles',
    report_code: 'BS.ASS.NCA',
  },
  {
    id: accountElementIds.contraAsset,
    key: 'contra_asset',
    label: 'Contra Asset',
    default_side: 'credit',
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description: 'Accounts that offset asset balances, such as accumulated depreciation',
    report_code: 'BS.ASS.CTR',
  },
  {
    id: accountElementIds.currentAsset,
    key: 'current_asset',
    label: 'Current Asset',
    default_side: 'debit',
    parent_id: accountElementIds.assets,
    financial_statement_id: financialStatementIds.bs,
    description: 'Short-term, liquid assets like cash, receivables, inventory',
    report_code: 'BS.ASS.CUR',
  },

  {
    id: accountElementIds.currentLiabilities,
    key: 'current_liabilities',
    label: 'Current Liabilities',
    default_side: 'credit',
    parent_id: accountElementIds.liabilities,
    financial_statement_id: financialStatementIds.bs,
    description: 'Short-term liabilities like accounts payable, short-term debt',
    report_code: 'BS.LIA.CUR',
  },
  {
    id: accountElementIds.nonCurrentLiabilities,
    key: 'non_current_liabilities',
    label: 'Non-current Liabilities',
    default_side: 'credit',
    parent_id: accountElementIds.liabilities,
    financial_statement_id: financialStatementIds.bs,
    description: 'Long-term liabilities like long-term debt, deferred taxes',
    report_code: 'BS.LIA.NCL',
  },
  {
    id: accountElementIds.contraLiabilities,
    key: 'contra_liabilities',
    label: 'Contra Liabilities',
    default_side: 'debit',
    parent_id: accountElementIds.liabilities,
    financial_statement_id: financialStatementIds.bs,
    description: 'Accounts that reduce the balance of a standard liability account',
    report_code: 'BS.LIA.CTR',
  },
  {
    id: accountElementIds.capital,
    key: 'contributed_capital',
    label: 'Contributed Capital',
    default_side: 'credit',
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description: 'Share capital, premium, APIC, other direct contributions from owners',
    report_code: 'BS.EQU.CAP',
  },
  {
    id: accountElementIds.reserves,
    key: 'reserves',
    label: 'Reserves',
    default_side: 'credit',
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description: 'Retained Earnings and Other Reserves',
    report_code: 'BS.EQU.RES',
  },
  {
    id: accountElementIds.otherEquity,
    key: 'other_equity',
    label: 'Other Equity',
    default_side: 'credit',
    parent_id: accountElementIds.equity,
    financial_statement_id: financialStatementIds.bs,
    description: 'Accumulated Other Comprehensive Income and other components of equity',
    report_code: 'BS.EQU.OTH',
  },
  {
    id: accountElementIds.revenue,
    key: 'revenue',
    label: 'Revenue',
    default_side: 'credit',
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description: 'Income from primary business activities, including sales and services',
    report_code: 'IS.INC.REV',
  },
  {
    id: accountElementIds.otherIncome,
    key: 'other_income',
    label: 'Other Income',
    default_side: 'credit',
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description: 'Income from sources outside primary business activities',
    report_code: 'IS.INC.OTH',
  },
  {
    id: accountElementIds.contraRevenue,
    key: 'contra_revenue',
    label: 'Contra Revenue',
    default_side: 'debit',
    parent_id: accountElementIds.income,
    financial_statement_id: financialStatementIds.is,
    description: 'Reductions to gross revenue like discounts, returns, and allowances',
    report_code: 'IS.INC.CTR',
  },
  {
    id: accountElementIds.costOfSales,
    key: 'cost_of_sales',
    label: 'Cost of Sales',
    default_side: 'debit',
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: 'Direct costs tied to production or services',
    report_code: 'IS.EXP.COS',
  },
  {
    id: accountElementIds.opex,
    key: 'operating_expenses',
    label: 'Operating Expenses',
    default_side: 'debit',
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: 'Ongoing expenses like SG&A, payroll, rent, utilities etc.',
    report_code: 'IS.EXP.OPX',
  },
  {
    id: accountElementIds.nonOpex,
    key: 'non_operating_expenses',
    label: 'Non-operating Expenses',
    default_side: 'debit',
    parent_id: accountElementIds.expenses,
    financial_statement_id: financialStatementIds.is,
    description: 'Non-recurring or unusual expenses',
    report_code: 'IS.EXP.NOP',
  },
];

const defaultAccountElements: AccountElementWithRequiredReportCode[] = [
  ...parentAccountElements,
  ...childrenAccountElements,
];

const seedAccountElements = async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx(tableName).insert(defaultAccountElements).onConflict().ignore();

    if (NODE_ENV === 'local' || NODE_ENV === 'docker') {
      console.log(`Seeded ${parentAccountElements.length} parent elements`);
      console.log(`Seeded ${childrenAccountElements.length} child elements`);
    }
  });
};

const tableName = 'account_elements';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('label', 256).notNullable();
    table.specificType('default_side', 'debit_credit').notNullable();
    table.string('description', 512).nullable();
    table.string('report_code', 64).nullable();

    table.uuid('parent_id').nullable().references('id').inTable(tableName);
    table
      .uuid('financial_statement_id')
      .notNullable()
      .references('id')
      .inTable('financial_statements')
      .onDelete('RESTRICT');

    addStandardColumns(table);

    table.index(['parent_id'], 'account_category_parent_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await preventUpdateOrDelete(knex, tableName);
  await seedAccountElements(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
