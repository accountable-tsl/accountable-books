// Re-export all shared formatters so existing imports keep working
export {
  formatCurrency,
  formatDeltaPercent,
  formatVariance,
  formatVariancePercent,
  formatPercentOfRevenue,
  formatSignedCurrency,
  getVarianceTone,
  isFavorableDelta,
  formatCompactLineLabel,
  formatSourceLabel,
  formatDetailAmount,
  getAmountTone,
} from './shared/statement-format';

export type { LineVarianceIntent } from './shared/statement-format';

// ---------------------------------------------------------------------------
// Income-specific: variance intent by line id
// ---------------------------------------------------------------------------

export function getLineVarianceIntent(
  lineId: string,
): 'favorable_when_up' | 'favorable_when_down' {
  const expenseLikePrefixes = [
    'cost_of_sales',
    'cos_',
    'operating_expenses',
    'opex_',
    'income_tax_expense',
  ];
  return expenseLikePrefixes.some((prefix) => lineId.startsWith(prefix))
    ? 'favorable_when_down'
    : 'favorable_when_up';
}
