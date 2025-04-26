import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";

export const coaSource = z.enum(["users", "system", "template"]);
export type CoaSource = z.infer<typeof coaSource>;
// coa
export const newCoa = z.object({
  company_id: z.string().uuid(),
  name: z.string().max(256),
  account_type_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  created_by_id: z.string().uuid(),
  is_active: z.boolean().default(true),
  code: z.string().max(256).nullish(),
  description: z.string().max(512).nullish(),
  locked: z.boolean().default(false).nullish(),
  source: coaSource.nullish(),
});
export const coa = newCoa.merge(dbBaseFields);

export type NewCoa = z.infer<typeof newCoa>;
export type Coa = z.infer<typeof coa>;
