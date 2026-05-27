import { z } from 'zod';

import { billingIntervalSchema } from './catalog.js';

export const billingSubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancel_scheduled',
  'canceled',
  'payment_failed',
]);
export type BillingSubscriptionStatus = z.infer<
  typeof billingSubscriptionStatusSchema
>;

export const billingSubscriptionSummarySchema = z.object({
  id: z.string().trim().min(1).max(128),
  billingAccountId: z.string().trim().min(1).max(128),
  planKey: z.string().trim().min(1).max(120),
  billingInterval: billingIntervalSchema,
  status: billingSubscriptionStatusSchema,
  currentPeriodStartAt: z.iso.datetime().nullable(),
  currentPeriodEndAt: z.iso.datetime().nullable(),
  trialEndsAt: z.iso.datetime().nullable().optional(),
});
export type BillingSubscriptionSummary = z.infer<
  typeof billingSubscriptionSummarySchema
>;
