import { z } from 'zod';

export const billingCatalogQuerySchema = z.object({
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/),
  at: z.iso.datetime().optional(),
});

export type BillingCatalogQuery = z.infer<typeof billingCatalogQuerySchema>;
