import type { Knex } from 'knex';
import { type MonoAccountDetails } from '../baccons.types.js';
import { getCurrencyByCode } from '../../currencies/currencies.model.js';
import { knexClient } from '../../../db/knexClient.js';
import { createNewBankAccount } from '../../banking/bankAccounts/bankAccounts.model.js';
import { AppError } from '../../../shared/utils/response.utils.js';
import { resolveBankFromMonoDetails } from './resolveBank.js';
import { resolveCurrency } from './resolveCurrency.js';

export async function createBankAccount({
  userId,
  companyId,
  accountName,
  accountNumber,
  bankId,
  currencyId,
  trx,
}: {
  userId: string;
  companyId: string;
  accountName: string;
  accountNumber: string;
  bankId: string;
  currencyId: string;
  trx?: Knex.Transaction;
}) {
  const execute = async (knex: Knex.Transaction) => {
    // Create bank account
    const result = await createNewBankAccount({
      companyId,
      userId,
      data: {
        displayName: accountName,
        accountName: accountName,
        accountNumber: accountNumber,
        bankId,
        currencyId,
      },
      trx,
    });

    if (!result.success) {
      throw new Error(result.message || 'Bank account creation failed');
    }

    return {
      success: true,
      bankAccountId: result.data?.id,
    };
  };

  try {
    return trx ? await execute(trx) : await knexClient.transaction(execute);
  } catch (err: any) {
    throw new AppError(err instanceof Error ? err.message : 'Bank account creation failed', {
      companyId,
      accountName,
    });
  }
}
