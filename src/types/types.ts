import Decimal from "decimal.js";

export enum DebitCredit {
  Debit = "DEBIT",
  Credit = "CREDIT",
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

export enum CategorisationStatus {
  CATEGORISED = "CATEGORISED",
  UNCATEGORISED = "UNCATEGORISED",
  AUTOCATEGORISED = "AUTO_CATEGORISED",
}

export enum BankAccountType {
  OTHER = "OTHER",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  SAVINGS = "SAVINGS",
  CHECKINGS_CURRENT = "CHECKINGS_CURRENT",
  UTILITY = "UTILITY",
}

export enum JournalStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
  VOIDED = "VOIDED",
}

export enum JournalRecurrenceFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

export interface ServerResponseFormat<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
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

export interface TabConfig<T> {
  label: string;
  key: T;
  link?: string;
  className?: string;
}
export interface TabNavigationProps<T> {
  tabs: TabConfig<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  baseClassName?: string;
}

export interface BankAccount {
  id?: string;
  bankId?: string | number;
  bank?: Bank;
  displayName?: string;
  bankAccountType?: BankAccountType;
  bankAccountNo?: string;
  bankBalance: string | number;
  lastReconciled?: Date | string | null;
  currencyId?: string | number;
  currency?: Currency;
  companyId?: number;
  company?: Company;
  coaId?: number | null;
  accountInCoa?: Coa | null;
  transactionBatches?: BankTransactionBatch[];
  autoCategorisedCount?: number | string;
  uncategorisedCount?: number | string;
  totalTransactionCount?: number | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BankTransaction {
  id?: string | number;
  date: Date | string | null;
  payee?: string;
  reference?: string;
  description?: string;
  amount: string | number;
  transactionSide?: DebitCredit;
  source?: BankTransactionSource;
  isReconciled?: boolean;
  bankTransactionBatchId?: string | number;
  accountTransactionId?: string | number;
  bankAccountId?: string;
  bankAccount?: BankAccount;
}

export interface BankTransactionBatch {
  startDate: Date;
  endDate: Date;
  source: "FILE_IMPORT" | "BANK_FEED" | "MANUAL_ENTRY";
  bankAccountId: string;
  bankTransactions: BankTransaction[];
  createdById: string;
}

export interface BankTransactionFilters {
  startDate?: Date;
  endDate?: Date;
  bankAccountId?: string;
  minAmount?: Decimal | string;
  maxAmount?: Decimal | string;
  isCategorised?: boolean;
  isDeleted?: boolean;
  searchQuery?: string;
  transactionSide?: DebitCredit;
  currentPage?: number;
  pageSize?: number;
  categorisationStatus?: CategorisationStatus[];
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
  defaultSide?: DebitCredit;
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
  defaultSide?: DebitCredit;
  currencyId?: number;
  currency?: Currency;
  companyId?: number;
  company?: Company;
  isActive?: boolean;
  balance?: number;
  bankAccountId?: string;
  bankAccount?: BankAccount;
  createdAt?: Date;
  updatedAt?: Date;
  reportingBalance?: Decimal;
  nativeBalance?: Decimal;
}

export type Transaction = {
  transactionSource: "bankTransaction" | "ledgerTransaction";
  categorisationStatus: CategorisationStatus;
  id: string;
  date: Date | string;
  ledgerTransactionId?: string;
  fsDate: string | Date;
  coaId: string;
  transactionSide: DebitCredit;
  sourceCurrencyId: string;
  sourceAmount: Decimal | string;
  absoluteSourceAmount: Decimal | string;
  systemExchangeRate: Decimal | string;
  customExchangeRate: Decimal | string;
  amount: Decimal | string;
  absoluteAmount: Decimal | string;
  description?: string;
  reference?: string;
  projectId: string;
  updatedById: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | string;
  isDeleted: boolean;
  coa: Coa;
  bankAccount?: {
    id: string;
    displayName: string;
    bankAccountNo: string;
    coaId: string;
    currencyId: string;
    bankId: string;
    bankName: string;
    bankLogo: string;
    bankBalance: string | Decimal;
  };
  bankTransaction?: {
    id: string;
    date: Date;
    contact: string;
    description: string;
    reference: string;
    amount: Decimal | string;
    defaultExchangeRate: Decimal | string;
    bankTransactionBatchId: string;
    ledgerTransactionId: string;
  };
  ledgerTransaction: {
    id: string;
    date: Date;
    description?: string;
    reference?: string;
    notes?: string;
  };
  contact?: any; //Contact;
  journalBatch?: any; //JournalBatch;
  company?: Company;
  project?: any; // Project;
};

export type CatEngineTransaction = {
  id: string;
  transactionSource: string;
  categorisationStatus: CategorisationStatus;
  bankLogo: string | null;
  bankName: string | null;
  date: Date;
  fsDate: Date;
  contactName: string;
  reference: string;
  description: string;
  bankCurrencyCode: string;
  bankCurrencyId: string;
  bankCurrencySymbol?: string;
  transactionSide: DebitCredit | null;
  bankAmount: Decimal;
  exchangeRate: Decimal;
  amount: Decimal;
  bankAccountId: string | null;
  bankTransactionBatchId?: string | null;
  ledgerTransactionId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  coaId?: string | null;
  coaAccountName?: string | null;
  coaAccountCode?: string | null;
  userId: string;
};

export type TransactionKey = keyof CatEngineTransaction;

export type BankAccounts = BankAccount[];

export type CompanyData = {
  id: string;
  name: string;
  website: string;
  industry: string;
  teamSize: string;
  revenue: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  countryPhoneCode: string;
  countryFlag: string;
  countryContinent: string;
  reportingCurrencyId: string;
  reportingCurrencyCode: string;
  reportingCurrencyName: string;
  reportingCurrencySymbol: string;
  createdById: string;
  createdByFirstname: string;
  createdByLastname: string;
  createdAt: Date;
  updatedAt: Date;
};

export enum ScreenSize {
  Mobile = "mobile",
  Tablet = "tablet",
  Desktop = "desktop",
}


