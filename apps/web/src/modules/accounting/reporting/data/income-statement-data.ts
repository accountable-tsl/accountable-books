import type {
  DetailLineAccount,
  DetailTransaction,
  ReconciliationStatus,
  StatementLine,
  StatementNote,
} from '@accountable-books/contracts/schema';

import { getIncomeStatementSectionOrder } from './statement-section-order';

import type { IncomeStatementNomenclature } from './statement-nomenclature';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Line IDs computed from other lines (not direct account types). */
export const DERIVED_STATEMENT_LINE_IDS = new Set([
  'gross_profit',
  'operating_result',
  'income_before_tax',
  'net_income',
]);

/** Line ids that start a logical section (used for subtle background banding only). */
export const SECTION_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  cost_of_sales: 'Cost of sales',
  gross_profit: 'Gross profit',
  operating_expenses: 'Operating expenses',
  operating_result: 'Operating result',
  other_income_expense: 'Other & tax',
  net_income: 'Net income',
};

// ---------------------------------------------------------------------------
// Template + type-level mock data (API-shaped)
// ---------------------------------------------------------------------------

type IncomeTypeAmount = {
  current: number;
  compare: number;
};

type IncomeTypeConfig = {
  id: string;
  label: string;
  code: string;
  reconciliationStatus: ReconciliationStatus;
};

const SHOW_WHEN_EMPTY_TYPE_KEYS = new Set<string>([
  'revenue_product',
  'revenue_services',
  'cos_materials',
  'opex_payroll',
]);

const TYPE_CONFIGS: IncomeTypeConfig[] = [
  {
    id: 'revenue_product',
    label: 'Product revenue',
    code: '4100',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'revenue_services',
    label: 'Service revenue',
    code: '4200',
    reconciliationStatus: 'pending',
  },
  {
    id: 'revenue_discounts',
    label: 'Discounts & returns',
    code: '4300',
    reconciliationStatus: 'unreconciled',
  },
  {
    id: 'cos_materials',
    label: 'Direct materials',
    code: '5010',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'cos_labor',
    label: 'Direct labor',
    code: '5020',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'cos_fulfillment',
    label: 'Fulfillment fees',
    code: '5030',
    reconciliationStatus: 'pending',
  },
  {
    id: 'opex_payroll',
    label: 'Payroll',
    code: '6100',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'opex_marketing',
    label: 'Marketing',
    code: '6200',
    reconciliationStatus: 'pending',
  },
  {
    id: 'opex_rent',
    label: 'Rent & occupancy',
    code: '6300',
    reconciliationStatus: 'reconciled',
  },
  {
    id: 'opex_software',
    label: 'Software & subscriptions',
    code: '6400',
    reconciliationStatus: 'unreconciled',
  },
  {
    id: 'opex_other',
    label: 'Other operating expenses',
    code: '6900',
    reconciliationStatus: 'reconciled',
  },
];

const TYPE_CONFIG_MAP = new Map<string, IncomeTypeConfig>(
  TYPE_CONFIGS.map((cfg) => [cfg.id, cfg]),
);

const TYPE_AMOUNTS: Record<string, IncomeTypeAmount> = {
  revenue_product: { current: 880_000, compare: 791_000 },
  revenue_services: { current: 402_000, compare: 355_000 },
  revenue_discounts: { current: -37_000, compare: -28_000 },
  cos_materials: { current: 218_000, compare: 199_000 },
  cos_labor: { current: 141_000, compare: 133_000 },
  cos_fulfillment: { current: 61_000, compare: 56_000 },
  opex_payroll: { current: 230_000, compare: 220_000 },
  opex_marketing: { current: 154_000, compare: 112_000 },
  opex_rent: { current: 88_000, compare: 85_000 },
  opex_software: { current: 55_000, compare: 49_000 },
  opex_other: { current: 33_000, compare: 32_000 },
};

const SECTION_TYPE_KEYS: Record<string, string[]> = {
  revenue: ['revenue_product', 'revenue_services', 'revenue_discounts'],
  cost_of_sales: ['cos_materials', 'cos_labor', 'cos_fulfillment'],
  operating_expenses: [
    'opex_payroll',
    'opex_marketing',
    'opex_rent',
    'opex_software',
    'opex_other',
  ],
};

function getTypeAmount(typeId: string): IncomeTypeAmount {
  const amt = TYPE_AMOUNTS[typeId];
  if (!amt) return { current: 0, compare: 0 };
  return amt;
}

function sumTypeAmounts(typeIds: string[]): IncomeTypeAmount {
  return typeIds.reduce<IncomeTypeAmount>(
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
// Mock statement data — built from type-level data + template
// ---------------------------------------------------------------------------

export function buildStatementLines(
  labels: IncomeStatementNomenclature,
  framework?: string | null,
): StatementLine[] {
  const revenueTotals = sumTypeAmounts(SECTION_TYPE_KEYS.revenue);
  const costOfSalesTotals = sumTypeAmounts(SECTION_TYPE_KEYS.cost_of_sales);
  const operatingExpensesTotals = sumTypeAmounts(
    SECTION_TYPE_KEYS.operating_expenses,
  );

  const grossProfit = {
    current: revenueTotals.current - costOfSalesTotals.current,
    compare: revenueTotals.compare - costOfSalesTotals.compare,
  };

  const operatingResult = {
    current: grossProfit.current - operatingExpensesTotals.current,
    compare: grossProfit.compare - operatingExpensesTotals.compare,
  };

  const otherIncomeExpense: IncomeTypeAmount = {
    current: -14_000,
    compare: 6_000,
  };
  const incomeTaxExpense: IncomeTypeAmount = {
    current: 58_000,
    compare: 55_000,
  };

  const incomeBeforeTax = {
    current: operatingResult.current + otherIncomeExpense.current,
    compare: operatingResult.compare + otherIncomeExpense.compare,
  };

  const netIncome = {
    current: incomeBeforeTax.current - incomeTaxExpense.current,
    compare: incomeBeforeTax.compare - incomeTaxExpense.compare,
  };

  const lines: StatementLine[] = [
    {
      id: 'revenue',
      label: labels.revenue,
      amount: revenueTotals.current,
      compareAmount: revenueTotals.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.revenue),
    },
    {
      id: 'cost_of_sales',
      label: labels.costOfSales,
      amount: costOfSalesTotals.current,
      compareAmount: costOfSalesTotals.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.cost_of_sales),
    },
    {
      id: 'gross_profit',
      label: labels.grossProfit,
      amount: grossProfit.current,
      compareAmount: grossProfit.compare,
      tone: 'total',
    },
    {
      id: 'operating_expenses',
      label: labels.operatingExpenses,
      amount: operatingExpensesTotals.current,
      compareAmount: operatingExpensesTotals.compare,
      children: buildTypeLines(SECTION_TYPE_KEYS.operating_expenses),
    },
    {
      id: 'operating_result',
      label: labels.operatingResult,
      amount: operatingResult.current,
      compareAmount: operatingResult.compare,
      tone: 'total',
    },
    {
      id: 'other_income_expense',
      label: labels.otherIncomeExpense,
      amount: otherIncomeExpense.current,
      compareAmount: otherIncomeExpense.compare,
    },
    {
      id: 'income_before_tax',
      label: labels.incomeBeforeTax,
      amount: incomeBeforeTax.current,
      compareAmount: incomeBeforeTax.compare,
      tone: 'total',
    },
    {
      id: 'income_tax_expense',
      label: labels.incomeTaxExpense,
      amount: incomeTaxExpense.current,
      compareAmount: incomeTaxExpense.compare,
    },
    {
      id: 'net_income',
      label: labels.netIncome,
      amount: netIncome.current,
      compareAmount: netIncome.compare,
      tone: 'total',
    },
  ];

  const order = getIncomeStatementSectionOrder(framework);
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
    lineId: 'revenue',
    body: 'Revenue grew 11.4% period-over-period, driven by an 11.2% increase in product revenue and a 13.2% increase in service revenue. Discounts & returns widened from $28K to $37K — worth monitoring if the trend continues.',
    source: 'ai',
    updatedAt: '2026-02-18T10:30:00Z',
    updatedBy: null,
  },
  {
    lineId: 'operating_expenses',
    body: 'Operating expenses increased 12.4%, primarily driven by a $42K increase in marketing spend for the Q1 trade show. Payroll rose modestly (+4.5%). Rent & occupancy stable at $88K.',
    source: 'ai_edited',
    updatedAt: '2026-02-20T14:15:00Z',
    updatedBy: 'Jane Doe',
  },
  {
    lineId: 'opex_marketing',
    body: 'Includes a $42K one-time trade show expense (Booth + travel for SaaStr Annual). This will not recur in Q2. Underlying marketing spend is flat at ~$112K.',
    source: 'human',
    updatedAt: '2026-02-19T09:45:00Z',
    updatedBy: 'Jane Doe',
  },
  {
    lineId: 'net_income',
    body: 'Net income up 5.5% despite higher operating costs, reflecting strong top-line growth. Effective tax rate stable at ~23%.',
    source: 'ai',
    updatedAt: '2026-02-18T10:30:00Z',
    updatedBy: null,
  },
];

export function getIncomeNotes(_period?: unknown): Map<string, StatementNote> {
  const map = new Map<string, StatementNote>();
  for (const note of MOCK_NOTES) {
    map.set(note.lineId, note);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mock COA accounts (COA-first drill-down)
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
  revenue_product: [
    {
      id: '00000000-0000-0000-0000-000000000101',
      code: '4100',
      label: 'Product Sales',
      share: 0.85,
      reconciliationStatus: 'reconciled',
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      code: '4101',
      label: 'Product Returns',
      share: 0.15,
      reconciliationStatus: 'reconciled',
    },
  ],
  revenue_services: [
    {
      id: '00000000-0000-0000-0000-000000000201',
      code: '4200',
      label: 'Service Revenue',
      share: 1,
      reconciliationStatus: 'pending',
    },
  ],
  revenue_discounts: [
    {
      id: '00000000-0000-0000-0000-000000000301',
      code: '4300',
      label: 'Discounts & Returns',
      share: 1,
      reconciliationStatus: 'unreconciled',
    },
  ],
  cos_materials: [
    {
      id: '00000000-0000-0000-0000-000000000401',
      code: '5010',
      label: 'Direct Materials',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  cos_labor: [
    {
      id: '00000000-0000-0000-0000-000000000501',
      code: '5020',
      label: 'Direct Labor',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  cos_fulfillment: [
    {
      id: '00000000-0000-0000-0000-000000000601',
      code: '5030',
      label: 'Fulfillment Fees',
      share: 1,
      reconciliationStatus: 'pending',
    },
  ],
  opex_payroll: [
    {
      id: '00000000-0000-0000-0000-000000000701',
      code: '6100',
      label: 'Payroll',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  opex_marketing: [
    {
      id: '00000000-0000-0000-0000-000000000801',
      code: '6200',
      label: 'Marketing',
      share: 1,
      reconciliationStatus: 'pending',
    },
  ],
  opex_rent: [
    {
      id: '00000000-0000-0000-0000-000000000901',
      code: '6300',
      label: 'Rent & Occupancy',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  opex_software: [
    {
      id: '00000000-0000-0000-0000-000000000a01',
      code: '6400',
      label: 'Software & Subscriptions',
      share: 1,
      reconciliationStatus: 'unreconciled',
    },
  ],
  opex_other: [
    {
      id: '00000000-0000-0000-0000-000000000b01',
      code: '6900',
      label: 'Other Operating Expenses',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  other_income_expense: [
    {
      id: '00000000-0000-0000-0000-000000000c01',
      code: '7100',
      label: 'Other Income / (Expense)',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
  income_tax_expense: [
    {
      id: '00000000-0000-0000-0000-000000000d01',
      code: '7200',
      label: 'Income Tax Expense',
      share: 1,
      reconciliationStatus: 'reconciled',
    },
  ],
};

export function getIncomeAccountsForLine(
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

export function getIncomeTransactionsForLineAndAccount(
  line: StatementLine,
  accountId: string,
): DetailTransaction[] {
  const coas = MOCK_COA_ACCOUNTS[line.id];
  if (!coas) return [];
  const coa = coas.find((c) => c.id === accountId);
  if (!coa) return [];
  const account = { code: coa.code, label: coa.label };
  const drCr = line.amount > 0 ? 'credit' : 'debit';

  return [
    buildMockTransaction(
      line,
      account,
      '1',
      0.42,
      drCr,
      '2026-02-03',
      `${coa.label} - batch A`,
      'bank',
      [
        {
          id: `${line.id}-${coa.code}-f1`,
          name: 'Invoice_2026-02.pdf',
          url: '#',
        },
      ],
      [
        {
          id: `${line.id}-${coa.code}-a1`,
          eventType: 'ledger_posted_auto',
          actorName: 'System',
          actorType: 'system',
          timestamp: '2026-02-03T14:22:00Z',
          comment: 'Auto-posted from bank feed',
        },
        {
          id: `${line.id}-${coa.code}-a2`,
          eventType: 'ledger_marked_reviewed',
          actorName: 'Jane Doe',
          actorType: 'user',
          timestamp: '2026-02-05T09:15:00Z',
          comment: 'Marked reviewed',
        },
      ],
    ),
    buildMockTransaction(
      line,
      account,
      '2',
      0.28,
      drCr,
      '2026-02-11',
      `${coa.label} adjustment`,
      'journal',
      [
        { id: `${line.id}-${coa.code}-f2`, name: 'Receipt.pdf', url: '#' },
        {
          id: `${line.id}-${coa.code}-f3`,
          name: 'Supporting_doc.xlsx',
          url: '#',
        },
      ],
      [
        {
          id: `${line.id}-${coa.code}-a3`,
          eventType: 'ledger_posted_manual',
          actorName: 'John Smith',
          actorType: 'user',
          timestamp: '2026-02-11T11:00:00Z',
          comment: 'Manual posting',
        },
        {
          id: `${line.id}-${coa.code}-a4`,
          eventType: 'metadata_updated',
          actorName: 'John Smith',
          actorType: 'user',
          timestamp: '2026-02-12T16:30:00Z',
        },
      ],
    ),
    buildMockTransaction(
      line,
      account,
      '3',
      0.3,
      drCr,
      '2026-02-21',
      `${coa.label} accrual`,
      'journal',
      [],
      [
        {
          id: `${line.id}-${coa.code}-a5`,
          eventType: 'ledger_posted_manual',
          actorName: 'Jane Doe',
          actorType: 'user',
          timestamp: '2026-02-21T08:45:00Z',
          comment: 'Month-end accrual',
        },
      ],
    ),
  ];
}
