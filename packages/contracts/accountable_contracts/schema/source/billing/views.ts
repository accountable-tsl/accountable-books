import { z } from 'zod';

import { billingAccountSummarySchema } from './accounts.js';
import { billingInvoiceSummarySchema } from './invoices.js';
import { billingSubscriptionSummarySchema } from './subscriptions.js';

export const billingSettingsOverviewViewSchema = z.object({
  billingAccount: billingAccountSummarySchema,
  currentSubscription: billingSubscriptionSummarySchema.nullable(),
  upcomingInvoice: billingInvoiceSummarySchema.nullable(),
});
export type BillingSettingsOverviewView = z.infer<
  typeof billingSettingsOverviewViewSchema
>;

export const billingManagePlanViewSchema = z.object({
  currentSubscription: billingSubscriptionSummarySchema.nullable(),
  actionPermissions: z.object({
    canManagePlan: z.boolean(),
    canCancel: z.boolean(),
    canDowngradeToFree: z.boolean(),
  }),
});
export type BillingManagePlanView = z.infer<typeof billingManagePlanViewSchema>;
