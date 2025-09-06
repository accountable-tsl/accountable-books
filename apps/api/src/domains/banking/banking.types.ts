import { z } from 'zod';
import { bankProviderKey } from '../bankFeedProviders/bankFeedProviders.types.js';

export const newCompanyBankCredentialInput = z.object({
  companyId: z.string().uuid(),
  providerKey: bankProviderKey,
  identifier: z.string().nullable(),
  token: z.string(),
  rawData: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
  userId: z.string().uuid(),
});

export type NewCompanyBankCredentialInput = z.infer<typeof newCompanyBankCredentialInput>;
