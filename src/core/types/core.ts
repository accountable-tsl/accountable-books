import Decimal from "decimal.js";
import { z } from "zod";

export const nodeEnv = z.enum([
  "test",
  "local",
  "docker",
  "staging",
  "production",
]);
export type NodeEnv = z.infer<typeof nodeEnv>;

//Custom decimal handler
const decimalInput = z.union([z.string(), z.number(), z.instanceof(Decimal)]);

export const decimalSchema = decimalInput.transform((val) => new Decimal(val));

// Base
export const dbStandardFields = z.object({
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().optional(),
});
export type StandardFields = z.infer<typeof dbStandardFields>;

export const dbBaseFields = z
  .object({ id: z.string().uuid() })
  .merge(dbStandardFields);

export const zDate = z.preprocess((val) => {
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    val instanceof Date
  ) {
    const date = new Date(val);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}, z.date());

export const zEmail = () =>
  z
    .string()
    .email()
    .transform((email) => email.trim().toLowerCase());

export const debitCredit = z.enum(["debit", "credit"]);
export type DebitCredit = z.infer<typeof debitCredit>;

export const categorizationStatus = z.enum([
  "uncategorized",
  "suggested",
  "reviewed",
]);
export type CategorizationStatus = z.infer<typeof categorizationStatus>;
