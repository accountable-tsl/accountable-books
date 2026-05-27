import { billing } from '@accountable-books/contracts/schema';
import { v5 as uuidv5 } from 'uuid';

/**
 * Launch billing catalog snapshot (v1).
 *
 * This file is migration-owned reference data.
 * Once shipped, do not edit historical rows in place.
 *
 * Future pricing or feature changes should be introduced by:
 * - a new migration
 * - new effective-dated rows
 * - and, if helpful, a new versioned snapshot file
 */

export const BILLING_CATALOG_V1_EFFECTIVE_AT = '2026-05-18T00:00:00.000Z';

const BILLING_CATALOG_V1_NAMESPACE = '629f6ebd-5cc4-4e5d-b90e-76158f33928b';

type PlanKey =
  | 'firm_free'
  | 'firm_standard'
  | 'firm_custom'
  | 'business_basic'
  | 'business_standard'
  | 'business_premium'
  | 'individual_free';

type PlanFamily = (typeof billing.BILLING_PLAN_FAMILIES)[number];
type PlanKind = (typeof billing.BILLING_PLAN_KINDS)[number];
type CurrencyCode = 'USD' | 'NGN';
type BillingInterval = (typeof billing.BILLING_INTERVALS)[number];
type PlanFeatureCode = (typeof billing.BILLING_PLAN_FEATURE_CODES)[number];

type PlanDefinition = {
  planFamily: PlanFamily;
  planKind: PlanKind;
  displayName: string;
  publicLabel?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  prices?: Partial<
    Record<CurrencyCode, Partial<Record<BillingInterval, number>>>
  >;
  features?: Partial<Record<PlanFeatureCode, Record<string, unknown>>>;
};

const REQUIRED_LAUNCH_PLAN_KEYS: readonly PlanKey[] = [
  'firm_free',
  'firm_standard',
  'firm_custom',
  'business_basic',
  'business_standard',
  'business_premium',
  'individual_free',
] as const;

const launchPlans: Record<PlanKey, PlanDefinition> = {
  firm_free: {
    planFamily: 'firm',
    planKind: 'free',
    displayName: 'Firm Free',
    prices: {
      USD: { month: 0 },
      NGN: { month: 0 },
    },
    features: {
      internal_workspace_limit: { count: 1 },
      employee_seat_limit: { unlimited: true },
      monthly_credit_allowance_units: { units: 5 },
      managed_workspace_monthly_credit_bonus: {
        business_basic: 1,
        business_standard: 3,
        business_premium: 7,
      },
      managed_client_pricing_tier: { tier: 'standard' },
      branding_tier: { tier: 'subdomain_only' },
      support_tier: { tier: 'standard' },
    },
  },
  firm_standard: {
    planFamily: 'firm',
    planKind: 'paid',
    displayName: 'Firm Standard',
    prices: {
      USD: {
        month: 14900,
        year: 149000,
      },
    },
    features: {
      internal_workspace_limit: { count: 1 },
      employee_seat_limit: { unlimited: true },
      monthly_credit_allowance_units: { units: 20 },
      managed_workspace_monthly_credit_bonus: {
        business_basic: 2,
        business_standard: 5,
        business_premium: 12,
      },
      managed_client_pricing_tier: { tier: 'discounted' },
      branding_tier: { tier: 'basic_branding' },
      support_tier: { tier: 'enhanced' },
    },
  },
  firm_custom: {
    planFamily: 'firm',
    planKind: 'custom_contact',
    displayName: 'Firm Custom',
    metadata: {
      self_serve_checkout_enabled: false,
    },
    features: {
      internal_workspace_limit: { count: 1 },
      employee_seat_limit: { unlimited: true },
      monthly_credit_allowance_units: { mode: 'negotiated' },
      managed_workspace_monthly_credit_bonus: { mode: 'negotiated' },
      managed_client_pricing_tier: { tier: 'lowest' },
      branding_tier: { tier: 'custom' },
      support_tier: { tier: 'custom' },
      onboarding_support: { included: true },
    },
  },
  business_basic: {
    planFamily: 'business',
    planKind: 'paid',
    displayName: 'Business Basic',
    prices: {
      USD: {
        month: 8900,
        year: 89000,
      },
      NGN: {
        month: 13_500_000,
        year: 135_000_000,
      },
    },
    features: {
      currency_mode: { mode: 'single_currency' },
      connected_bank_accounts_limit: { count: 2 },
      monthly_credit_allowance_units: { units: 5 },
      support_tier: { tier: 'standard' },
    },
  },
  business_standard: {
    planFamily: 'business',
    planKind: 'paid',
    displayName: 'Business Standard',
    prices: {
      USD: {
        month: 19900,
        year: 199000,
      },
      NGN: {
        month: 30_000_000,
        year: 300_000_000,
      },
    },
    features: {
      currency_mode: { mode: 'multicurrency' },
      connected_bank_accounts_limit: { count: 10 },
      monthly_credit_allowance_units: { units: 15 },
      support_tier: { tier: 'enhanced' },
    },
  },
  business_premium: {
    planFamily: 'business',
    planKind: 'paid',
    displayName: 'Business Premium',
    prices: {
      USD: {
        month: 39900,
        year: 399000,
      },
      NGN: {
        month: 60_000_000,
        year: 600_000_000,
      },
    },
    features: {
      currency_mode: { mode: 'multicurrency' },
      connected_bank_accounts_limit: { unlimited: true },
      monthly_credit_allowance_units: { units: 40 },
      support_tier: { tier: 'priority' },
    },
  },
  individual_free: {
    planFamily: 'individual',
    planKind: 'free',
    displayName: 'Individual Free',
    prices: {
      USD: { month: 0 },
      NGN: { month: 0 },
    },
    features: {
      currency_mode: { mode: 'single_currency' },
      launch_scope: { mode: 'limited' },
    },
  },
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(`billing catalog seed v1: ${message}`);
  }
};

const stableId = (...parts: string[]): string => {
  return uuidv5(parts.join('::'), BILLING_CATALOG_V1_NAMESPACE);
};

const planIdFor = (planKey: PlanKey): string => {
  return stableId('plan', planKey);
};

const priceIdFor = (
  planKey: PlanKey,
  currencyCode: CurrencyCode,
  billingInterval: BillingInterval,
): string => {
  return stableId(
    'price',
    planKey,
    currencyCode,
    billingInterval,
    BILLING_CATALOG_V1_EFFECTIVE_AT,
  );
};

const featureIdFor = (planKey: PlanKey, featureCode: string): string => {
  return stableId(
    'feature',
    planKey,
    featureCode,
    BILLING_CATALOG_V1_EFFECTIVE_AT,
  );
};

const definedPlanKeys = Object.keys(launchPlans);

const assertLaunchPlanCoverage = (): void => {
  for (const planKey of REQUIRED_LAUNCH_PLAN_KEYS) {
    assert(planKey in launchPlans, `missing required launch plan "${planKey}"`);
  }

  assert(
    definedPlanKeys.length === REQUIRED_LAUNCH_PLAN_KEYS.length,
    'unexpected launch plan count; update REQUIRED_LAUNCH_PLAN_KEYS intentionally',
  );
};

const assertPlanDefinitions = (): void => {
  for (const [planKey, definition] of Object.entries(launchPlans) as Array<
    [PlanKey, PlanDefinition]
  >) {
    assert(
      definition.displayName.length > 0,
      `${planKey} must have a display name`,
    );

    if (definition.planKind === 'custom_contact') {
      assert(
        definition.prices === undefined,
        `${planKey} must not define catalog prices for a custom-contact plan`,
      );
    }

    for (const [currencyCode, intervalMap] of Object.entries(
      definition.prices ?? {},
    ) as Array<[CurrencyCode, Partial<Record<BillingInterval, number>>]>) {
      for (const [billingInterval, unitAmountMinor] of Object.entries(
        intervalMap,
      ) as Array<[BillingInterval, number]>) {
        assert(
          Number.isInteger(unitAmountMinor) && unitAmountMinor >= 0,
          `${planKey} ${currencyCode} ${billingInterval} price must be a non-negative integer minor-unit amount`,
        );
      }
    }

    for (const [featureCode, featureValue] of Object.entries(
      definition.features ?? {},
    )) {
      const featureSchema =
        billing.billingPlanFeatureValueSchemas[
          featureCode as keyof typeof billing.billingPlanFeatureValueSchemas
        ];

      assert(featureCode.length > 0, `${planKey} has a blank feature code`);
      assert(
        featureSchema !== undefined,
        `${planKey} feature "${featureCode}" is not a canonical billing feature code`,
      );

      featureSchema.parse(featureValue);
    }
  }
};

assertLaunchPlanCoverage();
assertPlanDefinitions();

export const BILLING_PLAN_IDS = Object.fromEntries(
  (Object.keys(launchPlans) as PlanKey[]).map((planKey) => [
    planKey,
    planIdFor(planKey),
  ]),
) as Record<PlanKey, string>;

export const billingPlanCatalogSeed = (
  Object.entries(launchPlans) as Array<[PlanKey, PlanDefinition]>
).map(([planKey, definition]) => ({
  id: BILLING_PLAN_IDS[planKey],
  plan_key: planKey,
  plan_family: definition.planFamily,
  plan_kind: definition.planKind,
  display_name: definition.displayName,
  public_label: definition.publicLabel ?? null,
  is_active: definition.isActive ?? true,
  metadata: definition.metadata ?? {},
}));

/**
 * Canonical launch catalog price rows.
 *
 * Important:
 * - Seed only commercially locked rows here.
 * - Future price additions or changes should be additive through a new
 *   migration and new effective-dated rows.
 * - Provider-specific execution ids belong in
 *   `billing_plan_catalog_provider_prices`,
 *   not here.
 * - If a market/currency row is not commercially locked yet, omit it here and
 *   add it later in a dedicated migration rather than guessing.
 */
export const billingPlanPriceSeed = (
  Object.entries(launchPlans) as Array<[PlanKey, PlanDefinition]>
).flatMap(([planKey, definition]) =>
  Object.entries(definition.prices ?? {}).flatMap(
    ([currencyCode, intervalMap]) =>
      Object.entries(intervalMap ?? {}).map(
        ([billingInterval, unitAmountMinor]) => ({
          id: priceIdFor(
            planKey,
            currencyCode as CurrencyCode,
            billingInterval as BillingInterval,
          ),
          plan_catalog_id: BILLING_PLAN_IDS[planKey],
          currency_code: currencyCode as CurrencyCode,
          billing_interval: billingInterval as BillingInterval,
          unit_amount_minor: unitAmountMinor as number,
          effective_at: BILLING_CATALOG_V1_EFFECTIVE_AT,
          expires_at: null,
        }),
      ),
  ),
);

export const billingPlanFeatureSeed = (
  Object.entries(launchPlans) as Array<[PlanKey, PlanDefinition]>
).flatMap(([planKey, definition]) =>
  Object.entries(definition.features ?? {}).map(
    ([featureCode, featureValue]) => ({
      id: featureIdFor(planKey, featureCode),
      plan_catalog_id: BILLING_PLAN_IDS[planKey],
      feature_code: featureCode,
      feature_value_json: featureValue,
      effective_at: BILLING_CATALOG_V1_EFFECTIVE_AT,
      expires_at: null,
    }),
  ),
);

export type BillingPlanProviderPriceSeedRow = {
  id: string;
  billing_plan_catalog_price_id: string;
  provider_key: string;
  provider_product_id: string | null;
  provider_price_id: string;
  country_code: string | null;
  status: 'active' | 'inactive' | 'deprecated';
  effective_at: string;
  expires_at: string | null;
};

export const billingPlanProviderPriceSeed: readonly BillingPlanProviderPriceSeedRow[] =
  [];
