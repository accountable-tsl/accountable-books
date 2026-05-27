import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { getBillingAccountByOwnerCompanyId } from '../accounts/accounts.model.js';
import {
  ensureBillingAccountForCompany,
  finalizeAccountingFirmBillingBootstrap,
  provisionBillingForCompany,
  resolveCommercialModeForCompany,
} from '../provisioning/provisioning.service.js';
import { resolveWorkspaceBillingContext } from '../resolver/ownership-resolver.service.js';

async function insertCompany(
  trx: Knex.Transaction,
  opts: {
    suffix: string;
    type: 'business' | 'accounting_firm' | 'individual';
    assignedFirmId?: string | null;
    isPlatform?: boolean;
  },
): Promise<string> {
  const testUserId = await getTestUserId(trx, US_USER_EMAIL);
  const testCurrencyId = await getCurrencyId(trx, 'USD');
  const country = await trx('countries').where('code', 'US').first();
  if (!country) throw new Error('US country not found');

  const [company] = await trx('companies')
    .insert({
      short_code: `p${randomUUID().replace(/-/g, '').slice(0, 9)}`,
      legal_name: `Provision ${opts.suffix}`,
      display_name: `Provision ${opts.suffix}`,
      type: opts.type,
      country_id: country.id,
      reporting_currency_id: testCurrencyId,
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      created_by_id: testUserId,
      assigned_firm_id: opts.assignedFirmId ?? null,
      workspace_class: opts.isPlatform ? 'platform' : 'customer',
    })
    .returning('id');

  if (opts.type === 'accounting_firm') {
    await trx('accounting_firms_meta')
      .insert({
        company_id: company.id,
        slug: `t${randomUUID().slice(0, 8)}`,
      })
      .onConflict(['company_id'])
      .ignore();
  }

  if (opts.assignedFirmId) {
    await trx('client_firm_assignments')
      .insert({
        client_company_id: company.id,
        accounting_firm_company_id: opts.assignedFirmId,
        created_by_id: testUserId,
        updated_by_id: testUserId,
      })
      .onConflict(['client_company_id'])
      .merge({
        accounting_firm_company_id: opts.assignedFirmId,
        updated_by_id: testUserId,
      });
  }

  return company.id;
}

describe('provisioning.service', () => {
  let trx: Knex.Transaction;
  const billingEmail = 'provision-test@example.com';

  beforeEach(async () => {
    trx = await getTestDb().transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('provisions firm company with firm_internal ownership', async () => {
    const firmCompanyId = await insertCompany(trx, {
      suffix: 'firm',
      type: 'accounting_firm',
    });

    await trx('companies')
      .where({ id: firmCompanyId })
      .update({ assigned_firm_id: firmCompanyId });

    await trx('client_firm_assignments')
      .insert({
        client_company_id: firmCompanyId,
        accounting_firm_company_id: firmCompanyId,
        created_by_id: await getTestUserId(trx, US_USER_EMAIL),
        updated_by_id: await getTestUserId(trx, US_USER_EMAIL),
      })
      .onConflict(['client_company_id'])
      .merge({ accounting_firm_company_id: firmCompanyId });

    const result = await finalizeAccountingFirmBillingBootstrap(firmCompanyId, {
      billingEmail,
      db: trx,
    });

    expect(result.commercialMode).toBe('firm_internal');
    expect(result.createdAccount).toBe(true);
    expect(result.createdOwnership).toBe(true);

    const context = await resolveWorkspaceBillingContext(firmCompanyId, {
      db: trx,
    });
    expect(context?.commercialMode).toBe('firm_internal');
    expect(context?.isFirmInternalWorkspace).toBe(true);
  });

  it('rejects accounting firm bootstrap before self-assignment is complete', async () => {
    const firmCompanyId = await insertCompany(trx, {
      suffix: 'firm-early',
      type: 'accounting_firm',
    });

    await expect(
      finalizeAccountingFirmBillingBootstrap(firmCompanyId, {
        billingEmail,
        db: trx,
      }),
    ).rejects.toThrow(
      `Accounting firm ${firmCompanyId} must be self-assigned before billing bootstrap`,
    );

    const account = await getBillingAccountByOwnerCompanyId(firmCompanyId, trx);
    expect(account).toBeNull();
  });

  it('provisions business on platform firm as firm_managed', async () => {
    const platformFirm = await trx('companies')
      .where({ workspace_class: 'platform' })
      .first<{ id: string }>();
    if (!platformFirm) throw new Error('Platform firm not found');

    // Platform firm must have a billing account before clients can be provisioned under it
    await ensureBillingAccountForCompany(platformFirm.id, {
      billingEmail,
      db: trx,
    });

    const businessId = await insertCompany(trx, {
      suffix: 'biz',
      type: 'business',
      assignedFirmId: platformFirm.id,
    });

    const mode = await resolveCommercialModeForCompany(businessId, trx);
    expect(mode).toBe('firm_managed');

    const result = await provisionBillingForCompany(businessId, {
      billingEmail,
      db: trx,
    });

    expect(result.commercialMode).toBe('firm_managed');

    const platformFirmAccount = await getBillingAccountByOwnerCompanyId(
      platformFirm.id,
      trx,
    );
    const context = await resolveWorkspaceBillingContext(businessId, {
      db: trx,
    });
    expect(context?.billingAccount.ownerCompanyId).toBe(platformFirm.id);
    expect(context?.billingAccountId).toBe(platformFirmAccount?.id);
  });

  it('provisions business under non-platform firm as firm_managed', async () => {
    const firmCompanyId = await insertCompany(trx, {
      suffix: 'mgmtfirm',
      type: 'accounting_firm',
      assignedFirmId: undefined,
    });
    await trx('companies')
      .where({ id: firmCompanyId })
      .update({ assigned_firm_id: firmCompanyId });

    await provisionBillingForCompany(firmCompanyId, {
      billingEmail,
      db: trx,
    });

    const clientId = await insertCompany(trx, {
      suffix: 'client',
      type: 'business',
      assignedFirmId: firmCompanyId,
    });

    const result = await provisionBillingForCompany(clientId, {
      billingEmail,
      db: trx,
    });

    expect(result.commercialMode).toBe('firm_managed');

    const firmAccount = await getBillingAccountByOwnerCompanyId(
      firmCompanyId,
      trx,
    );
    const context = await resolveWorkspaceBillingContext(clientId, { db: trx });
    expect(context?.billingAccountId).toBe(firmAccount?.id);
    expect(context?.commercialMode).toBe('firm_managed');
  });

  it('is idempotent on second provision call', async () => {
    const businessId = await insertCompany(trx, {
      suffix: 'idem',
      type: 'business',
    });

    const first = await provisionBillingForCompany(businessId, {
      billingEmail,
      db: trx,
    });
    const second = await provisionBillingForCompany(businessId, {
      billingEmail,
      db: trx,
    });

    expect(second.createdAccount).toBe(false);
    expect(second.createdOwnership).toBe(false);
    expect(second.billingAccountId).toBe(first.billingAccountId);
    expect(second.ownershipId).toBe(first.ownershipId);

    const ownershipCount = await trx('workspace_billing_ownership')
      .where({ workspace_company_id: businessId, ended_at: null })
      .count('* as count');
    expect(Number(ownershipCount[0]?.count)).toBe(1);
  });

  it('reconciles ownership when firm self-assignment changes commercial mode', async () => {
    const platformFirm = await trx('companies')
      .where({ workspace_class: 'platform' })
      .first<{ id: string }>();
    if (!platformFirm) throw new Error('Platform firm not found');

    const firmCompanyId = await insertCompany(trx, {
      suffix: 'recon',
      type: 'accounting_firm',
      assignedFirmId: platformFirm.id,
    });
    // platformFirm.id is accounting_firms_meta.company_id

    await provisionBillingForCompany(firmCompanyId, {
      billingEmail,
      db: trx,
    });

    let context = await resolveWorkspaceBillingContext(firmCompanyId, {
      db: trx,
    });
    expect(context?.commercialMode).toBe('self_serve');

    await trx('companies')
      .where({ id: firmCompanyId })
      .update({ assigned_firm_id: firmCompanyId });
    await trx('client_firm_assignments')
      .where({ client_company_id: firmCompanyId })
      .update({ accounting_firm_company_id: firmCompanyId });

    await provisionBillingForCompany(firmCompanyId, { billingEmail, db: trx });

    context = await resolveWorkspaceBillingContext(firmCompanyId, { db: trx });
    expect(context?.commercialMode).toBe('firm_internal');
  });

  it('fails fast when company billing country cannot be resolved', async () => {
    const fakeDb = Object.assign(
      () => ({
        leftJoin() {
          return this;
        },
        where() {
          return this;
        },
        select() {
          return this;
        },
        first: async () => ({
          id: 'company-missing-country',
          type: 'business',
          legal_name: 'Missing Country Co',
          assigned_firm_id: null,
          country_code: null,
          currency_code: 'USD',
        }),
      }),
      {
        fn: {
          now: () => new Date(),
        },
      },
    );

    await expect(
      ensureBillingAccountForCompany('company-missing-country', {
        billingEmail,
        db: fakeDb as unknown as Knex.Transaction,
      }),
    ).rejects.toThrow(
      'Company company-missing-country not found or missing billing country',
    );
  });
});
