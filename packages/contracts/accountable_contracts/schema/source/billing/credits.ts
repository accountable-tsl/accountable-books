import { z } from 'zod';

export const billingCreditGrantTypeSchema = z.enum([
  'monthly_included',
  'monthly_workspace_bonus',
  'gifted',
  'purchased',
  'negotiated',
]);
export type BillingCreditGrantType = z.infer<
  typeof billingCreditGrantTypeSchema
>;

export const billingActorTypeSchema = z.enum([
  'firm_user',
  'client_user',
  'system',
  'admin',
  'webhook',
]);
export type BillingActorType = z.infer<typeof billingActorTypeSchema>;
