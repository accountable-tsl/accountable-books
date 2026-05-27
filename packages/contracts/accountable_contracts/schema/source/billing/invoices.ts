import { z } from 'zod';

import { billingMinorUnitAmountSchema } from './catalog.js';

export const billingInvoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'past_due',
  'void',
  'uncollectible',
]);
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;

export const billingInvoiceSummarySchema = z.object({
  id: z.string().trim().min(1).max(128),
  billingAccountId: z.string().trim().min(1).max(128),
  currencyCode: z.string().trim().length(3),
  status: billingInvoiceStatusSchema,
  totalAmountMinor: billingMinorUnitAmountSchema,
  amountDueMinor: billingMinorUnitAmountSchema,
  dueAt: z.iso.datetime().nullable(),
});
export type BillingInvoiceSummary = z.infer<typeof billingInvoiceSummarySchema>;
