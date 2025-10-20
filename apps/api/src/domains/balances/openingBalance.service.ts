import { knexClient as db } from '../../db/knexClient.js';
import type { Knex } from 'knex';
import {
  bankOpeningBalanceParams,
  type BankAccountOpeningBalances,
  type BankOpeningBalanceParams,
} from './balances.types.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import z from 'zod';
import type { ApiResponse } from '../../core/types/api.types.js';
import {
  postJournalRecord,
  reverseJournalRecord,
} from '../journals/journals.model.js';
import { enqueueBankBalance } from '../../jobs/queues/balance-recalc.queue.js';
import { createCoa } from '../chartOfAccounts/coa.model.js';

const getAsOfDate = (coverageStart: Date) => {
  return new Date(
    Date.UTC(
      coverageStart.getUTCFullYear(),
      coverageStart.getUTCMonth(),
      coverageStart.getUTCDate() - 1,
      23,
      59,
      59,
      999,
    ),
  );
};

export async function setOpeningBalance({
  params,
  userId,
  trx,
}: {
  params: BankOpeningBalanceParams;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{ openingBalanceId: string; journalBatchId?: string }>
> {
  const v = bankOpeningBalanceParams.safeParse(params);
  if (!v.success) {
    return errorResponse('Invalid input', z.treeifyError(v.error));
  }

  const {
    bank_account_id,
    amount,
    coverage_start,
    coverage_end,
    origin,
    metadata,
  } = v.data;
  const asOfDate = getAsOfDate(coverage_start);

  const exec = async (tx: Knex.Transaction) => {
    // Fetch bank account and company details
    const bankAccount = (await tx('bank_accounts')
      .where({ id: bank_account_id, is_deleted: false })
      .join('companies', 'bank_accounts.company_id', 'companies.id')
      .select(
        'companies.id as company_id',
        'companies.conversion_date',
        'bank_accounts.coa_id',
        'bank_accounts.id as bank_account_id',
        'bank_accounts.currency_id',
        'bank_accounts.mask',
      )
      .first()) as
      | {
          company_id: string;
          conversion_date: string | null;
          coa_id: string;
          bank_account_id: string;
          currency_id: string;
          mask: string;
        }
      | undefined;

    if (!bankAccount) {
      throw new Error('Bank account not found');
    }

    // Check for existing active opening balance
    const existingActive = await tx('bank_account_opening_balances')
      .where({ bank_account_id, is_active: true, is_deleted: false })
      .first();

    // Rule 1: Cannot override user conversion balances
    if (existingActive?.origin === 'user_conversion') {
      throw new Error(
        'Cannot override user conversion balance. ' +
          'User must manually delete or update it first.',
      );
    }

    // Rule 2: New balance must be earlier (or be the first)
    const isEarlier =
      !existingActive || asOfDate < new Date(existingActive.as_of_date);

    if (existingActive && !isEarlier) {
      throw new Error(
        `Cannot set opening balance for ${asOfDate.toISOString().split('T')[0]}. ` +
          `An earlier balance already exists for ${existingActive.as_of_date}. ` +
          `New opening balances must be earlier than existing ones.`, // Likely a previous checkpoint for snapshot backfill purposes
      );
    }

    // Deactivate and reverse old balance if replacing
    if (existingActive) {
      // Deactivate the old balance
      await tx('bank_account_opening_balances')
        .where({ id: existingActive.id })
        .update({
          is_active: false,
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        });

      // REVERSE the old journal if it exists
      if (existingActive.journal_batch_id) {
        await reverseJournalRecord({
          journalBatchId: existingActive.journal_batch_id,
          reversalReason: `Superseded by earlier opening balance dated ${asOfDate.toISOString().split('T')[0]}`,
          userId,
          trx: tx,
        });
      }
    }

    // Insert new opening balance (always active)
    const [newBalance] = await tx('bank_account_opening_balances')
      .insert({
        bank_account_id,
        as_of_date: asOfDate,
        amount,
        origin,
        is_active: true,
        coverage_start,
        coverage_end,
        metadata: { ...metadata, coverage_start, coverage_end },
        created_by_id: userId,
        updated_by_id: userId,
      })
      .returning('*');

    // Don't create journal if balance is before conversion date
    const isBeforeConversion =
      bankAccount.conversion_date &&
      asOfDate < new Date(bankAccount.conversion_date);

    let journalBatchId: string | undefined;
    let equityCoaId: string | undefined;
    if (!isBeforeConversion) {
      const coaResult = await createCoa({
        data: [
          {
            name: 'Opening Balance Equity',
            accountTypeKey: 'eq_other',
            description: 'System account for opening balances',
            source: 'system',
            isActive: true,
            locked: true,
          },
        ],
        userId,
        companyId: bankAccount.company_id,
        trx: tx,
      });

      if (
        !coaResult.success ||
        !coaResult.data ||
        !coaResult.data.coaIds ||
        coaResult.data.coaIds.length === 0
      ) {
        throw new Error('Failed to create opening balance equity coa');
      }

      equityCoaId = coaResult.data.coaIds[0];

      const journalResult = await postJournalRecord({
        data: {
          date: asOfDate,
          title: `Bank Opening Balance - ${bankAccount.mask}`,
          description: `Opening balance for bank account - ${bankAccount.mask} - ${origin === 'user_conversion' ? 'User conversion' : 'System calculated'}`,
          status: 'posted',
          currencyId: bankAccount.currency_id,
          transactions: [
            {
              description: `Bank opening balance - ${bankAccount.mask}`,
              coaId: bankAccount.coa_id,
              amount: Math.abs(amount),
              side: amount >= 0 ? 'debit' : 'credit',
            },
            {
              description: `Opening Balance Equity - ${bankAccount.mask}`,
              coaId: equityCoaId,
              amount: Math.abs(amount),
              side: amount >= 0 ? 'credit' : 'debit',
            },
          ],
        },
        companyId: bankAccount.company_id,
        userId,
        trx: tx,
      });

      if (!journalResult.success || !journalResult.data) {
        throw new Error('Failed to create journal entry for opening balance');
      }

      journalBatchId = journalResult.data.journalBatchId;

      // Link journal batch to opening balance
      await tx('bank_account_opening_balances')
        .where({ id: newBalance.id })
        .update({ journal_batch_id: journalBatchId });
    }

    await enqueueBankBalance({
      companyId: bankAccount.company_id,
      bankAccountId: bank_account_id,
      recalcFrom: new Date(coverage_start).toISOString().split('T')[0],
      triggeredBy:
        origin === 'user_conversion'
          ? 'conversion_set'
          : 'opening_balance_calculated',
    });

    return successResponse('Opening balance created successfully', {
      openingBalanceId: newBalance.id,
      journalBatchId,
    });
  };

  try {
    if (trx) {
      return await exec(trx);
    } else {
      return await db.transaction(exec);
    }
  } catch (error) {
    if (trx) {
      throw error;
    }
    return errorResponse('Failed to create opening balance', error);
  }
}

export async function getOpeningBalances({
  bankAccountId,
  trx,
}: {
  bankAccountId: string;
  trx?: Knex.Transaction;
}): Promise<BankAccountOpeningBalances[]> {
  const client = trx || db;
  const openingBalances = await client('bank_account_opening_balances')
    .where({
      bank_account_id: bankAccountId,
      is_deleted: false,
    })
    .orderBy('as_of_date', 'desc');

  return openingBalances;
}

/**
 * Get the active opening balance for a bank account
 * Optionally filter by a date threshold to get opening balance before a specific date
 *
 * @param bankAccountId - UUID of the bank account
 * @param asOfBefore - Optional date (YYYY-MM-DD) to get OB before this date
 * @param trx - Optional Knex transaction
 * @returns Active opening balance record or null
 */
export async function getActiveOpeningBalance({
  bankAccountId,
  asOfBefore,
  trx,
}: {
  bankAccountId: string;
  asOfBefore?: string; // YYYY-MM-DD format
  trx?: Knex.Transaction;
}): Promise<BankAccountOpeningBalances | null> {
  const client = trx || db;

  let query = client('bank_account_opening_balances').where({
    bank_account_id: bankAccountId,
    is_active: true,
    is_deleted: false,
  });

  if (asOfBefore) {
    query = query.where('as_of_date', '<', asOfBefore);
  }

  const result = await query.orderBy('as_of_date', 'desc').first();

  return result || null;
}
