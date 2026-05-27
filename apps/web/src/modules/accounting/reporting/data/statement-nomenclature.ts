export type NormalizedReportingFramework = 'ifrs' | 'us_gaap' | 'generic';

export interface IncomeStatementNomenclature {
  statementTitle: string;
  revenue: string;
  costOfSales: string;
  grossProfit: string;
  operatingExpenses: string;
  operatingResult: string;
  otherIncomeExpense: string;
  incomeBeforeTax: string;
  incomeTaxExpense: string;
  netIncome: string;
}

const GAAP_INCOME_LABELS: IncomeStatementNomenclature = {
  statementTitle: 'Income Statement',
  revenue: 'Revenue',
  costOfSales: 'Cost of Goods Sold',
  grossProfit: 'Gross Profit',
  operatingExpenses: 'Operating Expenses',
  operatingResult: 'Operating Income',
  otherIncomeExpense: 'Other Income / (Expense)',
  incomeBeforeTax: 'Income Before Tax',
  incomeTaxExpense: 'Income Tax Expense',
  netIncome: 'Net Income',
};

const IFRS_INCOME_LABELS: IncomeStatementNomenclature = {
  statementTitle: 'Statement of Profit or Loss',
  revenue: 'Revenue',
  costOfSales: 'Cost of Sales',
  grossProfit: 'Gross Profit',
  operatingExpenses: 'Operating Expenses',
  operatingResult: 'Operating Profit',
  otherIncomeExpense: 'Other Income / (Expense)',
  incomeBeforeTax: 'Profit Before Tax',
  incomeTaxExpense: 'Income Tax Expense',
  netIncome: 'Profit for the Period',
};

export function normalizeReportingFramework(
  reportingFramework?: string | null,
): NormalizedReportingFramework {
  const value = reportingFramework?.trim().toLowerCase() ?? '';
  if (!value) return 'generic';

  if (value.includes('ifrs') || value.includes('ias')) {
    return 'ifrs';
  }

  if (
    value.includes('gaap') ||
    value.includes('asc') ||
    value.includes('us gaap') ||
    value.includes('us-gaap')
  ) {
    return 'us_gaap';
  }

  return 'generic';
}

export function getIncomeStatementNomenclature(
  reportingFramework?: string | null,
): IncomeStatementNomenclature {
  const normalized = normalizeReportingFramework(reportingFramework);
  if (normalized === 'ifrs') return IFRS_INCOME_LABELS;
  if (normalized === 'us_gaap') return GAAP_INCOME_LABELS;
  return GAAP_INCOME_LABELS;
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

export interface BalanceSheetNomenclature {
  statementTitle: string;
  currentAssets: string;
  nonCurrentAssets: string;
  totalAssets: string;
  currentLiabilities: string;
  nonCurrentLiabilities: string;
  totalLiabilities: string;
  equity: string;
  retainedEarnings: string;
  totalEquity: string;
  totalLiabilitiesAndEquity: string;
}

const GAAP_BALANCE_SHEET_LABELS: BalanceSheetNomenclature = {
  statementTitle: 'Balance Sheet',
  currentAssets: 'Current Assets',
  nonCurrentAssets: 'Non-Current Assets',
  totalAssets: 'Total Assets',
  currentLiabilities: 'Current Liabilities',
  nonCurrentLiabilities: 'Non-Current Liabilities',
  totalLiabilities: 'Total Liabilities',
  equity: "Stockholders' Equity",
  retainedEarnings: 'Retained Earnings',
  totalEquity: "Total Stockholders' Equity",
  totalLiabilitiesAndEquity: "Total Liabilities & Stockholders' Equity",
};

const IFRS_BALANCE_SHEET_LABELS: BalanceSheetNomenclature = {
  statementTitle: 'Statement of Financial Position',
  currentAssets: 'Current Assets',
  nonCurrentAssets: 'Non-Current Assets',
  totalAssets: 'Total Assets',
  currentLiabilities: 'Current Liabilities',
  nonCurrentLiabilities: 'Non-Current Liabilities',
  totalLiabilities: 'Total Liabilities',
  equity: 'Equity',
  retainedEarnings: 'Retained Earnings',
  totalEquity: 'Total Equity',
  totalLiabilitiesAndEquity: 'Total Liabilities & Equity',
};

export function getBalanceSheetNomenclature(
  reportingFramework?: string | null,
): BalanceSheetNomenclature {
  const normalized = normalizeReportingFramework(reportingFramework);
  if (normalized === 'ifrs') return IFRS_BALANCE_SHEET_LABELS;
  if (normalized === 'us_gaap') return GAAP_BALANCE_SHEET_LABELS;
  return GAAP_BALANCE_SHEET_LABELS;
}
