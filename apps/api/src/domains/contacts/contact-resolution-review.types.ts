import z from 'zod';

export const resolutionReviewStatus = z.enum([
  'unresolved',
  'ambiguous',
  'inferred',
  'confirmed',
  'manual_override',
  'ignored',
]);
export type ResolutionReviewStatus = z.infer<typeof resolutionReviewStatus>;

export const contactResolutionReviewQueueInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().min(1).max(256).optional(),
  statuses: z.array(resolutionReviewStatus).min(1).optional(),
  includeInferredContacts: z.boolean().default(true),
});
export type ContactResolutionReviewQueueInput = z.infer<
  typeof contactResolutionReviewQueueInput
>;

export const confirmContactResolutionInput = z
  .object({
    resolutionId: z.uuid().optional(),
    bankTransactionId: z.uuid().optional(),
    alias: z.string().trim().min(1).max(512).optional(),
    createAlias: z.boolean().default(true),
  })
  .refine((input) => input.resolutionId || input.bankTransactionId, {
    message: 'resolutionId or bankTransactionId is required',
    path: ['resolutionId'],
  });
export type ConfirmContactResolutionInput = z.infer<
  typeof confirmContactResolutionInput
>;

export const linkObservedCounterpartyInput = z.object({
  observedCounterpartyId: z.uuid(),
  contactId: z.uuid(),
  alias: z.string().trim().min(1).max(512).optional(),
});
export type LinkObservedCounterpartyInput = z.infer<
  typeof linkObservedCounterpartyInput
>;

export const createContactFromObservedCounterpartyInput = z.object({
  observedCounterpartyId: z.uuid(),
  displayName: z.string().trim().min(1).max(256).optional(),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: 'Invalid email address',
    })
    .transform((value) => (value === '' ? undefined : value.toLowerCase()))
    .optional(),
  address: z
    .string()
    .trim()
    .max(512)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1024)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  alias: z.string().trim().min(1).max(512).optional(),
});
export type CreateContactFromObservedCounterpartyInput = z.infer<
  typeof createContactFromObservedCounterpartyInput
>;

export const ignoreObservedCounterpartyInput = z.object({
  observedCounterpartyId: z.uuid(),
  reason: z.string().trim().min(1).max(512).optional(),
});
export type IgnoreObservedCounterpartyInput = z.infer<
  typeof ignoreObservedCounterpartyInput
>;

export const rejectInferredContactInput = z.object({
  contactId: z.uuid(),
  reason: z.string().trim().min(1).max(512).optional(),
});
export type RejectInferredContactInput = z.infer<
  typeof rejectInferredContactInput
>;

export const contactAliasesQueryInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().min(1).max(256).optional(),
  contactId: z.uuid().optional(),
  observedCounterpartyId: z.uuid().optional(),
  includeDeleted: z.boolean().default(false),
});
export type ContactAliasesQueryInput = z.infer<typeof contactAliasesQueryInput>;

export const reassignContactAliasInput = z.object({
  contactId: z.uuid(),
});
export type ReassignContactAliasInput = z.infer<
  typeof reassignContactAliasInput
>;
