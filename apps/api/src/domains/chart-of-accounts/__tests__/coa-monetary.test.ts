import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import { getTestCompanyId } from '../../../../test/helpers.js';
import {
  buildMonetaryMap,
  isMonetaryEntry,
  prefetchMonetaryCoaIds,
} from '../coa-monetary.js';

describe('coa-monetary', () => {
  describe('isMonetaryEntry', () => {
    const reportingId = '00000000-0000-4000-8000-000000000001';
    const foreignId = '00000000-0000-4000-8000-000000000002';
    const cashCoaId = '00000000-0000-4000-8000-000000000010';
    const expenseCoaId = '00000000-0000-4000-8000-000000000011';
    const monetaryCoaIds = new Set([cashCoaId]);

    it('honours explicit is_monetary override', () => {
      expect(
        isMonetaryEntry(
          {
            coa_id: expenseCoaId,
            source_currency_id: reportingId,
            is_monetary: true,
          },
          reportingId,
          new Set(),
        ),
      ).toBe(true);
      expect(
        isMonetaryEntry(
          {
            coa_id: cashCoaId,
            source_currency_id: reportingId,
            is_monetary: false,
          },
          reportingId,
          monetaryCoaIds,
        ),
      ).toBe(false);
    });

    it('uses COA default_monetary when is_monetary is unset', () => {
      expect(
        isMonetaryEntry(
          { coa_id: cashCoaId, source_currency_id: reportingId },
          reportingId,
          monetaryCoaIds,
        ),
      ).toBe(true);
      expect(
        isMonetaryEntry(
          { coa_id: expenseCoaId, source_currency_id: reportingId },
          reportingId,
          monetaryCoaIds,
        ),
      ).toBe(false);
    });

    it('treats foreign-currency lines as monetary', () => {
      expect(
        isMonetaryEntry(
          { coa_id: expenseCoaId, source_currency_id: foreignId },
          reportingId,
          new Set(),
        ),
      ).toBe(true);
    });
  });

  describe('buildMonetaryMap', () => {
    it('indexes entries in order', () => {
      const reportingId = '00000000-0000-4000-8000-000000000001';
      const cashCoaId = '00000000-0000-4000-8000-000000000010';
      const expenseCoaId = '00000000-0000-4000-8000-000000000011';

      const map = buildMonetaryMap(
        [
          { coa_id: cashCoaId, source_currency_id: reportingId },
          { coa_id: expenseCoaId, source_currency_id: reportingId },
        ],
        reportingId,
        new Set([cashCoaId]),
      );

      expect(map.get(0)).toBe(true);
      expect(map.get(1)).toBe(false);
    });
  });

  describe('prefetchMonetaryCoaIds', () => {
    let trx: Knex.Transaction;

    beforeEach(async () => {
      trx = await getTestDb().transaction();
    });

    afterEach(async () => {
      await trx.rollback();
    });

    it('returns monetary COAs for the company', async () => {
      const companyId = await getTestCompanyId(trx, 'bizDemoUS');

      const cashCoa = await trx('coa')
        .where({ company_id: companyId })
        .join('account_types', 'coa.account_type_id', 'account_types.id')
        .where('account_types.key', 'ca_bank')
        .select('coa.id')
        .first();

      const expenseCoa = await trx('coa')
        .where({ company_id: companyId })
        .join('account_types', 'coa.account_type_id', 'account_types.id')
        .where('account_types.key', 'exp_opex_office_supplies')
        .select('coa.id')
        .first();

      if (!cashCoa || !expenseCoa) {
        throw new Error('Demo company missing required COAs');
      }

      const monetary = await prefetchMonetaryCoaIds(
        companyId,
        [cashCoa.id, expenseCoa.id],
        trx,
      );

      expect(monetary.has(cashCoa.id)).toBe(true);
      expect(monetary.has(expenseCoa.id)).toBe(false);
    });
  });
});
