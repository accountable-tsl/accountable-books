import { z } from 'zod';

import {
  billingAccountOwnerTypeSchema,
  billingAccountStatusSchema,
} from './accounts.js';
import { billingCommercialModeSchema } from './managed-workspaces.js';

export { billingCommercialModeSchema };
export type { BillingCommercialMode } from './managed-workspaces.js';

export const billingSoftwarePayerSchema = z.enum([
  'billing_account',
  'client_billing_account',
]);
export type BillingSoftwarePayer = z.infer<typeof billingSoftwarePayerSchema>;

export const billingAccountRecordSchema = z.object({
  id: z.string().trim().min(1).max(128),
  ownerCompanyId: z.string().trim().min(1).max(128),
  ownerType: billingAccountOwnerTypeSchema,
  invoiceCurrencyCode: z.string().trim().length(3),
  status: billingAccountStatusSchema,
});
export type BillingAccountRecord = z.infer<typeof billingAccountRecordSchema>;

export const workspaceBillingContextSchema = z.object({
  workspaceCompanyId: z.string().trim().min(1).max(128),
  ownershipId: z.string().trim().min(1).max(128),
  billingAccountId: z.string().trim().min(1).max(128),
  clientBillingAccountId: z.string().trim().min(1).max(128).nullable(),
  commercialMode: billingCommercialModeSchema,
  softwarePayer: billingSoftwarePayerSchema,
  isFirmInternalWorkspace: z.boolean(),
  effectiveAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  billingAccount: billingAccountRecordSchema,
  clientBillingAccount: billingAccountRecordSchema.nullable(),
});
export type WorkspaceBillingContext = z.infer<
  typeof workspaceBillingContextSchema
>;
