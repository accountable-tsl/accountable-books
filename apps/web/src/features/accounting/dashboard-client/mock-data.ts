/** Mock dashboard data – replace with API */
import { CoinsIcon, TrendingDown, Wallet } from 'lucide-react';

import type { MetricCardProps } from './components/metric-card';

export const MOCK_ALL_CLEAR_MESSAGE =
  'Your accountant has categorized 47 transactions this month';
export const MOCK_DATA_HEALTH_LINE =
  'Bank feeds: 2 connected, last sync 3h ago. Docs: 2/4 received';
export const MOCK_HAS_CONNECTED_BANK = true;
export const MOCK_HAS_DATA = true;

export const MOCK_ACTION_CENTER_TASKS: Array<{
  id: string;
  title: string;
  due: string;
  impact: string;
  ctaLabel: string;
}> = [
  {
    id: '1',
    title: 'Reconnect GTB feed',
    due: 'Today',
    impact: 'Close delay risk',
    ctaLabel: 'Reconnect',
  },
  {
    id: '2',
    title: 'Upload VAT receipt pack',
    due: 'Fri',
    impact: 'Filing blocked',
    ctaLabel: 'Upload',
  },
];

export const MOCK_QUICK_ACTIONS: Array<{ label: string }> = [
  { label: 'Connect bank' },
  { label: 'Upload statement' },
  { label: 'Open Workbench' },
];

export const MOCK_COMPLIANCE_ALERTS: Array<{
  id: string;
  title: string;
  due?: string;
}> = [
  { id: '1', title: 'VAT filing due', due: 'Mar 15' },
  { id: '2', title: 'Annual return due', due: 'Apr 30' },
];

export const MOCK_FINANCIAL_OVERVIEW_CARDS: MetricCardProps[] = [
  {
    title: 'Revenue',
    description:
      'Total income for the selected period, including sales and other income. YTD is year-to-date.',
    value: '$168.67M',
    change: { direction: 'up', percent: '12.4%', label: 'This Month' },
    footer: {
      label: 'YTD Revenue',
      value: 'NGN 800.99M',
      valueNumber: 800_990_000,
    },
    icon: CoinsIcon,
  },
  {
    title: 'Expenses',
    description:
      'Total spending for the period. Burn rate is how much you spend per month on average.',
    value: '$42.1M',
    change: { direction: 'down', percent: '3.2%', label: 'This Month' },
    footer: {
      label: 'Burn rate',
      value: '$1.2M/mo',
      valueNumber: 1_200_000,
    },
    icon: TrendingDown,
  },
  {
    title: 'Cash runway',
    description:
      'How long your current bank balance can cover expenses at the current burn rate.',
    value: '14 months',
    change: { direction: 'up', percent: '2.1%', label: 'vs last month' },
    footer: {
      label: 'Bank balance',
      value: '$18.4M',
      valueNumber: 18_400_000,
    },
    icon: Wallet,
  },
];
