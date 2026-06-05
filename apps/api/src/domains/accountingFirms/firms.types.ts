import { z } from 'zod';

import { dbBaseFields, dbUserAuditFields } from '../../core/types/core.js';
import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const firmType = z.enum([
  'freelancer',
  'ca_cpa',
  'tax_preparer',
  'international',
]);

export const newAccFirmInput = z.object({
  company_id: z.uuid().nullish(),
  slug: z.string().max(20).optional(),
  firm_type: firmType.nullish(),
});

export const newAccFirm = newAccFirmInput.extend({
  company_id: z.uuid(),
  slug: z.string().max(20),
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  deleted_by_id: z.uuid().nullish(),
});

export const accFirm = newAccFirm
  .merge(dbUserAuditFields)
  .merge(dbBaseFields)
  .omit({ id: true });

export type NewAccFirmInput = z.infer<typeof newAccFirmInput>;
export type NewAccFirm = z.infer<typeof newAccFirm>;
export type AccFirm = z.infer<typeof accFirm>;

export type AccFirmWithId = Omit<AccFirm, 'company_id'> & { id: string };
export type AccFirmCamelResponse = SnakeToCamelCaseObject<NewAccFirm>;
