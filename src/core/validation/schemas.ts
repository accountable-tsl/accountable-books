import Decimal from "decimal.js";
import { z } from "zod";

export const nodeEnv = z.enum([
  "test",
  "local",
  "docker.dev",
  "staging",
  "production",
]);
export type NodeEnv = z.infer<typeof nodeEnv>;

//Custom decimal handler
export const DecimalInput = z.union([
  z.string(),
  z.number(),
  z.instanceof(Decimal),
]);

export const DecimalSchema = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((val) => new Decimal(val.toString()));

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
