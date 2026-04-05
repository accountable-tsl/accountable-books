import type { StatementInsight } from '../model/types';

export function buildBalanceSheetInsightSlides(
  periodLabel: string,
): StatementInsight[] {
  return [
    {
      id: 'liquidity',
      headline: 'Current ratio stable at 1.3x',
      evidence:
        'Current assets and current liabilities both grew in line. Bank and trade receivables remain the largest current asset components.',
      aiPrompt: `Explain the current ratio and liquidity position in ${periodLabel}. Show current assets and liabilities breakdown with supporting accounts.`,
    },
    {
      id: 'asset_mix',
      headline: 'Non-current assets up 4.2% vs prior period',
      evidence:
        'PPE and intangibles increased; no new major capex. Depreciation and amortization in line with prior run rate.',
      aiPrompt: `Explain the change in non-current assets in ${periodLabel}. Break down PPE, intangibles, and other long-term assets with evidence.`,
    },
    {
      id: 'leverage',
      headline: 'Debt-to-equity within target range',
      evidence:
        'Total liabilities and equity moved in line with prior period. Long-term debt flat; short-term facilities used for working capital.',
      aiPrompt: `Explain leverage and the liabilities vs equity mix in ${periodLabel}. Show debt and equity components and any notable changes.`,
    },
    {
      id: 'working_capital',
      headline: 'Working capital positive and stable',
      evidence:
        'Current assets exceed current liabilities. Trade receivables and payables both increased; inventory stable.',
      aiPrompt: `Explain working capital in ${periodLabel}. Show the main drivers—receivables, payables, inventory—and how they changed.`,
    },
  ];
}
