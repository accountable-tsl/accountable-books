import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

export const bankLocalCodeType = z.enum([
  "sort_code",
  "routing",
  "bank_code",
  "ifsc",
  "blz",
  "zengin_code",
  "cnaps",
]);
export type BankLocalCodeType = z.infer<typeof bankLocalCodeType>;

export const newBank = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1, "Bank name is required"),
  official_name: z.string().min(1, "Bank official name is required"),
  key: z
    .string()
    .min(1, "Bank key is required")
    .transform((val) => val.toLowerCase()),
  country_id: z.string().uuid(),

  swift_code: z.string().nullish(),
  local_code: z.string().nullish(),
  local_code_type: z.string().nullish(),
  website: z.string().nullish(),

  logo_url: z.string().nullish(),

  logo_key: z.string().nullish(),

  created_by_id: z.string().uuid().optional(),
});
export type NewBank = z.infer<typeof newBank>;
export type NewBankCamel = SnakeToCamelCaseObject<NewBank>;
export type NewInput = NewBank | NewBankCamel;

export const bank = newBank.merge(dbBaseFields);
export type Bank = z.infer<typeof bank>;

export type FetchBanksResponse = NewBankCamel & {
  countryCode: string | null;
  countryName: string | null;
  countryFlag: string | null;
};

export const fetchBanksOptions = z.object({
  id: z.string().uuid().optional(),
  key: z.string().optional(),
  countryId: z.string().uuid().optional(),
  countryCode: z.string().length(2).optional(),
});

export type FetchBanksOptions = z.infer<typeof fetchBanksOptions>;
