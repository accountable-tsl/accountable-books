import type { DebitCredit } from '../../../core/types/core.js';
import type { FinancialStatementKey } from './financial-statements.js';

export const accountElementIds = {
  assets: '2ada8895-5645-43e4-bd86-fb1e9d875833',
  liabilities: 'fa88add1-da66-46ee-a133-96768796d2fc',
  equity: 'bfe5d934-0551-4ecf-9e3b-e3f51035d98a',
  income: '769e0a41-7f80-4ecf-be23-e20c30abe1f2',
  expenses: '3d73a9ff-3c17-40e3-80e1-129c80bfb2dc',

  nonCurrentAsset: '80049a94-3793-4d9a-9781-eaf063787e66',
  currentAsset: 'e96b89a1-21b5-4bf8-8457-7f172483bbd7',
  contraAsset: 'e1165fbf-2326-4d67-a92e-de95ac2a9cde',

  nonCurrentLiabilities: 'e0b60496-12fa-43f7-8b0d-92d614ce08b7',
  currentLiabilities: '987c9f91-0d24-49c6-9fb9-b5f57c0090bf',
  contraLiabilities: '7c7c9f91-0d24-49c6-9fb9-b5f57c0090bf',

  capital: '519a3026-906a-4490-8ce2-14ba2e035575',
  reserves: 'c66f707c-8394-4574-a4f8-91e1765466b9',
  otherEquity: '6ab44386-dd1b-4e8e-b2cc-f497dc93b9ac',

  revenue: '02fa1b21-6df5-4bbc-b0b0-a8223ea235aa',
  otherIncome: '5f10e7dc-69fb-47ba-bca7-0a7386a8ccfb',
  contraRevenue: '87a60baf-c459-4c97-848a-27c59c11f3a3',

  costOfSales: 'eb42e5e2-47e4-4d90-9eff-f00bd2b7ce27',
  opex: '426e474a-666a-4eb8-a862-b96402c46107',
  nonOpex: 'e01074ea-229e-44dd-93ae-ca2e5b72930d',
} as const;

export type AccountElementCatalogEntry = {
  id: string;
  key: string;
  label: string;
  default_side: DebitCredit;
  description: string | null;
  report_code: string;
  parent_key: string | null;
  financial_statement_key: FinancialStatementKey;
};

export const ACCOUNT_ELEMENTS_CATALOG = [
  {
    id: accountElementIds.assets,
    key: 'assets',
    label: 'Assets',
    default_side: 'debit',
    parent_key: null,
    financial_statement_key: 'bs',
    description: 'All asset accounts.',
    report_code: 'BS.ASS',
  },
  {
    id: accountElementIds.liabilities,
    key: 'liabilities',
    label: 'Liabilities',
    default_side: 'credit',
    parent_key: null,
    financial_statement_key: 'bs',
    description: 'All liability accounts.',
    report_code: 'BS.LIA',
  },
  {
    id: accountElementIds.equity,
    key: 'equity',
    label: 'Equity',
    default_side: 'credit',
    parent_key: null,
    financial_statement_key: 'bs',
    description: 'Ownership interests and residual claims on net assets.',
    report_code: 'BS.EQU',
  },
  {
    id: accountElementIds.income,
    key: 'income',
    label: 'Income',
    default_side: 'credit',
    parent_key: null,
    financial_statement_key: 'is',
    description: 'Income and revenue accounts.',
    report_code: 'IS.INC',
  },
  {
    id: accountElementIds.expenses,
    key: 'expenses',
    label: 'Expenses',
    default_side: 'debit',
    parent_key: null,
    financial_statement_key: 'is',
    description: 'Expenses, cost of sales, and other outflows.',
    report_code: 'IS.EXP',
  },
  {
    id: accountElementIds.nonCurrentAsset,
    key: 'non_current_asset',
    label: 'Non-current Asset',
    default_side: 'debit',
    parent_key: 'assets',
    financial_statement_key: 'bs',
    description:
      'Long-term assets such as property, equipment, investments, and intangibles.',
    report_code: 'BS.ASS.NCA',
  },
  {
    id: accountElementIds.contraAsset,
    key: 'contra_asset',
    label: 'Contra Asset',
    default_side: 'credit',
    parent_key: 'assets',
    financial_statement_key: 'bs',
    description:
      'Accounts that offset asset balances, such as accumulated depreciation.',
    report_code: 'BS.ASS.CTR',
  },
  {
    id: accountElementIds.currentAsset,
    key: 'current_asset',
    label: 'Current Asset',
    default_side: 'debit',
    parent_key: 'assets',
    financial_statement_key: 'bs',
    description:
      'Short-term, liquid assets such as cash, receivables, and inventory.',
    report_code: 'BS.ASS.CUR',
  },
  {
    id: accountElementIds.currentLiabilities,
    key: 'current_liabilities',
    label: 'Current Liabilities',
    default_side: 'credit',
    parent_key: 'liabilities',
    financial_statement_key: 'bs',
    description: 'Short-term liabilities such as payables and short-term debt.',
    report_code: 'BS.LIA.CUR',
  },
  {
    id: accountElementIds.nonCurrentLiabilities,
    key: 'non_current_liabilities',
    label: 'Non-current Liabilities',
    default_side: 'credit',
    parent_key: 'liabilities',
    financial_statement_key: 'bs',
    description:
      'Long-term liabilities such as long-term debt and deferred tax.',
    report_code: 'BS.LIA.NCL',
  },
  {
    id: accountElementIds.contraLiabilities,
    key: 'contra_liabilities',
    label: 'Contra Liabilities',
    default_side: 'debit',
    parent_key: 'liabilities',
    financial_statement_key: 'bs',
    description:
      'Accounts that reduce the balance of standard liability accounts.',
    report_code: 'BS.LIA.CTR',
  },
  {
    id: accountElementIds.capital,
    key: 'contributed_capital',
    label: 'Contributed Capital',
    default_side: 'credit',
    parent_key: 'equity',
    financial_statement_key: 'bs',
    description:
      'Share capital, premium, APIC, and other direct owner contributions.',
    report_code: 'BS.EQU.CAP',
  },
  {
    id: accountElementIds.reserves,
    key: 'reserves',
    label: 'Reserves',
    default_side: 'credit',
    parent_key: 'equity',
    financial_statement_key: 'bs',
    description: 'Retained earnings and other reserves.',
    report_code: 'BS.EQU.RES',
  },
  {
    id: accountElementIds.otherEquity,
    key: 'other_equity',
    label: 'Other Equity',
    default_side: 'credit',
    parent_key: 'equity',
    financial_statement_key: 'bs',
    description:
      'Accumulated other comprehensive income and other equity components.',
    report_code: 'BS.EQU.OTH',
  },
  {
    id: accountElementIds.revenue,
    key: 'revenue',
    label: 'Revenue',
    default_side: 'credit',
    parent_key: 'income',
    financial_statement_key: 'is',
    description:
      'Income from primary business activities, including sales and services.',
    report_code: 'IS.INC.REV',
  },
  {
    id: accountElementIds.otherIncome,
    key: 'other_income',
    label: 'Other Income',
    default_side: 'credit',
    parent_key: 'income',
    financial_statement_key: 'is',
    description: 'Income from sources outside primary business activities.',
    report_code: 'IS.INC.OTH',
  },
  {
    id: accountElementIds.contraRevenue,
    key: 'contra_revenue',
    label: 'Contra Revenue',
    default_side: 'debit',
    parent_key: 'income',
    financial_statement_key: 'is',
    description:
      'Reductions to gross revenue, such as discounts, returns, and allowances.',
    report_code: 'IS.INC.CTR',
  },
  {
    id: accountElementIds.costOfSales,
    key: 'cost_of_sales',
    label: 'Cost of Sales',
    default_side: 'debit',
    parent_key: 'expenses',
    financial_statement_key: 'is',
    description: 'Direct costs tied to production or service delivery.',
    report_code: 'IS.EXP.COS',
  },
  {
    id: accountElementIds.opex,
    key: 'operating_expenses',
    label: 'Operating Expenses',
    default_side: 'debit',
    parent_key: 'expenses',
    financial_statement_key: 'is',
    description:
      'Ongoing operating expenses such as SG&A, payroll, rent, and utilities.',
    report_code: 'IS.EXP.OPX',
  },
  {
    id: accountElementIds.nonOpex,
    key: 'non_operating_expenses',
    label: 'Non-operating Expenses',
    default_side: 'debit',
    parent_key: 'expenses',
    financial_statement_key: 'is',
    description: 'Non-operating, non-recurring, or unusual expenses.',
    report_code: 'IS.EXP.NOP',
  },
] as const satisfies readonly AccountElementCatalogEntry[];

export type AccountElementKey =
  (typeof ACCOUNT_ELEMENTS_CATALOG)[number]['key'];
