import type {
  DetailLineAccount,
  DetailTransaction,
  ReconciliationStatus,
  StatementLine,
  StatementNote,
} from '@accountable-books/contracts/schema';

import { getBalanceSheetSectionOrder } from './statement-section-order';

import type { BalanceSheetNomenclature } from './statement-nomenclature';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DERIVED_STATEMENT_LINE_IDS = new Set([
  'total_assets',
  'total_liabilities',
  'total_equity',
  'total_liabilities_and_equity',
]);

export const SECTION_LABELS: Record<string, string> = {
  current_asset: 'Current Assets',
  non_current_asset: 'Non-Current Assets',
  total_assets: 'Total Assets',
  current_liabilities: 'Current Liabilities',
  non_current_liabilities: 'Non-Current Liabilities',
  total_liabilities: 'Total Liabilities',
  contributed_capital: 'Equity',
  reserves: 'Equity',
  other_equity: 'Equity',
  total_equity: 'Total Equity',
  total_liabilities_and_equity: 'Total Liabilities & Equity',
};

// ---------------------------------------------------------------------------
// Template + mock data shaped like future API
// ---------------------------------------------------------------------------

type BalanceSheetTypeAmount = {
  current: number;
  compare: number;
};

type BalanceSheetTypeConfig = {
  id: string;
  label: string;
  code: string;
  reconciliationStatus: ReconciliationStatus;
};

const SHOW_WHEN_EMPTY_TYPE_KEYS = new Set<string>([
  'eq_contributed_capital',
  'eq_retained_earnings',
]);

const TYPE_CONFIGS: BalanceSheetTypeConfig[] = [
  {
    id: 'ca_bank',
    label: 'Bank',
    code: '1000',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'ca_trade_receivable',
    label: 'Trade Receivables',
    code: '1100',
    reconciliationStatus: 'pending',
  },
  {
    id: 'ca_inventory',
    label: 'Inventory',
    code: '1200',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'nca_ppe',
    label: 'Property, Plant, Equipment',
    code: '1500',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'nca_intangible_asset',
    label: 'Intangible Assets',
    code: '1600',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'cl_trade_payable',
    label: 'Trade Payables',
    code: '2000',
    reconciliationStatus: 'pending',
  },
  {
    id: 'cl_short_term_debt',
    label: 'Short-Term Debt',
    code: '2100',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'ncl_long_term_debt',
    label: 'Long-Term Debt',
    code: '2500',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'eq_contributed_capital',
    label: 'Contributed Capital',
    code: '3000',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'eq_retained_earnings',
    label: 'Retained Earnings',
    code: '3100',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'eq_other',
    label: 'Other Components of Equity',
    code: '3200',
    reconciliationStatus: 'reconciled',
  },
];

const TYPE_CONFIG_MAP = new Map<string, BalanceSheetTypeConfig>(
  TYPE_CONFIGS.map((cfg) => [cfg.id, cfg]),
);

const TYPE_AMOUNTS: Record<string, BalanceSheetTypeAmount> = {
  ca_bank: { current: 420_000, compare: 380_000 },
  ca_trade_receivable: { current: 380_000, compare: 355_000 },
  ca_inventory: { current: 300_000, compare: 285_000 },
  nca_ppe: { current: 980_000, compare: 920_000 },
  nca_intangible_asset: { current: 420_000, compare: 390_000 },
  cl_trade_payable: { current: 320_000, compare: 290_000 },
  cl_short_term_debt: { current: 280_000, compare: 260_000 },
  ncl_long_term_debt: { current: 600_000, compare: 580_000 },
  eq_contributed_capital: { current: 800_000, compare: 740_000 },
  eq_retained_earnings: { current: 500_000, compare: 460_000 },
  eq_other: { current: 0, compare: 0 },
};

const SECTION_TYPE_KEYS: Record<string, string[]> = {
  current_asset: ['ca_bank', 'ca_trade_receivable', 'ca_inventory'],
  non_current_asset: ['nca_ppe', 'nca_intangible_asset'],
  current_liabilities: ['cl_trade_payable', 'cl_short_term_debt'],
  non_current_liabilities: ['ncl_long_term_debt'],
  contributed_capital: ['eq_contributed_capital'],
  reserves: ['eq_retained_earnings'],
  other_equity: ['eq_other'],
};

function getTypeAmount(typeId: string): BalanceSheetTypeAmount {
  const amt = TYPE_AMOUNTS[typeId];
  if (!amt) return { current: 0, compare: 0 };
  return amt;
}

function sumTypeAmounts(typeIds: string[]): BalanceSheetTypeAmount {
  return typeIds.reduce<BalanceSheetTypeAmount>(
    (acc, id) => {
      const amt = getTypeAmount(id);
      acc.current += amt.current;
      acc.compare += amt.compare;
      return acc;
    },
    { current: 0, compare: 0 },
  );
}

function buildTypeLines(typeIds: string[]): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const id of typeIds) {
    const cfg = TYPE_CONFIG_MAP.get(id);
    if (!cfg) continue;
    const amt = getTypeAmount(id);
    const isZero = amt.current === 0 && amt.compare === 0;
    if (isZero && !SHOW_WHEN_EMPTY_TYPE_KEYS.has(id)) {
      continue;
    }
    lines.push({
      id: cfg.id,
      label: cfg.label,
      amount: amt.current,
      compareAmount: amt.compare,
      tone: 'normal',
      reconciliationStatus: cfg.reconciliationStatus,
      code: cfg.code,
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Mock statement data
// ---------------------------------------------------------------------------

export function buildBalanceSheetLines(
  labels: BalanceSheetNomenclature,
  framework?: string | null,
): StatementLine[] {
  const currentAssets = sumTypeAmounts(SECTION_TYPE_KEYS.current_asset);
  const nonCurrentAssets = sumTypeAmounts(SECTION_TYPE_KEYS.non_current_asset);
  const totalAssets = {
    current: currentAssets.current + nonCurrentAssets.current,
    compare: currentAssets.compare + nonCurrentAssets.compare,
  };

  const currentLiabilities = sumTypeAmounts(
    SECTION_TYPE_KEYS.current_liabilities,
  );
  const nonCurrentLiabilities = sumTypeAmounts(
    SECTION_TYPE_KEYS.non_current_liabilities,
  );
  const totalLiabilities = {
    current: currentLiabilities.current + nonCurrentLiabilities.current,
    compare: currentLiabilities.compare + nonCurrentLiabilities.compare,
  };

  const contributedCapital = sumTypeAmounts(
    SECTION_TYPE_KEYS.contributed_capital,
  );
  const reserves = sumTypeAmounts(SECTION_TYPE_KEYS.reserves);
  const otherEquity = sumTypeAmounts(SECTION_TYPE_KEYS.other_equity);
  const totalEquity = {
    current:
      contributedCapital.current + reserves.current + otherEquity.current,
    compare:
      contributedCapital.compare + reserves.compare + otherEquity.compare,
  };

  const lines: StatementLine[] = [
    {
      id: 'current_asset',
      label: labels.currentAssets,
      amount: currentAssets.current,
      compareAmount: currentAssets.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.current_asset),
    },
    {
      id: 'non_current_asset',
      label: labels.nonCurrentAssets,
      amount: nonCurrentAssets.current,
      compareAmount: nonCurrentAssets.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.non_current_asset),
    },
    {
      id: 'total_assets',
      label: labels.totalAssets,
      amount: totalAssets.current,
      compareAmount: totalAssets.compare,
      tone: 'total',
    },
    {
      id: 'current_liabilities',
      label: labels.currentLiabilities,
      amount: currentLiabilities.current,
      compareAmount: currentLiabilities.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.current_liabilities),
    },
    {
      id: 'non_current_liabilities',
      label: labels.nonCurrentLiabilities,
      amount: nonCurrentLiabilities.current,
      compareAmount: nonCurrentLiabilities.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.non_current_liabilities),
    },
    {
      id: 'total_liabilities',
      label: labels.totalLiabilities,
      amount: totalLiabilities.current,
      compareAmount: totalLiabilities.compare,
      tone: 'total',
    },
    {
      id: 'contributed_capital',
      label: 'Contributed Capital',
      amount: contributedCapital.current,
      compareAmount: contributedCapital.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.contributed_capital),
    },
    {
      id: 'reserves',
      label: 'Reserves',
      amount: reserves.current,
      compareAmount: reserves.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.reserves),
    },
    {
      id: 'other_equity',
      label: 'Other Equity',
      amount: otherEquity.current,
      compareAmount: otherEquity.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.other_equity),
    },
    {
      id: 'total_equity',
      label: labels.totalEquity,
      amount: totalEquity.current,
      compareAmount: totalEquity.compare,
      tone: 'total',
    },
    {
      id: 'total_liabilities_and_equity',
      label: labels.totalLiabilitiesAndEquity,
      amount: totalLiabilities.current + totalEquity.current,
      compareAmount: totalLiabilities.compare + totalEquity.compare,
      tone: 'total',
    },
  ];

  const order = getBalanceSheetSectionOrder(framework);
  const byId = new Map(lines.map((l) => [l.id, l]));
  return order
    .map((id) => byId.get(id))
    .filter((l): l is StatementLine => l != null);
}

// ---------------------------------------------------------------------------
// Mock notes
// ---------------------------------------------------------------------------

const MOCK_NOTES: StatementNote[] = [
  {
    lineId: 'current_asset',
    body: 'Current assets increased 7.8% period-over-period. Bank and trade receivables both grew; inventory stable. No material aging in receivables.',
    source: 'ai',
    updatedAt: '2026-02-18T10:30:00Z',
    updatedBy: null,
  },
  {
    lineId: 'total_liabilities',
    body: 'Total liabilities up 6.2%. Short-term debt rose with the new facility draw; long-term debt flat. Trade payables growth in line with revenue.',
    source: 'ai_edited',
    updatedAt: '2026-02-19T14:00:00Z',
    updatedBy: 'Jane Doe',
  },
  {
    lineId: 'total_equity',
    body: 'Equity increased 8.1%, driven by retained earnings. No new share issuance in the period.',
    source: 'ai',
    updatedAt: '2026-02-18T10:30:00Z',
    updatedBy: null,
  },
];

export function getBalanceNotes(_period?: unknown): Map<string, StatementNote> {
  const map = new Map<string, StatementNote>();
  for (const note of MOCK_NOTES) {
    map.set(note.lineId, note);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mock COA accounts
// ---------------------------------------------------------------------------

const MOCK_COA_ACCOUNTS: Record<
  string,
  {
    id: string;
    code: string;
    label: string;
    share: number;
    reconciliationStatus: ReconciliationStatus;
  }[]
> = {
  ca_bank: [
    {
      id: '00000000-0000-0000-0000-000000001001',
      code: '1000',
      label: 'Bank',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  ca_trade_receivable: [
    {
      id: '00000000-0000-0000-0000-000000001101',
      code: '1100',
      label: 'Trade Receivables',
      share: 1,
      reconciliationStatus: 'pending',
    },
  ],
  ca_inventory: [
    {
      id: '00000000-0000-0000-0000-000000001201',
      code: '1200',
      label: 'Inventory',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  nca_ppe: [
    {
      id: '00000000-0000-0000-0000-000000001501',
      code: '1500',
      label: 'Property, Plant, Equipment',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  nca_intangible_asset: [
    {
      id: '00000000-0000-0000-0000-000000001601',
      code: '1600',
      label: 'Intangible Assets',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  cl_trade_payable: [
    {
      id: '00000000-0000-0000-0000-000000002001',
      code: '2000',
      label: 'Trade Payables',
      share: 1,
      reconciliationStatus: 'pending',
    },
  ],
  cl_short_term_debt: [
    {
      id: '00000000-0000-0000-0000-000000002101',
      code: '2100',
      label: 'Short-Term Debt',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  ncl_long_term_debt: [
    {
      id: '00000000-0000-0000-0000-000000002501',
      code: '2500',
      label: 'Long-Term Debt',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  eq_contributed_capital: [
    {
      id: '00000000-0000-0000-0000-000000003001',
      code: '3000',
      label: 'Contributed Capital',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  eq_retained_earnings: [
    {
      id: '00000000-0000-0000-0000-000000003101',
      code: '3100',
      label: 'Retained Earnings',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  eq_other: [
    {
      id: '00000000-0000-0000-0000-000000003201',
      code: '3200',
      label: 'Other Components of Equity',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
};

export function getBalanceAccountsForLine(
  line: StatementLine,
): DetailLineAccount[] {
  if (DERIVED_STATEMENT_LINE_IDS.has(line.id)) return [];
  const coas = MOCK_COA_ACCOUNTS[line.id];
  if (!coas) return [];
  return coas.map((c) => ({
    id: c.id,
    code: c.code,
    label: c.label,
    amount: Math.round(line.amount * c.share),
    compareAmount: Math.round(line.compareAmount * c.share),
    reconciliationStatus: c.reconciliationStatus,
  }));
}

function buildMockTransaction(
  line: StatementLine,
  account: { code: string; label: string },
  suffix: string,
  amountShare: number,
  drCr: 'debit' | 'credit',
  date: string,
  description: string,
  source: 'bank' | 'journal',
  attachments: { id: string; name: string; url?: string }[],
  auditEvents: DetailTransaction['auditEvents'],
): DetailTransaction {
  return {
    id: `${line.id}-${account.code}-txn-${suffix}`,
    date,
    description,
    source,
    amount: Math.round(line.amount * amountShare),
    drCr,
    account,
    attachments: attachments.length > 0 ? attachments : undefined,
    auditEvents,
  };
}

export function getBalanceTransactionsForLineAndAccount(
  line: StatementLine,
  accountId: string,
): DetailTransaction[] {
  const coas = MOCK_COA_ACCOUNTS[line.id];
  if (!coas) return [];
  const coa = coas.find((c) => c.id === accountId);
  if (!coa) return [];
  const account = { code: coa.code, label: coa.label };
  const isAsset = isAssetLineId(line.id);
  const drCr = isAsset
    ? line.amount > 0
      ? 'debit'
      : 'credit'
    : line.amount > 0
      ? 'credit'
      : 'debit';

  return [
    buildMockTransaction(
      line,
      account,
      '1',
      0.4,
      drCr,
      '2026-02-03',
      `${coa.label} - batch A`,
      'bank',
      [{ id: `${line.id}-${coa.code}-f1`, name: 'Doc.pdf', url: '#' }],
      [
        {
          id: `${line.id}-${coa.code}-a1`,
          eventType: 'ledger_posted_auto',
          actorName: 'System',
          actorType: 'system',
          timestamp: '2026-02-03T14:22:00Z',
          comment: 'Auto-posted from bank feed',
        },
      ],
    ),
    buildMockTransaction(
      line,
      account,
      '2',
      0.35,
      drCr,
      '2026-02-15',
      `${coa.label} adjustment`,
      'journal',
      [],
      [
        {
          id: `${line.id}-${coa.code}-a2`,
          eventType: 'ledger_posted_manual',
          actorName: 'John Smith',
          actorType: 'user',
          timestamp: '2026-02-15T11:00:00Z',
          comment: 'Manual posting',
        },
      ],
    ),
  ];
}

function isAssetLineId(lineId: string): boolean {
  if (lineId === 'current_asset' || lineId === 'non_current_asset') return true;
  if (lineId.startsWith('ca_') || lineId.startsWith('nca_')) return true;
  return false;
}
