import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getActiveFeaturesForPlans,
  getActivePlanByKey,
  getActivePricesForCurrency,
  getPlanByKey,
  listActivePlans,
} from '../catalog/catalog.model.js';

const LAUNCH_EFFECTIVE_AT = new Date('2026-05-18T00:00:00.000Z');
const BEFORE_LAUNCH = new Date('2020-01-01T00:00:00.000Z');

describe('catalog.model', () => {
  let trx: Knex.Transaction;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('listActivePlans', () => {
    it('returns all 7 active plans', async () => {
      const plans = await listActivePlans(trx);
      expect(plans).toHaveLength(7);
    });

    it('returns only active plans ordered by plan_key', async () => {
      const plans = await listActivePlans(trx);
      const keys = plans.map((p) => p.plan_key);
      expect(keys).toEqual([
        'business_basic',
        'business_premium',
        'business_standard',
        'firm_custom',
        'firm_free',
        'firm_standard',
        'individual_free',
      ]);
    });

    it('includes expected fields including public_label', async () => {
      const plans = await listActivePlans(trx);
      const firmFree = plans.find((p) => p.plan_key === 'firm_free');
      expect(firmFree).toBeDefined();
      expect(firmFree).toMatchObject({
        plan_key: 'firm_free',
        plan_family: 'firm',
        plan_kind: 'free',
        display_name: 'Firm Free',
        is_active: true,
      });
      expect('public_label' in firmFree!).toBe(true);
    });
  });

  describe('getPlanByKey', () => {
    it('returns a plan row for a known plan key', async () => {
      const plan = await getPlanByKey('firm_standard', trx);

      expect(plan).toBeDefined();
      expect(plan).toMatchObject({
        plan_key: 'firm_standard',
        plan_family: 'firm',
        plan_kind: 'paid',
        is_active: true,
      });
    });

    it('returns null for an unknown plan key', async () => {
      const plan = await getPlanByKey('does_not_exist', trx);

      expect(plan).toBeNull();
    });
  });

  describe('getActivePlanByKey', () => {
    it('returns an active plan row for a known active plan key', async () => {
      const plan = await getActivePlanByKey('business_basic', trx);

      expect(plan).toBeDefined();
      expect(plan?.plan_key).toBe('business_basic');
      expect(plan?.is_active).toBe(true);
    });

    it('returns null for an unknown plan key', async () => {
      const plan = await getActivePlanByKey('does_not_exist', trx);

      expect(plan).toBeNull();
    });
  });

  describe('getActivePricesForCurrency', () => {
    it('returns USD month and year prices for business_basic', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'USD',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const basicPrices = prices.filter((p) => {
        const plan = plans.find((pl) => pl.id === p.plan_catalog_id);
        return plan?.plan_key === 'business_basic';
      });

      const monthPrice = basicPrices.find(
        (p) => p.billing_interval === 'month',
      );
      const yearPrice = basicPrices.find((p) => p.billing_interval === 'year');

      expect(Number(monthPrice?.unit_amount_minor)).toBe(8900);
      expect(Number(yearPrice?.unit_amount_minor)).toBe(89000);
    });

    it('returns NGN month and year prices for business plans', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'NGN',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const basicPlan = plans.find((p) => p.plan_key === 'business_basic')!;
      const basicPrices = prices.filter(
        (p) => p.plan_catalog_id === basicPlan.id,
      );

      const monthPrice = basicPrices.find(
        (p) => p.billing_interval === 'month',
      );
      const yearPrice = basicPrices.find((p) => p.billing_interval === 'year');

      expect(Number(monthPrice?.unit_amount_minor)).toBe(13_500_000);
      expect(Number(yearPrice?.unit_amount_minor)).toBe(135_000_000);
    });

    it('returns 0 price rows for firm_custom (custom_contact has no catalog prices)', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'USD',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const firmCustom = plans.find((p) => p.plan_key === 'firm_custom')!;
      const customPrices = prices.filter(
        (p) => p.plan_catalog_id === firmCustom.id,
      );

      expect(customPrices).toHaveLength(0);
    });

    it('returns 0 rows for any currency at a date before effective_at', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'USD',
        BEFORE_LAUNCH,
        trx,
      );

      expect(prices).toHaveLength(0);
    });

    it('returns 0 rows for an unknown currency', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'JPY',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      expect(prices).toHaveLength(0);
    });

    it('returns empty array when planIds is empty', async () => {
      const prices = await getActivePricesForCurrency(
        [],
        'USD',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );
      expect(prices).toHaveLength(0);
    });

    it('unit_amount_minor is returned as a string from the pg driver', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const prices = await getActivePricesForCurrency(
        planIds,
        'USD',
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const paidPrice = prices.find((p) => Number(p.unit_amount_minor) > 0);
      expect(typeof paidPrice?.unit_amount_minor).toBe('string');
    });
  });

  describe('getActiveFeaturesForPlans', () => {
    it('returns monthly_credit_allowance_units for firm_free with value { units: 5 }', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const features = await getActiveFeaturesForPlans(
        planIds,
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const firmFree = plans.find((p) => p.plan_key === 'firm_free')!;
      const creditFeature = features.find(
        (f) =>
          f.plan_catalog_id === firmFree.id &&
          f.feature_code === 'monthly_credit_allowance_units',
      );

      expect(creditFeature?.feature_value_json).toEqual({ units: 5 });
    });

    it('returns 0 feature rows at a date before effective_at', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const features = await getActiveFeaturesForPlans(
        planIds,
        BEFORE_LAUNCH,
        trx,
      );

      expect(features).toHaveLength(0);
    });

    it('returns features for firm_custom including negotiated credit mode', async () => {
      const plans = await listActivePlans(trx);
      const planIds = plans.map((p) => p.id);

      const features = await getActiveFeaturesForPlans(
        planIds,
        LAUNCH_EFFECTIVE_AT,
        trx,
      );

      const firmCustom = plans.find((p) => p.plan_key === 'firm_custom')!;
      const customFeatures = features.filter(
        (f) => f.plan_catalog_id === firmCustom.id,
      );

      expect(customFeatures.length).toBeGreaterThan(0);

      const creditFeature = customFeatures.find(
        (f) => f.feature_code === 'monthly_credit_allowance_units',
      );
      expect(creditFeature?.feature_value_json).toEqual({ mode: 'negotiated' });
    });

    it('returns empty array when planIds is empty', async () => {
      const features = await getActiveFeaturesForPlans(
        [],
        LAUNCH_EFFECTIVE_AT,
        trx,
      );
      expect(features).toHaveLength(0);
    });
  });
});
