export type CompHistoryEntry = {
  fromMonth: string;
  toMonth?: string;
  isCurrent?: boolean;
};

export const buildMonthKey = (month?: string, year?: string) => {
  if (!month || !year) return undefined;
  const monthNumber = Number(month);
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return undefined;
  }
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
};

export const getNextMonthKey = (monthKey?: string) => {
  if (!monthKey) return undefined;
  const [year, month] = monthKey.split('-');
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isFinite(yearNumber) || !Number.isFinite(monthNumber)) {
    return undefined;
  }
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYearNumber = monthNumber === 12 ? yearNumber + 1 : yearNumber;
  return `${nextYearNumber}-${String(nextMonthNumber).padStart(2, '0')}`;
};

export const getPreviousMonthKey = (monthKey?: string) => {
  if (!monthKey) return undefined;
  const [year, month] = monthKey.split('-');
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isFinite(yearNumber) || !Number.isFinite(monthNumber)) {
    return undefined;
  }
  const prevMonthNumber = monthNumber === 1 ? 12 : monthNumber - 1;
  const prevYearNumber = monthNumber === 1 ? yearNumber - 1 : yearNumber;
  return `${prevYearNumber}-${String(prevMonthNumber).padStart(2, '0')}`;
};

export const getActiveCompRecord = <T extends CompHistoryEntry>(
  history: T[],
  periodKey?: string,
): T | undefined => {
  if (periodKey) {
    const activeByPeriod = history.find(
      (entry) =>
        entry.fromMonth <= periodKey &&
        (!entry.toMonth || entry.toMonth >= periodKey),
    );
    if (activeByPeriod) return activeByPeriod;
  }

  return history.find((entry) => entry.isCurrent);
};

export const getCompStartPolicy = <T extends CompHistoryEntry>({
  activeRecord,
  periodKey,
}: {
  activeRecord?: T;
  periodKey?: string;
}) => {
  const openEndedStartKey =
    activeRecord && !activeRecord.toMonth && periodKey
      ? activeRecord.fromMonth < periodKey
        ? periodKey
        : getNextMonthKey(periodKey)
      : undefined;
  const nextStartKey = activeRecord?.toMonth
    ? getNextMonthKey(activeRecord.toMonth)
    : (openEndedStartKey ?? periodKey);
  const autoEndKey =
    activeRecord && !activeRecord.toMonth && nextStartKey
      ? getPreviousMonthKey(nextStartKey)
      : undefined;

  return {
    nextStartKey,
    autoEndKey,
    startLocked: Boolean(activeRecord && nextStartKey),
  };
};

export const hasFinalizedOverlap = (
  fromMonth: string,
  toMonth: string | undefined,
  finalizedKeys: string[],
) => {
  const endKey = toMonth ?? '9999-12';
  return finalizedKeys.some((key) => key >= fromMonth && key <= endKey);
};

export const needsFutureStartConfirm = (
  draftStartKey?: string,
  runPeriodKey?: string,
  confirmed?: boolean,
) =>
  Boolean(
    runPeriodKey && draftStartKey && draftStartKey > runPeriodKey && !confirmed,
  );
