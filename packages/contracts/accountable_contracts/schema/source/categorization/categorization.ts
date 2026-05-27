import { z } from 'zod';

export const categorizationTransactionStatus = z.enum([
  'uncategorized',
  'proposed',
  'posted',
]);
export type CategorizationTransactionStatus = z.infer<
  typeof categorizationTransactionStatus
>;

// Categorization transaction from the view
export type CategorizationTransaction = {
  id: string;
  date: Date;
  fs_date: Date;
  bank_amount: number;
  /**
   * Description - The appropriate description for this transaction line.
   * - Uncategorized: Bank transaction description
   * - Proposed: Candidate line description
   * - Posted: Ledger entry description
   */
  description: string | null;
  /**
   * Reference - The appropriate reference for this transaction line.
   * - Uncategorized: Bank transaction reference
   * - Proposed: Candidate reference
   * - Posted: Ledger transaction reference
   */
  reference: string | null;
  /**
   * Contact name - The name of the contact/counterparty for this transaction.
   * - Uncategorized: Bank transaction payee
   * - Proposed: Contact display_name (if contact_id is set)
   * - Posted: Contact display_name (if contact_id is set)
   */
  contact_name: string | null;
  contact_id: string | null;
  /**
   * Contact type - The type of contact (customer, vendor, employee, etc.)
   */
  contact_type: string | null;
  bank_account_id: string;
  bank_account_display_name: string;
  bank_currency_id: string;
  bank_currency_code: string;
  bank_id: string;
  bank_display_name: string;
  bank_logo: string | null;
  /**
   * Bank account COA - The chart of accounts account associated with the bank account
   */
  bank_account_coa_id: string | null;
  bank_account_coa_name: string | null;
  bank_account_coa_code: string | null;
  /**
   * Reporting Currency - The currency used for financial reporting by the company
   */
  reporting_currency_id: string | null;
  reporting_currency_code: string | null;
  reporting_currency_name: string | null;
  reporting_currency_symbol: string | null;
  coa_id: string | null;
  coa_name: string | null;
  coa_code: string | null;
  project_id: string | null;
  project_name: string | null;
  /**
   * System exchange rate - The system-determined exchange rate
   */
  system_exchange_rate: number;
  /**
   * Custom exchange rate - User-provided or system rate if no custom rate
   */
  custom_exchange_rate: number;
  /**
   * Native amount - Amount in the source currency
   */
  native_amount: number;
  /**
   * Reporting amount - Amount converted to reporting currency (native_amount * custom_exchange_rate)
   */
  reporting_amount: number;
  ledger_transaction_id: string | null;
  /**
   * Ledger entry ID - ID of the ledger_entries record (for posted transactions).
   * - Set: ID of the ledger_entries record for this specific line
   * - null: Not applicable (uncategorized or proposed transactions)
   */
  ledger_entry_id: string | null;
  /**
   * Candidate ID - ID of the categorization_candidate (for proposed transactions).
   * - Set: ID of the categorization_candidate that proposes this categorization
   * - null: Not applicable (uncategorized or posted transactions)
   */
  candidate_id: string | null;
  /**
   * Candidate line ID - ID of the categorization_candidate_lines record (for proposed transactions).
   * - Set: ID of the categorization_candidate_lines record for this specific line
   * - null: Not applicable (uncategorized or posted transactions)
   */
  candidate_line_id: string | null;
  confidence: number | null;
  explanation: string | null;
  /**
   * Human reviewed - Whether the transaction has been manually reviewed by a user.
   * Only applicable for posted transactions.
   * - true: Transaction was reviewed by a human
   * - false: Transaction was auto-posted and not yet reviewed
   * - null: Not applicable (uncategorized or proposed transactions)
   */
  human_reviewed: boolean | null;
  /**
   * Categorization candidate ID - ID of the categorization_candidate that was used to create this ledger transaction.
   * Only applicable for posted transactions that came from a candidate.
   * - Set: ID of the categorization_candidate that was posted to create this ledger transaction
   * - null: Transaction was manually posted or not applicable
   *
   * Note: This is different from candidate_id:
   * - candidate_id: The candidate itself (for proposed transactions)
   * - categorization_candidate_id: Which candidate was used to create the ledger transaction (for posted transactions)
   */
  categorization_candidate_id: string | null;
  categorization_status: CategorizationTransactionStatus;
  company_id: string;
  /**
   * Is editable - Whether this transaction can be edited.
   * A transaction is not editable if its fs_date falls within a closed or locked fiscal period.
   */
  is_editable: boolean;
  /**
   * Review notes - Notes added during manual review of the transaction.
   * Only applicable for posted transactions (from ledger_entries.review_notes).
   * - Set: Review notes added by user
   * - null: Not applicable (uncategorized or proposed transactions) or no notes
   */
  review_notes: string | null;
  /**
   * Files - Array of attached files (from transaction_files).
   * Each file object contains file_name and file_id.
   * - Uncategorized: Files attached to bank transaction (source='bank')
   * - Posted: Files attached to ledger transaction or entry (source='ledger')
   * - Empty array: No files attached or not applicable (proposed transactions)
   */
  files: Array<{
    id: string;
    name: string;
    key: string;
    bucket_name: string;
    type: string;
    size_bytes: number;
  }>;
  /**
   * Client reference ID - Client-provided reference ID (e.g., temp-entry-*) for exact matching.
   * Only applicable for posted transactions (extracted from ledger_entries.metadata).
   * - Set: Client reference ID from intent (for temp entries)
   * - null: Not applicable or no client_ref_id in metadata
   */
  client_ref_id?: string | null;
};

// Parameters for getting categorization statistics
export const getCategorizationStatsParams = z
  .object({
    companyId: z.string(),
    bankAccountIds: z.array(z.string()).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasDateFrom = data.dateFrom !== undefined;
    const hasDateTo = data.dateTo !== undefined;

    // If one date is provided, both must be provided
    if (hasDateFrom !== hasDateTo) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Both dateFrom and dateTo must be provided together, or neither',
        path: hasDateFrom ? ['dateTo'] : ['dateFrom'],
      });
      return;
    }

    // If both dates are provided, dateFrom must be <= dateTo
    const dateFrom = data.dateFrom;
    const dateTo = data.dateTo;
    if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
      ctx.addIssue({
        code: 'custom',
        message: 'dateFrom must be less than or equal to dateTo',
        path: ['dateFrom'],
      });
    }
  });
export type GetCategorizationStatsParams = z.infer<
  typeof getCategorizationStatsParams
>;

// Response type for categorization stats
export interface CategorizationStatsResponse {
  totalUncategorized: number;
  totalProposed: number;
  oldestUncategorizedDate: string | null; // YYYY-MM-DD
  newestUncategorizedDate: string | null; // YYYY-MM-DD
  // Only present when dateFrom and dateTo are provided
  uncategorizedInRangeCount?: number;
  proposedInRangeCount?: number;
  hasUncategorizedOutsideRange?: boolean;
  uncategorizedOutsideRangeCount?: number;
}
