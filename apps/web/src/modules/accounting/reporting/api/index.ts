import {
  buildBalanceSheetLines,
  buildStatementLines,
  findLineById,
  getBalanceAccountsForLine,
  getBalanceNotes,
  getBalanceSheetNomenclature,
  getBalanceTransactionsForLineAndAccount,
  getIncomeAccountsForLine,
  getIncomeNotes,
  getIncomeStatementNomenclature,
  getIncomeTransactionsForLineAndAccount,
} from '../data';

import type {
  BalanceSheetResponse,
  FetchBalanceSheetParams,
  FetchIncomeStatementParams,
  FetchStatementLineAccountTransactionsParams,
  FetchStatementLineDetailsParams,
  IncomeStatementResponse,
  StatementLineAccountTransactionsResponse,
  StatementLineDetailResponse,
} from '../model/types';

const DEFAULT_LIMIT = 50;

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = parseInt(cursor, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function buildNextCursor(
  offset: number,
  returned: number,
  total: number,
): string | null {
  const next = offset + returned;
  return next < total ? String(next) : null;
}

export async function fetchIncomeStatement(
  params: FetchIncomeStatementParams,
): Promise<IncomeStatementResponse> {
  const { companyId, period, framework } = params;
  const fw = framework === 'us_gaap' ? 'us_gaap' : 'ifrs';
  const labels = getIncomeStatementNomenclature(fw);
  const lines = buildStatementLines(labels, fw);
  const notesMap = getIncomeNotes();
  const notes = Array.from(notesMap.values());

  return {
    companyId,
    framework: fw,
    basis: 'modified_accrual_basis',
    period: {
      periodType: period.periodType,
      fiscalYear: period.fiscalYear,
      periodNumber: period.periodNumber,
      startDate: period.startDate,
      endDate: period.endDate,
    },
    lines,
    notes,
  };
}

export async function fetchBalanceSheet(
  params: FetchBalanceSheetParams,
): Promise<BalanceSheetResponse> {
  const { companyId, period, framework } = params;
  const fw = framework === 'us_gaap' ? 'us_gaap' : 'ifrs';
  const labels = getBalanceSheetNomenclature(fw);
  const lines = buildBalanceSheetLines(labels, fw);
  const notesMap = getBalanceNotes();
  const notes = Array.from(notesMap.values());

  return {
    companyId,
    framework: fw,
    basis: 'modified_accrual_basis',
    period: {
      periodType: period.periodType,
      fiscalYear: period.fiscalYear,
      periodNumber: period.periodNumber,
      startDate: period.startDate,
      endDate: period.endDate,
    },
    lines,
    notes,
  };
}

export async function fetchStatementLineDetails(
  params: FetchStatementLineDetailsParams,
): Promise<StatementLineDetailResponse> {
  const { statementType, lineId } = params;

  if (statementType === 'income') {
    const labels = getIncomeStatementNomenclature('ifrs');
    const lines = buildStatementLines(labels, 'ifrs');
    const found = findLineById(lines, lineId);
    const line = found?.line;
    if (!line) {
      return { lineId, accounts: [] };
    }
    const accounts = getIncomeAccountsForLine(line);
    return { lineId, accounts };
  }

  const labels = getBalanceSheetNomenclature('ifrs');
  const lines = buildBalanceSheetLines(labels, 'ifrs');
  const found = findLineById(lines, lineId);
  const line = found?.line;
  if (!line) {
    return { lineId, accounts: [] };
  }
  const accounts = getBalanceAccountsForLine(line);
  return { lineId, accounts };
}

export async function fetchStatementLineAccountTransactions(
  params: FetchStatementLineAccountTransactionsParams,
): Promise<StatementLineAccountTransactionsResponse> {
  const {
    statementType,
    lineId,
    accountId,
    period: _period,
    cursor,
    limit = DEFAULT_LIMIT,
  } = params;

  let all: StatementLineAccountTransactionsResponse['transactions'];

  if (statementType === 'income') {
    const labels = getIncomeStatementNomenclature('ifrs');
    const lines = buildStatementLines(labels, 'ifrs');
    const found = findLineById(lines, lineId);
    const line = found?.line;
    if (!line) {
      return {
        lineId,
        accountId,
        transactions: [],
        nextCursor: null,
        hasMore: false,
      };
    }
    all = getIncomeTransactionsForLineAndAccount(line, accountId);
  } else {
    const labels = getBalanceSheetNomenclature('ifrs');
    const lines = buildBalanceSheetLines(labels, 'ifrs');
    const found = findLineById(lines, lineId);
    const line = found?.line;
    if (!line) {
      return {
        lineId,
        accountId,
        transactions: [],
        nextCursor: null,
        hasMore: false,
      };
    }
    all = getBalanceTransactionsForLineAndAccount(line, accountId);
  }

  const offset = parseCursor(cursor);
  const slice = all.slice(offset, offset + limit);
  const nextCursor = buildNextCursor(offset, slice.length, all.length);

  return {
    lineId,
    accountId,
    transactions: slice,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}
