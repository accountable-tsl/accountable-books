import type { CompensationPeriodSchema, RentPeriodSchema } from '../domain';

import type { z } from 'zod';

export type CompensationPeriod = z.infer<typeof CompensationPeriodSchema>;
export type RentPeriod = z.infer<typeof RentPeriodSchema>;

export function monthInRange(params: {
  month: string;
  fromMonth: string;
  toMonth?: string;
}): boolean {
  const { month, fromMonth, toMonth } = params;
  if (month < fromMonth) return false;
  if (!toMonth) return true;
  return month <= toMonth;
}

export function pickPeriodForMonth<T extends { fromMonth: string; toMonth?: string }>(
  history: T[],
  month: string,
): T | null {
  const matches = history.filter((p) =>
    monthInRange({ month, fromMonth: p.fromMonth, toMonth: p.toMonth }),
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  throw new Error(`Multiple overlapping periods for month ${month}`);
}

