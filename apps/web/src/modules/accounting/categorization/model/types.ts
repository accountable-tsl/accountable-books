/**
 * Categorization transaction status
 */
export type CategorizationTransactionStatus =
  | 'uncategorized'
  | 'proposed'
  | 'posted';

/**
 * Raw categorization transaction from API
 * One row per non-bank leg
 */
export interface CategorizationTransaction {
  id: string; // bank_transaction_id
  date: Date;
  fs_date: Date;
  bank_amount: number;
  description: string | null;
  reference: string | null;
  contact_name: string | null;
  contact_id: string | null;
  contact_type: string | null;
  bank_account_id: string;
  bank_account_display_name: string;
  bank_currency_id: string;
  bank_currency_code: string;
  bank_id: string;
  bank_display_name: string;
  bank_logo: string | null;
  coa_id: string | null;
  coa_name: string | null;
  coa_code: string | null;
  project_id: string | null;
  project_name: string | null;
  system_exchange_rate: number;
  custom_exchange_rate: number;
  native_amount: number;
  reporting_amount: number;
  ledger_transaction_id: string | null;
  candidate_id: string | null;
  confidence: number | null;
  explanation: string | null;
  human_reviewed: boolean | null;
  categorization_candidate_id: string | null;
  categorization_status: CategorizationTransactionStatus;
  company_id: string;
  is_editable: boolean;
}

/**
 * Aggregated summary information for a grouped transaction
 */
export interface TransactionSummary {
  totalReportingAmount: number;
  totalNativeAmount: number;
  primaryAccountName: string | null;
  primaryAccountCode: string | null;
  splitCount: number;
  isSplit: boolean;
}

/**
 * Grouped transaction structure
 * Groups all non-bank legs by bank_transaction_id
 */
export interface GroupedTransactionOld {
  id: string; // bank_transaction_id
  lines: CategorizationTransaction[]; // All non-bank legs
  summary: TransactionSummary;
  status: CategorizationTransactionStatus;
  date: Date;
  fs_date: Date;
  bank_amount: number;
  bank_account_id: string;
  bank_account_display_name: string;
  bank_currency_id: string;
  bank_currency_code: string;
  bank_id: string;
  bank_display_name: string;
  bank_logo: string | null;
  is_editable: boolean;
}

/**
 * Parameters for fetching categorization transactions
 */
export interface GetCategorizationTransactionsParams {
  companyId: string;
  dateFrom: Date;
  dateTo: Date;
  status?: CategorizationTransactionStatus;
  limit?: number;
  offset?: number;
}

/**
 * Response from API
 */
export interface GetCategorizationTransactionsResponse {
  transactions: CategorizationTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface GroupedTransaction {
  // Flags
  hasMultipleEntries?: boolean;
  entryCount?: number;
  rowType: 'parent' | 'subRow';

  // Bank info
  id: string;
  bankTransactionId: string;
  bankName: string;
  bankLogo: string | null;
  bankAccountName: string;
  bankAccountCurrencyCode: string;

  // Transaction details
  date: string;
  fsDate: string | null;
  description: string | null;
  contactId: string | null;
  contactName: string | null;
  reference: string | null;
  projectId: string | null;
  projectName: string | null;

  // Amounts
  nativeAmount: number;
  reportingAmount: number;
  exchangeRate: string;
  spent: number;
  received: number;

  // Categorization
  confidence: number | null;
  status: CategorizationTransactionStatus;
  coaId: string | null;
  coaCode: string | null;
  coaName: string | null;

  // Raw entries
  entries?: GroupedTransaction[];
}
