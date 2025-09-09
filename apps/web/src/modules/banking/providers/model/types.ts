import z from 'zod';

export const bankProviderKey = z.enum(['plaid', 'mono']);
export type BankProviderKey = z.infer<typeof bankProviderKey>;

export interface BankProvider {
  id: string;
  key: BankProviderKey;
  name: string;
  logo: string;
  countries: string[];
}

export interface ProviderSelectionResult {
  type: 'auto-direct' | 'show-selection' | 'csv-fallback';
  provider?: BankProvider;
  providers?: BankProvider[];
}
