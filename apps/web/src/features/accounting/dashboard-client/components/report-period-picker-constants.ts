import { MONTHS } from '../constants';

import type { CompareMode, ReportPeriod } from '../report-period';

export const QUARTERS = [1, 2, 3, 4] as const;

export const QUICK_ACTIONS: Array<{
  label: string;
  mode: ReportPeriod['mode'];
  disabled?: boolean;
  title?: string;
}> = [
  { label: 'Full Year', mode: 'year' },
  { label: 'YTD', mode: 'ytd' },
  { label: 'T12M', mode: 'trailing12m' },
  {
    label: 'Custom…',
    mode: 'custom',
    disabled: true,
    title: 'Custom range coming soon',
  },
];

export const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'prior_period', label: 'Prior Period' },
  { value: 'prior_year', label: 'Prior Year' },
];

/** Grid rows: each row has 3 months + 1 quarter. */
export const GRID_ROWS = QUARTERS.map((q) => {
  const startIdx = (q - 1) * 3;
  return {
    quarter: q,
    months: [MONTHS[startIdx], MONTHS[startIdx + 1], MONTHS[startIdx + 2]],
  };
});
