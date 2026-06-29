import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { queueBroker } from '../../../jobs/queues/queue-broker.js';
import { balanceRecalcQueue } from '../../balances/balance-recalc.queue.js';
import { enrichmentQueue } from '../../categorization/enrichment/enrichment.queue.js';
import { addNewBankTransactions } from '../bankTransactions.model.js';

async function createFreshBankAccount(
  trx: Knex.Transaction,
  companyId: string,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .first('bank_id', 'coa_id');
  if (!existing) {
    throw new Error('Demo company has no bank account to template from');
  }
  const company = await trx('companies')
    .where({ id: companyId })
    .first('reporting_currency_id');

  const [account] = await trx('bank_accounts')
    .insert({
      display_name: 'Import After-Commit Test Account',
      account_number: `IAC-${randomUUID()}`,
      bank_id: existing.bank_id,
      currency_id: company.reporting_currency_id,
      company_id: companyId,
      coa_id: existing.coa_id,
      connection_status: 'not_connected',
      created_by_id: userId,
    })
    .returning('id');

  return account.id;
}

function buildImportPayload(bankAccountId: string) {
  return {
    source: 'manual_entry' as const,
    bank_account_id: bankAccountId,
    source_metadata: {},
    bank_transactions: [
      {
        transaction_date: new Date('2025-02-01'),
        amount: -25,
        bank_account_id: bankAccountId,
      },
    ],
  };
}

describe('addNewBankTransactions after-commit side effects (Phase 0)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queueBroker.configure({ disableAll: true, logSkipped: false });
  });

  it('does not enqueue balance or enrichment when the import rolls back', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });

    const balanceGetJob = vi
      .spyOn(balanceRecalcQueue, 'getJob')
      .mockResolvedValue(undefined);
    const balanceAdd = vi
      .spyOn(balanceRecalcQueue, 'add')
      .mockResolvedValue({ id: 'balance-job' } as never);
    const enrichmentAdd = vi
      .spyOn(enrichmentQueue, 'add')
      .mockResolvedValue({ id: 'enrichment-job' } as never);

    const trx = await getTestDb().transaction();
    try {
      const companyId = await getTestCompanyId(trx, 'bizDemoUS');
      const userId = await getTestUserId(trx, US_USER_EMAIL);
      const bankAccountId = await createFreshBankAccount(
        trx,
        companyId,
        userId,
      );

      const result = await addNewBankTransactions({
        userId,
        companyId,
        trx,
        data: buildImportPayload(bankAccountId),
      });
      expect(result.success).toBe(true);
    } finally {
      await trx.rollback();
    }

    await new Promise((resolve) => setImmediate(resolve));

    expect(balanceGetJob).not.toHaveBeenCalled();
    expect(balanceAdd).not.toHaveBeenCalled();
    expect(enrichmentAdd).not.toHaveBeenCalled();
  });

  it('enqueues balance and enrichment when the import commits', async () => {
    queueBroker.configure({ disableAll: false, logSkipped: false });

    const balanceGetJob = vi
      .spyOn(balanceRecalcQueue, 'getJob')
      .mockResolvedValue(undefined);
    const balanceAdd = vi
      .spyOn(balanceRecalcQueue, 'add')
      .mockResolvedValue({ id: 'balance-job' } as never);
    const enrichmentAdd = vi
      .spyOn(enrichmentQueue, 'add')
      .mockResolvedValue({ id: 'enrichment-job' } as never);

    const trx = await getTestDb().transaction();
    const companyId = await getTestCompanyId(trx, 'bizDemoUS');
    const userId = await getTestUserId(trx, US_USER_EMAIL);
    const bankAccountId = await createFreshBankAccount(trx, companyId, userId);

    const result = await addNewBankTransactions({
      userId,
      companyId,
      trx,
      data: buildImportPayload(bankAccountId),
    });
    expect(result.success).toBe(true);
    await trx.commit();

    await new Promise((resolve) => setImmediate(resolve));

    expect(balanceGetJob).toHaveBeenCalled();
    expect(balanceAdd).toHaveBeenCalled();
    expect(enrichmentAdd).toHaveBeenCalled();
  });
});
