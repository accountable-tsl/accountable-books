import { z } from "zod";
import { dbBaseFields } from "../../core/types/core";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

export const firmType = z.enum([
  "freelancer",
  "ca_cpa",
  "tax_preparer",
  "international",
]);

export const newAccFirmInput = z.object({
  company_id: z.string().uuid().nullish(),
  slug: z.string().max(20).optional(),
  firm_type: firmType.nullish(),
});

export const newAccFirm = newAccFirmInput.extend({
  company_id: z.string().uuid(),
  slug: z.string().max(20),
});

export const accFirm = newAccFirm.merge(dbBaseFields).omit({ id: true });

export type NewAccFirmInput = z.infer<typeof newAccFirmInput>;
export type NewAccFirm = z.infer<typeof newAccFirm>;
export type AccFirm = z.infer<typeof accFirm>;

export type AccFirmWithId = Omit<AccFirm, "company_id"> & { id: string };
export type AccFirmCamelResponse = SnakeToCamelCaseObject<NewAccFirm>;
