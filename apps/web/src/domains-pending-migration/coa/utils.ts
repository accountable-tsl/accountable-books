import { toTitleCase } from '@/shared/utils/formatting-utils';
import type {
  ActionSummary,
  AnalyzeSelectionResponse,
  CoaResponse,
  QuickFilterOptions,
} from '@/domains-pending-migration/coa/types';

export const hardcodedParentAccountElements = [
  { label: 'All', value: 'all' },
  { label: 'Assets', value: 'assets' },
  { label: 'Liabilities', value: 'liabilities' },
  { label: 'Income', value: 'income' },
  { label: 'Expenses', value: 'expenses' },
  { label: 'Equity', value: 'equity' },
];

const priorityOrder = ['assets', 'liabilities', 'income', 'expenses', 'equity'];

function getPriorityIndex(value: string) {
  const index = priorityOrder.indexOf(value.toLowerCase());
  return index === -1 ? Infinity : index;
}

export function getAccountElementOptions(
  parentElementColumn: { getFacetedUniqueValues: () => Map<string, number> } | undefined,
): QuickFilterOptions[] {
  if (!parentElementColumn) return hardcodedParentAccountElements;

  const faceted = parentElementColumn.getFacetedUniqueValues();
  const rawEntries = Array.from(faceted.entries());

  const totalCount = rawEntries.reduce((acc, [, count]) => acc + count, 0);

  // const dynamicOptions = rawEntries.map(([key, count]) => ({
  //   value: key,
  //   label: toTitleCase(key),
  //   count,
  // }));

  const dynamicOptions = hardcodedParentAccountElements
    .filter((i) => i.value !== 'all')
    .map((item) => {
      const count = rawEntries.find((entry) => entry[0] === item.value)?.[1];
      return {
        ...item,
        value: item.value,
        label: toTitleCase(item.label),
        count: count ?? 0,
      };
    });

  const allOption = {
    value: 'all',
    label: 'All',
    count: totalCount,
  };

  dynamicOptions.filter(Boolean).sort((a, b) => {
    if (a.value === '') return -1;
    if (b.value === '') return 1;

    const priorityA = getPriorityIndex(a.value);
    const priorityB = getPriorityIndex(b.value);

    if (priorityA !== priorityB) return priorityA - priorityB;

    return a.label.localeCompare(b.label);
  });

  return [allOption, ...dynamicOptions];
}

export function analyzeSelectedAccounts(accounts: CoaResponse[]): AnalyzeSelectionResponse {
  const summary: ActionSummary = {
    total: accounts.length,
    locked: 0,
    archived: 0,
    deleted: 0,
    undeletable: 0,
  };

  for (const acc of accounts) {
    if (acc.isLocked) summary.locked++;
    if (!acc.isActive) summary.archived++;
    if (acc.isDeleted) summary.deleted++;
    if (!acc.canDelete || acc.hasTransactions) summary.undeletable++;
  }

  const canDelete = summary.total > 0 && summary.undeletable === 0;
  const canArchive =
    summary.total > 0 && summary.locked === 0 && summary.archived === 0 && summary.deleted === 0;
  const canExport = summary.total > 0;

  return {
    canDelete,
    canArchive,
    canExport,
    summary,
  };
}

export const getChangedFields = <T extends Record<string, any>>(
  formData: T,
  dirtyFields: Partial<Record<keyof T, boolean>>,
): Partial<T> => {
  return Object.keys(dirtyFields).reduce((acc, key) => {
    if (dirtyFields[key as keyof T]) {
      acc[key as keyof T] = formData[key as keyof T];
    }
    return acc;
  }, {} as Partial<T>);
};
