import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../config/test-db.js';
import { resolveWorkspaceBillingContext } from '../../domains/billing/resolver/ownership-resolver.service.js';
import { mustHaveAccounts } from '../../domains/chart-of-accounts/coa.constants.js';
import {
  VEYRA_NG_PARTNER_SLUG,
  VEYRA_US_PARTNER_SLUG,
} from '../../domains/companies/workspace-bootstrap.config.js';
import { createInitialUserOnboardingState } from '../onboarding/onboarding.utils.js';
import { registerNewAccount } from './signup.service.js';

vi.mock('../../shared/telemetry/capture-sentry-exception.js', () => ({
  captureSentryException: vi.fn(),
}));

vi.mock('../communications/email/email.service.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/telemetry/capture-product-event.js', () => ({
  captureProductEvent: vi.fn(),
}));

/** Lowercase letters only — firm slugs reject digits. */
function randomFirmSlug(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 8; i++) s += letters[Math.floor(Math.random() * 26)];
  return `firm-${s}`;
}

function baseUser(suffix: string, userType: 'regular' | 'demo' = 'regular') {
  return {
    firstname: 'Test',
    lastname: 'User',
    email: `signup-${suffix}@example.com`,
    password: 'Password123!',
    onboardingState: createInitialUserOnboardingState(),
    userType,
  } as const;
}

async function getAssignedFirmSlug(
  trx: Knex.Transaction,
  companyId: string,
): Promise<string | null> {
  const assignment = await trx('companies')
    .where({ id: companyId })
    .first<{ assigned_firm_id: string | null }>('assigned_firm_id');

  if (!assignment?.assigned_firm_id) {
    return null;
  }

  const firmMeta = await trx('accounting_firms_meta')
    .where({ company_id: assignment.assigned_firm_id })
    .first<{ slug: string | null }>('slug');

  return firmMeta?.slug ?? null;
}

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

    const result = await registerNewAccount({
      trx,
      user: baseUser(suffix),
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

    const coaCount = await trx('coa')
      .where({ company_id: createdCompany!.id })
      .count<{ count: string }>('id as count')
      .first();

    expect(Number(coaCount?.count ?? 0)).toBe(mustHaveAccounts.length);
  });

  it('provisions a regular business signup with correct workspace, billing, and role', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

    const result = await registerNewAccount({
      trx,
      user: baseUser(suffix),
      company: {
        legalName: `Business Co ${suffix}`,
        type: 'business',
        countryCode: 'NG',
        reportingCurrencyCode: 'NGN',
        shortCode: `bz${suffix}`.slice(0, 10),
        workspaceClass: 'customer',
      },
    });

    expect(result.success).toBe(true);
    const company = result.data!.company;
    expect(company.workspaceClass).toBe('customer');
    expect(company.slug).toBeTruthy();

    const billing = await resolveWorkspaceBillingContext(company.id, {
      db: trx,
    });
    expect(billing?.commercialMode).toBe('firm_managed');

    const role = await trx('user_company_roles')
      .where({ company_id: company.id, is_deleted: false })
      .first<{ role_id: string }>();
    expect(role).toBeTruthy();

    expect(await getAssignedFirmSlug(trx, company.id)).toBe(
      VEYRA_NG_PARTNER_SLUG,
    );
  });

  it('routes US business signups to the US partner firm', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

    const result = await registerNewAccount({
      trx,
      user: baseUser(suffix),
      company: {
        legalName: `US Business Co ${suffix}`,
        type: 'business',
        countryCode: 'US',
        reportingCurrencyCode: 'USD',
        shortCode: `us${suffix}`.slice(0, 10),
        workspaceClass: 'customer',
      },
    });

    expect(result.success).toBe(true);
    expect(await getAssignedFirmSlug(trx, result.data!.company.id)).toBe(
      VEYRA_US_PARTNER_SLUG,
    );
  });

  it('provisions an accounting firm signup with self-assignment, firm meta, and slug in response', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    const slug = randomFirmSlug();

    const result = await registerNewAccount({
      trx,
      user: baseUser(suffix),
      company: {
        legalName: `Firm Co ${suffix}`,
        type: 'accounting_firm',
        countryCode: 'US',
        reportingCurrencyCode: 'USD',
        shortCode: `fm${suffix}`.slice(0, 10),
        workspaceClass: 'customer',
        slug,
      },
    });

    expect(result.success).toBe(true);
    const company = result.data!.company;
    expect(company.slug).toBe(slug);

    const billing = await resolveWorkspaceBillingContext(company.id, {
      db: trx,
    });
    expect(billing?.commercialMode).toBe('firm_internal');

    const firmMeta = await trx('accounting_firms_meta')
      .where({ company_id: company.id })
      .first<{ slug: string }>();
    expect(firmMeta?.slug).toBe(slug);

    // Accounting firms are self-assigned
    const persisted = await trx('companies')
      .where({ id: company.id })
      .select('assigned_firm_id')
      .first<{ assigned_firm_id: string | null }>();
    expect(persisted?.assigned_firm_id).toBe(company.id);
  });

  it('provisions a demo signup with demo workspace class and completed onboarding state', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

    const result = await registerNewAccount({
      trx,
      user: baseUser(suffix, 'demo'),
      company: {
        legalName: `Demo Co ${suffix}`,
        type: 'business',
        countryCode: 'NG',
        reportingCurrencyCode: 'NGN',
        shortCode: `dm${suffix}`.slice(0, 10),
        workspaceClass: 'demo',
      },
    });

    expect(result.success).toBe(true);
    const company = result.data!.company;
    expect(company.workspaceClass).toBe('demo');

    const persisted = await trx('companies')
      .where({ id: company.id })
      .select('workspace_class', 'onboarding_state')
      .first<{ workspace_class: string; onboarding_state: unknown }>();
    expect(persisted?.workspace_class).toBe('demo');

    // Demo companies get a completed onboarding state
    const state = persisted?.onboarding_state as {
      steps?: Record<string, boolean>;
    };
    expect(state?.steps?.company_details_confirmed).toBe(true);

    const coaCount = await trx('coa')
      .where({ company_id: company.id })
      .count<{ count: string }>('* as count')
      .first();
    expect(Number(coaCount?.count ?? 0)).toBeGreaterThan(
      mustHaveAccounts.length,
    );
  });
});
