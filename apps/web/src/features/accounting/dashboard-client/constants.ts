import {
  CheckCircle2,
  CircleMinus,
  ClockFading,
  Info,
  Minus,
} from 'lucide-react';

export const DASHBOARD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'income', label: 'Income Statement' },
  { id: 'balance', label: 'Balance Sheet' },
  { id: 'cash', label: 'Cash Management' },
] as const;

/** Page title and subtitle per tab. For income, title may be overridden by company preference (e.g. "Profit & Loss"). */
export const TAB_PAGE_HEADERS: Record<
  (typeof DASHBOARD_TABS)[number]['id'],
  { title: string; subtitle: string }
> = {
  overview: {
    title: 'Overview',
    subtitle: 'Your books at a glance.',
  },
  income: {
    title: 'Income Statement',
    subtitle: 'Revenue, expenses, and net income for the period.',
  },
  balance: {
    title: 'Balance Sheet',
    subtitle: 'What the business owns, owes, and is worth.',
  },
  cash: {
    title: 'Cash Management',
    subtitle: 'Cash position and movements for the period.',
  },
};

export const MONTHS = [
  { idx: 0, short: 'Jan', long: 'January' },
  { idx: 1, short: 'Feb', long: 'February' },
  { idx: 2, short: 'Mar', long: 'March' },
  { idx: 3, short: 'Apr', long: 'April' },
  { idx: 4, short: 'May', long: 'May' },
  { idx: 5, short: 'Jun', long: 'June' },
  { idx: 6, short: 'Jul', long: 'July' },
  { idx: 7, short: 'Aug', long: 'August' },
  { idx: 8, short: 'Sep', long: 'September' },
  { idx: 9, short: 'Oct', long: 'October' },
  { idx: 10, short: 'Nov', long: 'November' },
  { idx: 11, short: 'Dec', long: 'December' },
] as const;

export const READINESS_KEYS = [
  { label: 'Done', icon: CheckCircle2, className: 'text-green-500' },
  {
    label: 'In Progress',
    icon: ClockFading,
    className: 'text-muted-foreground',
  },
  {
    label: 'Client action required',
    icon: Info,
    className: 'text-destructive',
  },
  { label: 'Not due', icon: Minus, className: 'text-muted-foreground' },
  {
    label: 'N/A',
    icon: CircleMinus,
    className: 'text-muted-foreground fill-muted-foreground/10',
  },
] as const;

export const ACTION_CENTER_ID = 'action-center';

/** Shared card header styling for statement/dashboard cards. */
export const CARD_HEADER_CLASS =
  'border-border/50 bg-muted/20 dark:bg-muted/30 flex min-h-12 shrink-0 items-center border-b px-4';

/** Re-export for consumers that import period types from constants. */
export type { Period, PeriodBounds } from './period-utils';
