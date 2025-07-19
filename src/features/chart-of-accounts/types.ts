import { z } from "zod";

export const coaSource = z.enum(["user", "system", "template"]);
export type CoaSource = z.infer<typeof coaSource>;

export type FetchCoaInput = {
  companyId: string;
  accountId?: string;
  accountCode?: string;
  active?: boolean;
  accountTypeKey?: string;
};
export type CoaResponse = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  source?: CoaSource;
  defaultSide: string;

  accountTypeId: string;
  accountTypeKey: string;
  accountTypeLabel: string;

  reportCode?: string;

  accountElementId: string;
  accountElementKey: string;
  accountElementLabel: string;

  parentAccountElementId?: string;
  parentAccountElementKey?: string;
  parentAccountElementLabel?: string;

  accountCurrencyId: string;
  accountCurrencyCode: string;
  accountCurrencySymbol: string;

  reportingCurrencyId: string;
  reportingCurrencyCode: string;
  reportingCurrencySymbol: string;

  gaapFsLabel: string;
  ifrsFsLabel: string;

  isLocked: boolean;
  isActive: boolean;
  isDeleted: boolean;
  hasTransactions: boolean;
};
