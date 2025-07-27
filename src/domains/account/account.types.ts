import z from "zod";
import { debitCredit, DebitCredit } from "../../core/types/core";

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
  accountElements: AccountElementDTO[];
  financialStatements: FinancialStatementDTO[];
};
