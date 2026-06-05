export type FinancialStatementKey = 'is' | 'bs' | 'cf';

export const financialStatementIds = {
  is: 'dfcfc3c0-8886-49a6-bc37-a0c32decc8be',
  bs: 'ba4104cc-039d-4959-b87d-3e67abf483c9',
  cf: '82be58ac-345d-4cf0-aa81-0edc19eb1c33',
} as const;

export type FinancialStatementCatalogEntry = {
  id: string;
  key: FinancialStatementKey;
  us_gaap_label: string;
  ifrs_label: string;
  default_label: string;
};

export const FINANCIAL_STATEMENTS_CATALOG: readonly FinancialStatementCatalogEntry[] =
  [
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
