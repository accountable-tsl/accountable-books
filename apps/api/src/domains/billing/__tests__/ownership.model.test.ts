import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { createBillingAccount } from '../accounts/accounts.model.js';
import {
  createWorkspaceBillingOwnership,
  endWorkspaceBillingOwnership,
  getCurrentWorkspaceBillingOwnership,
  listWorkspaceBillingOwnershipHistory,
} from '../ownership/ownership.model.js';

async function insertTestCompany(
  trx: Knex.Transaction,
  suffix: string,
): Promise<string> {
  const testUserId = await getTestUserId(trx, US_USER_EMAIL);
  const testCurrencyId = await getCurrencyId(trx, 'USD');
  const country = await trx('countries').where('code', 'US').first();
  if (!country) throw new Error('US country not found');

  const [company] = await trx('companies')
    .insert({
      short_code: `${suffix}${randomUUID().slice(0, 6)}`,
      legal_name: `Ownership Test ${suffix}`,
      display_name: `Ownership Test ${suffix}`,
      type: 'business',
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

describe('ownership.model', () => {
  let trx: Knex.Transaction;
  let workspaceCompanyId: string;
  let billingAccountId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    workspaceCompanyId = await insertTestCompany(trx, 'w');
    const account = await createBillingAccount(
      { ownerCompanyId: workspaceCompanyId, invoiceCurrencyCode: 'USD' },
      trx,
    );
    billingAccountId = account.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('createWorkspaceBillingOwnership', () => {
    it('creates self_serve ownership row', async () => {
      const row = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'self_serve',
        },
        trx,
      );

      expect(row).toMatchObject({
        workspace_company_id: workspaceCompanyId,
        billing_account_id: billingAccountId,
        client_billing_account_id: null,
        commercial_mode: 'self_serve',
        software_payer: 'billing_account',
        ended_at: null,
      });
    });

    it('creates firm_internal ownership row', async () => {
      const row = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'firm_internal',
        },
        trx,
      );

      expect(row.commercial_mode).toBe('firm_internal');
      expect(row.client_billing_account_id).toBeNull();
    });

    it('creates firm_managed ownership with optional client billing account', async () => {
      const clientCompanyId = await insertTestCompany(trx, 'c');
      const clientAccount = await createBillingAccount(
        { ownerCompanyId: clientCompanyId, invoiceCurrencyCode: 'USD' },
        trx,
      );
      const firmCompanyId = await insertTestCompany(trx, 'f');
      const firmAccount = await createBillingAccount(
        { ownerCompanyId: firmCompanyId, invoiceCurrencyCode: 'USD' },
        trx,
      );

      const row = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId: clientCompanyId,
          billingAccountId: firmAccount.id,
          clientBillingAccountId: clientAccount.id,
          commercialMode: 'firm_managed',
        },
        trx,
      );

      expect(row).toMatchObject({
        workspace_company_id: clientCompanyId,
        billing_account_id: firmAccount.id,
        client_billing_account_id: clientAccount.id,
        commercial_mode: 'firm_managed',
        software_payer: 'billing_account',
      });
    });

    it('rejects client billing account equal to payer billing account', async () => {
      await expect(
        createWorkspaceBillingOwnership(
          {
            workspaceCompanyId,
            billingAccountId,
            clientBillingAccountId: billingAccountId,
            commercialMode: 'firm_managed',
          },
          trx,
        ),
      ).rejects.toThrow(/must differ from billingAccountId/);
    });

    it('rejects disallowed ownership field combinations', async () => {
      const otherAccountId = (
        await createBillingAccount(
          {
            ownerCompanyId: await insertTestCompany(trx, 'o'),
            invoiceCurrencyCode: 'USD',
          },
          trx,
        )
      ).id;

      await expect(
        createWorkspaceBillingOwnership(
          {
            workspaceCompanyId,
            billingAccountId,
            clientBillingAccountId: otherAccountId,
            commercialMode: 'self_serve',
          },
          trx,
        ),
      ).rejects.toThrow(/clientBillingAccountId must be null/);

      await expect(
        createWorkspaceBillingOwnership(
          {
            workspaceCompanyId,
            billingAccountId,
            commercialMode: 'self_serve',
            softwarePayer: 'client_billing_account',
          },
          trx,
        ),
      ).rejects.toThrow(/softwarePayer must be billing_account/);
    });

    it('DB rejects self_serve row with client_billing_account_id set', async () => {
      const otherAccountId = (
        await createBillingAccount(
          {
            ownerCompanyId: await insertTestCompany(trx, 'db'),
            invoiceCurrencyCode: 'USD',
          },
          trx,
        )
      ).id;

      await expect(
        trx('workspace_billing_ownership').insert({
          workspace_company_id: workspaceCompanyId,
          billing_account_id: billingAccountId,
          client_billing_account_id: otherAccountId,
          commercial_mode: 'self_serve',
          software_payer: 'billing_account',
          effective_at: new Date(),
        }),
      ).rejects.toThrow(/violates check constraint/);
    });

    it('rejects overlapping active ownership rows', async () => {
      await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'self_serve',
        },
        trx,
      );

      await expect(
        createWorkspaceBillingOwnership(
          {
            workspaceCompanyId,
            billingAccountId,
            commercialMode: 'self_serve',
          },
          trx,
        ),
      ).rejects.toThrow(/Active workspace billing ownership already exists/);
    });

    it('rejects overlapping ownership windows', async () => {
      const jan1 = new Date('2026-01-01T00:00:00.000Z');
      const jan15 = new Date('2026-01-15T00:00:00.000Z');
      const feb1 = new Date('2026-02-01T00:00:00.000Z');

      await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'self_serve',
          effectiveAt: jan1,
        },
        trx,
      );

      await endWorkspaceBillingOwnership(workspaceCompanyId, feb1, trx);

      await expect(
        createWorkspaceBillingOwnership(
          {
            workspaceCompanyId,
            billingAccountId,
            commercialMode: 'firm_managed',
            effectiveAt: jan15,
          },
          trx,
        ),
      ).rejects.toThrow(/Overlapping workspace billing ownership window/);
    });
  });

  describe('ownership transitions and history', () => {
    it('ends an ownership row and creates a successor row', async () => {
      const first = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'self_serve',
          effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        trx,
      );

      const endedAt = new Date('2026-06-01T00:00:00.000Z');
      const ended = await endWorkspaceBillingOwnership(
        workspaceCompanyId,
        endedAt,
        trx,
      );
      expect(ended?.id).toBe(first.id);
      expect(ended?.ended_at).toEqual(endedAt);

      const second = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'firm_managed',
          effectiveAt: endedAt,
        },
        trx,
      );

      const history = await listWorkspaceBillingOwnershipHistory(
        workspaceCompanyId,
        trx,
      );
      expect(history).toHaveLength(2);
      expect(history[0].commercial_mode).toBe('self_serve');
      expect(history[1].id).toBe(second.id);
    });

    it('resolves historical ownership by at', async () => {
      await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'self_serve',
          effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        trx,
      );

      await endWorkspaceBillingOwnership(
        workspaceCompanyId,
        new Date('2026-06-01T00:00:00.000Z'),
        trx,
      );

      await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'firm_managed',
          effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        trx,
      );

      const duringFirst = await getCurrentWorkspaceBillingOwnership(
        workspaceCompanyId,
        trx,
        new Date('2026-03-01T00:00:00.000Z'),
      );
      expect(duringFirst?.commercial_mode).toBe('self_serve');

      const duringSecond = await getCurrentWorkspaceBillingOwnership(
        workspaceCompanyId,
        trx,
        new Date('2026-07-01T00:00:00.000Z'),
      );
      expect(duringSecond?.commercial_mode).toBe('firm_managed');
    });

    it('recognizes firm_internal as non-billable managed ownership', async () => {
      const row = await createWorkspaceBillingOwnership(
        {
          workspaceCompanyId,
          billingAccountId,
          commercialMode: 'firm_internal',
        },
        trx,
      );

      expect(row.commercial_mode).toBe('firm_internal');
      const current = await getCurrentWorkspaceBillingOwnership(
        workspaceCompanyId,
        trx,
      );
      expect(current?.commercial_mode).toBe('firm_internal');
    });
  });
});
