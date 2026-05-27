import { z } from 'zod';

/**
 * Legacy billing contract surface.
 *
 * This file remains in place for compatibility while the billing domain moves
 * to grouped contracts under `schema/source/billing/*`.
 *
 * It is no longer re-exported from the primary accounting schema surface.
 */

/**
 * Which billing surface should be rendered for the current workspace context.
 */
export const billingViewSchema = z.enum([
  'firm',
  'client_self_serve',
  'client_managed',
]);
export type BillingView = z.infer<typeof billingViewSchema>;

/**
 * Commercial rail for the workspace.
 * - firm_customer: accounting firm is the platform customer
 * - client_customer: end-client workspace is the platform customer
 */
export const billingCommercialModeSchema = z.enum([
  'firm_customer',
  'client_customer',
]);
export type BillingCommercialMode = z.infer<typeof billingCommercialModeSchema>;

/**
 * Who pays for core software subscription charges.
 */
export const billingSoftwarePayerSchema = z.enum(['firm', 'client']);
export type BillingSoftwarePayer = z.infer<typeof billingSoftwarePayerSchema>;

/**
 * Who pays for client-facing AI usage, or whether usage is non-billable.
 */
export const billingAiPayerSchema = z.enum([
  'firm',
  'client',
  'disabled',
  'free_tier',
]);
export type BillingAiPayer = z.infer<typeof billingAiPayerSchema>;

export const billingSubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'none',
]);
export type BillingSubscriptionStatus = z.infer<
  typeof billingSubscriptionStatusSchema
>;

export const billingIntervalSchema = z.enum(['month', 'year']);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

const currencyCodeSchema = z.string().trim().length(3);
const currencySymbolSchema = z.string().trim().min(1).max(8);

const billingSubscriptionConfiguredSchema = z.object({
  status: z.enum(['active', 'trialing', 'past_due', 'canceled']),
  planName: z.string().trim().min(1).max(120),
  billingInterval: billingIntervalSchema,
  currentPeriodEnd: z.iso.datetime().optional(),
});

const billingSubscriptionNoneSchema = z.object({
  status: z.literal('none'),
  planName: z.null().optional(),
  billingInterval: z.null().optional(),
  currentPeriodEnd: z.null().optional(),
});

export const billingSubscriptionSchema = z.discriminatedUnion('status', [
  billingSubscriptionConfiguredSchema,
  billingSubscriptionNoneSchema,
]);
export type BillingSubscription = z.infer<typeof billingSubscriptionSchema>;

export const billingCheckoutSessionRequestSchema = z.object({
  returnUrl: z.url().optional(),
});
export type BillingCheckoutSessionRequest = z.infer<
  typeof billingCheckoutSessionRequestSchema
>;

export const billingCheckoutSessionResponseSchema = z.object({
  checkoutUrl: z.url(),
  sessionId: z.string().trim().min(1).max(128),
  expiresAt: z.iso.datetime().optional(),
});
export type BillingCheckoutSessionResponse = z.infer<
  typeof billingCheckoutSessionResponseSchema
>;

export const billingPortalSessionRequestSchema = z.object({
  returnUrl: z.url().optional(),
});
export type BillingPortalSessionRequest = z.infer<
  typeof billingPortalSessionRequestSchema
>;

export const billingPortalSessionResponseSchema = z.object({
  portalUrl: z.url(),
});
export type BillingPortalSessionResponse = z.infer<
  typeof billingPortalSessionResponseSchema
>;

export const billingInvoiceStatusSchema = z.enum([
  'paid',
  'open',
  'void',
  'uncollectible',
]);
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;

export const billingInvoiceSummarySchema = z.object({
  id: z.string().trim().min(1).max(64),
  number: z.string().trim().min(1).max(64),
  /**
   * Signed amount supports credit invoices and overpayment offsets.
   */
  amount: z.number(),
  displayAmount: z.string().trim().min(1).max(64).optional(),
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  status: billingInvoiceStatusSchema,
  issuedAt: z.iso.datetime(),
});
export type BillingInvoiceSummary = z.infer<typeof billingInvoiceSummarySchema>;

export const billingUsageSummarySchema = z.object({
  used: z.number().int().nonnegative(),
  included: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
  unitLabel: z.string().trim().min(1).max(64),
  periodStartAt: z.iso.datetime().optional(),
  periodEndAt: z.iso.datetime().optional(),
});
export type BillingUsageSummary = z.infer<typeof billingUsageSummarySchema>;

export const billingAiUsageModeSchema = z.enum([
  'paid',
  'free_tier',
  'disabled',
  'not_applicable',
]);
export type BillingAiUsageMode = z.infer<typeof billingAiUsageModeSchema>;

const billingAiSurfaceUsageBillableSchema = z.object({
  mode: z.enum(['paid', 'free_tier']),
  usage: billingUsageSummarySchema,
});

const billingAiSurfaceUsageNonBillableSchema = z.object({
  mode: z.enum(['disabled', 'not_applicable']),
  usage: z.undefined().optional(),
});

export const billingAiSurfaceUsageSchema = z.discriminatedUnion('mode', [
  billingAiSurfaceUsageBillableSchema,
  billingAiSurfaceUsageNonBillableSchema,
]);
export type BillingAiSurfaceUsage = z.infer<typeof billingAiSurfaceUsageSchema>;

export const billingAiUsageSchema = z.object({
  firmWorkflow: billingAiSurfaceUsageSchema.optional(),
  clientExperience: billingAiSurfaceUsageSchema.optional(),
});
export type BillingAiUsage = z.infer<typeof billingAiUsageSchema>;

export const billingRevenueSharePayoutStatusSchema = z.enum([
  'manual_pending',
  'paid',
  'not_applicable',
]);
export type BillingRevenueSharePayoutStatus = z.infer<
  typeof billingRevenueSharePayoutStatusSchema
>;

export const billingRevenueShareSummarySchema = z.object({
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  /**
   * Signed values support refunds, clawbacks, and net-negative adjustment windows.
   */
  currentMonthGross: z.number(),
  platformFee: z.number(),
  netToFirm: z.number(),
  payoutStatus: billingRevenueSharePayoutStatusSchema,
});
export type BillingRevenueShareSummary = z.infer<
  typeof billingRevenueShareSummarySchema
>;

export const billingEstimateStatusSchema = z.enum(['estimated', 'finalized']);
export type BillingEstimateStatus = z.infer<typeof billingEstimateStatusSchema>;

export const billingNextBillEstimateSchema = z.object({
  amount: z.number(),
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  asOf: z.iso.datetime(),
  status: billingEstimateStatusSchema,
  confidenceNote: z.string().trim().min(1).max(256).optional(),
});
export type BillingNextBillEstimate = z.infer<
  typeof billingNextBillEstimateSchema
>;

export const billingInvoiceLinePreviewTypeSchema = z.enum([
  'firm_subscription',
  'firm_usage',
  'client_plan_group',
  'client_usage_group',
]);
export type BillingInvoiceLinePreviewType = z.infer<
  typeof billingInvoiceLinePreviewTypeSchema
>;

export const billingInvoiceLinePreviewSchema = z.object({
  lineType: billingInvoiceLinePreviewTypeSchema,
  label: z.string().trim().min(1).max(160),
  amount: z.number(),
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  quantity: z.number().nonnegative().optional(),
  unitAmount: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type BillingInvoiceLinePreview = z.infer<
  typeof billingInvoiceLinePreviewSchema
>;

export const billingUsageChargeSummarySchema = z.object({
  amount: z.number().optional(),
  units: z.number().int().nonnegative(),
  included: z.number().int().nonnegative().optional(),
  remaining: z.number().int().nonnegative().optional(),
});
export type BillingUsageChargeSummary = z.infer<
  typeof billingUsageChargeSummarySchema
>;

export const billingUsageBilledToFirmSchema = z.object({
  totalAmount: z.number().optional(),
  totalUnits: z.number().int().nonnegative(),
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  firmTeam: billingUsageChargeSummarySchema,
  clientBilledToFirm: billingUsageChargeSummarySchema.extend({
    clientCount: z.number().int().nonnegative(),
  }),
});
export type BillingUsageBilledToFirm = z.infer<
  typeof billingUsageBilledToFirmSchema
>;

export const billingActionCapabilitiesSchema = z.object({
  canManageBilling: z.boolean(),
  canViewBreakdownDetails: z.boolean(),
  billingPortalUrl: z.url().optional(),
  breakdownDetailsAvailable: z.boolean(),
});
export type BillingActionCapabilities = z.infer<
  typeof billingActionCapabilitiesSchema
>;

export const managedByFirmSchema = z.object({
  firmName: z.string().trim().min(1).max(256),
  firmLogo: z.string().trim().url().optional(),
});
export type ManagedByFirm = z.infer<typeof managedByFirmSchema>;

const billingContextBaseSchema = z.object({
  companyId: z.string().trim().min(1).max(50),
  canManageBilling: z.boolean(),
  currencyCode: currencyCodeSchema,
  currencySymbol: currencySymbolSchema.nullish(),
  commercialMode: billingCommercialModeSchema,
  softwarePayer: billingSoftwarePayerSchema,
  clientAiPayer: billingAiPayerSchema,
  subscription: billingSubscriptionSchema,
  invoices: z.array(billingInvoiceSummarySchema).optional(),
  aiUsage: billingAiUsageSchema.optional(),
  nextBillEstimate: billingNextBillEstimateSchema.optional(),
  invoiceLinePreview: z.array(billingInvoiceLinePreviewSchema).optional(),
  usageBilledToFirm: billingUsageBilledToFirmSchema.optional(),
  actions: billingActionCapabilitiesSchema.optional(),
});

const firmBillingContextSchema = billingContextBaseSchema.extend({
  view: z.literal('firm'),
  firmRevenueShare: billingRevenueShareSummarySchema.optional(),
});

const clientSelfServeBillingContextSchema = billingContextBaseSchema.extend({
  view: z.literal('client_self_serve'),
});

const clientManagedBillingContextSchema = billingContextBaseSchema.extend({
  view: z.literal('client_managed'),
  managedByFirm: managedByFirmSchema,
});

export const billingContextResponseSchema = z.discriminatedUnion('view', [
  firmBillingContextSchema,
  clientSelfServeBillingContextSchema,
  clientManagedBillingContextSchema,
]);
export type BillingContextResponse = z.infer<
  typeof billingContextResponseSchema
>;
