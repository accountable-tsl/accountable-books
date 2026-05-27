import { z } from 'zod';

export const BILLING_PLAN_FAMILIES = [
  'firm',
  'business',
  'individual',
] as const;

export const billingPlanFamilySchema = z.enum(BILLING_PLAN_FAMILIES);
export type BillingPlanFamily = z.infer<typeof billingPlanFamilySchema>;

export const BILLING_PLAN_KINDS = ['free', 'paid', 'custom_contact'] as const;

export const billingPlanKindSchema = z.enum(BILLING_PLAN_KINDS);
export type BillingPlanKind = z.infer<typeof billingPlanKindSchema>;

export const BILLING_INTERVALS = ['month', 'year'] as const;

export const billingIntervalSchema = z.enum(BILLING_INTERVALS);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const billingPlanKeySchema = z.string().trim().min(1).max(120);
export type BillingPlanKey = z.infer<typeof billingPlanKeySchema>;

export const BILLING_LAUNCH_PLAN_KEYS = [
  'firm_free',
  'firm_standard',
  'firm_custom',
  'business_basic',
  'business_standard',
  'business_premium',
  'individual_free',
] as const;

export const billingLaunchPlanKeySchema = z.enum(BILLING_LAUNCH_PLAN_KEYS);
export type BillingLaunchPlanKey = z.infer<typeof billingLaunchPlanKeySchema>;

export const BILLING_BUSINESS_PLAN_KEYS = [
  'business_basic',
  'business_standard',
  'business_premium',
] as const;

export const billingBusinessPlanKeySchema = z.enum(BILLING_BUSINESS_PLAN_KEYS);
export type BillingBusinessPlanKey = z.infer<
  typeof billingBusinessPlanKeySchema
>;

export const BILLING_PLAN_FEATURE_CODES = [
  'internal_workspace_limit',
  'employee_seat_limit',
  'monthly_credit_allowance_units',
  'managed_workspace_monthly_credit_bonus',
  'managed_client_pricing_tier',
  'branding_tier',
  'support_tier',
  'onboarding_support',
  'currency_mode',
  'connected_bank_accounts_limit',
  'launch_scope',
] as const;

export const billingPlanFeatureCodeSchema = z.enum(BILLING_PLAN_FEATURE_CODES);
export type BillingPlanFeatureCode = z.infer<
  typeof billingPlanFeatureCodeSchema
>;

export const billingPlanFeatureValueSchemas = {
  internal_workspace_limit: z.object({
    count: z.number().int().min(0),
  }),
  employee_seat_limit: z.object({
    unlimited: z.boolean(),
  }),
  monthly_credit_allowance_units: z.union([
    z.object({
      units: z.number().int().min(0),
    }),
    z.object({
      mode: z.literal('negotiated'),
    }),
  ]),
  managed_workspace_monthly_credit_bonus: z.union([
    z.object(
      Object.fromEntries(
        BILLING_BUSINESS_PLAN_KEYS.map((planKey) => [
          planKey,
          z.number().int().min(0),
        ]),
      ) as Record<BillingBusinessPlanKey, z.ZodNumber>,
    ),
    z.object({
      mode: z.literal('negotiated'),
    }),
  ]),
  managed_client_pricing_tier: z.object({
    tier: z.enum(['standard', 'discounted', 'lowest']),
  }),
  branding_tier: z.object({
    tier: z.enum(['subdomain_only', 'basic_branding', 'custom']),
  }),
  support_tier: z.object({
    tier: z.enum(['standard', 'enhanced', 'priority', 'custom']),
  }),
  onboarding_support: z.object({
    included: z.boolean(),
  }),
  currency_mode: z.object({
    mode: z.enum(['single_currency', 'multicurrency']),
  }),
  connected_bank_accounts_limit: z.union([
    z.object({
      count: z.number().int().min(0),
    }),
    z.object({
      unlimited: z.literal(true),
    }),
  ]),
  launch_scope: z.object({
    mode: z.literal('limited'),
  }),
} as const satisfies Record<BillingPlanFeatureCode, z.ZodTypeAny>;

export const billingPlanCatalogItemSchema = z.object({
  planKey: billingPlanKeySchema,
  planFamily: billingPlanFamilySchema,
  planKind: billingPlanKindSchema,
  displayName: z.string().trim().min(1).max(160),
  isActive: z.boolean(),
});
export type BillingPlanCatalogItem = z.infer<
  typeof billingPlanCatalogItemSchema
>;

export const billingMinorUnitAmountSchema = z.string().trim().regex(/^\d+$/);
export type BillingMinorUnitAmount = z.infer<
  typeof billingMinorUnitAmountSchema
>;

export const billingSignedMinorUnitAmountSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/);
export type BillingSignedMinorUnitAmount = z.infer<
  typeof billingSignedMinorUnitAmountSchema
>;

export const billingCatalogPriceSummarySchema = z.object({
  currencyCode: z.string().length(3),
  billingInterval: billingIntervalSchema,
  unitAmountMinor: billingMinorUnitAmountSchema,
});
export type BillingCatalogPriceSummary = z.infer<
  typeof billingCatalogPriceSummarySchema
>;

const internalWorkspaceLimitFeatureSchema = z.object({
  featureCode: z.literal('internal_workspace_limit'),
  featureValue: billingPlanFeatureValueSchemas.internal_workspace_limit,
});

const employeeSeatLimitFeatureSchema = z.object({
  featureCode: z.literal('employee_seat_limit'),
  featureValue: billingPlanFeatureValueSchemas.employee_seat_limit,
});

const monthlyCreditAllowanceUnitsFeatureSchema = z.object({
  featureCode: z.literal('monthly_credit_allowance_units'),
  featureValue: billingPlanFeatureValueSchemas.monthly_credit_allowance_units,
});

const managedWorkspaceMonthlyCreditBonusFeatureSchema = z.object({
  featureCode: z.literal('managed_workspace_monthly_credit_bonus'),
  featureValue:
    billingPlanFeatureValueSchemas.managed_workspace_monthly_credit_bonus,
});

const managedClientPricingTierFeatureSchema = z.object({
  featureCode: z.literal('managed_client_pricing_tier'),
  featureValue: billingPlanFeatureValueSchemas.managed_client_pricing_tier,
});

const brandingTierFeatureSchema = z.object({
  featureCode: z.literal('branding_tier'),
  featureValue: billingPlanFeatureValueSchemas.branding_tier,
});

const supportTierFeatureSchema = z.object({
  featureCode: z.literal('support_tier'),
  featureValue: billingPlanFeatureValueSchemas.support_tier,
});

const onboardingSupportFeatureSchema = z.object({
  featureCode: z.literal('onboarding_support'),
  featureValue: billingPlanFeatureValueSchemas.onboarding_support,
});

const currencyModeFeatureSchema = z.object({
  featureCode: z.literal('currency_mode'),
  featureValue: billingPlanFeatureValueSchemas.currency_mode,
});

const connectedBankAccountsLimitFeatureSchema = z.object({
  featureCode: z.literal('connected_bank_accounts_limit'),
  featureValue: billingPlanFeatureValueSchemas.connected_bank_accounts_limit,
});

const launchScopeFeatureSchema = z.object({
  featureCode: z.literal('launch_scope'),
  featureValue: billingPlanFeatureValueSchemas.launch_scope,
});

export const billingCatalogFeatureSummarySchema = z.discriminatedUnion(
  'featureCode',
  [
    internalWorkspaceLimitFeatureSchema,
    employeeSeatLimitFeatureSchema,
    monthlyCreditAllowanceUnitsFeatureSchema,
    managedWorkspaceMonthlyCreditBonusFeatureSchema,
    managedClientPricingTierFeatureSchema,
    brandingTierFeatureSchema,
    supportTierFeatureSchema,
    onboardingSupportFeatureSchema,
    currencyModeFeatureSchema,
    connectedBankAccountsLimitFeatureSchema,
    launchScopeFeatureSchema,
  ],
);
export type BillingCatalogFeatureSummary = z.infer<
  typeof billingCatalogFeatureSummarySchema
>;

export const billingCatalogPlanSchema = z.object({
  planKey: billingPlanKeySchema,
  planFamily: billingPlanFamilySchema,
  planKind: billingPlanKindSchema,
  displayName: z.string().trim().min(1).max(160),
  publicLabel: z.string().nullable(),
  isActive: z.boolean(),
  prices: z.array(billingCatalogPriceSummarySchema),
  features: z.array(billingCatalogFeatureSummarySchema),
});
export type BillingCatalogPlan = z.infer<typeof billingCatalogPlanSchema>;

export const billingCatalogResponseSchema = z.object({
  asOf: z.iso.datetime(),
  currencyCode: z.string().length(3),
  plans: z.array(billingCatalogPlanSchema),
});
export type BillingCatalogResponse = z.infer<
  typeof billingCatalogResponseSchema
>;
