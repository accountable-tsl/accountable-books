import { z } from 'zod';

import { YMD_REGEX } from '@/shared/utils/date-utils';

import type { CategorizationTransactionStatus } from './types';

export enum IntentActionType {
  ASSIGN_COA = 'ASSIGN_COA',
  UPDATE_DESCRIPTION = 'UPDATE_DESCRIPTION',
  UPDATE_FS_DATE = 'UPDATE_FS_DATE',
  UPDATE_CONTACT = 'UPDATE_CONTACT',
  UPDATE_REFERENCE = 'UPDATE_REFERENCE',
  UPDATE_PROJECT = 'UPDATE_PROJECT',
  UPDATE_FX_RATE = 'UPDATE_FX_RATE',
  POST_TO_LEDGER = 'POST_TO_LEDGER',
}

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
  scope: intentScope,
  entryId: z.string().optional(),
  value: z.string(),
});

const updateFsDatePayload = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  fsDate: z.regex(YMD_REGEX), //
});

const updateContactPayload = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
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

/**
 * -----------------------------
 * Intent Payload Map (TS)
 * -----------------------------
 */

export interface IntentPayloadMap {
  [IntentActionType.ASSIGN_COA]: z.infer<typeof assignCoaPayload>;

  [IntentActionType.UPDATE_DESCRIPTION]: z.infer<
    typeof updateDescriptionPayload
  >;

  [IntentActionType.UPDATE_FS_DATE]: z.infer<typeof updateFsDatePayload>;

  [IntentActionType.UPDATE_CONTACT]: z.infer<typeof updateContactPayload>;

  [IntentActionType.UPDATE_REFERENCE]: z.infer<typeof updateReferencePayload>;

  [IntentActionType.UPDATE_PROJECT]: z.infer<typeof updateProjectPayload>;

  [IntentActionType.UPDATE_FX_RATE]: z.infer<typeof updateFxRatePayload>;

  [IntentActionType.POST_TO_LEDGER]: z.infer<typeof postToLedgerPayload>;
}

/**
 * -----------------------------
 * Intent Schema Map
 * -----------------------------
 * Used for runtime validation by action type
 */

export const IntentPayloadSchemaMap = {
  [IntentActionType.ASSIGN_COA]: assignCoaPayload,
  [IntentActionType.UPDATE_DESCRIPTION]: updateDescriptionPayload,
  [IntentActionType.UPDATE_FS_DATE]: updateFsDatePayload,
  [IntentActionType.UPDATE_CONTACT]: updateContactPayload,
  [IntentActionType.UPDATE_REFERENCE]: updateReferencePayload,
  [IntentActionType.UPDATE_PROJECT]: updateProjectPayload,
  [IntentActionType.UPDATE_FX_RATE]: updateFxRatePayload,
  [IntentActionType.POST_TO_LEDGER]: postToLedgerPayload,
} as const;

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
  const schema = IntentPayloadSchemaMap[action];
  return schema.safeParse(payload).success;
}
