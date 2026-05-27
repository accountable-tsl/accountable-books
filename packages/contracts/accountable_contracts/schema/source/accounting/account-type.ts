import { z } from 'zod';

import { labelRole } from '../common/enums.js';

export const newAccountType = z.object({
  id: z.uuid(),
  key: z.string().max(64),
  label: z.string().max(256),
  description: z.string().max(512).nullish(),
  account_element_id: z.uuid(),
  report_code: z
    .string()
    .regex(
      /^(BS|IS)(\.[A-Z]{3}){3,4}$/,
      'Report code must follow BS|IS.XXX.XXX.XXX or BS|IS.XXX.XXX.XXX.XXX format',
    )
    .max(64),
  default_monetary: z.boolean().default(false).optional(),
  trainable: z.boolean().default(false),
  is_contra: z.boolean().default(false).optional(),
  is_postable_control: z.boolean().default(false).optional(),
  label_role: labelRole,
  accrual_targets: z.array(z.string().max(64)).optional(), // Would be nice if there was a way to make sure these are valid account type keys. They're in order of preference though
});

export type AccountTypeWithRequiredReportCode = z.infer<typeof newAccountType>;
