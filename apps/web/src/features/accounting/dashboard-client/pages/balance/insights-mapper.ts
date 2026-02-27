import { MONTHS } from '../../constants';

import type {
  CategoryBreakdownDatum,
  FinancialInsightsContext,
  GroupedBarChartDatum,
  InsightsChartPayload,
  SimpleBarChartDatum,
} from '../../insights/charts';
import type { ReportPeriod } from '../../report-period';
import type { StatementLine } from '../shared/statement-types';

type BuildBalanceInsightsChartsInput = {
  period: ReportPeriod;
  periodLabel: string;
  currencyCode?: string;
  statementLines: StatementLine[];
};

function indexStatementLines(statementLines: StatementLine[]) {
  const byId = new Map<string, StatementLine>();
  for (const line of statementLines) {
    byId.set(line.id, line);
    line.children?.forEach((child) => byId.set(child.id, child));
  }
  return byId;
}

function getTrendBucketLabels(period: ReportPeriod) {
  if (period.mode === 'trailing12m') {
    const labels: string[] = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(
        period.anchor.year,
        period.anchor.monthIdx - offset,
        1,
      );
      const month = MONTHS[date.getMonth()].short;
      const year = String(date.getFullYear()).slice(-2);
      labels.push(`${month} ${year}`);
    }
    return labels;
  }

  if (period.mode === 'ytd') {
    return MONTHS.slice(0, period.anchor.monthIdx + 1).map(
      (month) => month.short,
    );
  }

  return [];
}

export function resolveBalanceInsightsContext(
  period: ReportPeriod,
  hasTrendBuckets: boolean,
): FinancialInsightsContext {
  if (period.compare !== 'none') return 'comparison';
  if (
    (period.mode === 'trailing12m' || period.mode === 'ytd') &&
    hasTrendBuckets
  ) {
    return 'trend';
  }
  return 'single';
}

export function buildBalanceInsightsCharts({
  period,
  periodLabel,
  currencyCode,
  statementLines,
}: BuildBalanceInsightsChartsInput): InsightsChartPayload {
  const lineById = indexStatementLines(statementLines);

  const currentAssets = lineById.get('current_asset');
  const nonCurrentAssets = lineById.get('non_current_asset');
  const currentLiabilities = lineById.get('current_liabilities');
  const nonCurrentLiabilities = lineById.get('non_current_liabilities');
  const totalAssets = lineById.get('total_assets');
  const totalLiabilities = lineById.get('total_liabilities');
  const totalEquity = lineById.get('total_equity');

  const workingCapitalCurrent =
    (currentAssets?.amount ?? 0) - (currentLiabilities?.amount ?? 0);
  const workingCapitalCompare =
    (currentAssets?.compareAmount ?? 0) -
    (currentLiabilities?.compareAmount ?? 0);

  // Approximate net debt: total liabilities minus cash (ca_bank) when available.
  const bankChild =
    currentAssets?.children?.find((c) => c.id === 'ca_bank') ?? null;
  const cashCurrent = bankChild?.amount ?? 0;
  const cashCompare = bankChild?.compareAmount ?? 0;
  const netDebtCurrent = (totalLiabilities?.amount ?? 0) - cashCurrent;
  const netDebtCompare = (totalLiabilities?.compareAmount ?? 0) - cashCompare;

  const trendLabels = getTrendBucketLabels(period);
  const context = resolveBalanceInsightsContext(period, trendLabels.length > 1);

  if (context === 'single') {
    const assetsByCategory: CategoryBreakdownDatum[] = [];
    if (currentAssets) {
      assetsByCategory.push({
        label: 'Current assets',
        value: currentAssets.amount,
      });
    }
    if (nonCurrentAssets) {
      assetsByCategory.push({
        label: 'Non-current assets',
        value: nonCurrentAssets.amount,
      });
    }

    const liaEqByCategory: CategoryBreakdownDatum[] = [];
    if (currentLiabilities) {
      liaEqByCategory.push({
        label: 'Current liabilities',
        value: currentLiabilities.amount,
      });
    }
    if (nonCurrentLiabilities) {
      liaEqByCategory.push({
        label: 'Non-current liabilities',
        value: nonCurrentLiabilities.amount,
      });
    }
    if (totalEquity) {
      liaEqByCategory.push({
        label: 'Equity',
        value: totalEquity.amount,
      });
    }

    const cards = [
      {
        id: 'bs_assets_composition',
        kind: 'category_breakdown',
        title: 'Assets by category',
        subtitle: periodLabel,
        currencyCode,
        status:
          assetsByCategory.length > 0 ? ('ready' as const) : ('empty' as const),
        emptyMessage: 'No asset data for this period.',
        data: assetsByCategory,
      },
      {
        id: 'bs_capital_structure',
        kind: 'category_breakdown',
        title: 'Liabilities & equity mix',
        subtitle: periodLabel,
        currencyCode,
        status:
          liaEqByCategory.length > 0 ? ('ready' as const) : ('empty' as const),
        emptyMessage: 'No liabilities or equity data for this period.',
        data: liaEqByCategory,
      },
    ] as const;

    return {
      context,
      cards,
    };
  }

  if (context === 'comparison') {
    const snapshotBars: GroupedBarChartDatum[] = [];
    if (totalAssets) {
      snapshotBars.push({
        label: 'Assets',
        current: totalAssets.amount,
        compare: totalAssets.compareAmount,
      });
    }
    if (totalLiabilities) {
      snapshotBars.push({
        label: 'Liabilities',
        current: totalLiabilities.amount,
        compare: totalLiabilities.compareAmount,
      });
    }
    if (totalEquity) {
      snapshotBars.push({
        label: 'Equity',
        current: totalEquity.amount,
        compare: totalEquity.compareAmount,
      });
    }

    const workingCapitalDelta = workingCapitalCurrent - workingCapitalCompare;
    const netDebtDelta = netDebtCurrent - netDebtCompare;

    const wcDebtBars: SimpleBarChartDatum[] = [
      {
        label: 'Working capital change',
        value: workingCapitalDelta,
      },
      {
        label: 'Net debt change',
        value: netDebtDelta,
      },
    ];

    const cards = [
      {
        id: 'bs_snapshot_vs_prior',
        kind: 'grouped_bar',
        title: 'Balance sheet vs prior',
        subtitle: periodLabel,
        currencyCode,
        status:
          snapshotBars.length > 0 ? ('ready' as const) : ('empty' as const),
        emptyMessage: 'Not enough data to compare this period.',
        data: snapshotBars,
      },
      {
        id: 'bs_wc_debt_change',
        kind: 'simple_bar',
        title: 'Working capital & debt change',
        subtitle: periodLabel,
        currencyCode,
        status: 'ready' as const,
        emptyMessage: 'No movement in working capital or net debt.',
        data: wcDebtBars,
      },
    ] as const;

    return {
      context,
      cards,
    };
  }

  // context === 'trend'
  // For now, produce placeholder trend lines derived from the latest snapshot.
  const trendAssets: SimpleBarChartDatum[] = trendLabels.map((label) => ({
    label,
    value: totalAssets?.amount ?? 0,
  }));
  const trendWorkingCapital: SimpleBarChartDatum[] = trendLabels.map(
    (label) => ({
      label,
      value: workingCapitalCurrent,
    }),
  );

  const cards = [
    {
      id: 'bs_trend_assets',
      kind: 'simple_bar',
      title: 'Total assets trend (demo)',
      subtitle: periodLabel,
      currencyCode,
      status: trendAssets.length > 0 ? ('ready' as const) : ('empty' as const),
      emptyMessage: 'No trend data available.',
      data: trendAssets,
    },
    {
      id: 'bs_trend_working_capital',
      kind: 'simple_bar',
      title: 'Working capital trend (demo)',
      subtitle: periodLabel,
      currencyCode,
      status:
        trendWorkingCapital.length > 0
          ? ('ready' as const)
          : ('empty' as const),
      emptyMessage: 'No trend data available.',
      data: trendWorkingCapital,
    },
  ] as const;

  return {
    context,
    cards,
  };
}
