import { billing } from '@accountable-books/contracts/schema';

export const BILLING_PLAN_FAMILIES = billing.BILLING_PLAN_FAMILIES;

export const BILLING_PLAN_KINDS = billing.BILLING_PLAN_KINDS;

export const BILLING_INTERVALS = billing.BILLING_INTERVALS;

export const BILLING_SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancel_scheduled',
  'canceled',
  'payment_failed',
] as const;

export const BILLING_INVOICE_STATUSES = [
  'draft',
  'open',
  'paid',
  'past_due',
  'void',
  'uncollectible',
] as const;

export const BILLING_COMMERCIAL_MODES = [
  'self_serve',
  'firm_managed',
  'firm_internal',
] as const;

export const BILLING_SOFTWARE_PAYERS = ['firm', 'client', 'platform'] as const;

export const BILLING_WORKSPACE_AI_PAYERS = [
  'firm',
  'client',
  'platform',
  'disabled',
] as const;

export const BILLING_ACTOR_TYPES = [
  'firm_user',
  'client_user',
  'system',
  'admin',
  'webhook',
] as const;

export const BILLING_CHARGE_TYPES = [
  'firm_subscription',
  'managed_workspace_wholesale',
  'client_sell_subscription',
  'credit_topup',
  'adjustment',
] as const;

export const BILLING_PAYOUT_ENTRY_TYPES = [
  'opening_balance',
  'client_collection',
  'platform_fee',
  'adjustment',
  'payout',
  'ending_balance',
] as const;
