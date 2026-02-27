import { formatCurrency, formatDeltaPercent } from '../shared/statement-format';

import type { IncomeStatementNomenclature } from '../../statement-nomenclature';
import type { KpiItem } from '../shared/kpi-strip';
import type { StatementLine } from '../shared/statement-types';

/**
 * Compute KPI strip items from income statement lines.
 * Pure function — no hooks, no side-effects.
 */
export function computeIncomeKpis(
  statementLines: StatementLine[],
  currencyCode: string,
  labels: IncomeStatementNomenclature,
): { kpis: KpiItem[]; opexRatio: number } {
  const lineById = new Map<string, StatementLine>();
  for (const line of statementLines) {
    lineById.set(line.id, line);
    line.children?.forEach((child) => lineById.set(child.id, child));
  }

  const netIncome = lineById.get('net_income');
  const revenue = lineById.get('revenue');
  const costOfSales = lineById.get('cost_of_sales');
  const operatingExpenses = lineById.get('operating_expenses');

  if (!netIncome || !revenue || !costOfSales || !operatingExpenses) {
    return { kpis: [], opexRatio: 0 };
  }

  const grossMargin =
    ((revenue.amount - costOfSales.amount) / revenue.amount) * 100;
  const compareGrossMargin =
    ((revenue.compareAmount - costOfSales.compareAmount) /
      revenue.compareAmount) *
    100;

  const opexRatio = (operatingExpenses.amount / revenue.amount) * 100;
  const compareOpexRatio =
    (operatingExpenses.compareAmount / revenue.compareAmount) * 100;

  const kpis: KpiItem[] = [
    {
      title: labels.netIncome,
      description: 'Profit after all costs and tax.',
      value: formatCurrency(netIncome.amount, currencyCode),
      direction: netIncome.amount >= netIncome.compareAmount ? 'up' : 'down',
      percent: formatDeltaPercent(netIncome.amount, netIncome.compareAmount),
    },
    {
      title: 'Gross margin',
      description: 'Profit from core sales before operating costs.',
      value: `${grossMargin.toFixed(1)}%`,
      direction: grossMargin >= compareGrossMargin ? 'up' : 'down',
      percent: formatDeltaPercent(grossMargin, compareGrossMargin),
    },
    {
      title: 'OpEx ratio',
      description: 'Operating costs as % of revenue.',
      value: `${opexRatio.toFixed(1)}%`,
      direction: opexRatio <= compareOpexRatio ? 'up' : 'down',
      percent: formatDeltaPercent(opexRatio, compareOpexRatio),
    },
  ];

  return { kpis, opexRatio };
}
