import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { getTestUserId, US_USER_EMAIL } from '../../../../test/helpers.js';
import { resolveWorkspaceBillingContext } from '../../billing/resolver/ownership-resolver.service.js';
import { mustHaveAccounts } from '../../chart-of-accounts/coa.constants.js';
import { createCompany } from '../companies.model.js';
import {
  ensureAccountingFirmMeta,
  ensureCompanyBilling,
  ensureCompanyChartOfAccounts,
  ensureCompanyFirmAssignment,
  ensureCompanySettings,
  ensureWorkspaceRoleGrant,
  insertCompanyRecord,
  provisionCompanyWorkspace,
} from '../company-provisioning.service.js';

/** Lowercase letters only — firm slugs reject digits (see isValidFirmSlug). */
function randomFirmSlug(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `firm-${suffix}`;
}

function buildCompanyInput(overrides: Record<string, unknown> = {}): {
  legal_name: string;
  type: 'business' | 'individual' | 'accounting_firm';
  country_code: string;
  reporting_currency_code: string;
  created_by_id: string;
  short_code: string;
  workspace_class: 'customer' | 'demo' | 'platform' | 'partner';
  slug?: string;
  load_coa_template?: boolean;
  assigned_firm_id?: string;
} {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

  return {
    legal_name: `Provision Test ${suffix}`,
    type: 'business',
    country_code: 'US',
    reporting_currency_code: 'USD',
    created_by_id: '',
    short_code: `pt${suffix}`.slice(0, 10),
    workspace_class: 'customer',
    ...overrides,
  };
}

describe('company-provisioning.service', () => {
  let trx: Knex.Transaction;
  let userId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    userId = await getTestUserId(trx, US_USER_EMAIL);
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('insertCompanyRecord inserts only the company row and applies defaults', async () => {
    const inserted = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        type: 'individual',
        country_code: 'GB',
        reporting_currency_code: 'GBP',
      }),
    });

    const assignment = await trx('client_firm_assignments')
      .where({ client_company_id: inserted.id })
      .first();
    const ownership = await trx('workspace_billing_ownership')
      .where({ workspace_company_id: inserted.id, ended_at: null })
      .first();
    const settings = await trx('company_settings')
      .where({ company_id: inserted.id })
      .first();

    expect(inserted.id).toBeTruthy();
    expect(inserted.assigned_firm_id).toBeNull();
    expect(inserted.year_end_month).toBe(4);
    expect(inserted.year_end_day).toBe(5);
    expect(inserted.workspace_class).toBe('customer');
    expect(assignment).toBeUndefined();
    expect(ownership).toBeUndefined();
    expect(settings).toBeUndefined();
  });

  it('ensures accounting firm metadata and self-assignment idempotently', async () => {
    const firm = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        type: 'accounting_firm',
        short_code: `fm${randomUUID().slice(0, 8)}`,
      }),
    });

    const metaFirst = await ensureAccountingFirmMeta({
      trx,
      companyId: firm.id,
      actorUserId: userId,
      meta: {
        company_id: firm.id,
        slug: randomFirmSlug(),
        firm_type: 'ca_cpa',
      },
    });
    const metaSecond = await ensureAccountingFirmMeta({
      trx,
      companyId: firm.id,
      actorUserId: userId,
      meta: {
        company_id: firm.id,
        slug: metaFirst.slug,
        firm_type: 'ca_cpa',
      },
    });

    const assignmentFirst = await ensureCompanyFirmAssignment({
      trx,
      companyId: firm.id,
      actorUserId: userId,
      strategy: 'self',
    });
    const assignmentSecond = await ensureCompanyFirmAssignment({
      trx,
      companyId: firm.id,
      actorUserId: userId,
      strategy: 'self',
    });

    const assignments = await trx('client_firm_assignments')
      .where({ client_company_id: firm.id })
      .select('*');
    const persistedCompany = await trx('companies')
      .where({ id: firm.id })
      .select('assigned_firm_id')
      .first<{ assigned_firm_id: string | null }>();

    expect(metaFirst.created).toBe(true);
    expect(metaSecond.updated).toBe(false);
    expect(assignmentFirst.assignedFirmId).toBe(firm.id);
    expect(assignmentSecond.updated).toBe(false);
    expect(assignments).toHaveLength(1);
    expect(persistedCompany?.assigned_firm_id).toBe(firm.id);
  });

  it('ensures billing, chart of accounts, settings, and roles idempotently', async () => {
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `bz${randomUUID().slice(0, 8)}`,
      }),
    });

    await ensureCompanyFirmAssignment({
      trx,
      companyId: company.id,
      actorUserId: userId,
      strategy: 'default_platform',
    });

    const firstBilling = await ensureCompanyBilling({
      trx,
      companyId: company.id,
      billingEmail: 'provisioning@example.com',
    });
    const secondBilling = await ensureCompanyBilling({
      trx,
      companyId: company.id,
      billingEmail: 'provisioning@example.com',
    });

    const firstCoa = await ensureCompanyChartOfAccounts({
      trx,
      companyId: company.id,
      userId,
      mode: 'default',
    });
    const secondCoa = await ensureCompanyChartOfAccounts({
      trx,
      companyId: company.id,
      userId,
      mode: 'default',
    });

    await ensureCompanySettings({
      trx,
      companyId: company.id,
      userId,
    });
    await ensureCompanySettings({
      trx,
      companyId: company.id,
      userId,
    });

    const firstRole = await ensureWorkspaceRoleGrant({
      trx,
      companyId: company.id,
      userId,
      roleKey: 'client_owner',
      grantedBy: userId,
    });
    const secondRole = await ensureWorkspaceRoleGrant({
      trx,
      companyId: company.id,
      userId,
      roleKey: 'client_owner',
      grantedBy: userId,
    });

    const coaCount = await trx('coa')
      .where({ company_id: company.id })
      .count<{ count: string }>('* as count')
      .first();
    const settingsCount = await trx('company_settings')
      .where({ company_id: company.id })
      .count<{ count: string }>('* as count')
      .first();
    const roleCount = await trx('user_company_roles')
      .where({ company_id: company.id, user_id: userId, is_deleted: false })
      .count<{ count: string }>('* as count')
      .first();

    expect(firstBilling.billingAccountId).toBe(secondBilling.billingAccountId);
    expect(firstCoa.skipped).toBe(false);
    expect(secondCoa.skipped).toBe(true);
    expect(firstRole.action).toBe('created');
    expect(secondRole.action).toBe('no change');
    expect(Number(coaCount?.count ?? 0)).toBe(mustHaveAccounts.length);
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
    expect(Number(roleCount?.count ?? 0)).toBe(1);
  });

  it('provisions a customer workspace end to end', async () => {
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'customer-provision@example.com',
      policy: { kind: 'signup' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          short_code: `cw${randomUUID().slice(0, 8)}`,
        }),
        coa_mode: 'default',
        role_key: 'client_owner',
        skip_side_effects: true,
      },
    });

    const billingContext = await resolveWorkspaceBillingContext(
      result.company.id,
      {
        db: trx,
      },
    );
    const settingsCount = await trx('company_settings')
      .where({ company_id: result.company.id })
      .count<{ count: string }>('* as count')
      .first();
    const role = await trx('user_company_roles')
      .where({
        company_id: result.company.id,
        user_id: userId,
        is_deleted: false,
      })
      .first();

    expect(result.assignment.assignedFirmId).toBeTruthy();
    expect(result.assignment.assignedFirmId).not.toBe(result.company.id);
    expect(result.billing?.commercialMode).toBe('self_serve');
    expect(billingContext?.commercialMode).toBe('self_serve');
    expect(result.chartOfAccounts.mode).toBe('default');
    expect(result.roleGrant.action).toBe('created');
    expect(result.sideEffects.skipped).toBe(true);
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
    expect(role).toBeTruthy();
  });

  it('provisions an accounting firm workspace end to end', async () => {
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'firm-provision@example.com',
      policy: { kind: 'system_seed' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          type: 'accounting_firm',
          short_code: `fw${randomUUID().slice(0, 8)}`,
          slug: randomFirmSlug(),
        }),
        firm_type: 'ca_cpa',
        coa_mode: 'default',
        role_key: 'admin',
        skip_side_effects: true,
      },
    });

    const meta = await trx('accounting_firms_meta')
      .where({ company_id: result.company.id })
      .first();
    const billingContext = await resolveWorkspaceBillingContext(
      result.company.id,
      {
        db: trx,
      },
    );

    expect(result.firmMeta?.slug).toBeTruthy();
    expect(result.assignment.assignedFirmId).toBe(result.company.id);
    expect(result.billing?.commercialMode).toBe('firm_internal');
    expect(billingContext?.commercialMode).toBe('firm_internal');
    expect(result.roleGrant.action).toBe('created');
    expect(result.sideEffects.skipped).toBe(true);
    expect(meta).toBeTruthy();
  });

  it('keeps createCompany behavior compatible for current callers', async () => {
    const response = await createCompany({
      transaction: trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `cc${randomUUID().slice(0, 8)}`,
      }),
    });

    expect(response.success).toBe(true);
    expect(response.data?.id).toBeTruthy();

    const persistedCompany = await trx('companies')
      .where({ id: response.data?.id })
      .select('assigned_firm_id')
      .first<{ assigned_firm_id: string | null }>();
    const billingContext = await resolveWorkspaceBillingContext(
      response.data!.id!,
      {
        db: trx,
      },
    );
    const settingsCount = await trx('company_settings')
      .where({ company_id: response.data?.id })
      .count<{ count: string }>('* as count')
      .first();

    expect(persistedCompany?.assigned_firm_id).toBeTruthy();
    expect(billingContext?.commercialMode).toBe('self_serve');
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
  });
});
