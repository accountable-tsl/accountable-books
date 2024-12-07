export enum DefaultSide {
  Debit = "Debit",
  Credit = "Credit",
}

export enum BankTransactionStatus {
  RECONCILED = "RECONCILED",
  UNRECONCILED = "UNRECONCILED",
}

export enum BankTransactionSource {
  IMPORTED = "FILE_IMPORT",
  CONNECTED = "BANK_FEED",
  MANUAL = "MANUAL_ENTRY",
}

export enum BankAccountType {
  OTHER = "OTHER",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  SAVINGS = "SAVINGS",
  CHECKINGS_CURRENT = "CHECKINGS_CURRENT",
  UTILITY = "UTILITY",
}

export interface Company {
  id?: number;
  name?: string;
  email?: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  userId?: number;
  currencyId: number;
  currency?: Currency;
  bankAccounts?: BankAccount[];
  coas?: Coa[];
}

export interface Currency {
  id?: number;
  code?: string;
  name?: string;
  symbol?: string;
  companies?: Company[];
  coa?: Coa[];
  bankAccounts?: BankAccount[];
}

export interface Country {
  id?: number;
  code?: string;
  name?: string;
  phoneCode?: string;
  flag?: string | null;
  continent?: string | null;
  company?: Company[];
  banks?: Bank[];
}

export interface FinancialStatement {
  id?: number;
  statementKey?: string;
  usGaapLabel?: string;
  ifrsLabel?: string;
  defaultLabel?: string;
  accountElement?: AccountElement[];
}

export interface Bank {
  id?: number;
  name?: string;
  bankLogo?: string | null;
  countryId?: number;
  country?: Country;
  bankAccounts?: BankAccount[];
}

export interface BankAccount {
  id?: string;
  bankId?: string | number;
  bank?: Bank;
  displayName?: string;
  bankAccountType?: BankAccountType;
  bankAccountNo?: string;
  bankBalance?: string | number;
  lastReconciled?: Date | null;
  currencyId?: string | number;
  currency?: Currency;
  companyId?: number;
  company?: Company;
  coaId?: number | null;
  accountInCOA?: Coa | null;
  transactionBatches?: BankTransactionBatch[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BankTransaction {
  id?: string | number;
  date: string;
  payee?: string;
  reference?: string;
  description?: string;
  amount: string | number;
  type?: DefaultSide;
  source?: BankTransactionSource;
  isReconciled?: boolean;
  bankTransactionBatchId?: string | number;
  accountTransactionId?: string | number;
}

export interface BankTransactionBatch {
  startDate: Date;
  endDate: Date;
  source: "FILE_IMPORT" | "BANK_FEED" | "MANUAL_ENTRY";
  bankAccountId: string;
  bankTransactions: BankTransaction[];
  createdById: string;
}

export interface AccountType {
  id?: number;
  typeName?: string;
  accountElementId?: number;
  accountElement?: AccountElement;
  description?: string;
  coa?: Coa[];
}

export interface AccountElement {
  id?: number;
  elementName?: string;
  defaultSide?: DefaultSide;
  parentId?: number;
  parent?: AccountElement;
  children?: AccountElement[];
  financialStatementId?: number;
  financialStatement?: FinancialStatement;
  description?: string;
  accountType?: AccountType[];
}

export interface Coa {
  id?: string | number;
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId?: number;
  accountType?: AccountType;
  defaultSide?: DefaultSide;
  currencyId?: number;
  currency?: Currency;
  companyId?: number;
  company?: Company;
  isActive?: boolean;
  balance?: number;
  bankAccountId?: string;
  bankAccount?: BankAccount;
  transactions?: AccountTransaction[];
  journalTransactions?: JournalTransaction[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type BankAccounts = BankAccount[];
