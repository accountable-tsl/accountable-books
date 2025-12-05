import z from 'zod';

import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../../shared/utils/formatting.utils.js';

export const bankAccountCredentialStatus = z.enum([
  'active',
  'expired',
  'revoked',
]);
export type BankAccountCredentialStatus = z.infer<
  typeof bankAccountCredentialStatus
>;

const newCredentialInput = z.object({
  id: z.uuid().optional(),
  provider_id: z.uuid(),
  item_identifier: z.string().nullable(),
  access_token: z.string(),
  refresh_token: z.string().nullish(),
  institution_id: z.string().nullish(),
  institution_name: z.string().nullish(),
  raw_metadata: z.record(z.string(), z.unknown()),
  status: bankAccountCredentialStatus,
  connected_at: z.date().optional(),
  connected_by: z.uuid().optional(),
  expires_at: z.date().optional(),
  updated_by: z.uuid().optional(),

  sync_cursor: z.string().nullish(),
  sync_state: z.record(z.string(), z.any()).optional(),
  initial_sync_completed: z.boolean().optional(),
  transactions_from_date: z.date().nullish(),
  last_transactions_sync_at: z.date().nullish(),
});

export const newBankAccountCredentialInput =
  createCamelCaseSchema(newCredentialInput);
export type NewBankAccountCredentialInput = SnakeToCamelCaseObject<
  z.infer<typeof newCredentialInput>
>;

const newBankAccountCredential = newCredentialInput
  .omit({ access_token: true, refresh_token: true })
  .extend({
    company_id: z.uuid(),
    encrypted_access_token: z.string(),
    encrypted_refresh_token: z.string().nullish(),
    connected_by: z.uuid(),
  });

export type NewBankAccountCredential = z.infer<typeof newBankAccountCredential>;
const bankAccountCredential = newBankAccountCredential.extend({
  id: z.uuid(),
});
export type BankAccountCredential = z.infer<typeof bankAccountCredential>;
