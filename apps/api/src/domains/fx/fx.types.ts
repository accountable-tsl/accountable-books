import type { Knex } from 'knex';
import z from 'zod';

/**
 * Types for FX transaction ID generation
 */
export const fxLotType = z.enum([
  'JRN',
  'LEDGER_TX',
  'CASH',
  'LOAN',
  'LOAN_DRAW',
]);
export type FxLotType = z.infer<typeof fxLotType>;

/**
 * Zod schema for fx_transaction_id input validation
 */
export const fxTransactionIdInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JRN'),
    journalBatchId: z.string().trim().min(1, 'journalBatchId is required'),
  }),
  z.object({
    type: z.literal('LEDGER_TX'),
    ledgerTransactionId: z.uuid('ledgerTransactionId must be a valid UUID'),
  }),
  z.object({
    type: z.literal('CASH'),
    bankAccountId: z.uuid('bankAccountId must be a valid UUID'),
    currencyId: z.uuid('currencyId must be a valid UUID'),
  }),
  z.object({
    type: z.literal('LOAN'),
    loanId: z.string().trim().min(1, 'loanId is required'),
  }),
  z.object({
    type: z.literal('LOAN_DRAW'),
    loanDrawId: z.string().trim().min(1, 'loanDrawId is required'),
  }),
]);

export type FxTransactionIdInput = z.infer<typeof fxTransactionIdInputSchema>;

/**
 * Parameters for determining monetary entries
 */
export interface DetermineMonetaryEntriesParams {
  entries: Array<{
    coa_id: string;
    source_currency_id: string;
    is_monetary?: boolean;
  }>;
  companyId: string;
  reportingCurrencyId: string;
  trx?: Knex.Transaction;
}

/**
 * Result of monetary determination
 */
export interface DetermineMonetaryResult {
  monetaryMap: Map<number, boolean>; // Map of entry index to is_monetary
  monetaryEntries: Array<{
    index: number;
    entry: MonetaryEntry;
  }>;
}

export const fxMovementSourceType = z.enum([
  'ledger_entry',
  'ledger_reversal',
  'ledger_supersession',
  'period_revaluation',
  'manual_adjustment',
]);

/**
 * Zod schema for upserting FX position parameters
 */
export const upsertFxPositionParamsSchema = z.object({
  companyId: z.uuid('companyId must be a valid UUID'),
  fx_transaction_id: z.string().trim().min(1, 'fx_transaction_id is required'),
  account_id: z.uuid('account_id must be a valid UUID'),
  foreign_currency_id: z.uuid('foreign_currency_id must be a valid UUID'),
  source_amount: z.number(),
  amount: z.number(),
  exchange_rate: z.number().positive('exchange_rate must be positive'),
  source_type: fxMovementSourceType,
  source_id: z
    .string()
    .trim()
    .min(1, 'source_id cannot be empty')
    .max(128, 'source_id cannot exceed 128 characters')
    .nullish(),
  ledger_transaction_id: z
    .uuid('ledger_transaction_id must be a valid UUID')
    .nullish(),
  ledger_entry_id: z.uuid('ledger_entry_id must be a valid UUID').nullish(),
  movement_date: z.iso.date(),
  created_by_id: z.uuid('created_by_id must be a valid UUID'),
  movement_type: z
    .enum([
      'opened',
      'increased',
      'partially_settled',
      'fully_settled',
      'revalued',
      'reversed',
      'superseded_reversed',
      'adjusted',
    ])
    .optional(),
  reversal_of_movement_id: z
    .uuid('reversal_of_movement_id must be a valid UUID')
    .nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Parameters for upserting FX position
 */
export interface UpsertFxPositionParams
  extends z.infer<typeof upsertFxPositionParamsSchema> {
  trx: Knex.Transaction;
}

/**
 * Function type for generating fx_transaction_id from an entry
 */
export type FxTransactionIdGenerator = (
  entry: MonetaryEntry,
  context: {
    companyId: string;
    reportingCurrencyId: string;
  },
) => string;

/**
 * Zod schema for monetary entry
 */
export const monetaryEntrySchema = z.object({
  coa_id: z.string().uuid('coa_id must be a valid UUID'),
  source_currency_id: z
    .string()
    .uuid('source_currency_id must be a valid UUID'),
  source_amount: z.number().finite('source_amount must be a finite number'),
  amount: z.number(),
  is_monetary: z.boolean().optional(),
  custom_exchange_rate: z
    .number()
    .positive('custom_exchange_rate must be positive')
    .finite('custom_exchange_rate must be a finite number')
    .optional(),
  system_exchange_rate: z
    .number()
    .positive('system_exchange_rate must be positive')
    .finite('system_exchange_rate must be a finite number')
    .optional(),
});

/**
 * Entry that may need FX tracking
 */
export interface MonetaryEntry extends z.infer<typeof monetaryEntrySchema> {}

/**
 * Zod schema for processing FX positions parameters
 */
export const processFxPositionsParamsSchema = z.object({
  entries: monetaryEntrySchema.array().min(1, 'At least one entry is required'),
  companyId: z.string().uuid('companyId must be a valid UUID'),
  reportingCurrencyId: z
    .string()
    .uuid('reportingCurrencyId must be a valid UUID'),
  movementDate: z.iso.date(),
  createdById: z.uuid('createdById must be a valid UUID'),
  sourceType: fxMovementSourceType.default('manual_adjustment'),
});

/**
 * Parameters for processing FX positions
 */
export interface ProcessFxPositionsParams
  extends z.infer<typeof processFxPositionsParamsSchema> {
  fxTransactionIdGenerator: FxTransactionIdGenerator;
  trx: Knex.Transaction;
}

/**
 * Result of processing FX positions
 */
export interface ProcessFxPositionsResult {
  positionsCreated: number;
  positionsUpdated: number;
  positionsClosed: number;
}

export const reverseFxPositionMovementsParamsSchema = z.object({
  companyId: z.uuid('companyId must be a valid UUID'),
  ledgerTransactionId: z.uuid('ledgerTransactionId must be a valid UUID'),
  reversingLedgerTransactionId: z
    .uuid('reversingLedgerTransactionId must be a valid UUID')
    .nullish(),
  movementDate: z.iso.date(),
  createdById: z.uuid('createdById must be a valid UUID'),
  movementType: z.enum(['reversed', 'superseded_reversed']),
});

export interface ReverseFxPositionMovementsParams
  extends z.infer<typeof reverseFxPositionMovementsParamsSchema> {
  trx: Knex.Transaction;
}
