import { isValidFirmSlug } from '@accountable-books/utils/firm-slugs';
import { z } from 'zod';

import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const firmType = z.enum([
  'freelancer',
  'ca_cpa',
  'tax_preparer',
  'international',
]);

export const firmSlug = z
  .string()
  .trim()
  .refine(
    isValidFirmSlug,
    'Slug must be 3-20 lowercase letters, optionally separated by single hyphens',
  );

export const newAccFirmInput = z.object({
  company_id: z.uuid().nullish(),
  slug: firmSlug.optional(),
  firm_type: firmType.nullish(),
});

export const newAccFirm = newAccFirmInput.extend({
  company_id: z.uuid(),
  slug: firmSlug,
  created_by_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
});

export const accFirm = newAccFirm.extend({
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type NewAccFirmInput = z.infer<typeof newAccFirmInput>;
export type NewAccFirm = z.infer<typeof newAccFirm>;
export type AccFirm = z.infer<typeof accFirm>;

export type AccFirmWithId = Omit<AccFirm, 'company_id'> & { id: string };
export type AccFirmCamelResponse = SnakeToCamelCaseObject<NewAccFirm>;
