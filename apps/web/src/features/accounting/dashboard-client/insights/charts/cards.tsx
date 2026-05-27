import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCurrencyAdaptive } from '../../pages/shared/statement-format';

import type {
  CategoryBreakdownDatum,
  GroupedBarChartDatum,
  InsightsChartStatus,
  SimpleBarChartDatum,
  TrendLineChartDatum,
  WaterfallChartDatum,
} from './types';

function truncateLabel(label: string, max = 18) {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function ChartCardShell({
  title,
  subtitle,
  status,
  emptyMessage,
  heightClassName,
  children,
}: {
  title: string;
  subtitle?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  heightClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex flex-col rounded-lg border p-3 lg:min-h-0 lg:flex-1">
      <div className="shrink-0">
        <p className="text-sm font-medium">{title}</p>
        {subtitle ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">{subtitle}</p>
        ) : null}
      </div>
      <div
        className={cn(
          'mt-2 h-[160px] lg:h-auto lg:min-h-0 lg:flex-1',
          heightClassName,
        )}
      >
        {status !== 'empty' ? (
          children
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-md border border-dashed text-center text-xs">
            {emptyMessage ?? 'Not enough data for this view yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

export function WaterfallChartCard({
  title,
  subtitle,
  currencyCode,
  status,
  emptyMessage,
  data,
}: {
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  data: WaterfallChartDatum[];
}) {
  const config: ChartConfig = {
    value: { label: 'Amount', color: 'hsl(var(--chart-2))' },
  };

  return (
    <ChartCardShell
      title={title}
      subtitle={subtitle}
      status={status}
      emptyMessage={emptyMessage}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            tickFormatter={(value) =>
              formatCurrencyAdaptive(Number(value), currencyCode)
            }
            width={64}
            tickMargin={6}
            fontSize={10}
          />
          <XAxis
            dataKey="label"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(label) => truncateLabel(String(label), 10)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                valueFormatter={(value) =>
                  formatCurrencyAdaptive(Number(value), currencyCode)
                }
              />
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={26}>
            {data.map((row, idx) => (
              <Cell
                key={`${row.label}-${idx}`}
                fill={
                  row.tone === 'total'
                    ? 'hsl(var(--primary))'
                    : row.value >= 0
                      ? 'hsl(var(--chart-2))'
                      : 'hsl(var(--chart-1))'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function GroupedBarChartCard({
  title,
  subtitle,
  currencyCode,
  status,
  emptyMessage,
  data,
}: {
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  data: GroupedBarChartDatum[];
}) {
  const config: ChartConfig = {
    current: { label: 'Current', color: 'hsl(var(--chart-2))' },
    compare: { label: 'Prior', color: 'hsl(var(--chart-1))' },
  };

  return (
    <ChartCardShell
      title={title}
      subtitle={subtitle}
      status={status}
      emptyMessage={emptyMessage}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart
          data={data}
          margin={{ top: 6, right: 8, left: 4, bottom: 0 }}
          barGap={4}
          barCategoryGap="14%"
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            tickFormatter={(value) =>
              formatCurrencyAdaptive(Number(value), currencyCode)
            }
            width={64}
            tickMargin={6}
            fontSize={10}
          />
          <XAxis
            dataKey="label"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                valueFormatter={(value) =>
                  formatCurrencyAdaptive(Number(value), currencyCode)
                }
              />
            }
          />
          <Bar
            dataKey="current"
            fill="var(--color-current)"
            radius={[4, 4, 0, 0]}
            barSize={18}
          />
          <Bar
            dataKey="compare"
            fill="var(--color-compare)"
            radius={[4, 4, 0, 0]}
            barSize={18}
          />
        </BarChart>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function TrendLinesChartCard({
  title,
  subtitle,
  currencyCode,
  status,
  emptyMessage,
  data,
}: {
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  data: TrendLineChartDatum[];
}) {
  const config: ChartConfig = {
    revenue: { label: 'Revenue', color: 'hsl(var(--chart-2))' },
    expenses: { label: 'Expenses', color: 'hsl(var(--chart-1))' },
  };

  return (
    <ChartCardShell
      title={title}
      subtitle={subtitle}
      status={status}
      emptyMessage={emptyMessage}
    >
      <ChartContainer config={config} className="h-full w-full">
        <LineChart
          data={data}
          margin={{ top: 6, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            tickFormatter={(value) =>
              formatCurrencyAdaptive(Number(value), currencyCode)
            }
            width={56}
            fontSize={10}
          />
          <XAxis
            dataKey="label"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                valueFormatter={(value) =>
                  formatCurrencyAdaptive(Number(value), currencyCode)
                }
              />
            }
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="var(--color-expenses)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function SimpleBarChartCard({
  title,
  subtitle,
  currencyCode,
  status,
  emptyMessage,
  data,
}: {
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  data: SimpleBarChartDatum[];
}) {
  const config: ChartConfig = {
    value: { label: 'Value', color: 'hsl(var(--primary))' },
  };

  return (
    <ChartCardShell
      title={title}
      subtitle={subtitle}
      status={status}
      emptyMessage={emptyMessage}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart
          data={data}
          margin={{ top: 6, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            tickFormatter={(value) =>
              formatCurrencyAdaptive(Number(value), currencyCode)
            }
            width={56}
            fontSize={10}
          />
          <XAxis
            dataKey="label"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                valueFormatter={(value) =>
                  formatCurrencyAdaptive(Number(value), currencyCode)
                }
              />
            }
          />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </ChartCardShell>
  );
}

export function CategoryBreakdownChartCard({
  title,
  subtitle,
  currencyCode,
  status,
  emptyMessage,
  data,
}: {
  title: string;
  subtitle?: string;
  currencyCode?: string;
  status: InsightsChartStatus;
  emptyMessage?: string;
  data: CategoryBreakdownDatum[];
}) {
  const config: ChartConfig = {
    value: { label: 'Amount', color: 'hsl(var(--chart-3))' },
  };
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const dataWithDisplay = data.map((item) => {
    const percent = total > 0 ? (item.value / total) * 100 : 0;
    return {
      ...item,
      percent,
    };
  });

  return (
    <ChartCardShell
      title={title}
      subtitle={subtitle}
      status={status}
      emptyMessage={emptyMessage}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart
          layout="vertical"
          data={dataWithDisplay}
          margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(value) =>
              formatCurrencyAdaptive(Number(value), currencyCode)
            }
            fontSize={10}
            tickCount={4}
            minTickGap={16}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="label"
            type="category"
            width={106}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(label) => truncateLabel(String(label), 15)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(value, _name, item) => {
                  const percent =
                    typeof item.payload?.percent === 'number'
                      ? item.payload.percent
                      : 0;
                  const formatted = formatCurrencyAdaptive(
                    Number(value),
                    currencyCode,
                  );
                  return (
                    <span className="font-medium">
                      {formatted ? `${formatted} (${percent.toFixed(1)}%)` : ''}
                    </span>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ChartContainer>
    </ChartCardShell>
  );
}
