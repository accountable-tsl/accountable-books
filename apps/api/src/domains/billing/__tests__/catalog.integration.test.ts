import { billing } from '@accountable-books/contracts/schema';
import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';

import { requestApp } from '../../../../test/http.js';
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
    const res = await requestApp(app, {
      path: '/api/billing/catalog?currencyCode=USD',
    });

    expect(res.status).toBe(401);
    expect((res.body as { success: boolean }).success).toBe(false);
  });

  it('returns 400 for invalid currencyCode', async () => {
    const res = await requestApp(app, {
      path: '/api/billing/catalog?currencyCode=usd',
      headers: { Cookie: authenticatedCookie },
    });

    expect(res.status).toBe(400);
    expect((res.body as { success: boolean }).success).toBe(false);
  });

  it('returns 400 for invalid at', async () => {
    const res = await requestApp(app, {
      path: '/api/billing/catalog?currencyCode=USD&at=not-a-date',
      headers: { Cookie: authenticatedCookie },
    });

    expect(res.status).toBe(400);
    expect((res.body as { success: boolean }).success).toBe(false);
  });

  it('defaults asOf to the current time when at is omitted', async () => {
    const before = Date.now();

    const res = await requestApp(app, {
      path: '/api/billing/catalog?currencyCode=USD',
      headers: { Cookie: authenticatedCookie },
    });

    const after = Date.now();

    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);

    const asOfMillis = Date.parse(
      (res.body as { data: { asOf: string } }).data.asOf,
    );
    expect(Number.isNaN(asOfMillis)).toBe(false);
    expect(asOfMillis).toBeGreaterThanOrEqual(before);
    expect(asOfMillis).toBeLessThanOrEqual(after);
  });

  it('returns catalog envelope with launch plans at effective date', async () => {
    const res = await requestApp(app, {
      path: `/api/billing/catalog?currencyCode=USD&at=${encodeURIComponent(LAUNCH_EFFECTIVE_AT)}`,
      headers: { Cookie: authenticatedCookie },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      success: boolean;
      message: string;
      data: {
        asOf: string;
        currencyCode: string;
        plans: Array<{
          planKey: string;
          prices: Array<{ billingInterval: string; unitAmountMinor: string }>;
        }>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.message).toBe('Billing catalog retrieved');
    expect(body.data).toBeDefined();
    expect(body.data.asOf).toBe(LAUNCH_EFFECTIVE_AT);
    expect(body.data.currencyCode).toBe('USD');
    expect(body.data.plans).toHaveLength(EXPECTED_LAUNCH_PLAN_COUNT);

    const businessBasic = body.data.plans.find(
      (p) => p.planKey === 'business_basic',
    );
    expect(businessBasic).toBeDefined();
    const monthPrice = businessBasic!.prices.find(
      (p) => p.billingInterval === 'month',
    );
    expect(monthPrice?.unitAmountMinor).toBe('8900');

    const parsed = billing.billingCatalogResponseSchema.safeParse(body.data);
    expect(parsed.success).toBe(true);
  });
});
