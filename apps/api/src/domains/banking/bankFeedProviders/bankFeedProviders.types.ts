import z from 'zod';

import { dbBaseFields } from '../../../core/types/core.js';
import { createCamelCaseSchema } from '../../../shared/utils/formatting.utils.js';

import type { SnakeToCamelCaseObject } from '../../../shared/utils/formatting.utils.js';

export const bankFeedProviderStatus = z.enum([
  'active',
  'inactive',
  'deprecated',
]);
export type BankFeedProviderStatus = z.infer<typeof bankFeedProviderStatus>;

export const bankProviderKey = z.enum(['plaid', 'mono']); // stripe, teller, enable_banking, yodlee, etc.
export type BankProviderKey = z.infer<typeof bankProviderKey>;

const bankFeedProviderInput = z.object({
  id: z.uuid().optional(),
  key: bankProviderKey,
  display_name: z.string().trim().min(1).max(128),
  description: z.string().max(512).nullish(),
  website: z.url().nullish(),
  logo_url: z.url().nullish(),
  status: bankFeedProviderStatus.optional(),
  created_by_id: z.uuid().optional(),
  updated_by_id: z.uuid().nullish(),
  countries: z.array(z.string().length(2)),
});

export const bankFeedProviderInputCamel = createCamelCaseSchema(
  bankFeedProviderInput,
);
export type BankFeedProviderInputCamel = SnakeToCamelCaseObject<
  z.infer<typeof bankFeedProviderInput>
>;

const newBankFeedProvider = bankFeedProviderInput.omit({ countries: true });
export type NewBankFeedProvider = z.infer<typeof newBankFeedProvider>;

const bankFeedProvider = z.object({
  ...newBankFeedProvider.shape,
  ...dbBaseFields.shape,
});
export type BankFeedProvider = z.infer<typeof bankFeedProvider>;

const newBankFeedProviderCountry = z.object({
  bank_feed_provider_id: z.uuid(),
  country_id: z.uuid(),
  active: z.boolean().optional(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});
export type NewBankFeedProviderCountry = z.infer<
  typeof newBankFeedProviderCountry
>;

export const bankFeedProviderCountries = z.object({
  ...newBankFeedProviderCountry.shape,
  active: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
export type BankFeedProviderCountries = z.infer<
  typeof bankFeedProviderCountries
>;

export interface RawBankFeedProviderResponse {
  id: string;
  key: BankProviderKey;
  name: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  status: BankFeedProviderStatus;
  countryId: string;
  countryCode: string;
}
export type BankFeedProviderWithCountries = {
  id: string;
  key: BankProviderKey;
  name: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  status: BankFeedProviderStatus;
  countries: Array<{ id: string; code: string }>;
};

export const updateProviderInput = z
  .object({
    display_name: z.string().trim().min(1).max(128),
    description: z.string().max(512),
    website: z.url(),
    logo_url: z.url(),
    status: bankFeedProviderStatus,
    new_countries: z.array(z.string().length(2)), // add new countries
    disable_countries: z.array(z.string().length(2)), // mark certain countries as inactive
  })
  .partial();
export type UpdateProviderInput = z.infer<typeof updateProviderInput>;
