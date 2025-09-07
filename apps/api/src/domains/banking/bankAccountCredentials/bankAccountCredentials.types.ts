import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from 'src/shared/utils/formatting.utils.js';
import z from 'zod';

export const bankAccountCredentialStatus = z.enum(['active', 'expired', 'revoked']);
export type BankAccountCredentialStatus = z.infer<typeof bankAccountCredentialStatus>;

const newCredentialInput = z.object({
  id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  item_identifier: z.string().nullish(),
  access_token: z.string(),
  refresh_token: z.string().nullish(),
  institution_id: z.string().nullish(),
  institution_name: z.string().nullish(),
  raw_metadata: z.record(z.unknown()),
  status: bankAccountCredentialStatus,
  connected_at: z.date().optional(),
  connected_by: z.string().uuid().optional(),
  expires_at: z.date().optional(),
  updated_by: z.string().uuid().optional(),
});

export const newBankAccountCredentialInput = createCamelCaseSchema(newCredentialInput);
export type NewBankAccountCredentialInput = SnakeToCamelCaseObject<
  z.infer<typeof newCredentialInput>
>;

const newBankAccountCredential = newCredentialInput
  .omit({ access_token: true, refresh_token: true })
  .extend({
    company_id: z.string().uuid(),
    encrypted_access_token: z.string(),
    encrypted_refresh_token: z.string().nullish(),
    connected_by: z.string().uuid(),
  });

export type NewBankAccountCredential = z.infer<typeof newBankAccountCredential>;
export type BankAccountCredential = z.infer<typeof newBankAccountCredential>;
