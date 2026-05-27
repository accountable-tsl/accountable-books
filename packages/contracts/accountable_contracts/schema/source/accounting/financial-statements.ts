import { z } from 'zod';

import {
  accountingBasis,
  debitCredit,
  detailTransactionSource,
  reconciliationStatus,
  reportingFramework,
  statementNoteSource,
} from '../common/enums.js';
import { fiscalPeriodType } from './fiscal-period.js';
import { ledgerAuditEvent } from './ledger-audit.js';

export const statementLineTone = z.enum(['normal', 'subtotal', 'total']);
export type StatementLineTone = z.infer<typeof statementLineTone>;

export const detailAttachment = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url().optional(),
});
export type DetailAttachment = z.infer<typeof detailAttachment>;

export type DetailAuditEvent = import('./ledger-audit.js').LedgerAuditEvent;

export const detailTransaction = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  source: detailTransactionSource,
  amount: z.number(),
  account: z.object({
    code: z.string(),
    label: z.string(),
  }),
  attachments: z.array(detailAttachment).optional(),
  auditEvents: z.array(ledgerAuditEvent).optional(),
  drCr: debitCredit,
});
export type DetailTransaction = z.infer<typeof detailTransaction>;

export interface StatementLineShape {
  id: string;
  label: string;
  amount: number;
  compareAmount: number;
  tone?: StatementLineTone;
  reconciliationStatus?: z.infer<typeof reconciliationStatus>;
  code?: string;
  children?: StatementLineShape[];
}

export const statementLine: z.ZodType<StatementLineShape> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    amount: z.number(),
    compareAmount: z.number(),
    tone: statementLineTone.optional(),
    reconciliationStatus: reconciliationStatus.optional(),
    code: z.string().optional(),
    children: z.array(statementLine).optional(),
  }),
);
export type StatementLine = StatementLineShape;

export const statementNote = z.object({
  lineId: z.string(),
  body: z.string(),
  source: statementNoteSource,
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});
export type StatementNote = z.infer<typeof statementNote>;

const reportPeriod = z.object({
  periodType: fiscalPeriodType,
  fiscalYear: z.number().int(),
  periodNumber: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
});

export const incomeStatementResponse = z.object({
  companyId: z.string(),
  framework: reportingFramework,
  basis: accountingBasis,
  period: reportPeriod,
  lines: z.array(statementLine),
  notes: z.array(statementNote),
});
export type IncomeStatementResponse = z.infer<typeof incomeStatementResponse>;

export const balanceSheetResponse = z.object({
  companyId: z.string(),
  framework: reportingFramework,
  basis: accountingBasis,
  period: reportPeriod,
  lines: z.array(statementLine),
  notes: z.array(statementNote),
});
export type BalanceSheetResponse = z.infer<typeof balanceSheetResponse>;

export const detailLineAccount = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  amount: z.number(),
  compareAmount: z.number(),
  reconciliationStatus: reconciliationStatus.optional(),
});
export type DetailLineAccount = z.infer<typeof detailLineAccount>;

export const statementLineDetailResponse = z.object({
  lineId: z.string(),
  accounts: z.array(detailLineAccount),
});
export type StatementLineDetailResponse = z.infer<
  typeof statementLineDetailResponse
>;

export const statementLineAccountTransactionsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
});
export type StatementLineAccountTransactionsQuery = z.infer<
  typeof statementLineAccountTransactionsQuery
>;

export const statementLineAccountTransactionsResponse = z.object({
  lineId: z.string(),
  accountId: z.string().uuid(),
  transactions: z.array(detailTransaction),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type StatementLineAccountTransactionsResponse = z.infer<
  typeof statementLineAccountTransactionsResponse
>;
