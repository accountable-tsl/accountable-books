import { billing } from '@accountable-books/contracts/schema';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { app, setupApp } from '../../../app.js';
import { JWT_CONFIG } from '../../../features/auth/auth.utils.js';

const LAUNCH_EFFECTIVE_AT = '2026-05-18T00:00:00.000Z';
const EXPECTED_LAUNCH_PLAN_COUNT = billing.BILLING_LAUNCH_PLAN_KEYS.length;

const authenticatedCookie = `accessToken=${jwt.sign(
  { sub: 'billing-catalog-integration-test' },
  JWT_CONFIG.accessToken.secret,
  { expiresIn: '1h' },
)}`;

describe('GET /api/billing/catalog (integration)', () => {
  beforeAll(async () => {
    await setupApp();
  });

  it('returns 401 without an access token cookie', async () => {
    const res = await request(app).get('/api/billing/catalog?currencyCode=USD');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid currencyCode', async () => {
    const res = await request(app)
      .get('/api/billing/catalog?currencyCode=usd')
      .set('Cookie', [authenticatedCookie]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid at', async () => {
    const res = await request(app)
      .get('/api/billing/catalog?currencyCode=USD&at=not-a-date')
      .set('Cookie', [authenticatedCookie]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('defaults asOf to the current time when at is omitted', async () => {
    const before = Date.now();

    const res = await request(app)
      .get('/api/billing/catalog?currencyCode=USD')
      .set('Cookie', [authenticatedCookie]);

    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const asOfMillis = Date.parse(res.body.data.asOf);
    expect(Number.isNaN(asOfMillis)).toBe(false);
    expect(asOfMillis).toBeGreaterThanOrEqual(before);
    expect(asOfMillis).toBeLessThanOrEqual(after);
  });

  it('returns catalog envelope with launch plans at effective date', async () => {
    const res = await request(app)
      .get(
        `/api/billing/catalog?currencyCode=USD&at=${encodeURIComponent(LAUNCH_EFFECTIVE_AT)}`,
      )
      .set('Cookie', [authenticatedCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Billing catalog retrieved');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.asOf).toBe(LAUNCH_EFFECTIVE_AT);
    expect(res.body.data.currencyCode).toBe('USD');
    expect(res.body.data.plans).toHaveLength(EXPECTED_LAUNCH_PLAN_COUNT);

    const businessBasic = res.body.data.plans.find(
      (p: { planKey: string }) => p.planKey === 'business_basic',
    );
    expect(businessBasic).toBeDefined();
    const monthPrice = businessBasic.prices.find(
      (p: { billingInterval: string }) => p.billingInterval === 'month',
    );
    expect(monthPrice?.unitAmountMinor).toBe('8900');

    const parsed = billing.billingCatalogResponseSchema.safeParse(
      res.body.data,
    );
    expect(parsed.success).toBe(true);
  });
});
