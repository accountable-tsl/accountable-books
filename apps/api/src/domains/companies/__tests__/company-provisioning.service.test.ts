import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { getTestUserId, US_USER_EMAIL } from '../../../../test/helpers.js';
import { resolveWorkspaceBillingContext } from '../../billing/resolver/ownership-resolver.service.js';
import { loadCoaTemplateForCompany } from '../../chart-of-accounts/coa-template.model.js';
import { MUST_HAVE_ACCOUNTS } from '../../chart-of-accounts/coa.constants.js';
import {
  createCoaAccount,
  createDefaultAccounts,
} from '../../chart-of-accounts/coa.model.js';
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
  reconcileCompanyWorkspace,
} from '../company-provisioning.service.js';
import {
  VEYRA_NG_PARTNER_SLUG,
  VEYRA_US_PARTNER_SLUG,
} from '../workspace-bootstrap.config.js';

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

async function getAssignedFirmSlug(
  trx: Knex.Transaction,
  assignedFirmId: string,
): Promise<string | null> {
  const firmMeta = await trx('accounting_firms_meta')
    .where({ company_id: assignedFirmId })
    .first<{ slug: string | null }>('slug');

  return firmMeta?.slug ?? null;
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
      strategy: 'default',
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
    expect(Number(coaCount?.count ?? 0)).toBe(MUST_HAVE_ACCOUNTS.length);
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
    expect(Number(roleCount?.count ?? 0)).toBe(1);
  });

  it('repairs missing must-have accounts when a company already has a COA', async () => {
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `bz${randomUUID().slice(0, 8)}`,
      }),
    });

    await createCoaAccount({
      trx,
      companyId: company.id,
      userId,
      input: {
        name: `Existing account ${randomUUID()}`,
        account_type_key: 'ca_other',
      },
    });

    const result = await ensureCompanyChartOfAccounts({
      trx,
      companyId: company.id,
      userId,
      mode: 'template',
    });

    const requiredRows = await trx('coa')
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where({
        'coa.company_id': company.id,
        'coa.is_active': true,
        'coa.is_deleted': false,
        'coa.locked': true,
      })
      .whereIn(
        'account_types.key',
        MUST_HAVE_ACCOUNTS.map((account) => account.account_type_key),
      )
      .select('account_types.key');

    expect(result.skipped).toBe(false);
    expect(requiredRows).toHaveLength(MUST_HAVE_ACCOUNTS.length);
  });

  it('loads the selected template and confirms all must-have account types', async () => {
    const templateName = 'biz:none:basic:nocode:v1';
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `tp${randomUUID().slice(0, 8)}`,
      }),
    });
    const templateCount = await trx('coa_templates')
      .where({ template_name: templateName, is_active: true })
      .count<{ count: string }>('* as count')
      .first();

    const result = await ensureCompanyChartOfAccounts({
      trx,
      companyId: company.id,
      userId,
      mode: 'template',
      templateName,
    });

    const templateRows = await trx('coa')
      .where({ company_id: company.id, source: 'template' })
      .select<{ id: string }[]>('id');
    const currentVersions = await trx('coa_versions')
      .whereIn(
        'coa_id',
        templateRows.map((row) => row.id),
      )
      .whereNull('effective_to')
      .count<{ count: string }>('* as count')
      .first();
    const requiredTypeCount = await countQualifyingRequiredTypes(
      trx,
      company.id,
    );

    expect(result).toEqual({ skipped: false, mode: 'template' });
    expect(templateRows).toHaveLength(Number(templateCount?.count ?? 0));
    expect(Number(currentVersions?.count ?? 0)).toBe(templateRows.length);
    expect(requiredTypeCount).toBe(MUST_HAVE_ACCOUNTS.length);
  });

  it('rolls back the full template batch when one template account conflicts', async () => {
    const templateName = 'biz:none:basic:nocode:v1';
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `tf${randomUUID().slice(0, 8)}`,
      }),
    });
    const templateAccount = await trx('coa_templates')
      .where({ template_name: templateName, is_active: true })
      .first<{ name: string }>('name');

    if (!templateAccount) {
      throw new Error(`Expected active template ${templateName}`);
    }

    await createCoaAccount({
      trx,
      companyId: company.id,
      userId,
      input: {
        name: templateAccount.name,
        account_type_key: 'ca_other',
      },
    });
    const countBefore = await countCompanyCoa(trx, company.id);

    await expect(
      trx.transaction(async (savepoint) => {
        const response = await loadCoaTemplateForCompany(savepoint, {
          companyId: company.id,
          created_by_id: userId,
          template_name: templateName,
          use_code: true,
        });

        if (!response.success) {
          throw new Error(response.message);
        }
      }),
    ).rejects.toThrow('Failed to load and insert coa template');

    expect(await countCompanyCoa(trx, company.id)).toBe(countBefore);
  });

  it('rolls back the full default-account batch when one required name conflicts', async () => {
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `df${randomUUID().slice(0, 8)}`,
      }),
    });
    const conflictingName = MUST_HAVE_ACCOUNTS[0].name;

    await createCoaAccount({
      trx,
      companyId: company.id,
      userId,
      input: {
        name: conflictingName,
        account_type_key: 'ca_other',
      },
    });
    const countBefore = await countCompanyCoa(trx, company.id);

    await expect(
      trx.transaction((savepoint) =>
        createDefaultAccounts({
          trx: savepoint,
          companyUUID: company.id,
          userId,
        }),
      ),
    ).rejects.toMatchObject({ code: '23505' });

    expect(await countCompanyCoa(trx, company.id)).toBe(countBefore);
    expect(await countQualifyingRequiredTypes(trx, company.id)).toBe(0);
  });

  it('rolls back the complete workspace when a late provisioning step fails', async () => {
    const shortCode = `rb${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const company = buildCompanyInput({
      created_by_id: userId,
      short_code: shortCode,
    });

    await expect(
      trx.transaction((savepoint) =>
        provisionCompanyWorkspace({
          trx: savepoint,
          actorUserId: userId,
          ownerUserId: userId,
          billingEmail: 'rollback-provision@example.com',
          policy: { kind: 'signup' },
          company: {
            ...company,
            coa_mode: 'default',
            skip_side_effects: true,
            additional_role_grants: [
              {
                user_id: randomUUID(),
                role_key: 'client_owner',
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow('User not found');

    expect(
      await trx('companies').where({ short_code: shortCode }).first(),
    ).toBeUndefined();
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

    expect(
      await getAssignedFirmSlug(trx, result.assignment.assignedFirmId),
    ).toBe(VEYRA_US_PARTNER_SLUG);
    expect(result.billing?.commercialMode).toBe('firm_managed');
    expect(billingContext?.commercialMode).toBe('firm_managed');
    expect(result.chartOfAccounts.mode).toBe('default');
    expect(result.roleGrant.action).toBe('created');
    expect(result.pendingSideEffects.mode === 'skip_jobs').toBe(true);
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
    expect(role).toBeTruthy();
  });

  it('provisions a demo workspace end to end through the unified policy', async () => {
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'demo-provision@example.com',
      policy: { kind: 'demo' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          short_code: `dw${randomUUID().slice(0, 8)}`,
          workspace_class: 'demo',
        }),
        skip_side_effects: true,
      },
    });

    const persistedCompany = await trx('companies')
      .where({ id: result.company.id })
      .select('workspace_class', 'assigned_firm_id')
      .first<{
        workspace_class: 'customer' | 'demo' | 'platform' | 'partner';
        assigned_firm_id: string | null;
      }>();
    const billingContext = await resolveWorkspaceBillingContext(
      result.company.id,
      {
        db: trx,
      },
    );
    const role = await trx('user_company_roles')
      .where({
        company_id: result.company.id,
        user_id: userId,
        is_deleted: false,
      })
      .first();
    const coaCount = await trx('coa')
      .where({ company_id: result.company.id })
      .count<{ count: string }>('* as count')
      .first();

    expect(result.company.workspace_class).toBe('demo');
    expect(persistedCompany?.workspace_class).toBe('demo');
    expect(
      await getAssignedFirmSlug(trx, result.assignment.assignedFirmId),
    ).toBe(VEYRA_US_PARTNER_SLUG);
    expect(persistedCompany?.assigned_firm_id).toBe(
      result.assignment.assignedFirmId,
    );
    expect(result.billing?.commercialMode).toBe('firm_managed');
    expect(billingContext?.commercialMode).toBe('firm_managed');
    expect(result.chartOfAccounts.mode).toBe('template');
    expect(result.pendingSideEffects.mode === 'skip_jobs').toBe(true);
    expect(Number(coaCount?.count ?? 0)).toBeGreaterThan(0);
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
    expect(result.pendingSideEffects.mode === 'skip_jobs').toBe(true);
    expect(meta).toBeTruthy();
  });

  it('routes auto-assigned Nigerian customer workspaces to the Nigerian partner firm', async () => {
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'ng-routing@example.com',
      policy: { kind: 'signup' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          country_code: 'NG',
          reporting_currency_code: 'NGN',
          short_code: `ng${randomUUID().slice(0, 8)}`,
        }),
        coa_mode: 'default',
        skip_side_effects: true,
      },
    });

    expect(
      await getAssignedFirmSlug(trx, result.assignment.assignedFirmId),
    ).toBe(VEYRA_NG_PARTNER_SLUG);
  });

  it('routes explicit default assignment to the platform workspace', async () => {
    const company = await insertCompanyRecord({
      trx,
      company: buildCompanyInput({
        created_by_id: userId,
        short_code: `pd${randomUUID().slice(0, 8)}`,
      }),
    });

    const assignment = await ensureCompanyFirmAssignment({
      trx,
      companyId: company.id,
      actorUserId: userId,
      strategy: 'default',
    });

    const platform = await trx('companies')
      .where({ workspace_class: 'platform' })
      .first<{ id: string }>('id');

    expect(assignment.assignedFirmId).toBe(platform?.id);
  });

  it('provisions an accounting firm via signup policy (self-assigned, customer class, admin role)', async () => {
    const slug = randomFirmSlug();
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'firm-signup@example.com',
      policy: { kind: 'signup' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          type: 'accounting_firm',
          short_code: `sf${randomUUID().slice(0, 8)}`,
          slug,
        }),
        skip_side_effects: true,
      },
    });

    const meta = await trx('accounting_firms_meta')
      .where({ company_id: result.company.id })
      .first<{ slug: string }>();
    const role = await trx('user_company_roles as ucr')
      .join('roles as r', 'r.id', 'ucr.role_id')
      .where({
        'ucr.company_id': result.company.id,
        'ucr.user_id': userId,
        'ucr.is_deleted': false,
      })
      .select('r.key')
      .first<{ key: string }>();

    expect(result.company.workspace_class).toBe('customer');
    expect(result.firmMeta?.slug).toBe(slug);
    expect(result.assignment.assignedFirmId).toBe(result.company.id);
    expect(meta?.slug).toBe(slug);
    expect(role?.key).toBe('admin');
    expect(result.pendingSideEffects.mode === 'skip_jobs').toBe(true);
  });

  it('reconciles a workspace idempotently (billing, CoA, settings, role not duplicated)', async () => {
    const input = {
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'reconcile@example.com',
      policy: { kind: 'signup' as const },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          short_code: `rc${randomUUID().slice(0, 8)}`,
        }),
        coa_mode: 'default' as const,
        role_key: 'client_owner' as const,
        skip_side_effects: true,
      },
    };

    const provisioned = await provisionCompanyWorkspace({ trx, ...input });

    const reconciled = await reconcileCompanyWorkspace({
      trx,
      companyId: provisioned.company.id,
      ...input,
    });

    const coaCount = await trx('coa')
      .where({ company_id: provisioned.company.id })
      .count<{ count: string }>('* as count')
      .first();
    const settingsCount = await trx('company_settings')
      .where({ company_id: provisioned.company.id })
      .count<{ count: string }>('* as count')
      .first();
    const roleCount = await trx('user_company_roles')
      .where({
        company_id: provisioned.company.id,
        user_id: userId,
        is_deleted: false,
      })
      .count<{ count: string }>('* as count')
      .first();

    expect(reconciled.company.id).toBe(provisioned.company.id);
    expect(reconciled.billing?.billingAccountId).toBe(
      provisioned.billing?.billingAccountId,
    );
    expect(reconciled.chartOfAccounts.skipped).toBe(true);
    expect(reconciled.roleGrant.action).toBe('no change');
    expect(Number(coaCount?.count ?? 0)).toBeGreaterThan(0);
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
    expect(Number(roleCount?.count ?? 0)).toBe(1);
  });

  // platform_bootstrap policy is intentionally not tested here: the unique partial index
  // on workspace_class='platform' prevents inserting a second platform workspace while
  // the bootstrapped one exists. Canonical platform workspace coverage belongs to the
  // central bootstrap phase.

  it('provisions a workspace with admin policy (behaves like signup)', async () => {
    const result = await provisionCompanyWorkspace({
      trx,
      actorUserId: userId,
      ownerUserId: userId,
      billingEmail: 'admin-policy@example.com',
      policy: { kind: 'admin' },
      company: {
        ...buildCompanyInput({
          created_by_id: userId,
          short_code: `ap${randomUUID().slice(0, 8)}`,
        }),
        coa_mode: 'default',
        role_key: 'client_owner',
        skip_side_effects: true,
      },
    });

    const persistedCompany = await trx('companies')
      .where({ id: result.company.id })
      .select('workspace_class')
      .first<{ workspace_class: string }>();
    const billingContext = await resolveWorkspaceBillingContext(
      result.company.id,
      { db: trx },
    );

    expect(persistedCompany?.workspace_class).toBe('customer');
    expect(result.assignment.assignedFirmId).toBeTruthy();
    expect(result.assignment.assignedFirmId).not.toBe(result.company.id);
    expect(billingContext?.commercialMode).toBe('firm_managed');
    expect(result.roleGrant.action).toBe('created');
    expect(result.pendingSideEffects.mode === 'skip_jobs').toBe(true);
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
    expect(billingContext?.commercialMode).toBe('firm_managed');
    expect(Number(settingsCount?.count ?? 0)).toBeGreaterThan(0);
  });
});

async function countCompanyCoa(
  trx: Knex.Transaction,
  companyId: string,
): Promise<number> {
  const result = await trx('coa')
    .where({ company_id: companyId })
    .count<{ count: string }>('* as count')
    .first();
  return Number(result?.count ?? 0);
}

async function countQualifyingRequiredTypes(
  trx: Knex.Transaction,
  companyId: string,
): Promise<number> {
  const result = await trx('coa')
    .join('account_types', 'coa.account_type_id', 'account_types.id')
    .where({
      'coa.company_id': companyId,
      'coa.is_active': true,
      'coa.is_deleted': false,
      'coa.locked': true,
    })
    .whereIn(
      'account_types.key',
      MUST_HAVE_ACCOUNTS.map((account) => account.account_type_key),
    )
    .countDistinct<{ count: string }>('account_types.key as count')
    .first();
  return Number(result?.count ?? 0);
}
