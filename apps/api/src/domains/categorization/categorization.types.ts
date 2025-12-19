import z from 'zod';

export const txnCategorizationSource = z.enum([
  'rule',
  'ml',
  'ml_heuristic',
  'manual',
  // 'enrichment',
]);
export type TxnCategorizationSource = z.infer<typeof txnCategorizationSource>;

// Categorization transaction status
export const categorizationTransactionStatus = z.enum([
  'uncategorized',
  'proposed',
  'posted',
]);
export type CategorizationTransactionStatus = z.infer<
  typeof categorizationTransactionStatus
>;

// Categorization transaction from the view
export interface CategorizationTransaction {
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
}

// Parameters for getting categorization transactions
export const getCategorizationTransactionsParams = z.object({
  companyId: z.string(),
  dateFrom: z.date(),
  dateTo: z.date(),
  status: categorizationTransactionStatus.optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
});
export type GetCategorizationTransactionsParams = z.infer<
  typeof getCategorizationTransactionsParams
>;

// Response type
export interface GetCategorizationTransactionsResponse {
  transactions: CategorizationTransaction[];
  total: number;
  limit: number;
  offset: number;
}

// Intent types for autosave
export const intentActionType = z.enum([
  'ASSIGN_ACCOUNT',
  'UPDATE_DESCRIPTION',
  'UPDATE_FS_DATE',
  'UPDATE_CONTACT',
  'UPDATE_REFERENCE',
  'UPDATE_PROJECT',
  'UPDATE_FX_RATE',
  'POST_TO_LEDGER',
]);
export type IntentActionType = z.infer<typeof intentActionType>;

export const intentScope = z.enum(['entry', 'group']);
export type IntentScope = z.infer<typeof intentScope>;

// Intent payload schemas
const assignAccountPayloadSchema = z.object({
  entryId: z.string().min(1),
  coaId: z.string().min(1),
});

const updateDescriptionPayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  value: z.string(),
});

const updateFsDatePayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  fsDate: z.string(),
});

const updateContactPayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
});

const updateReferencePayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  reference: z.string(),
});

const updateProjectPayloadSchema = z.object({
  entryId: z.string().min(1),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
});

const updateFxRatePayloadSchema = z.object({
  bankTransactionId: z.string().min(1),
  rate: z.number().positive(),
});

const postToLedgerPayloadSchema = z.object({
  bankTransactionId: z.string().min(1),
});

// Intent schema
export const categorizationIntentSchema = z.object({
  intent_id: z.uuid(),
  intent_key: z.string(),
  transaction_id: z.uuid(),
  action_type: intentActionType,
  payload: z.union([
    assignAccountPayloadSchema,
    updateDescriptionPayloadSchema,
    updateFsDatePayloadSchema,
    updateContactPayloadSchema,
    updateReferencePayloadSchema,
    updateProjectPayloadSchema,
    updateFxRatePayloadSchema,
    postToLedgerPayloadSchema,
  ]),
  client_version: z.number().int().positive(),
  transaction_state: categorizationTransactionStatus,
});

export type CategorizationIntent = z.infer<typeof categorizationIntentSchema>;
