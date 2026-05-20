import { billing } from '@accountable-books/contracts/schema';

import {
  BILLING_CATALOG_V1_EFFECTIVE_AT,
  billingPlanCatalogSeed,
  billingPlanFeatureSeed,
  billingPlanPriceSeed,
  billingPlanProviderPriceSeed,
} from '../../../migrations/data/billing/catalog.v1.js';

const REQUIRED_LAUNCH_PLAN_KEYS = billing.BILLING_LAUNCH_PLAN_KEYS;

const EXPECTED_COUNTS = {
  plans: 7,
  prices: 18,
  features: 36,
  providerPrices: 0,
} as const;

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(`billing catalog validation: ${message}`);
  }
};

const assertUnique = (label: string, values: readonly string[]): void => {
  assert(
    values.length === new Set(values).size,
    `${label} must be unique across the seed snapshot`,
  );
};

export function validateBillingCatalogV1Seed(): void {
  assert(
    BILLING_CATALOG_V1_EFFECTIVE_AT === '2026-05-18T00:00:00.000Z',
    'unexpected effective date for catalog v1',
  );

  assert(
    billingPlanCatalogSeed.length === EXPECTED_COUNTS.plans,
    `expected ${EXPECTED_COUNTS.plans} plan rows, got ${billingPlanCatalogSeed.length}`,
  );
  assert(
    billingPlanPriceSeed.length === EXPECTED_COUNTS.prices,
    `expected ${EXPECTED_COUNTS.prices} price rows, got ${billingPlanPriceSeed.length}`,
  );
  assert(
    billingPlanFeatureSeed.length === EXPECTED_COUNTS.features,
    `expected ${EXPECTED_COUNTS.features} feature rows, got ${billingPlanFeatureSeed.length}`,
  );
  assert(
    billingPlanProviderPriceSeed.length === EXPECTED_COUNTS.providerPrices,
    `expected ${EXPECTED_COUNTS.providerPrices} provider price rows, got ${billingPlanProviderPriceSeed.length}`,
  );

  const planKeys = billingPlanCatalogSeed.map((row) => row.plan_key);
  assertUnique('plan keys', planKeys);
  assertUnique(
    'plan ids',
    billingPlanCatalogSeed.map((row) => row.id),
  );
  assertUnique(
    'price ids',
    billingPlanPriceSeed.map((row) => row.id),
  );
  assertUnique(
    'feature ids',
    billingPlanFeatureSeed.map((row) => row.id),
  );

  for (const requiredPlanKey of REQUIRED_LAUNCH_PLAN_KEYS) {
    assert(
      planKeys.includes(requiredPlanKey),
      `missing required launch plan "${requiredPlanKey}"`,
    );
  }

  const planIds = new Set(billingPlanCatalogSeed.map((row) => row.id));
  for (const priceRow of billingPlanPriceSeed) {
    assert(
      planIds.has(priceRow.plan_catalog_id),
      `price row ${priceRow.id} references an unknown plan_catalog_id`,
    );
  }

  for (const featureRow of billingPlanFeatureSeed) {
    assert(
      planIds.has(featureRow.plan_catalog_id),
      `feature row ${featureRow.id} references an unknown plan_catalog_id`,
    );
  }

  const firmCustomFeature = billingPlanFeatureSeed.find(
    (row) =>
      row.feature_code === 'managed_workspace_monthly_credit_bonus' &&
      row.feature_value_json &&
      'mode' in row.feature_value_json &&
      row.feature_value_json.mode === 'negotiated',
  );

  assert(
    firmCustomFeature !== undefined,
    'firm_custom must define an explicit negotiated managed workspace bonus feature',
  );

  const individualFreePlan = billingPlanCatalogSeed.find(
    (row) => row.plan_key === 'individual_free',
  );
  if (!individualFreePlan) {
    throw new Error(
      'billing catalog validation: individual_free plan must exist',
    );
  }
  assert(
    !('launch_scope' in (individualFreePlan.metadata ?? {})),
    'individual_free metadata must not duplicate launch_scope',
  );

  const individualLaunchScopeFeature = billingPlanFeatureSeed.find(
    (row) =>
      row.plan_catalog_id === individualFreePlan.id &&
      row.feature_code === 'launch_scope',
  );
  assert(
    individualLaunchScopeFeature !== undefined,
    'individual_free must keep launch_scope as a feature',
  );
}
