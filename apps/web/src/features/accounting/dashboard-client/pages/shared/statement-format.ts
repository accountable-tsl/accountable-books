import type { DetailTransaction } from './statement-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LineVarianceIntent = 'favorable_when_up' | 'favorable_when_down';

// ---------------------------------------------------------------------------
// Currency / number formatting
// ---------------------------------------------------------------------------

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDeltaPercent(current: number, previous: number) {
  if (previous === 0) return '0.0%';
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

export function formatVariance(value: number, currency: string) {
  if (value === 0) return '—';
  const absFormatted = formatCurrency(Math.abs(value), currency);
  return `${value > 0 ? '+' : '-'}${absFormatted}`;
}

export function formatVariancePercent(current: number, previous: number) {
  if (previous === 0) return '—';
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

export function formatPercentOfRevenue(amount: number, revenue: number) {
  if (!Number.isFinite(revenue) || revenue === 0) return '—';
  const percent = (amount / revenue) * 100;
  return `${percent.toFixed(1)}%`;
}

export function formatSignedCurrency(value: number, currency: string) {
  const formatted = formatCurrency(value, currency);
  if (value > 0) return `+${formatted}`;
  return formatted;
}

// ---------------------------------------------------------------------------
// Variance tone
// ---------------------------------------------------------------------------

export function getVarianceTone(
  value: number,
  intent: LineVarianceIntent = 'favorable_when_up',
) {
  if (value === 0) return 'text-muted-foreground';
  const favorable = intent === 'favorable_when_up' ? value > 0 : value < 0;
  if (favorable) return 'text-green-600 dark:text-green-500';
  return 'text-destructive';
}

export function isFavorableDelta(delta: number, intent: LineVarianceIntent) {
  if (delta === 0) return null;
  return intent === 'favorable_when_up' ? delta > 0 : delta < 0;
}

// ---------------------------------------------------------------------------
// Label / detail formatting
// ---------------------------------------------------------------------------

export function formatCompactLineLabel(label: string) {
  if (label.length <= 24) return label;
  return `${label.slice(0, 22)}...`;
}

export function formatSourceLabel(source: DetailTransaction['source']) {
  return source === 'bank' ? 'Bank' : 'Journal';
}

export function formatDetailAmount(value: number, currency: string) {
  return formatCurrency(value, currency);
}

export function getAmountTone(value: number) {
  if (value < 0) return 'text-destructive';
  return 'text-foreground';
}
