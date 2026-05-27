import { formatCurrency, formatDeltaPercent } from '../shared/statement-format';

import type { BalanceSheetNomenclature } from '../../statement-nomenclature';
import type { KpiItem } from '../shared/kpi-strip';
import type { StatementLine } from '../shared/statement-types';

/**
 * Compute KPI strip items from balance sheet lines.
 * Pure function — no hooks, no side-effects.
 */
export function computeBalanceSheetKpis(
  statementLines: StatementLine[],
  currencyCode: string,
  labels: BalanceSheetNomenclature,
): { kpis: KpiItem[] } {
  const lineById = new Map<string, StatementLine>();
  for (const line of statementLines) {
    lineById.set(line.id, line);
    line.children?.forEach((child) => lineById.set(child.id, child));
  }

  const totalAssets = lineById.get('total_assets');
  const totalLiabilities = lineById.get('total_liabilities');
  const totalEquity = lineById.get('total_equity');

  if (!totalAssets || !totalLiabilities || !totalEquity) {
    return { kpis: [] };
  }

  const kpis: KpiItem[] = [
    {
      title: labels.totalAssets,
      description: 'Total assets as of the period end.',
      value: formatCurrency(totalAssets.amount, currencyCode),
      direction:
        totalAssets.amount >= totalAssets.compareAmount ? 'up' : 'down',
      percent: formatDeltaPercent(
        totalAssets.amount,
        totalAssets.compareAmount,
      ),
    },
    {
      title: labels.totalLiabilities,
      description: 'Total liabilities as of the period end.',
      value: formatCurrency(totalLiabilities.amount, currencyCode),
      direction:
        totalLiabilities.amount >= totalLiabilities.compareAmount
          ? 'up'
          : 'down',
      percent: formatDeltaPercent(
        totalLiabilities.amount,
        totalLiabilities.compareAmount,
      ),
    },
    {
      title: labels.totalEquity,
      description: 'Total equity as of the period end.',
      value: formatCurrency(totalEquity.amount, currencyCode),
      direction:
        totalEquity.amount >= totalEquity.compareAmount ? 'up' : 'down',
      percent: formatDeltaPercent(
        totalEquity.amount,
        totalEquity.compareAmount,
      ),
    },
  ];

  return { kpis };
}
