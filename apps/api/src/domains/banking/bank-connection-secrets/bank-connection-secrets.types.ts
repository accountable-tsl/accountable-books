import { z } from 'zod';

/** Restricted token store — ordinary connection reads must not select these. */
export const newBankConnectionSecret = z.object({
  id: z.uuid().optional(),
  bank_connection_id: z.uuid(),
  encrypted_access_token: z.string().min(1),
  encrypted_refresh_token: z.string().min(1).nullish(),
  encryption_key_version: z.number().int().min(1),
  rotated_at: z.date().optional(),
});
export type NewBankConnectionSecret = z.infer<typeof newBankConnectionSecret>;

export const bankConnectionSecret = newBankConnectionSecret.extend({
  id: z.uuid(),
  rotated_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type BankConnectionSecret = z.infer<typeof bankConnectionSecret>;
