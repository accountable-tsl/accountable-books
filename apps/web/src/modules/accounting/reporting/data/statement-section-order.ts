/**
 * Statement section order by reporting framework.
 * Single source of truth for display order of sections on Balance Sheet and Income Statement.
 * Section keys match element keys and derived line ids used in statement data builders.
 */

export type ReportingFrameworkForOrder = 'us_gaap' | 'ifrs';

// ---------------------------------------------------------------------------
// Balance sheet — section keys (element keys + derived line ids)
// ---------------------------------------------------------------------------

/** US GAAP: order of liquidity — current assets first, then non-current; then liabilities; then equity. */
const BALANCE_SHEET_SECTION_ORDER_US_GAAP: readonly string[] = [
  'current_asset',
  'non_current_asset',
  'total_assets',
  'current_liabilities',
  'non_current_liabilities',
  'total_liabilities',
  'contributed_capital',
  'reserves',
  'other_equity',
  'total_equity',
  'total_liabilities_and_equity',
] as const;

/** IFRS: reverse order of liquidity — non-current assets first, then current; then equity; then liabilities. */
const BALANCE_SHEET_SECTION_ORDER_IFRS: readonly string[] = [
  'non_current_asset',
  'current_asset',
  'total_assets',
  'contributed_capital',
  'reserves',
  'other_equity',
  'total_equity',
  'non_current_liabilities',
  'current_liabilities',
  'total_liabilities',
  'total_liabilities_and_equity',
] as const;

export function getBalanceSheetSectionOrder(
  framework: ReportingFrameworkForOrder | string | null | undefined,
): readonly string[] {
  const normalized =
    typeof framework === 'string' && framework.toLowerCase().includes('ifrs')
      ? 'ifrs'
      : 'us_gaap';
  return normalized === 'ifrs'
    ? BALANCE_SHEET_SECTION_ORDER_IFRS
    : BALANCE_SHEET_SECTION_ORDER_US_GAAP;
}

// ---------------------------------------------------------------------------
// Income statement — section keys (element/section keys + derived line ids)
// ---------------------------------------------------------------------------

const INCOME_STATEMENT_SECTION_ORDER: readonly string[] = [
  'revenue',
  'cost_of_sales',
  'gross_profit',
  'operating_expenses',
  'operating_result',
  'other_income_expense',
  'income_before_tax',
  'income_tax_expense',
  'net_income',
] as const;

export function getIncomeStatementSectionOrder(
  _framework: ReportingFrameworkForOrder | string | null | undefined,
): readonly string[] {
  return INCOME_STATEMENT_SECTION_ORDER;
}
