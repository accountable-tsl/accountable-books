import { z } from 'zod';

import { billingIntervalSchema } from './catalog.js';

export const billingPriceAgreementKindSchema = z.enum([
  'custom',
  'negotiated',
  'lifetime',
  'partner',
]);
export type BillingPriceAgreementKind = z.infer<
  typeof billingPriceAgreementKindSchema
>;

export const billingPriceAgreementSummarySchema = z.object({
  id: z.string().trim().min(1).max(128),
  planKey: z.string().trim().min(1).max(120),
  currencyCode: z.string().trim().length(3),
  billingInterval: billingIntervalSchema,
  agreementKind: billingPriceAgreementKindSchema,
});
export type BillingPriceAgreementSummary = z.infer<
  typeof billingPriceAgreementSummarySchema
>;
