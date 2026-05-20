import type {
  BILLING_ACTOR_TYPES,
  BILLING_CHARGE_TYPES,
  BILLING_COMMERCIAL_MODES,
  BILLING_INVOICE_STATUSES,
  BILLING_PAYOUT_ENTRY_TYPES,
  BILLING_SOFTWARE_PAYERS,
  BILLING_SUBSCRIPTION_STATUSES,
  BILLING_WORKSPACE_AI_PAYERS,
} from './billing.constants.js';

export type BillingSubscriptionStatus =
  (typeof BILLING_SUBSCRIPTION_STATUSES)[number];
export type BillingInvoiceStatus = (typeof BILLING_INVOICE_STATUSES)[number];
export type BillingCommercialMode = (typeof BILLING_COMMERCIAL_MODES)[number];
export type BillingSoftwarePayer = (typeof BILLING_SOFTWARE_PAYERS)[number];
export type BillingWorkspaceAiPayer =
  (typeof BILLING_WORKSPACE_AI_PAYERS)[number];
export type BillingActorType = (typeof BILLING_ACTOR_TYPES)[number];
export type BillingChargeType = (typeof BILLING_CHARGE_TYPES)[number];
export type BillingPayoutEntryType =
  (typeof BILLING_PAYOUT_ENTRY_TYPES)[number];
