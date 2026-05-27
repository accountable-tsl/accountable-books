import { z } from 'zod';

import { toDate, toYMD } from '../../shared/utils/date.utils.js';

export const nodeEnv = z.enum(['local', 'staging', 'production', 'test']);
export type NodeEnv = z.infer<typeof nodeEnv>;

//Custom decimal handler
const decimalInput = z.union([z.string(), z.number()]);

export const decimalSchema = decimalInput.transform((val) => Number(val));

// Base
export const dbStandardFields = z.object({
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.date().nullish(),
});
export type StandardFields = z.infer<typeof dbStandardFields>;

export const dbBaseFields = z
  .object({ id: z.uuid() })
  .extend(dbStandardFields.shape);

export const zDate = z.preprocess((val) => {
  if (
    typeof val === 'string' ||
    typeof val === 'number' ||
    val instanceof Date
  ) {
    const date = toDate(val, 'keep');
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}, z.date());

export const zDateYMD = z.preprocess((val) => {
  if (
    typeof val === 'string' ||
    val instanceof Date ||
    typeof val === 'number'
  ) {
    return toYMD(val);
  }
  return undefined;
}, z.string());

export const zEmail = () =>
  z.email().transform((email) => email.trim().toLowerCase());

export const debitCredit = z.enum(['debit', 'credit']);
export type DebitCredit = z.infer<typeof debitCredit>;

// export const categorizationStatus = z.enum([
//   'uncategorized',
//   'proposed',
//   'accepted',
//   'rejected',
//   'posted',
// ]);
// export type CategorizationStatus = z.infer<typeof categorizationStatus>;
