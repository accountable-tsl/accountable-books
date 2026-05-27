import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import {
  createBillingAccount,
  getBillingAccountById,
  getBillingAccountByOwnerCompanyId,
} from '../accounts/accounts.model.js';

describe('accounts.model', () => {
  let trx: Knex.Transaction;
  let ownerCompanyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();

    const testUserId = await getTestUserId(trx, US_USER_EMAIL);
    const testCurrencyId = await getCurrencyId(trx, 'USD');
    const country = await trx('countries').where('code', 'US').first();
    if (!country) throw new Error('US country not found');

    const [company] = await trx('companies')
      .insert({
        short_code: `b${randomUUID().slice(0, 8)}`,
        legal_name: 'Billing Account Test Co',
        display_name: 'Billing Account Test Co',
        type: 'business',
        country_id: country.id,
        reporting_currency_id: testCurrencyId,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        created_by_id: testUserId,
      })
      .returning('id');

    ownerCompanyId = company.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('createBillingAccount', () => {
    it('creates a billing account with valid owner company and status', async () => {
      const account = await createBillingAccount(
        {
          ownerCompanyId,
          invoiceCurrencyCode: 'usd',
          status: 'active',
        },
        trx,
      );

      expect(account).toMatchObject({
        owner_company_id: ownerCompanyId,
        invoice_currency_code: 'USD',
        status: 'active',
        billing_cycle_anchor_day: null,
        billing_timezone: null,
        current_billing_period_start_at: null,
        current_billing_period_end_at: null,
      });
      expect(account.id).toBeTruthy();
    });

    it('rejects invalid status', async () => {
      await expect(
        createBillingAccount(
          {
            ownerCompanyId,
            invoiceCurrencyCode: 'USD',
            status: 'trialing' as 'active',
          },
          trx,
        ),
      ).rejects.toThrow(/Invalid billing account status/);
    });

    it('rejects invalid billing period window', async () => {
      const start = new Date('2026-06-01T00:00:00.000Z');
      const end = new Date('2026-05-01T00:00:00.000Z');

      await expect(
        createBillingAccount(
          {
            ownerCompanyId,
            invoiceCurrencyCode: 'USD',
            currentBillingPeriodStartAt: start,
            currentBillingPeriodEndAt: end,
          },
          trx,
        ),
      ).rejects.toThrow(/currentBillingPeriodEndAt must be after/);
    });

    it('rejects duplicate owner_company_id', async () => {
      await createBillingAccount(
        { ownerCompanyId, invoiceCurrencyCode: 'USD' },
        trx,
      );

      await expect(
        createBillingAccount(
          { ownerCompanyId, invoiceCurrencyCode: 'USD' },
          trx,
        ),
      ).rejects.toThrow(/Billing account already exists for owner company/);
    });
  });

  describe('getBillingAccountByOwnerCompanyId', () => {
    it('resolves account by owner company id', async () => {
      const created = await createBillingAccount(
        { ownerCompanyId, invoiceCurrencyCode: 'USD' },
        trx,
      );

      const found = await getBillingAccountByOwnerCompanyId(
        ownerCompanyId,
        trx,
      );
      expect(found).toEqual(created);
    });

    it('returns null when no account exists', async () => {
      const found = await getBillingAccountByOwnerCompanyId(randomUUID(), trx);
      expect(found).toBeNull();
    });
  });

  describe('getBillingAccountById', () => {
    it('resolves account by id', async () => {
      const created = await createBillingAccount(
        { ownerCompanyId, invoiceCurrencyCode: 'USD' },
        trx,
      );

      const found = await getBillingAccountById(created.id, trx);
      expect(found).toEqual(created);
    });
  });
});
