import {
  CategoryBreakdownChartCard,
  GroupedBarChartCard,
  SimpleBarChartCard,
  TrendLinesChartCard,
  WaterfallChartCard,
} from './cards';

import type { InsightsChartCard, InsightsChartPayload } from './types';

function renderCard(card: InsightsChartCard) {
  switch (card.kind) {
    case 'waterfall':
      return (
        <WaterfallChartCard
          title={card.title}
          subtitle={card.subtitle}
          currencyCode={card.currencyCode}
          status={card.status}
          emptyMessage={card.emptyMessage}
          data={card.data}
        />
      );
    case 'grouped_bar':
      return (
        <GroupedBarChartCard
          title={card.title}
          subtitle={card.subtitle}
          currencyCode={card.currencyCode}
          status={card.status}
          emptyMessage={card.emptyMessage}
          data={card.data}
        />
      );
    case 'trend_lines':
      return (
        <TrendLinesChartCard
          title={card.title}
          subtitle={card.subtitle}
          currencyCode={card.currencyCode}
          status={card.status}
          emptyMessage={card.emptyMessage}
          data={card.data}
        />
      );
    case 'simple_bar':
      return (
        <SimpleBarChartCard
          title={card.title}
          subtitle={card.subtitle}
          currencyCode={card.currencyCode}
          status={card.status}
          emptyMessage={card.emptyMessage}
          data={card.data}
        />
      );
    case 'category_breakdown':
      return (
        <CategoryBreakdownChartCard
          title={card.title}
          subtitle={card.subtitle}
          currencyCode={card.currencyCode}
          status={card.status}
          emptyMessage={card.emptyMessage}
          data={card.data}
        />
      );
    default:
      return null;
  }
}

export function InsightsChartsSection({
  payload,
}: {
  payload: InsightsChartPayload;
}) {
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      {payload.cards.map((card) => (
        <div key={card.id} className="flex flex-col lg:min-h-0 lg:flex-1">
          {renderCard(card)}
        </div>
      ))}
    </div>
  );
}
