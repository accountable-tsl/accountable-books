import { z } from 'zod';

import type { CategorizationTransactionStatus } from './types';

export enum IntentActionType {
  ASSIGN_ACCOUNT = 'ASSIGN_ACCOUNT',
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

const assignAccountPayloadSchema = z.object({
  entryId: z.string().min(1),
  coaId: z.string().min(1),
});

const postToLedgerPayloadSchema = z.object({
  bankTransactionId: z.string().min(1),
});

/** State intents */
const intentScope = z.enum(['entry', 'group']);
export type IntentScope = z.infer<typeof intentScope>;

const updateDescriptionPayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  value: z.string(),
});

const updateFsDatePayloadSchema = z.object({
  scope: intentScope,
  entryId: z.string().optional(),
  fsDate: z.string(), // ISO date string
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

/**
 * -----------------------------
 * Intent Payload Map (TS)
 * -----------------------------
 */

export interface IntentPayloadMap {
  [IntentActionType.ASSIGN_ACCOUNT]: z.infer<typeof assignAccountPayloadSchema>;

  [IntentActionType.UPDATE_DESCRIPTION]: z.infer<
    typeof updateDescriptionPayloadSchema
  >;

  [IntentActionType.UPDATE_FS_DATE]: z.infer<typeof updateFsDatePayloadSchema>;

  [IntentActionType.UPDATE_CONTACT]: z.infer<typeof updateContactPayloadSchema>;

  [IntentActionType.UPDATE_REFERENCE]: z.infer<
    typeof updateReferencePayloadSchema
  >;

  [IntentActionType.UPDATE_PROJECT]: z.infer<typeof updateProjectPayloadSchema>;

  [IntentActionType.UPDATE_FX_RATE]: z.infer<typeof updateFxRatePayloadSchema>;

  [IntentActionType.POST_TO_LEDGER]: z.infer<typeof postToLedgerPayloadSchema>;
}

/**
 * -----------------------------
 * Intent Schema Map
 * -----------------------------
 * Used for runtime validation by action type
 */

export const IntentPayloadSchemaMap = {
  [IntentActionType.ASSIGN_ACCOUNT]: assignAccountPayloadSchema,
  [IntentActionType.UPDATE_DESCRIPTION]: updateDescriptionPayloadSchema,
  [IntentActionType.UPDATE_FS_DATE]: updateFsDatePayloadSchema,
  [IntentActionType.UPDATE_CONTACT]: updateContactPayloadSchema,
  [IntentActionType.UPDATE_REFERENCE]: updateReferencePayloadSchema,
  [IntentActionType.UPDATE_PROJECT]: updateProjectPayloadSchema,
  [IntentActionType.UPDATE_FX_RATE]: updateFxRatePayloadSchema,
  [IntentActionType.POST_TO_LEDGER]: postToLedgerPayloadSchema,
} as const;

/**
 * -----------------------------
 * Intent Interface
 * -----------------------------
 */

export interface Intent<T extends IntentActionType = IntentActionType> {
  intent_id: string; // UUID, idempotency key
  intent_key: string; // semantic deduplication key
  transaction_id: string;
  action_type: T;
  payload: IntentPayloadMap[T];
  client_version: number;
  transaction_state: CategorizationTransactionStatus;
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
