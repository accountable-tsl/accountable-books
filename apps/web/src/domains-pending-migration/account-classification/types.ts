import type { DebitCredit } from '@/shared/types/core';
import { debitCredit } from '@/shared/types/core';
import { z } from 'zod';

export const accountType = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  reportCode: z.string().nullable(),
  elementKey: z.string(),
});
export type AccountType = z.infer<typeof accountType>;

export const accountElement = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  reportCode: z.string().nullable(),
  defaultSide: debitCredit,
  parentElementKey: z.string(),
  financialStatementKey: z.string(),
});
export type AccountElement = z.infer<typeof accountElement>;

export const parentAccountElement = accountElement.extend({
  parentElementKey: z.null().optional(),
});
export type ParentAccountElement = z.infer<typeof parentAccountElement>;

export const financialStatement = z.object({
  key: z.string(),
  defaultLabel: z.string(),
  usGaapLabel: z.string().nullable(),
  ifrsLabel: z.string().nullable(),
});
export type FinancialStatement = z.infer<typeof financialStatement>;

export type AccountMeta = {
  accountTypes: AccountType[];
  enrichedAccountTypes: EnrichedAccountType[];
  accountElements: AccountElement[];
  parentAccountElements: ParentAccountElement[];
  financialStatements: FinancialStatement[];
};

export interface EnrichedAccountType {
  key: string;
  label: string;

  elementKey: string;
  elementLabel: string;

  parentElementKey: string;
  parentElementLabel: string;

  defaultSide: DebitCredit;

  financialStatementKey: string;
  financialStatementLabel: string;

  reportCode: string | null;
  elementReportCode: string | null;
  parentElementReportCode: string | null;

  _rawElement?: AccountElement;
  _rawParent?: ParentAccountElement;
  _rawFinancialStatement?: FinancialStatement;
}
