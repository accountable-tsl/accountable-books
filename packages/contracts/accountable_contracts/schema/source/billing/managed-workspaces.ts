import { z } from 'zod';

import { billingIntervalSchema } from './catalog.js';

export const billingCommercialModeSchema = z.enum([
  'self_serve',
  'firm_managed',
  'firm_internal',
]);
export type BillingCommercialMode = z.infer<typeof billingCommercialModeSchema>;

export const managedWorkspaceAssignmentSchema = z.object({
  managedWorkspaceCompanyId: z.string().trim().min(1).max(128),
  firmBillingAccountId: z.string().trim().min(1).max(128),
  platformPlanKey: z.string().trim().min(1).max(120),
  currencyCode: z.string().trim().length(3),
  billingInterval: billingIntervalSchema,
});
export type ManagedWorkspaceAssignment = z.infer<
  typeof managedWorkspaceAssignmentSchema
>;
