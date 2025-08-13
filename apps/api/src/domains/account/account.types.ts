import z from 'zod';
import { debitCredit, type DebitCredit } from '../../core/types/core.js';

export const accountTypeDto = z.object({
  id: z.string().optional(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  reportCode: z.string().nullable(),
  elementKey: z.string(),
});
export type AccountTypeDTO = z.infer<typeof accountTypeDto>;

export const accountElementDto = z.object({
  id: z.string().optional(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  reportCode: z.string().nullable(),
  defaultSide: debitCredit,
  parentElementKey: z.string(),
  financialStatementKey: z.string(),
});
export type AccountElementDTO = z.infer<typeof accountElementDto>;

export const parentAccountElementDto = accountElementDto.extend({
  parentElementKey: z.null().optional(),
});
export type ParentAccountElementDTO = z.infer<typeof parentAccountElementDto>;

export const financialStatementDto = z.object({
  id: z.string().optional(),
  key: z.string(),
  defaultLabel: z.string(),
  usGaapLabel: z.string().nullable(),
  ifrsLabel: z.string().nullable(),
});
export type FinancialStatementDTO = z.infer<typeof financialStatementDto>;

export type AccountClassificationMetadata = {
  accountTypes: AccountTypeDTO[];
  enrichedAccountTypes: EnrichedAccountType[];
  accountElements: AccountElementDTO[];
  parentAccountElements: ParentAccountElementDTO[];
  financialStatements: FinancialStatementDTO[];
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

  _rawElement?: AccountElementDTO;
  _rawParent?: ParentAccountElementDTO;
  _rawFinancialStatement?: FinancialStatementDTO;
}
