import { z } from 'zod';

export const bankFeedProviderStatus = z.enum([
  'active',
  'inactive',
  'deprecated',
]);
export type BankFeedProviderStatus = z.infer<typeof bankFeedProviderStatus>;
export type BankFeedProvider = {
  id: string;
  key: string;
  name: string;
  description: string;
  website: string;
  logoUrl: string;
  logoKey: string;
  status: BankFeedProviderStatus;
  priority: number;
  externalId: string;
  countries: { id: string; code: string }[];
};
