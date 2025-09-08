import { z } from 'zod';
import { dbBaseFields } from '../../../core/types/core.js';
import { type SnakeToCamelCaseObject } from '../../../shared/utils/formatting.utils.js';

export const bankLocalCodeType = z.enum([
  'sort_code',
  'routing',
  'bank_code',
  'ifsc',
  'blz',
  'zengin_code',
  'cnaps',
]);
export type BankLocalCodeType = z.infer<typeof bankLocalCodeType>;

const countryId = z.uuid();
const countryCode = z
  .string()
  .length(2, 'Country code must be exactly 2 characters')
  .regex(/^[A-Za-z]{2}$/, 'Country code must be exactly 2 letters')
  .transform((val) => val.toUpperCase());

export const newBankInput = z.object({
  id: z.uuid().optional(),
  display_name: z.string().min(1, 'Bank name is required'),
  official_name: z.string().nullish(),
  key: z
    .string()
    .min(1, 'Bank key is required')
    .transform((val) => val.toLowerCase())
    .refine((val) => /^[a-z]{2}_[a-z0-9_]+$/.test(val), {
      error:
        "Bank key must start with 2-letter country code followed by underscore (e.g., 'ng_bank_name')",
    }),

  country: z.union([countryId, countryCode]),
  swift_code: z.string().nullish(),
  local_code: z.string().nullish(),
  local_code_type: z.string().nullish(),
  secondary_reference: z.string().nullish(),
  website: z.string().nullish(),

  logo_url: z.string().nullish(),
  logo_key: z.string().nullish(),
  raw_data: z.any().nullish(),
});
export type NewBankInput = z.infer<typeof newBankInput>;
export type NewBankInputCamel = SnakeToCamelCaseObject<NewBankInput>;
export type NewInput = NewBankInput | NewBankInputCamel;

export const newBank = newBankInput.omit({ country: true }).extend({
  country_id: z.uuid(),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().optional(),
});
export type NewBank = z.infer<typeof newBank>;

export const bank = newBank.merge(dbBaseFields);
export type Bank = z.infer<typeof bank>;

export type FetchBanksResponse = Omit<NewBankInputCamel, 'country'> & {
  countryId: string | null;
  countryCode: string | null;
  countryName: string | null;
  countryFlag: string | null;
};

export const fetchBanksOptions = z.object({
  id: z.uuid().optional(),
  key: z.string().optional(),
  countryId: countryId.optional(),
  countryCode: countryCode.optional(),
});

export type FetchBanksOptions = z.infer<typeof fetchBanksOptions>;
