export interface BankAccount {
  id: string;
  bankId?: string;
  bank?: Bank;
  displayName: string;
  bankAccountType?: BankAccountType;
  bankAccountNo?: string;
  bankBalance: string | number;
  lastReconciled?: Date | string | null;
  currencyId?: string;
  currency?: Currency;
  companyId?: string;
  company?: Company;
  coaId?: string | null;
  accountInCoa?: Coa | null;
  transactionBatches?: BankTransactionBatch[];
  autoCategorisedCount?: number | string;
  uncategorisedCount?: number | string;
  totalTransactionCount?: number | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BankAccounts = BankAccount[];
