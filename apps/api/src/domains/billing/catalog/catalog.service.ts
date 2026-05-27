import type { Knex } from 'knex';
import { billing } from '@accountable-books/contracts/schema';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  getActiveFeaturesForPlans,
  getActivePricesForCurrency,
  listActivePlans,
} from './catalog.model.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  RawFeatureRow,
  RawPlanRow,
  RawPriceRow,
} from './catalog.model.js';

function parseFeatureSummary(
  featureCodeRaw: string,
  featureValueRaw: Record<string, unknown>,
): billing.BillingCatalogFeatureSummary {
  const featureCode =
    billing.billingPlanFeatureCodeSchema.parse(featureCodeRaw);
  const featureValue =
    billing.billingPlanFeatureValueSchemas[featureCode].parse(featureValueRaw);

  return billing.billingCatalogFeatureSummarySchema.parse({
    featureCode,
    featureValue,
  });
}

function assembleCatalogPlan(
  plan: RawPlanRow,
  priceRows: RawPriceRow[],
  featureRows: RawFeatureRow[],
): billing.BillingCatalogPlan {
  return {
    planKey: billing.billingPlanKeySchema.parse(plan.plan_key),
    planFamily: billing.billingPlanFamilySchema.parse(plan.plan_family),
    planKind: billing.billingPlanKindSchema.parse(plan.plan_kind),
    displayName: plan.display_name,
    publicLabel: plan.public_label,
    isActive: plan.is_active,
    prices: priceRows.map((p) => ({
      currencyCode: p.currency_code,
      billingInterval: billing.billingIntervalSchema.parse(p.billing_interval),
      unitAmountMinor: billing.billingMinorUnitAmountSchema.parse(
        p.unit_amount_minor,
      ),
    })),
    features: featureRows.map((f) =>
      parseFeatureSummary(f.feature_code, f.feature_value_json),
    ),
  };
}

export async function getBillingCatalog(opts: {
  currencyCode: string;
  at?: Date;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<billing.BillingCatalogResponse>> {
  try {
    const db = opts.trx ?? knexClient;
    const at = opts.at ?? new Date();

    const plans = await listActivePlans(db);
    const planIds = plans.map((p) => p.id);

    const [priceRows, featureRows] = await Promise.all([
      getActivePricesForCurrency(planIds, opts.currencyCode, at, db),
      getActiveFeaturesForPlans(planIds, at, db),
    ]);

    const pricesByPlanId = new Map<string, RawPriceRow[]>();
    for (const row of priceRows) {
      const arr = pricesByPlanId.get(row.plan_catalog_id) ?? [];
      arr.push(row);
      pricesByPlanId.set(row.plan_catalog_id, arr);
    }

    const featuresByPlanId = new Map<string, RawFeatureRow[]>();
    for (const row of featureRows) {
      const arr = featuresByPlanId.get(row.plan_catalog_id) ?? [];
      arr.push(row);
      featuresByPlanId.set(row.plan_catalog_id, arr);
    }

    const assembledPlans = plans.map((plan) =>
      assembleCatalogPlan(
        plan,
        pricesByPlanId.get(plan.id) ?? [],
        featuresByPlanId.get(plan.id) ?? [],
      ),
    );

    const response: billing.BillingCatalogResponse = {
      asOf: at.toISOString(),
      currencyCode: opts.currencyCode,
      plans: assembledPlans,
    };

    billing.billingCatalogResponseSchema.parse(response);

    return successResponse('Billing catalog retrieved', response);
  } catch (error) {
    return errorResponse('Failed to retrieve billing catalog', error);
  }
}
