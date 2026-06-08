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
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  status: BankFeedProviderStatus;
  countries: { id: string; code: string }[];
};
