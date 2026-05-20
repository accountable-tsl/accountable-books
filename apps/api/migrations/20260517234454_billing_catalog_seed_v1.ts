import type { Knex } from 'knex';

import {
  billingPlanCatalogSeed,
  billingPlanFeatureSeed,
  billingPlanPriceSeed,
  billingPlanProviderPriceSeed,
} from './data/billing/catalog.v1.js';

const shouldLogSeedSummary = process.env.LOG_BILLING_CATALOG_SEED === '1';

export async function up(knex: Knex): Promise<void> {
  if (shouldLogSeedSummary) {
    console.info('[billing_catalog_seed_v1] inserting seed rows', {
      plans: billingPlanCatalogSeed.length,
      prices: billingPlanPriceSeed.length,
      features: billingPlanFeatureSeed.length,
      providerPrices: billingPlanProviderPriceSeed.length,
    });
  }

  await knex.transaction(async (trx) => {
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
  });
}

export async function down(knex: Knex): Promise<void> {
  if (shouldLogSeedSummary) {
    console.info('[billing_catalog_seed_v1] deleting seed rows', {
      plans: billingPlanCatalogSeed.length,
      prices: billingPlanPriceSeed.length,
      features: billingPlanFeatureSeed.length,
      providerPrices: billingPlanProviderPriceSeed.length,
    });
  }

  await knex.transaction(async (trx) => {
    if (billingPlanProviderPriceSeed.length > 0) {
      const providerPriceIds = billingPlanProviderPriceSeed.map(
        (row) => row.provider_price_id,
      );

      await trx('billing_plan_catalog_provider_prices')
        .whereIn('provider_price_id', providerPriceIds)
        .delete();
    }

    const featureIds = billingPlanFeatureSeed.map((row) => row.id);
    await trx('billing_plan_features').whereIn('id', featureIds).delete();

    const priceIds = billingPlanPriceSeed.map((row) => row.id);
    await trx('billing_plan_catalog_prices').whereIn('id', priceIds).delete();

    const planIds = billingPlanCatalogSeed.map((row) => row.id);
    await trx('billing_plan_catalog').whereIn('id', planIds).delete();
  });
}
