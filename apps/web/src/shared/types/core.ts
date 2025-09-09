import type { BankTransactionSource } from '@/modules/bank-transactions/manual-upload/types';
import dayjs from 'dayjs';
import Decimal from 'decimal.js';
import z from 'zod';

export const zEmail = z.email('Please enter a valid email address').trim().toLowerCase();

export type Email = z.infer<typeof zEmail>;

export const companyType = z.enum(['business', 'accounting_firm', 'individual']);
export type CompanyType = z.infer<typeof companyType>;

export const userType = z.enum(['admin', 'client', 'bookkeeper']);
export type UserType = z.infer<typeof userType>;

// Country
export type Country = {
  id: string;
  code: string;
  name: string;
  phoneCode: string;
  flag: string;
  continent?: string;
};

export type CurrencyList = {
  id: string;
  code: string;
  name: string;
  symbol: string;
};

export const debitCredit = z.enum(['debit', 'credit']);
export type DebitCredit = z.infer<typeof debitCredit>;

export const zDate = z.preprocess((val) => {
  if (typeof val === 'string' || typeof val === 'number' || val instanceof Date) {
    const date = new Date(val);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}, z.date());

//////////////////////////////////////

export enum BankTransactionStatus {
  RECONCILED = 'RECONCILED',
  UNRECONCILED = 'UNRECONCILED',
}

export enum CategorisationStatus {
  CATEGORISED = 'CATEGORISED',
  UNCATEGORISED = 'UNCATEGORISED',
  AUTOCATEGORISED = 'AUTO_CATEGORISED',
}

export enum BankAccountType {
  OTHER = 'OTHER',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  SAVINGS = 'SAVINGS',
  CHECKINGS_CURRENT = 'CHECKINGS_CURRENT',
  UTILITY = 'UTILITY',
}

export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  VOIDED = 'VOIDED',
}

export enum JournalRecurrenceFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
  code?: string;
}

export interface Company {
  id?: string;
  name?: string;
  email?: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  userId?: string;
  currencyId: string;
  currency?: Currency;
  bankAccounts?: BankAccount[];
  coas?: Coa[];
}

export interface Currency {
  id?: string;
  code?: string;
  name?: string;
  symbol?: string;
  companies?: Company[];
  coa?: Coa[];
  bankAccounts?: BankAccount[];
}

export interface FinancialStatement {
  id?: string;
  statementKey?: string;
  usGaapLabel?: string;
  ifrsLabel?: string;
  defaultLabel?: string;
  accountElement?: AccountElement[];
}

export interface Bank {
  id?: string;
  name?: string;
  bankLogo?: string | null;
  countryId?: string;
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
  bankId?: string;
  bank?: Bank;
  displayName?: string;
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

export interface BankTransaction {
  id?: string;
  date: Date | string | null;
  payee?: string;
  reference?: string;
  description?: string;
  amount: string | number;
  transactionSide?: DebitCredit;
  source?: BankTransactionSource;
  isReconciled?: boolean;
  bankTransactionBatchId?: string;
  accountTransactionId?: string;
  bankAccountId?: string;
  bankAccount?: BankAccount;
}

export interface BankTransactionBatch {
  startDate: Date;
  endDate: Date;
  source: BankTransactionSource;
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
  id?: string;
  accountCode?: string;
  accountName: string;
  description?: string;
  accountTypeId?: string;
  accountTypeName?: string;
  accountType?: AccountType;
  defaultSide?: DebitCredit;
  currencyId?: string;
  currency?: Currency;
  companyId?: string;
  company?: Company;
  isActive?: boolean;
  balance?: Decimal | number;
  bankAccountId?: string;
  bankAccount?: BankAccount;
  createdAt?: Date;
  updatedAt?: Date;
  reportingBalance?: Decimal;
  nativeBalance?: Decimal;
}

export type Transaction = {
  transactionSource: 'bankTransaction' | 'ledgerTransaction';
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
    bankBalance: string;
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

export enum ScreenSize {
  Mobile = 'mobile',
  Tablet = 'tablet',
  Desktop = 'desktop',
}

export interface JournalGridData {
  description: string;
  account: { label: string; value: string } | null;
  debit: string | null;
  credit: string | null;
}
export interface JournalTransaction {
  description?: string;
  side: DebitCredit;
  amount: Decimal;
  coaAccountId: string;
  coaAccount?: any;
}

export type JournalBatchData = {
  id?: string;
  sequenceNumber?: number;
  date: Date;
  description: string;
  status: JournalStatus;
  transactions?: JournalTransaction[];
  journalTransactions?: JournalTransaction[];
  autoReverseDate?: Date;
  note?: string;
  generatedFromTemplateId?: string | null;
  ledgerTransactionId?: string | null;
  postedAt?: string | null;
  postedById?: string | null;
  updatedById?: string;
  autoReversalDate?: string | null;
  reversedJournalId?: string | null;
  reversedById?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdById?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface PostJournalPayload {
  data: JournalBatchData[];
}

export interface PopupState {
  visible: boolean;
  errors: string[];
  isSuccess: boolean;
}

export type MultiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type MultiSelectOptionGroup = {
  label: string; // The group heading
  options: MultiSelectOption[];
};

export type GroupableOption = MultiSelectOption | MultiSelectOptionGroup;

export type MultiSelectProps = {
  options: (MultiSelectOption | MultiSelectOptionGroup)[];
  selectedValues?: string[];
  placeholder?: string;
  onChange: (selectedValues: string[]) => void;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  maxDisplayItems?: number;
  maxHeight?: string;
  selectAllLabel?: string;
  deselectAllLabel?: string;
  clearLabel?: string;
  noOptionsMessage?: string;
  searchPlaceholder?: string;
  renderOption?: (option: MultiSelectOption, isSelected: boolean) => React.ReactNode;
  renderSelectedItem?: (option: MultiSelectOption) => React.ReactNode;
  loading?: boolean;
  error?: string;
  id?: string;
};

export type AccountingTxnFilters = {
  startDate: Date | string | dayjs.Dayjs;
  endDate: Date | string | dayjs.Dayjs;
  showContact: boolean;
  showProject: boolean;
  showCurrency: boolean;
  showSourceAmounts: boolean;
  accountIds?: string[];
};

export interface AccountTxn {
  id: string;
  code: string;
  name: string;
  type: string;
  date: string;
  description: string;
  contactId?: string;
  contact?: any;
  projectId?: string;
  project?: any;
  currency: string;
  debitSource?: Decimal;
  creditSource?: Decimal;
  debitAmount: Decimal;
  creditAmount: Decimal;
}

export interface AccountTxns {
  account: Coa;
  transactions: AccountTxn[];
  openingBalance: Decimal;
  closingBalance: Decimal;
}

export interface AccountTxnTableProps {
  data: AccountTxns;
  showContact: boolean;
  showProject: boolean;
  showCurrency: boolean;
  showSourceAmounts: boolean;
}

export type Pagination = {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export const dateFromStringOrDate = z.preprocess((arg) => {
  if (arg instanceof Date) return arg;
  if (typeof arg === 'string') {
    const parsed = new Date(arg);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}, z.date());
export const dateOrString = dateFromStringOrDate;
export const dateOrStringOptional = dateFromStringOrDate.optional();
export const dateOrStringNullable = dateFromStringOrDate.nullable();
export const dateOrStringNullish = dateFromStringOrDate.nullish();
