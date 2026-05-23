import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../config/test-db.js';
import { mustHaveAccounts } from '../../domains/chart-of-accounts/coa.constants.js';
import { createInitialUserOnboardingState } from '../onboarding/onboarding.utils.js';
import { registerNewAccount } from './signup.service.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

vi.mock('../communications/email/email.service.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/utils/analytics.utils.js', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('signup.service', () => {
  let trx: Knex.Transaction;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
  });

  afterEach(async () => {
    await trx.rollback();
    vi.clearAllMocks();
  });

  it('respects loadCoaTemplate = false and creates default accounts only', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    const email = `phase2-${suffix}@example.com`;

    const result = await registerNewAccount({
      trx,
      user: {
        firstname: 'Phase',
        lastname: 'Two',
        email,
        password: 'Password123!',
        onboardingState: createInitialUserOnboardingState(),
        userType: 'regular',
      },
      company: {
        legalName: `Phase 2 Company ${suffix}`,
        type: 'business',
        countryCode: 'US',
        reportingCurrencyCode: 'USD',
        shortCode: `sg${suffix}`.slice(0, 10),
        workspaceClass: 'customer',
        loadCoaTemplate: false,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.company.id).toBeTruthy();

    const createdCompany = await trx('companies')
      .where({ short_code: `sg${suffix}`.slice(0, 10) })
      .select('id')
      .first<{ id: string }>();

    expect(createdCompany?.id).toBeTruthy();

    const coaCount = await trx('coa')
      .where({ company_id: createdCompany!.id })
      .count<{ count: string }>('id as count')
      .first();

    expect(Number(coaCount?.count ?? 0)).toBe(mustHaveAccounts.length);
  });
});
