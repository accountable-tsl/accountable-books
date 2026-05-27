export type InsightsChartStatus = 'ready' | 'empty' | 'partial';

export type FinancialInsightsContext = 'single' | 'comparison' | 'trend';

export type WaterfallChartDatum = {
  label: string;
  value: number;
  tone?: 'positive' | 'negative' | 'total';
};

export type GroupedBarChartDatum = {
  label: string;
  current: number;
  compare: number;
};

export type TrendLineChartDatum = {
  label: string;
  revenue: number;
  expenses: number;
};

export type SimpleBarChartDatum = {
  label: string;
  value: number;
};

export type CategoryBreakdownDatum = {
  label: string;
  value: number;
};

type BaseCard = {
  id: string;
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
};

export type InsightsChartCard =
  | (BaseCard & {
      kind: 'waterfall';
      data: WaterfallChartDatum[];
    })
  | (BaseCard & {
      kind: 'grouped_bar';
      data: GroupedBarChartDatum[];
    })
  | (BaseCard & {
      kind: 'trend_lines';
      data: TrendLineChartDatum[];
    })
  | (BaseCard & {
      kind: 'simple_bar';
      data: SimpleBarChartDatum[];
    })
  | (BaseCard & {
      kind: 'category_breakdown';
      data: CategoryBreakdownDatum[];
    });

export type InsightsChartPayload = {
  context: FinancialInsightsContext;
  cards: [InsightsChartCard, InsightsChartCard];
};
