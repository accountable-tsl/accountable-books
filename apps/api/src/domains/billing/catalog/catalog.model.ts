import type { Knex } from 'knex';

export type RawPlanRow = {
  id: string;
  plan_key: string;
  plan_family: string;
  plan_kind: string;
  display_name: string;
  public_label: string | null;
  is_active: boolean;
};

export type RawPriceRow = {
  plan_catalog_id: string;
  currency_code: string;
  billing_interval: string;
  unit_amount_minor: string;
};

export type RawFeatureRow = {
  plan_catalog_id: string;
  feature_code: string;
  feature_value_json: Record<string, unknown>;
};

export async function listActivePlans(
  db: Knex | Knex.Transaction,
): Promise<RawPlanRow[]> {
  return db('billing_plan_catalog')
    .select(
      'id',
      'plan_key',
      'plan_family',
      'plan_kind',
      'display_name',
      'public_label',
      'is_active',
    )
    .where('is_active', true)
    .orderBy('plan_key');
}

export async function getPlanByKey(
  planKey: string,
  db: Knex | Knex.Transaction,
): Promise<RawPlanRow | null> {
  const row = await db('billing_plan_catalog')
    .select(
      'id',
      'plan_key',
      'plan_family',
      'plan_kind',
      'display_name',
      'public_label',
      'is_active',
    )
    .where('plan_key', planKey)
    .first();

  return row ?? null;
}

export async function getActivePlanByKey(
  planKey: string,
  db: Knex | Knex.Transaction,
): Promise<RawPlanRow | null> {
  const row = await db('billing_plan_catalog')
    .select(
      'id',
      'plan_key',
      'plan_family',
      'plan_kind',
      'display_name',
      'public_label',
      'is_active',
    )
    .where({
      plan_key: planKey,
      is_active: true,
    })
    .first();

  return row ?? null;
}

export async function getActivePricesForCurrency(
  planIds: string[],
  currencyCode: string,
  at: Date,
  db: Knex | Knex.Transaction,
): Promise<RawPriceRow[]> {
  if (planIds.length === 0) return [];

  const result = await db.raw<{ rows: RawPriceRow[] }>(
    `
    SELECT DISTINCT ON (plan_catalog_id, billing_interval)
      plan_catalog_id,
      currency_code,
      billing_interval,
      unit_amount_minor
    FROM billing_plan_catalog_prices
    WHERE plan_catalog_id = ANY(:planIds)
      AND currency_code = :currencyCode
      AND effective_at <= :at
      AND (expires_at IS NULL OR expires_at > :at)
    ORDER BY plan_catalog_id, billing_interval, effective_at DESC
    `,
    { planIds, currencyCode, at },
  );

  return result.rows;
}

export async function getActiveFeaturesForPlans(
  planIds: string[],
  at: Date,
  db: Knex | Knex.Transaction,
): Promise<RawFeatureRow[]> {
  if (planIds.length === 0) return [];

  const result = await db.raw<{ rows: RawFeatureRow[] }>(
    `
    SELECT DISTINCT ON (plan_catalog_id, feature_code)
      plan_catalog_id,
      feature_code,
      feature_value_json
    FROM billing_plan_features
    WHERE plan_catalog_id = ANY(:planIds)
      AND effective_at <= :at
      AND (expires_at IS NULL OR expires_at > :at)
    ORDER BY plan_catalog_id, feature_code, effective_at DESC
    `,
    { planIds, at },
  );

  return result.rows;
}
