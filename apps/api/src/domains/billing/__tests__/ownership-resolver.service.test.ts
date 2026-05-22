import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { billing } from '@accountable-books/contracts/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { createBillingAccount } from '../accounts/accounts.model.js';
import { createWorkspaceBillingOwnership } from '../ownership/ownership.model.js';
import { resolveWorkspaceBillingContext } from '../resolver/ownership-resolver.service.js';

async function insertTestCompany(
  trx: Knex.Transaction,
  suffix: string,
  type: 'business' | 'accounting_firm' = 'business',
): Promise<string> {
  const testUserId = await getTestUserId(trx, US_USER_EMAIL);
  const testCurrencyId = await getCurrencyId(trx, 'USD');
  const country = await trx('countries').where('code', 'US').first();
  if (!country) throw new Error('US country not found');

  const [company] = await trx('companies')
    .insert({
      short_code: `${suffix}${randomUUID().slice(0, 6)}`,
      legal_name: `Resolver Test ${suffix}`,
      display_name: `Resolver Test ${suffix}`,
      type,
      country_id: country.id,
      reporting_currency_id: testCurrencyId,
      year_end_day: 31,
      year_end_month: 12,
      accounting_basis: 'modified_accrual_basis',
      created_by_id: testUserId,
    })
    .returning('id');

  return company.id;
}

describe('ownership-resolver.service', () => {
  let trx: Knex.Transaction;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('returns null when no ownership exists', async () => {
    const result = await resolveWorkspaceBillingContext(randomUUID(), {
      db: trx,
    });
    expect(result).toBeNull();
  });

  it('resolves self-serve workspace payer', async () => {
    const workspaceCompanyId = await insertTestCompany(trx, 'ss');
    const account = await createBillingAccount(
      { ownerCompanyId: workspaceCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId,
        billingAccountId: account.id,
        commercialMode: 'self_serve',
      },
      trx,
    );

    const context = await resolveWorkspaceBillingContext(workspaceCompanyId, {
      db: trx,
    });

    expect(context).not.toBeNull();
    expect(context).toMatchObject({
      workspaceCompanyId,
      commercialMode: 'self_serve',
      softwarePayer: 'billing_account',
      isFirmInternalWorkspace: false,
      clientBillingAccountId: null,
      clientBillingAccount: null,
    });
    expect(context!.billingAccount).toMatchObject({
      id: account.id,
      ownerCompanyId: workspaceCompanyId,
      ownerType: 'business',
      invoiceCurrencyCode: 'USD',
    });

    const parsed = billing.workspaceBillingContextSchema.safeParse(context);
    expect(parsed.success).toBe(true);
  });

  it('resolves firm-managed workspace payer with firm billing account', async () => {
    const firmCompanyId = await insertTestCompany(trx, 'fm', 'accounting_firm');
    const clientCompanyId = await insertTestCompany(trx, 'cl');
    const firmAccount = await createBillingAccount(
      { ownerCompanyId: firmCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );
    await createBillingAccount(
      { ownerCompanyId: clientCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId: clientCompanyId,
        billingAccountId: firmAccount.id,
        commercialMode: 'firm_managed',
      },
      trx,
    );

    const context = await resolveWorkspaceBillingContext(clientCompanyId, {
      db: trx,
    });

    expect(context).toMatchObject({
      workspaceCompanyId: clientCompanyId,
      commercialMode: 'firm_managed',
      billingAccountId: firmAccount.id,
      isFirmInternalWorkspace: false,
    });
    expect(context!.billingAccount.ownerType).toBe('firm');
    expect(context!.billingAccount.ownerCompanyId).toBe(firmCompanyId);
  });

  it('resolves firm-internal workspace', async () => {
    const firmCompanyId = await insertTestCompany(trx, 'fi', 'accounting_firm');
    const firmAccount = await createBillingAccount(
      { ownerCompanyId: firmCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId: firmCompanyId,
        billingAccountId: firmAccount.id,
        commercialMode: 'firm_internal',
      },
      trx,
    );

    const context = await resolveWorkspaceBillingContext(firmCompanyId, {
      db: trx,
    });

    expect(context).toMatchObject({
      commercialMode: 'firm_internal',
      isFirmInternalWorkspace: true,
    });
    expect(context!.billingAccount.ownerType).toBe('firm');
  });

  it('resolves historical ownership by at', async () => {
    const workspaceCompanyId = await insertTestCompany(trx, 'hist');
    const account = await createBillingAccount(
      { ownerCompanyId: workspaceCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId,
        billingAccountId: account.id,
        commercialMode: 'self_serve',
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      trx,
    );

    await trx('workspace_billing_ownership')
      .where({ workspace_company_id: workspaceCompanyId, ended_at: null })
      .update({ ended_at: new Date('2026-06-01T00:00:00.000Z') });

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId,
        billingAccountId: account.id,
        commercialMode: 'firm_managed',
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      trx,
    );

    const duringFirst = await resolveWorkspaceBillingContext(
      workspaceCompanyId,
      { db: trx, at: new Date('2026-03-01T00:00:00.000Z') },
    );
    expect(duringFirst?.commercialMode).toBe('self_serve');

    const duringSecond = await resolveWorkspaceBillingContext(
      workspaceCompanyId,
      { db: trx, at: new Date('2026-07-01T00:00:00.000Z') },
    );
    expect(duringSecond?.commercialMode).toBe('firm_managed');
  });

  it('includes client billing account when set on firm_managed ownership', async () => {
    const firmCompanyId = await insertTestCompany(trx, 'f2', 'accounting_firm');
    const clientCompanyId = await insertTestCompany(trx, 'c2');
    const firmAccount = await createBillingAccount(
      { ownerCompanyId: firmCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );
    const clientAccount = await createBillingAccount(
      { ownerCompanyId: clientCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );

    await createWorkspaceBillingOwnership(
      {
        workspaceCompanyId: clientCompanyId,
        billingAccountId: firmAccount.id,
        clientBillingAccountId: clientAccount.id,
        commercialMode: 'firm_managed',
      },
      trx,
    );

    const context = await resolveWorkspaceBillingContext(clientCompanyId, {
      db: trx,
    });

    expect(context?.clientBillingAccountId).toBe(clientAccount.id);
    expect(context?.clientBillingAccount).toMatchObject({
      id: clientAccount.id,
      ownerCompanyId: clientCompanyId,
      ownerType: 'business',
    });
  });
});
