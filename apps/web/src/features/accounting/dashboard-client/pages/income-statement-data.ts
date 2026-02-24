import type { IncomeStatementNomenclature } from '../statement-nomenclature';
import type {
  DetailTransaction,
  StatementLine,
  StatementNote,
} from './shared/statement-types';

// Re-export shared types so existing imports keep working
export type {
  ReconciliationStatus,
  StatementLine,
  StatementNote,
  DetailAttachment,
  DetailAuditEvent,
  DetailTransaction,
} from './shared/statement-types';

export { findLineById } from './shared/statement-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRIMARY_LINE_IDS = new Set([
  'revenue',
  'cost_of_sales',
  'gross_profit',
  'operating_expenses',
  'operating_result',
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
// Mock statement data
// ---------------------------------------------------------------------------

export function buildStatementLines(
  labels: IncomeStatementNomenclature,
): StatementLine[] {
  return [
    {
      id: 'revenue',
      label: labels.revenue,
      amount: 1_245_000,
      compareAmount: 1_118_000,
      tone: 'total',
      children: [
        {
          id: 'revenue_product',
          label: 'Product revenue',
          amount: 880_000,
          compareAmount: 791_000,
          reconciliationStatus: 'reconciled',
          code: '4100',
        },
        {
          id: 'revenue_services',
          label: 'Service revenue',
          amount: 402_000,
          compareAmount: 355_000,
          reconciliationStatus: 'pending',
          code: '4200',
        },
        {
          id: 'revenue_discounts',
          label: 'Discounts & returns',
          amount: -37_000,
          compareAmount: -28_000,
          reconciliationStatus: 'unreconciled',
          code: '4300',
        },
      ],
    },
    {
      id: 'cost_of_sales',
      label: labels.costOfSales,
      amount: 420_000,
      compareAmount: 388_000,
      children: [
        {
          id: 'cos_materials',
          label: 'Direct materials',
          amount: 218_000,
          compareAmount: 199_000,
          reconciliationStatus: 'reconciled',
          code: '5010',
        },
        {
          id: 'cos_labor',
          label: 'Direct labor',
          amount: 141_000,
          compareAmount: 133_000,
          reconciliationStatus: 'reconciled',
          code: '5020',
        },
        {
          id: 'cos_fulfillment',
          label: 'Fulfillment fees',
          amount: 61_000,
          compareAmount: 56_000,
          reconciliationStatus: 'pending',
          code: '5030',
        },
      ],
    },
    {
      id: 'gross_profit',
      label: labels.grossProfit,
      amount: 825_000,
      compareAmount: 730_000,
      tone: 'subtotal',
    },
    {
      id: 'operating_expenses',
      label: labels.operatingExpenses,
      amount: 560_000,
      compareAmount: 498_000,
      children: [
        {
          id: 'opex_payroll',
          label: 'Payroll',
          amount: 230_000,
          compareAmount: 220_000,
          reconciliationStatus: 'reconciled',
          code: '6100',
        },
        {
          id: 'opex_marketing',
          label: 'Marketing',
          amount: 154_000,
          compareAmount: 112_000,
          reconciliationStatus: 'pending',
          code: '6200',
        },
        {
          id: 'opex_rent',
          label: 'Rent & occupancy',
          amount: 88_000,
          compareAmount: 85_000,
          reconciliationStatus: 'reconciled',
          code: '6300',
        },
        {
          id: 'opex_software',
          label: 'Software & subscriptions',
          amount: 55_000,
          compareAmount: 49_000,
          reconciliationStatus: 'unreconciled',
          code: '6400',
        },
        {
          id: 'opex_other',
          label: 'Other operating expenses',
          amount: 33_000,
          compareAmount: 32_000,
          reconciliationStatus: 'reconciled',
          code: '6900',
        },
      ],
    },
    {
      id: 'operating_result',
      label: labels.operatingResult,
      amount: 265_000,
      compareAmount: 232_000,
      tone: 'subtotal',
    },
    {
      id: 'other_income_expense',
      label: labels.otherIncomeExpense,
      amount: -14_000,
      compareAmount: 6_000,
    },
    {
      id: 'income_before_tax',
      label: labels.incomeBeforeTax,
      amount: 251_000,
      compareAmount: 238_000,
      tone: 'subtotal',
    },
    {
      id: 'income_tax_expense',
      label: labels.incomeTaxExpense,
      amount: 58_000,
      compareAmount: 55_000,
    },
    {
      id: 'net_income',
      label: labels.netIncome,
      amount: 193_000,
      compareAmount: 183_000,
      tone: 'total',
    },
  ];
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

/**
 * Returns mock notes for the current period, keyed by lineId.
 * Signature accepts ReportPeriod for future API integration.
 */
export function getNotesForPeriod(
  _period?: unknown,
): Map<string, StatementNote> {
  const map = new Map<string, StatementNote>();
  for (const note of MOCK_NOTES) {
    map.set(note.lineId, note);
  }
  return map;
}

function accountFromLine(line: StatementLine): { code: string; label: string } {
  return { code: line.code ?? line.id, label: line.label };
}

export function getMockTransactionsForLine(
  line: StatementLine,
): DetailTransaction[] {
  const account = accountFromLine(line);
  return [
    {
      id: `${line.id}-txn-1`,
      date: '2026-02-03',
      description: `${line.label} allocation - batch A`,
      source: 'bank',
      amount: line.amount * 0.42,
      drCr: line.amount > 0 ? 'Cr' : 'Dr', // mock inference for income lines
      account,
      attachments: [
        { id: `${line.id}-txn-1-f1`, name: 'Invoice_2026-02.pdf', url: '#' },
      ],
      auditEvents: [
        {
          id: `${line.id}-txn-1-a1`,
          eventType: 'ledger_posted_auto',
          actorName: 'System',
          actorType: 'system',
          timestamp: '2026-02-03T14:22:00Z',
          comment: 'Auto-posted from bank feed',
        },
        {
          id: `${line.id}-txn-1-a2`,
          eventType: 'ledger_marked_reviewed',
          actorName: 'Jane Doe',
          actorType: 'user',
          timestamp: '2026-02-05T09:15:00Z',
          comment: 'Marked reviewed',
        },
      ],
    },
    {
      id: `${line.id}-txn-2`,
      date: '2026-02-11',
      description: `${line.label} adjustment`,
      source: 'journal',
      amount: line.amount * 0.28,
      drCr: line.amount > 0 ? 'Cr' : 'Dr',
      account,
      attachments: [
        { id: `${line.id}-txn-2-f1`, name: 'Receipt.pdf', url: '#' },
        { id: `${line.id}-txn-2-f2`, name: 'Supporting_doc.xlsx', url: '#' },
      ],
      auditEvents: [
        {
          id: `${line.id}-txn-2-a1`,
          eventType: 'ledger_posted_manual',
          actorName: 'John Smith',
          actorType: 'user',
          timestamp: '2026-02-11T11:00:00Z',
          comment: 'Manual posting',
        },
        {
          id: `${line.id}-txn-2-a2`,
          eventType: 'metadata_updated',
          actorName: 'John Smith',
          actorType: 'user',
          timestamp: '2026-02-12T16:30:00Z',
        },
      ],
    },
    {
      id: `${line.id}-txn-3`,
      date: '2026-02-21',
      description: `${line.label} accrual`,
      source: 'journal',
      amount: line.amount * 0.3,
      drCr: line.amount > 0 ? 'Cr' : 'Dr',
      account,
      attachments: [],
      auditEvents: [
        {
          id: `${line.id}-txn-3-a1`,
          eventType: 'ledger_posted_manual',
          actorName: 'Jane Doe',
          actorType: 'user',
          timestamp: '2026-02-21T08:45:00Z',
          comment: 'Month-end accrual',
        },
      ],
    },
  ];
}
