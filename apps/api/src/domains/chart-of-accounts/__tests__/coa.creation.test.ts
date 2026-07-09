import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { ErrorCode } from '../../../shared/utils/response.utils.js';
import {
  createCoaAccount,
  createCoaAccounts,
  createDefaultAccounts,
} from '../coa.model.js';

import type { CreateCoaAccountInput } from '../coa.model.js';

type CoaRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  locked: boolean;
  source: string;
  company_id: string;
  currency_id: string;
  account_type_id: string;
  created_by_id: string;
  updated_by_id: string | null;
  version_seq: number;
};

const uniqueValue = (prefix: string) => `${prefix}-${randomUUID()}`;

describe('COA creation', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let reportingCurrencyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);

    const company = await trx('companies')
      .where({ id: companyId })
      .first<{ reporting_currency_id: string }>('reporting_currency_id');

    if (!company?.reporting_currency_id) {
      throw new Error('Expected demo company to have a reporting currency');
    }
    reportingCurrencyId = company.reporting_currency_id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates and initializes a batch atomically using company reporting currency', async () => {
    const firstName = uniqueValue('Batch expense');
    const secondName = uniqueValue('Batch revenue');
    const firstCode = uniqueValue('BATCH-EXP');
    const snapshotBefore = await trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .first<{
        snapshot_version: string | number | bigint;
      }>('snapshot_version');

    const { coaIds } = await createCoaAccounts({
      trx,
      companyId,
      userId,
      versionNote: 'test_batch_creation',
      accounts: [
        {
          name: firstName,
          code: firstCode,
          account_type_key: 'exp_opex_office_supplies',
        },
        {
          name: secondName,
          account_type_key: 'rev_revenue',
          description: 'Created by the batch operation',
          is_active: false,
          locked: true,
          source: 'system',
        },
      ],
    });

    expect(coaIds).toHaveLength(2);

    const rows = await trx('coa')
      .whereIn('id', coaIds)
      .orderBy('name')
      .select<CoaRow[]>('*');
    const rowsByName = new Map(rows.map((row) => [row.name, row]));

    expect(rowsByName.get(firstName)).toMatchObject({
      code: firstCode,
      description: null,
      is_active: true,
      locked: false,
      source: 'user',
      company_id: companyId,
      currency_id: reportingCurrencyId,
      created_by_id: userId,
      updated_by_id: userId,
      version_seq: 1,
    });
    expect(rowsByName.get(secondName)).toMatchObject({
      code: null,
      description: 'Created by the batch operation',
      is_active: false,
      locked: true,
      source: 'system',
      company_id: companyId,
      currency_id: reportingCurrencyId,
      created_by_id: userId,
      updated_by_id: userId,
      version_seq: 1,
    });

    const versions = await trx('coa_versions')
      .whereIn('coa_id', coaIds)
      .select('coa_id', 'version_seq', 'effective_to', 'changeset');
    expect(versions).toHaveLength(2);
    expect(versions).toEqual(
      expect.arrayContaining(
        coaIds.map((coaId) =>
          expect.objectContaining({
            coa_id: coaId,
            version_seq: 1,
            effective_to: null,
            changeset: null,
          }),
        ),
      ),
    );

    const snapshotAfter = await trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .first<{
        snapshot_version: string | number | bigint;
        notes: string | null;
      }>('snapshot_version', 'notes');
    if (!snapshotAfter) {
      throw new Error('Expected batch creation to initialize a snapshot');
    }
    expect(snapshotAfter.notes).toBe('test_batch_creation');
    expect(BigInt(snapshotAfter.snapshot_version)).toBe(
      BigInt(snapshotBefore?.snapshot_version ?? 0) + 1n,
    );
  });

  it('normalizes names and codes before persistence', async () => {
    const name = uniqueValue('Normalized account');

    const { coaIds } = await createCoaAccounts({
      trx,
      companyId,
      userId,
      accounts: [
        {
          name: `  ${name}  `,
          code: '   ',
          account_type_key: 'ca_other',
        },
      ],
    });

    const row = await trx('coa')
      .where({ id: coaIds[0] })
      .first<{ name: string; code: string | null }>('name', 'code');
    expect(row).toEqual({ name, code: null });
  });

  it('ignores a supplied currency and always uses company reporting currency', async () => {
    const otherCurrencyId = await getCurrencyId(trx, 'GBP');
    expect(otherCurrencyId).not.toBe(reportingCurrencyId);

    const accounts = [
      {
        name: uniqueValue('Currency override attempt'),
        account_type_key: 'ca_other',
        currency_id: otherCurrencyId,
      },
    ] as unknown as CreateCoaAccountInput[];

    const { coaIds } = await createCoaAccounts({
      trx,
      companyId,
      userId,
      accounts,
    });

    const row = await trx('coa')
      .where({ id: coaIds[0] })
      .first<{ currency_id: string }>('currency_id');
    expect(row?.currency_id).toBe(reportingCurrencyId);
  });

  it('has a database backstop against non-reporting-currency COAs', async () => {
    const otherCurrencyId = await getCurrencyId(trx, 'GBP');
    const accountType = await trx('account_types')
      .where({ key: 'ca_other' })
      .first<{ id: string }>('id');

    if (!accountType) {
      throw new Error('Expected ca_other account type to exist');
    }

    await expect(
      trx.transaction((savepoint) =>
        savepoint('coa').insert({
          name: uniqueValue('Wrong currency'),
          account_type_id: accountType.id,
          company_id: companyId,
          currency_id: otherCurrencyId,
          created_by_id: userId,
          updated_by_id: userId,
        }),
      ),
    ).rejects.toThrow('COA currency must match company reporting currency');
  });

  it('creates one fully initialized account through createCoaAccount', async () => {
    const name = uniqueValue('Single account');

    const created = await createCoaAccount({
      trx,
      companyId,
      userId,
      input: {
        name,
        account_type_key: 'ca_other',
      },
    });

    const row = await trx('coa').where({ id: created.id }).first<CoaRow>();
    const version = await trx('coa_versions')
      .where({ coa_id: created.id, effective_to: null })
      .first<{ version_seq: number }>('version_seq');

    expect(row).toMatchObject({
      name,
      company_id: companyId,
      currency_id: reportingCurrencyId,
      version_seq: 1,
    });
    expect(version?.version_seq).toBe(1);
  });

  it('rejects an empty batch without writing anything', async () => {
    const countBefore = await countCompanyCoa(trx, companyId);

    const operation = createCoaAccounts({
      trx,
      companyId,
      userId,
      accounts: [],
    });
    await expect(operation).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
      message: 'At least one chart of account is required',
    });

    expect(await countCompanyCoa(trx, companyId)).toBe(countBefore);
  });

  it('rejects an invalid batch without writing valid rows from that batch', async () => {
    const validName = uniqueValue('Should not persist');
    const countBefore = await countCompanyCoa(trx, companyId);

    await expect(
      createCoaAccounts({
        trx,
        companyId,
        userId,
        accounts: [
          {
            name: validName,
            account_type_key: 'ca_other',
          },
          {
            name: '   ',
            account_type_key: 'ca_other',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid chart of accounts input',
    });

    expect(await countCompanyCoa(trx, companyId)).toBe(countBefore);
    expect(
      await trx('coa')
        .where({ company_id: companyId, name: validName })
        .first(),
    ).toBeUndefined();
  });

  it('rejects unknown account types before writing any rows', async () => {
    const name = uniqueValue('Unknown type');
    const countBefore = await countCompanyCoa(trx, companyId);

    const operation = createCoaAccounts({
      trx,
      companyId,
      userId,
      accounts: [
        {
          name,
          account_type_key: uniqueValue('unknown-type'),
        },
      ],
    });
    await expect(operation).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
      message: expect.stringContaining('Account types not found'),
    });

    expect(await countCompanyCoa(trx, companyId)).toBe(countBefore);
  });

  it('rejects a missing company before writing any rows', async () => {
    await expect(
      createCoaAccounts({
        trx,
        companyId: randomUUID(),
        userId,
        accounts: [
          {
            name: uniqueValue('Missing company'),
            account_type_key: 'ca_other',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Company or reporting currency not found',
    });
  });

  it('treats differently named active locked accounts as satisfying must-have types', async () => {
    const customName = uniqueValue('Custom receivables');
    const existing = await trx('coa')
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where({
        'coa.company_id': companyId,
        'coa.is_active': true,
        'coa.is_deleted': false,
        'coa.locked': true,
        'account_types.key': 'ca_trade_receivable',
      })
      .first<{ id: string }>('coa.id');

    if (!existing) {
      throw new Error('Expected demo company to have required receivables COA');
    }

    await trx('coa').where({ id: existing.id }).update({ name: customName });
    const countBefore = await countQualifyingAccountsByType(
      trx,
      companyId,
      'ca_trade_receivable',
    );

    await createDefaultAccounts({ trx, companyUUID: companyId, userId });
    await createDefaultAccounts({ trx, companyUUID: companyId, userId });

    expect(
      await countQualifyingAccountsByType(
        trx,
        companyId,
        'ca_trade_receivable',
      ),
    ).toBe(countBefore);
    expect(
      await trx('coa')
        .where({ id: existing.id })
        .first<{ name: string }>('name'),
    ).toEqual({ name: customName });
  });

  it('does not treat inactive or unlocked accounts as satisfying must-have types', async () => {
    const existing = await trx('coa')
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where({
        'coa.company_id': companyId,
        'account_types.key': 'ca_trade_receivable',
      })
      .select<{ id: string }[]>('coa.id');

    if (existing.length === 0) {
      throw new Error('Expected demo company to have a receivables COA');
    }

    for (const account of existing) {
      await trx('coa')
        .where({ id: account.id })
        .update({
          name: uniqueValue('Non-qualifying receivables'),
          is_active: false,
          locked: false,
        });
    }

    expect(
      await countQualifyingAccountsByType(
        trx,
        companyId,
        'ca_trade_receivable',
      ),
    ).toBe(0);

    await createDefaultAccounts({ trx, companyUUID: companyId, userId });

    expect(
      await countQualifyingAccountsByType(
        trx,
        companyId,
        'ca_trade_receivable',
      ),
    ).toBe(1);
    expect(
      await trx('coa')
        .where({ company_id: companyId, name: 'Trade Receivables' })
        .first<{ is_active: boolean; locked: boolean }>('is_active', 'locked'),
    ).toEqual({ is_active: true, locked: true });
  });

  it.each([
    {
      conflict: 'name',
      accounts: () => {
        const name = uniqueValue('Duplicate name');
        return [
          { name, account_type_key: 'ca_other' },
          { name: name.toUpperCase(), account_type_key: 'rev_revenue' },
        ];
      },
    },
    {
      conflict: 'code',
      accounts: () => {
        const code = uniqueValue('DUPLICATE-CODE');
        return [
          {
            name: uniqueValue('First coded account'),
            code,
            account_type_key: 'ca_other',
          },
          {
            name: uniqueValue('Second coded account'),
            code: code.toLowerCase(),
            account_type_key: 'rev_revenue',
          },
        ];
      },
    },
  ])(
    'rolls back the entire batch when case-insensitive $conflict uniqueness fails',
    async ({ accounts }) => {
      const input = accounts();
      const names = input.map((account) => account.name);
      const countBefore = await countCompanyCoa(trx, companyId);

      await expect(
        trx.transaction((savepoint) =>
          createCoaAccounts({
            trx: savepoint,
            companyId,
            userId,
            accounts: input,
          }),
        ),
      ).rejects.toMatchObject({ code: '23505' });

      expect(await countCompanyCoa(trx, companyId)).toBe(countBefore);
      expect(
        await trx('coa')
          .where({ company_id: companyId })
          .whereIn('name', names)
          .select('id'),
      ).toEqual([]);
    },
  );
});

async function countQualifyingAccountsByType(
  trx: Knex.Transaction,
  companyId: string,
  accountTypeKey: string,
): Promise<number> {
  const result = await trx('coa')
    .join('account_types', 'coa.account_type_id', 'account_types.id')
    .where({
      'coa.company_id': companyId,
      'coa.is_active': true,
      'coa.is_deleted': false,
      'coa.locked': true,
      'account_types.key': accountTypeKey,
    })
    .count<{ count: string }[]>('* as count');
  return Number(result[0]?.count ?? 0);
}

async function countCompanyCoa(
  trx: Knex.Transaction,
  companyId: string,
): Promise<number> {
  const result = await trx('coa')
    .where({ company_id: companyId })
    .count<{ count: string }[]>('* as count');
  return Number(result[0]?.count ?? 0);
}
