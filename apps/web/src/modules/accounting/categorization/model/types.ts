import type {
  CategorizationTransaction,
  CategorizationTransactionStatus,
} from '@accountable-books/contracts/schema';

export type { CategorizationTransaction, CategorizationTransactionStatus };

/**
 * Categorization transaction status
 */
// export type CategorizationTransactionStatus =
//   | 'uncategorized'
//   | 'proposed'
//   | 'posted';

// /**
//  * Raw categorization transaction from API
//  * One row per non-bank leg
//  */
// export interface CategorizationTransaction {
//   id: string; // bank_transaction_id
//   date: Date;
//   fs_date: Date;
//   bank_amount: number;
//   description: string | null;
//   reference: string | null;
//   contact_name: string | null;
//   contact_id: string | null;
//   contact_type: string | null;
//   bank_account_id: string;
//   bank_account_display_name: string;
//   bank_currency_id: string;
//   bank_currency_code: string;
//   bank_id: string;
//   bank_display_name: string;
//   bank_logo: string | null;
//   bank_account_coa_id?: string;
//   bank_account_coa_name?: string;
//   bank_account_coa_code?: string | null;
//   reporting_currency_id?: string | null;
//   reporting_currency_code?: string | null;
//   reporting_currency_name?: string | null;
//   reporting_currency_symbol?: string | null;
//   coa_id: string | null;
//   coa_name: string | null;
//   coa_code: string | null;
//   project_id: string | null;
//   project_name: string | null;
//   system_exchange_rate: number;
//   custom_exchange_rate: number;
//   native_amount: number;
//   reporting_amount: number;
//   ledger_transaction_id: string | null;
//   ledger_entry_id: string | null;
//   candidate_id: string | null;
//   candidate_line_id: string | null;
//   confidence: number | null;
//   explanation: string | null;
//   human_reviewed: boolean | null;
//   categorization_candidate_id: string | null;
//   categorization_status: CategorizationTransactionStatus;
//   company_id: string;
//   is_editable: boolean;
//   review_notes: string | null;
//   files: Array<{
//     id: string;
//     name: string;
//     type: string;
//     url: string;
//     size_bytes: number;
//   }>;
// }

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

export interface CategorizationTransactionFile {
  id: string;
  name: string;
  key: string;
  bucket_name: string;
  type: string;
  size_bytes: number;
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
  bankAccountCoaId?: string;
  bankAccountCoaName?: string;
  bankAccountCoaCode?: string | null;
  reportingCurrencyId?: string | null;
  reportingCurrencyCode?: string | null;
  reportingCurrencyName?: string | null;
  reportingCurrencySymbol?: string | null;
  bankAmount: number;

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

  ledgerTransactionId: string | null;
  candidateId: string | null;

  // Files attached to this transaction (only for uncategorized transactions with no entries)
  // For proposed/posted transactions, files are at the entry level
  files: Array<CategorizationTransactionFile>;

  // Raw entries
  entries?: Array<
    GroupedTransaction & {
      ledgerEntryId: string | null;
      candidateLineId: string | null;
      reviewNotes: string | null;
      // Files attached to this specific entry
      files: Array<CategorizationTransactionFile>;
      explanation: string | null;
      // Client reference ID for exact matching (from client_ref_id in metadata)
      client_ref_id?: string | null;
    }
  >;
}

export interface SendCategorizationIntentResponse {
  results?: Array<{
    bank_transaction_id: string;
    operation: 'created' | 'updated_metadata' | 'superseded';
    ledger_transaction_id: string;
    old_ledger_transaction_id?: string;
    warnings?: Record<string, string>;
    transaction?: CategorizationTransaction[];
  }>;
  skipped?: Array<{
    bank_transaction_id: string;
    reason: string;
  }>;
  summary?: {
    total_processed: number;
    created: number;
    updated: number;
    superseded: number;
    skipped: number;
    has_warnings: boolean;
  };
}
