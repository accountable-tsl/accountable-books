import Decimal from 'decimal.js';
import { EntryGridColumnInputType } from '../EntryGrid/EntryGrid';
import { parseDecimal } from '@/utils/utils';

export const sumAmounts = (
  journalData: any[],
  entryGridColumnData: {
    key: string;
    label: string;
    inputType: EntryGridColumnInputType;
  }[],
) => {
  if (!journalData || !Array.isArray(journalData) || journalData.length === 0) {
    return entryGridColumnData
      .filter((col) => col.inputType === EntryGridColumnInputType.AMOUNT)
      .reduce(
        (emptyTotals, col) => ({
          ...emptyTotals,
          [col.key]: new Decimal(0),
        }),
        {} as Record<string, Decimal>,
      );
  }
  try {
    return entryGridColumnData
      .filter((col) => col.inputType === EntryGridColumnInputType.AMOUNT)
      .reduce(
        (totals, col) => {
          const key = col.key;
          totals[key] = journalData.reduce(
            (sum, entry) => sum.plus(parseDecimal(entry?.[key])),
            new Decimal(0),
          );
          return totals;
        },
        {} as Record<string, Decimal>,
      );
  } catch (error) {
    console.error('Error calculating amount totals:', error);
    return {} as Record<string, Decimal>;
  }
};
