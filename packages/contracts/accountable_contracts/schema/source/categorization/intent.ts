import { z } from 'zod';

import { contactType } from '../common/enums.js';

export const ledgerIntentEntry = z
  .object({
    entry_id: z.uuid().optional(),
    client_ref_id: z.string().optional(), // Client-provided reference ID (e.g., temp-entry-*) for exact matching
    coa_id: z.uuid(),
    description: z.string().nullish(),
    reference: z.string().nullish(),
    fs_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    contact_id: z.uuid().nullish(),
    contact_type: contactType.nullish(),
    project_id: z.uuid().nullish(),
    source_amount: z.number().optional(), // for splits
    human_reviewed: z.boolean().optional(),
    review_notes: z.string().nullish(),
    file_id: z.string().nullish(), // null to remove file association
    file_name: z.string().nullish(), // null to remove file association
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.file_id && !data.file_name) {
      ctx.addIssue({
        code: 'custom',
        message: 'File name is required when file id is provided',
        path: ['file_name'],
      });
    }
    if (!data.file_id && data.file_name) {
      ctx.addIssue({
        code: 'custom',
        message: 'File id is required when file name is provided',
        path: ['file_id'],
      });
    }

    // Calendar validity
    if (data.fs_date) {
      const parsedDate = new Date(data.fs_date);
      // Logic: If result is NaN, then it is an INVALID date
      if (isNaN(parsedDate.getTime())) {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid calendar date',
          path: ['fs_date'],
        });
      }
    }
  });
export type LedgerIntentEntry = z.infer<typeof ledgerIntentEntry>;

export const ledgerIntentDesiredState = z.object({
  custom_exchange_rate: z.number().positive().nullish(), // Null to replace custom exchange rate with system exchange rate
  entries: z.array(ledgerIntentEntry).min(1).optional(), // Not necessarily required for transaction level changes / changes that affect the entire transaction
});
export type LedgerIntentDesiredState = z.infer<typeof ledgerIntentDesiredState>;

export const ledgerIntentSchema = z.object({
  intent_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  ledger_transaction_id: z.uuid().optional(),
  candidate_id: z.uuid().optional(),
  desired_state: ledgerIntentDesiredState.optional(),
  timestamp: z.iso.datetime(),
});

export type LedgerIntent = z.infer<typeof ledgerIntentSchema>;
