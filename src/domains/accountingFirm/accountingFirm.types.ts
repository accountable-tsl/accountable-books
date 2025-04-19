import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";

const firmType = z.enum([
  "freelancer",
  "ca_cpa",
  "tax_preparer",
  "international",
]);

export const newAccFirmInput = z.object({
  id: z.string().uuid().optional(),
  legal_name: z.string().max(256),
  country_id: z.string().uuid(),
  company_id: z.string().uuid().nullish(),
  created_by_id: z.string().uuid().nullish(),

  display_name: z.string().max(256).optional(),
  short_code: z.string().max(50).optional(),
  firm_type: firmType.nullish(),
  firm_size: z.string().max(50).nullish(),
  website: z.string().max(256).nullish(),
  revenue: z.string().max(50).nullish(),
  logo_url: z.string().max(256).nullish(),
});
export const newAccFirm = newAccFirmInput.extend({
  company_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
});
export const accFirm = newAccFirm.merge(dbBaseFields);

export type NewAccFirmInput = z.infer<typeof newAccFirmInput>;
export type NewAccFirm = z.infer<typeof newAccFirm>;
export type AccFirm = z.infer<typeof accFirm>;
