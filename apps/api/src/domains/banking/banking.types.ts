import { z } from 'zod';

export const newCompanyBankCredentialInput = z.object({
  companyId: z.string().uuid(),
  providerKey: z.string(),
  identifier: z.string().nullable(),
  token: z.string(),
  rawData: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
  userId: z.string().uuid(),
});

export type NewCompanyBankCredentialInput = z.infer<typeof newCompanyBankCredentialInput>;
