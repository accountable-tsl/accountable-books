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
  getBillingAccountProfile,
  upsertBillingAccountProfile,
} from '../profiles/profiles.model.js';

describe('profiles.model', () => {
  let trx: Knex.Transaction;
  let billingAccountId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();

    const testUserId = await getTestUserId(trx, US_USER_EMAIL);
    const testCurrencyId = await getCurrencyId(trx, 'USD');
    const country = await trx('countries').where('code', 'US').first();
    if (!country) throw new Error('US country not found');

    const [company] = await trx('companies')
      .insert({
        short_code: `p${randomUUID().slice(0, 8)}`,
        legal_name: 'Billing Profile Test Co',
        display_name: 'Billing Profile Test Co',
        type: 'business',
        country_id: country.id,
        reporting_currency_id: testCurrencyId,
        year_end_day: 31,
        year_end_month: 12,
        accounting_basis: 'modified_accrual_basis',
        created_by_id: testUserId,
      })
      .returning('id');

    const account = await createBillingAccount(
      { ownerCompanyId: company.id, invoiceCurrencyCode: 'USD' },
      trx,
    );
    billingAccountId = account.id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  describe('upsertBillingAccountProfile', () => {
    it('inserts a profile for a billing account', async () => {
      const profile = await upsertBillingAccountProfile(
        {
          billingAccountId,
          legalEntityName: 'Acme LLC',
          billingEmail: 'billing@acme.test',
          billingCountryCode: 'us',
          addressJson: { line1: '1 Main St', city: 'Austin' },
        },
        trx,
      );

      expect(profile).toMatchObject({
        billing_account_id: billingAccountId,
        legal_entity_name: 'Acme LLC',
        billing_email: 'billing@acme.test',
        billing_country_code: 'US',
        tax_id: null,
        address_json: { line1: '1 Main St', city: 'Austin' },
      });
      expect(profile.id).toBeTruthy();
    });

    it('upserts in place when profile already exists', async () => {
      await upsertBillingAccountProfile(
        {
          billingAccountId,
          legalEntityName: 'Acme LLC',
          billingEmail: 'old@acme.test',
          billingCountryCode: 'US',
        },
        trx,
      );

      const updated = await upsertBillingAccountProfile(
        {
          billingAccountId,
          legalEntityName: 'Acme Holdings LLC',
          billingEmail: 'billing@acme.test',
          billingCountryCode: 'US',
          taxId: '12-3456789',
        },
        trx,
      );

      const rows = await trx('billing_account_profiles').where({
        billing_account_id: billingAccountId,
      });
      expect(rows).toHaveLength(1);
      expect(updated).toMatchObject({
        legal_entity_name: 'Acme Holdings LLC',
        billing_email: 'billing@acme.test',
        tax_id: '12-3456789',
      });
    });

    it('rejects missing required fields', async () => {
      await expect(
        upsertBillingAccountProfile(
          {
            billingAccountId,
            legalEntityName: '   ',
            billingEmail: 'billing@acme.test',
            billingCountryCode: 'US',
          },
          trx,
        ),
      ).rejects.toThrow(/legalEntityName is required/);

      await expect(
        upsertBillingAccountProfile(
          {
            billingAccountId,
            legalEntityName: 'Acme LLC',
            billingEmail: 'not-an-email',
            billingCountryCode: 'US',
          },
          trx,
        ),
      ).rejects.toThrow(/billingEmail must be a valid email/);
    });

    it('rejects invalid address_json shape', async () => {
      await expect(
        upsertBillingAccountProfile(
          {
            billingAccountId,
            legalEntityName: 'Acme LLC',
            billingEmail: 'billing@acme.test',
            billingCountryCode: 'US',
            addressJson: ['not', 'an', 'object'] as unknown as Record<
              string,
              unknown
            >,
          },
          trx,
        ),
      ).rejects.toThrow(/addressJson must be a plain object/);
    });
  });

  describe('getBillingAccountProfile', () => {
    it('returns stored legal entity, email, country, and address', async () => {
      const created = await upsertBillingAccountProfile(
        {
          billingAccountId,
          legalEntityName: 'Stored Name Inc',
          billingEmail: 'stored@acme.test',
          billingCountryCode: 'NG',
          addressJson: { city: 'Lagos' },
        },
        trx,
      );

      const found = await getBillingAccountProfile(billingAccountId, trx);
      expect(found).toEqual(created);
      expect(found?.address_json).toEqual({ city: 'Lagos' });
    });

    it('returns null when no profile exists', async () => {
      const found = await getBillingAccountProfile(randomUUID(), trx);
      expect(found).toBeNull();
    });
  });
});
