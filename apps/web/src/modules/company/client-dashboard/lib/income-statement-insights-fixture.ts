import type { StatementInsight } from '../model/types';

export function buildIncomeStatementInsightSlides(
  opexRatio: number,
  periodLabel: string,
): StatementInsight[] {
  return [
    {
      id: 'rev_growth',
      headline: 'Revenue up 14.5% vs prior period',
      evidence:
        'Strongest gain in 6 months. Driven by Consulting Services (+$11.3K) and a new enterprise license deal.',
      aiPrompt: `Explain why revenue increased in ${periodLabel}. Show the top contributing accounts and supporting transactions.`,
    },
    {
      id: 'mkt_spend',
      headline: 'Marketing spend up 37.5% without proportional lift',
      evidence:
        'Digital advertising increased $2.6K and events spend rose $1.6K. Consider reviewing campaign ROI.',
      aiPrompt: `Explain the marketing spend increase in ${periodLabel}. Show the accounts and transactions behind the change, and call out any anomalies.`,
    },
    {
      id: 'margin',
      headline: 'Gross margin improved 2.3pts',
      evidence:
        'Direct labor costs stabilized while service revenue mix increased.',
      aiPrompt: `Explain the gross margin change in ${periodLabel}. Break down revenue and cost of sales drivers with supporting evidence.`,
    },
    {
      id: 'opex_ratio',
      headline: `OpEx now ${opexRatio.toFixed(1)}% of revenue`,
      evidence:
        'Operating costs are rising faster than revenue. Review the largest expense drivers this period.',
      aiPrompt: `Explain the operating expenses ratio in ${periodLabel}. Identify the largest drivers and supporting transactions.`,
    },
  ];
}
