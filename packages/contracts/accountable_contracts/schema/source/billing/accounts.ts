import { z } from 'zod';

export const billingAccountOwnerTypeSchema = z.enum([
  'firm',
  'business',
  'individual',
]);
export type BillingAccountOwnerType = z.infer<
  typeof billingAccountOwnerTypeSchema
>;

export const billingAccountStatusSchema = z.enum([
  'active',
  'suspended',
  'closed',
]);
export type BillingAccountStatus = z.infer<typeof billingAccountStatusSchema>;

export const billingAccountSummarySchema = z.object({
  id: z.string().trim().min(1).max(128),
  ownerType: billingAccountOwnerTypeSchema,
  ownerCompanyId: z.string().trim().min(1).max(128),
  invoiceCurrencyCode: z.string().trim().length(3),
  status: billingAccountStatusSchema,
});
export type BillingAccountSummary = z.infer<typeof billingAccountSummarySchema>;
