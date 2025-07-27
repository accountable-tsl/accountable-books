import { debitCredit } from "@/shared/types/core";
import z from "zod";

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

export const financialStatement = z.object({
  key: z.string(),
  defaultLabel: z.string(),
  usGaapLabel: z.string().nullable(),
  ifrsLabel: z.string().nullable(),
});
export type FinancialStatement = z.infer<typeof financialStatement>;

export type AccountClassificationMetadata = {
  accountTypes: AccountType[];
  accountElements: AccountElement[];
  financialStatements: FinancialStatement[];
};
