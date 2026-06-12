import type { Knex } from 'knex';

import {
  billingPlanCatalogSeed,
  billingPlanFeatureSeed,
  billingPlanPriceSeed,
  billingPlanProviderPriceSeed,
} from '../../../migrations/data/billing/catalog.v1.js';

export async function bootstrapBillingCatalog(
  trx: Knex.Transaction,
): Promise<void> {
  await trx('billing_plan_catalog')
    .insert(billingPlanCatalogSeed)
    .onConflict('plan_key')
    .ignore();

  await trx('billing_plan_catalog_prices')
    .insert(billingPlanPriceSeed)
    .onConflict([
      'plan_catalog_id',
      'currency_code',
      'billing_interval',
      'effective_at',
    ])
    .ignore();

  await trx('billing_plan_features')
    .insert(billingPlanFeatureSeed)
    .onConflict(['plan_catalog_id', 'feature_code', 'effective_at'])
    .ignore();

  if (billingPlanProviderPriceSeed.length > 0) {
    await trx('billing_plan_catalog_provider_prices')
      .insert(billingPlanProviderPriceSeed)
      .onConflict(['provider_key', 'provider_price_id'])
      .ignore();
  }
}
