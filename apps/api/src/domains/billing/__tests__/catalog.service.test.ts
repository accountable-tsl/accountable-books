import type { Knex } from 'knex';
import { billing } from '@accountable-books/contracts/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { getBillingCatalog } from '../catalog/catalog.service.js';

const LAUNCH_EFFECTIVE_AT = new Date('2026-05-18T00:00:00.000Z');
const BEFORE_LAUNCH = new Date('2020-01-01T00:00:00.000Z');

const EXPECTED_PLAN_KEYS = [
  'business_basic',
  'business_premium',
  'business_standard',
  'firm_custom',
  'firm_free',
  'firm_standard',
  'individual_free',
];

describe('catalog.service — getBillingCatalog', () => {
  let trx: Knex.Transaction;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('USD catalog', () => {
    it('returns all 7 plans', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.data?.plans).toHaveLength(7);
    });

    it('returns all expected plan keys', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const keys = result.data!.plans.map((p) => p.planKey).sort();
      expect(keys).toEqual(EXPECTED_PLAN_KEYS);
    });

    it('business_basic has correct USD prices', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const plan = result.data!.plans.find(
        (p) => p.planKey === 'business_basic',
      )!;
      const monthPrice = plan.prices.find((p) => p.billingInterval === 'month');
      const yearPrice = plan.prices.find((p) => p.billingInterval === 'year');

      expect(monthPrice?.unitAmountMinor).toBe('8900');
      expect(yearPrice?.unitAmountMinor).toBe('89000');
    });

    it('firm_custom has no prices', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const firmCustom = result.data!.plans.find(
        (p) => p.planKey === 'firm_custom',
      )!;
      expect(firmCustom.prices).toHaveLength(0);
    });

    it('firm_custom has features', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const firmCustom = result.data!.plans.find(
        (p) => p.planKey === 'firm_custom',
      )!;
      expect(firmCustom.features.length).toBeGreaterThan(0);
    });

    it('firm_free monthly_credit_allowance_units feature = { units: 5 }', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const firmFree = result.data!.plans.find(
        (p) => p.planKey === 'firm_free',
      )!;
      const creditFeature = firmFree.features.find(
        (f) => f.featureCode === 'monthly_credit_allowance_units',
      );
      expect(creditFeature?.featureCode).toBe('monthly_credit_allowance_units');
      if (creditFeature?.featureCode === 'monthly_credit_allowance_units') {
        expect(creditFeature.featureValue).toEqual({ units: 5 });
      }
    });

    it('all plans have prices: [] when at is before effective_at', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: BEFORE_LAUNCH,
        trx,
      });

      expect(result.success).toBe(true);
      const totalPrices = result.data!.plans.reduce(
        (sum, p) => sum + p.prices.length,
        0,
      );
      expect(totalPrices).toBe(0);
    });

    it('asOf reflects the at parameter', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.data?.asOf).toBe(LAUNCH_EFFECTIVE_AT.toISOString());
    });

    it('currencyCode is echoed in the response envelope', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.data?.currencyCode).toBe('USD');
    });

    it('response passes billingCatalogResponseSchema validation', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.success).toBe(true);
      const parsed = billing.billingCatalogResponseSchema.safeParse(
        result.data,
      );
      expect(parsed.success).toBe(true);
    });

    it('price minor amounts stay strings in the response', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'USD',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const plan = result.data!.plans.find(
        (p) => p.planKey === 'business_basic',
      )!;
      const monthPrice = plan.prices.find((p) => p.billingInterval === 'month');

      expect(typeof monthPrice?.unitAmountMinor).toBe('string');
    });
  });

  describe('NGN catalog', () => {
    it('business_basic has correct NGN month and year prices', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'NGN',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const plan = result.data!.plans.find(
        (p) => p.planKey === 'business_basic',
      )!;
      const monthPrice = plan.prices.find((p) => p.billingInterval === 'month');
      const yearPrice = plan.prices.find((p) => p.billingInterval === 'year');

      expect(monthPrice?.unitAmountMinor).toBe('13500000');
      expect(yearPrice?.unitAmountMinor).toBe('135000000');
    });

    it('business_standard and business_premium have NGN annual prices', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'NGN',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      for (const planKey of [
        'business_standard',
        'business_premium',
      ] as const) {
        const plan = result.data!.plans.find((p) => p.planKey === planKey)!;
        const yearPrice = plan.prices.find((p) => p.billingInterval === 'year');
        expect(yearPrice).toBeDefined();
      }
    });

    it('firm_standard has no NGN prices (firm plans are USD only)', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'NGN',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      const firmStandard = result.data!.plans.find(
        (p) => p.planKey === 'firm_standard',
      )!;
      expect(firmStandard.prices).toHaveLength(0);
    });

    it('response passes billingCatalogResponseSchema for NGN', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'NGN',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.success).toBe(true);
      const parsed = billing.billingCatalogResponseSchema.safeParse(
        result.data,
      );
      expect(parsed.success).toBe(true);
    });
  });

  describe('unknown currency', () => {
    it('returns all plans with prices: [] for an unsupported currency', async () => {
      const result = await getBillingCatalog({
        currencyCode: 'JPY',
        at: LAUNCH_EFFECTIVE_AT,
        trx,
      });

      expect(result.success).toBe(true);
      const totalPrices = result.data!.plans.reduce(
        (sum, p) => sum + p.prices.length,
        0,
      );
      expect(totalPrices).toBe(0);
    });
  });
});
