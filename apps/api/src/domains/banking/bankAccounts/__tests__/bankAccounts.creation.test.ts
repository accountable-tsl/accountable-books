import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../../config/test-db.js';
import {
  getCurrencyId,
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../../test/helpers.js';
import {
  createBankAccountWithConnection,
  createManualBankAccount,
} from '../bankAccounts.model.js';

describe('bank account creation', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let bankId: string;
  let reportingCurrencyId: string;

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'bizDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);

    const [bank, company] = await Promise.all([
      trx('banks').select('id').first<{ id: string }>(),
      trx('companies')
        .where({ id: companyId })
        .first<{ reporting_currency_id: string }>('reporting_currency_id'),
    ]);

    if (!bank || !company?.reporting_currency_id) {
      throw new Error('Expected test bank and company reporting currency');
    }

    bankId = bank.id;
    reportingCurrencyId = company.reporting_currency_id;
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates and links a reporting-currency COA for a foreign-currency bank account', async () => {
    const accountNumber = randomUUID();
    const coaName = `Foreign bank COA ${randomUUID()}`;
    const bankCurrencyId = await getCurrencyId(trx, 'GBP');

    const result = await createManualBankAccount({
      trx,
      companyId,
      userId,
      params: {
        displayName: `Foreign bank ${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyId: bankCurrencyId,
        coaName,
      },
    });

    expect(result.success).toBe(true);

    const bankAccount = await trx('bank_accounts')
      .where({ id: result.data!.bankAccountId })
      .first<{ coa_id: string; currency_id: string }>('coa_id', 'currency_id');
    const coa = await trx('coa')
      .where({ id: result.data!.coaId })
      .first<{ currency_id: string; name: string }>('currency_id', 'name');
    const currentVersion = await trx('coa_versions')
      .where({ coa_id: result.data!.coaId })
      .whereNull('effective_to')
      .first<{ version_seq: number }>('version_seq');

    expect(bankAccount).toEqual({
      coa_id: result.data!.coaId,
      currency_id: bankCurrencyId,
    });
    expect(coa).toEqual({
      currency_id: reportingCurrencyId,
      name: coaName,
    });
    expect(currentVersion?.version_seq).toBe(1);
  });

  it('rolls back the associated COA when bank-account insertion fails', async () => {
    const accountNumber = randomUUID();
    const coaName = `Rolled back bank COA ${randomUUID()}`;
    const before = await countCompanyRows(trx, companyId);

    const result = await createBankAccountWithConnection({
      companyId,
      userId,
      params: {
        displayName: `Invalid connected bank ${randomUUID()}`,
        accountNumber,
        accountType: 'checkings_current',
        businessOrPersonal: 'business',
        bankId,
        currencyCode: 'USD',
        coaName,
        providerId: randomUUID(),
        providerBankAccountId: randomUUID(),
        connectionCredentialId: randomUUID(),
        connectionStatus: 'connected',
      },
    });

    expect(result.success).toBe(false);
    expect(await countCompanyRows(trx, companyId)).toEqual(before);
    expect(
      await trx('coa').where({ company_id: companyId, name: coaName }).first(),
    ).toBeUndefined();
    expect(
      await trx('bank_accounts')
        .where({ company_id: companyId, account_number: accountNumber })
        .first(),
    ).toBeUndefined();
  });
});

async function countCompanyRows(
  trx: Knex.Transaction,
  companyId: string,
): Promise<{
  coa: number;
  coaVersions: number;
  bankAccounts: number;
  snapshotVersion: bigint;
}> {
  const [coa, coaVersions, bankAccounts, snapshot] = await Promise.all([
    countRows(trx('coa').where({ company_id: companyId })),
    countRows(
      trx('coa_versions')
        .join('coa', 'coa_versions.coa_id', 'coa.id')
        .where({ 'coa.company_id': companyId }),
    ),
    countRows(trx('bank_accounts').where({ company_id: companyId })),
    trx('coa_snapshot_versions')
      .where({ company_id: companyId })
      .first<{ snapshot_version: string | number | bigint }>(
        'snapshot_version',
      ),
  ]);

  return {
    coa,
    coaVersions,
    bankAccounts,
    snapshotVersion: BigInt(snapshot?.snapshot_version ?? 0),
  };
}

async function countRows(query: Knex.QueryBuilder): Promise<number> {
  const row = await query.count<{ count: string }>('* as count').first();
  return Number(row?.count ?? 0);
}
