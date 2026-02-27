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
// Balance-sheet-specific: variance intent by line id
// ---------------------------------------------------------------------------

/** Favorable: assets/equity up, liabilities down. Uses element keys and account type prefixes (cl_, ncl_). */
export function getLineVarianceIntent(
  lineId: string,
): 'favorable_when_up' | 'favorable_when_down' {
  if (
    lineId === 'current_liabilities' ||
    lineId === 'non_current_liabilities' ||
    lineId === 'total_liabilities'
  )
    return 'favorable_when_down';
  if (lineId.startsWith('cl_') || lineId.startsWith('ncl_'))
    return 'favorable_when_down';
  return 'favorable_when_up';
}
