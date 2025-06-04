import { z } from "zod";
import { dbBaseFields } from "../../core/validation/schemas";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";

export const newBank = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Bank name is required"),
  logo_url: z.string().url().optional(),
  logo_key: z.string().optional(),
  country_id: z.string().uuid(),
  created_by_id: z.string().uuid().optional(),
});
export type NewBank = z.infer<typeof newBank>;
export type NewBankCamel = SnakeToCamelCaseObject<NewBank>;
export type NewInput = NewBank | NewBankCamel;

export const bank = newBank.merge(dbBaseFields);
export type Bank = z.infer<typeof bank>;
