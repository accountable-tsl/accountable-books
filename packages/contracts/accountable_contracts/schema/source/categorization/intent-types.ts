import { z } from 'zod';

import { contactType } from '../common/enums.js';
import { categorizationTransactionStatus } from './categorization.js';

import type { CategorizationTransactionStatus } from './categorization.js';

export const YMD_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const dataMutationIntent = z.enum([
  'ASSIGN_COA',
  'UPDATE_DESCRIPTION',
  'UPDATE_FS_DATE',
  'UPDATE_CONTACT',
  'UPDATE_REFERENCE',
  'UPDATE_PROJECT',
]);
export type DataMutationIntent = z.infer<typeof dataMutationIntent>;

export const actionIntent = z.enum([
  'UPDATE_FX_RATE',
  'POST_TO_LEDGER',
  'SPLIT_TRANSACTION',
]);
export type ActionIntent = z.infer<typeof actionIntent>;

export const intentActionType = z.enum([
  ...dataMutationIntent.options,
  ...actionIntent.options,
]);

export type IntentActionType = z.infer<typeof intentActionType>;

/**
 * -----------------------------
 * Payload Schemas (Zod)
 * -----------------------------
 * These schemas serve two purposes:
 * 1. Runtime validation before emitting intent
 * 2. Source of truth for TypeScript inference
 */

/** Decision intents */

const assignCoaPayload = z.object({
  entryId: z.string().min(1),
  coaId: z.string().min(1),
});

const postToLedgerPayload = z.object({
  bankTransactionId: z.string().min(1),
});

/** State intents */
const intentScope = z.enum(['entry', 'group']);
export type IntentScope = z.infer<typeof intentScope>;

const updateDescriptionPayload = z.object({
  scope: 'entry',
  entryId: z.string().optional(),
  value: z.string(),
});

const updateFsDatePayload = z.object({
  scope: 'entry',
  entryId: z.string().optional(),
  fsDate: z.string().regex(YMD_REGEX), // YYYY-MM-DD
});

const updateContactPayload = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  contactId: z.string().nullable(),
  contactType: contactType.nullish(),
});

const updateReferencePayload = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  reference: z.string(),
});

const updateProjectPayload = z.object({
  entryId: z.string().min(1),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
});

const updateFxRatePayload = z.object({
  bankTransactionId: z.string().min(1),
  rate: z.number().positive(),
});

const splitTransactionPayload = z.object({
  entries: z
    .array(
      z.object({
        entryId: z.uuid().optional(),
        coaId: z.uuid(),
        description: z.string(),
        amount: z.number().positive(),
      }),
    )
    .min(2),
});

/**
 * -----------------------------
 * Intent Payload Map (TS)
 * -----------------------------
 */

export const intentPayloadMap = z.object({
  ASSIGN_COA: assignCoaPayload,
  UPDATE_DESCRIPTION: updateDescriptionPayload,
  UPDATE_FS_DATE: updateFsDatePayload,
  UPDATE_CONTACT: updateContactPayload,
  UPDATE_REFERENCE: updateReferencePayload,
  UPDATE_PROJECT: updateProjectPayload,
  UPDATE_FX_RATE: updateFxRatePayload,
  POST_TO_LEDGER: postToLedgerPayload,
  SPLIT_TRANSACTION: splitTransactionPayload,
});

export type IntentPayloadMap = z.infer<typeof intentPayloadMap>;

/**
 * -----------------------------
 * Intent Interface
 * -----------------------------
 */

export interface Intent<T extends IntentActionType = IntentActionType> {
  intent_id: string; // UUID, idempotency key
  intent_key: string; // semantic deduplication key
  bank_transaction_id: string;
  action_type: T;
  payload: IntentPayloadMap[T];
  client_version: number;
  categorization_status: CategorizationTransactionStatus;
}

/**
 * -----------------------------
 * Helpers
 * -----------------------------
 */

/**
 * Build semantic intent key.
 *
 * Examples:
 * - UPDATE_DESCRIPTION:entry_123
 * - UPDATE_DESCRIPTION:group
 * - UPDATE_FX_RATE:bank_tx_456
 */
export function buildIntentKey(
  action: IntentActionType,
  scopeId: string,
): string {
  return `${action}:${scopeId}`;
}

/**
 * Runtime validation helper.
 * Call this before enqueueing an intent.
 */
export function validateIntentPayload<T extends IntentActionType>(
  action: T,
  payload: unknown,
): payload is IntentPayloadMap[T] {
  const schema = intentPayloadMap.shape[action];
  return schema.safeParse(payload).success;
}

export const categorizationIntent = z.object({
  intent_id: z.uuid(),
  intent_key: z.string(),
  bank_transaction_id: z.uuid(),
  action_type: intentActionType,
  payload: z.union([
    assignCoaPayload,
    updateDescriptionPayload,
    updateFsDatePayload,
    updateContactPayload,
    updateReferencePayload,
    updateProjectPayload,
    updateFxRatePayload,
    postToLedgerPayload,
    splitTransactionPayload,
  ]),
  client_version: z.int().positive(),
  categorization_status: categorizationTransactionStatus,
});

export type CategorizationIntent = z.infer<typeof categorizationIntent>;
