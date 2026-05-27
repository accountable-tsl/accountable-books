import { z } from 'zod';

import { bankProviderKey } from './bankFeedProviders/bankFeedProviders.types.js';

export const newCompanyBankCredentialInput = z.object({
  companyId: z.uuid(),
  providerKey: bankProviderKey,
  identifier: z.string().nullable(),
  token: z.string(),
  rawData: z.record(z.string(), z.unknown()).prefault({}),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
  userId: z.uuid(),
});

export type NewCompanyBankCredentialInput = z.infer<
  typeof newCompanyBankCredentialInput
>;
