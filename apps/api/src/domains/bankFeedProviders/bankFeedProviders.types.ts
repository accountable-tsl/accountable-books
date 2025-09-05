import { z } from 'zod';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';
import { dbBaseFields } from '../../core/types/core.js';

export const bankFeedProviderStatus = z.enum(['active', 'inactive', 'deprecated']);
export type BankFeedProviderStatus = z.infer<typeof bankFeedProviderStatus>;

export const bankProviderKey = z.enum(['plaid', 'mono']); // stripe, teller, enable_banking, yodlee, etc.
export type BankProviderKey = z.infer<typeof bankProviderKey>;

export const bankFeedProviderInput = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(2), // customize min length as needed
  name: z.string(),
  description: z.string().nullish(),
  website: z.string().url().nullish(),
  logo_url: z.string().url().nullish(),
  logo_key: z.string().nullish(),
  status: bankFeedProviderStatus.optional(),
  priority: z.number().int().min(1).optional(),
  external_id: z.string().nullish(),
  created_by_id: z.string().uuid().optional(),
  updated_by_id: z.string().uuid().nullish(),
});
export type BankFeedProviderInput = z.infer<typeof bankFeedProviderInput>;
export type BankFeedProviderInputCamel = SnakeToCamelCaseObject<BankFeedProviderInput>;

export const bankFeedProviderInputCamel = createCamelCaseSchema(bankFeedProviderInput);

export type NewBankFeedProvider = BankFeedProviderInput;
export const bankFeedProvider = bankFeedProviderInput.merge(dbBaseFields);
export type BankFeedProvider = z.infer<typeof bankFeedProvider>;

export const bpcInput = z.object({
  bank_feed_provider_id: z.string().uuid().optional(),
  bank_feed_provider_key: z.string().optional(),

  country_code: z.string().length(2).optional(),
  country_id: z.string().uuid().optional(),

  created_by_id: z.string().uuid().optional(),
  updated_by_id: z.string().uuid().optional(),
});

export type BpcInput = z.infer<typeof bpcInput>;
export type BpcInputCamel = SnakeToCamelCaseObject<BpcInput>;

export const bpcInputCamel = createCamelCaseSchema(bpcInput);

export const newBankFeedProviderCountry = bpcInput.omit({ country_id: true }).extend({
  country_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
});

export type NewBankFeedProviderCountry = z.infer<typeof newBankFeedProviderCountry>;

export const bankFeedProviderCountries = newBankFeedProviderCountry.merge(dbBaseFields).omit({
  country_code: true,
  id: true,
});

export type BankFeedProviderCountries = z.infer<typeof bankFeedProviderCountries>;

export type BankFeedProviderWithCountries = {
  id: string;
  key: BankProviderKey;
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
