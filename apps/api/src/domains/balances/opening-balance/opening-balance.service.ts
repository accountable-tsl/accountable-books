import type { Knex } from 'knex';
import z from 'zod';

import { knexClient as db } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { createCoa } from '../../chart-of-accounts/coa.model.js';
import {
  postJournalRecord,
  reverseJournalRecord,
} from '../../journals/journals.model.js';
import { updateBankCurrentBalance } from '../bank-current-balance.js';
import { bankOpeningBalanceParams } from './opening-balance.types.js';
import {
  asOfDateYmdFromCoverageStart,
  journalDateFromCoverageStart,
  ymdUtc,
} from './opening-balance.utils.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankAccountOpeningBalances,
  BankOpeningBalanceParams,
  BankOpeningBalanceRole,
} from './opening-balance.types.js';

/**
 * Sets or updates the opening balance for a bank account.
 *
 * Rules:
 * - The first-ever record becomes the baseline (journal posted at 00:00Z of coverage_start day).
 * - User-entered balances override the existing baseline (old journal reversed, old role → checkpoint).
 * - System-calculated or snapshot origins append checkpoint-only records (no journal).
 * - Once a company has a conversion_date, all opening balance writes are blocked.
 *
 * Date conventions:
 * - as_of_date (DATE): end of the prior UTC day (closing position).
 * - journal.date (timestamp): start of the new period (opening position).
 */
export async function setBankOpeningBalance({
  params,
  userId,
  trx,
}: {
  params: BankOpeningBalanceParams;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    openingBalanceId: string;
    journalBatchId?: string;
    openingBalanceCoaId?: string;
  } | null>
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

  // Pre-validate coverage window
  if (coverage_start > coverage_end) {
    const message = `Invalid coverage window: coverage_start '${coverage_start.toISOString()}' > coverage_end '${coverage_end.toISOString()}'`;
    if (trx) {
      throw new Error(message);
    }
    return errorResponse(message);
  }

  // Convention: as_of_date (DATE) is the previous UTC calendar day of coverage_start
  const asOfDateYmd = asOfDateYmdFromCoverageStart(coverage_start); // for DB DATE
  const journalDate = journalDateFromCoverageStart(coverage_start); // for journal timestamp

  const exec = async (tx: Knex.Transaction) => {
    // Fetch bank account and company details
    const bankAccount = await tx('bank_accounts')
      .where({
        'bank_accounts.id': bank_account_id,
        'bank_accounts.is_deleted': false,
      })
      .join('companies', 'bank_accounts.company_id', 'companies.id')
      .select(
        'companies.id as company_id',
        'companies.year_end_month',
        'companies.year_end_day',
        'companies.conversion_date',
        'companies.default_timezone',
        'bank_accounts.coa_id',
        'bank_accounts.id as bank_account_id',
        'bank_accounts.currency_id',
        'bank_accounts.account_number_mask as mask',
      )
      .first<{
        company_id: string;
        conversion_date: string | null;
        year_end_month: number;
        default_timezone: string;
        year_end_day: number;
        coa_id: string;
        bank_account_id: string;
        currency_id: string;
        mask: string;
      }>();

    if (!bankAccount) {
      throw new Error('Bank account not found');
    }

    // Strict post-conversion lock: once conversion_date is set, OB writes are disallowed
    if (bankAccount.conversion_date) {
      const message = `Opening balances are locked after conversion date is set: ${new Date(bankAccount.conversion_date).toDateString()}.`;
      throw new Error(message);
    }

    // Get current baseline, lock to avoid race conditions
    const existingBaseline = await tx('bank_account_opening_balances')
      .where({ bank_account_id, role: 'baseline', is_deleted: false })
      .forUpdate()
      .first<BankAccountOpeningBalances>();

    if (existingBaseline) {
      const existingAsOfYmd =
        typeof existingBaseline.as_of_date === 'string'
          ? existingBaseline.as_of_date
          : ymdUtc(existingBaseline.as_of_date as Date);

      if (
        existingAsOfYmd === asOfDateYmd &&
        Number(existingBaseline.amount) === Number(amount) &&
        new Date(existingBaseline.coverage_start).getTime() ===
          coverage_start.getTime() &&
        new Date(existingBaseline.coverage_end).getTime() ===
          coverage_end.getTime() &&
        existingBaseline.origin === origin
      ) {
        return successResponse(
          'Opening balance already exists with same parameters',
          {
            openingBalanceId: existingBaseline.id,
            journalBatchId: existingBaseline.journal_batch_id || undefined,
          },
        );
      }
    }

    let equityCoaId: string | undefined;
    const postBaselineJournal = async (): Promise<string> => {
      // Get-or-create Equity COA
      const existingEquityCoa = await tx('coa')
        .select('id')
        .where({
          company_id: bankAccount.company_id,
          name: 'Opening Balance Equity',
          source: 'system',
          is_deleted: false,
        })
        .first<{ id: string }>();

      if (existingEquityCoa) {
        equityCoaId = existingEquityCoa.id;
      } else {
        const coaResult = await createCoa({
          data: [
            {
              name: 'Opening Balance Equity',
              accountTypeKey: 'eq_other',
              description: 'System account for opening balances',
              isActive: true,
              locked: true,
              source: 'system',
            },
          ],
          userId,
          companyId: bankAccount.company_id,
          trx: tx,
        });

        if (!coaResult.success || !coaResult.data?.coaIds?.[0]) {
          throw new Error('Failed to create opening balance equity coa');
        }

        equityCoaId = coaResult.data.coaIds[0];
      }

      const journalResult = await postJournalRecord({
        data: {
          date: ymdUtc(journalDate),
          title: `Bank Opening Balance - ${bankAccount.mask}`,
          description: `Opening balance for bank account - ${bankAccount.mask} (${origin})`,
          status: 'posted',
          currencyId: bankAccount.currency_id,
          entries: [
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

      return journalResult.data.journalBatchId;
    };

    // Decide action (per policy)
    // Decide baseline vs checkpoint behavior
    // We intentionally keep at most one baseline per bank_account.
    // The baseline represents the current trusted opening balance (with journal).
    // All other records are historical checkpoints for auditability only.

    let newRole: BankOpeningBalanceRole = 'checkpoint';
    let reverseOld = false;
    let postJournal = false;

    if (!existingBaseline) {
      // First-ever baseline, becomes the baseline
      newRole = 'baseline';
      postJournal = true;
    } else if (origin === 'user_entered') {
      // User-entered always becomes baseline, reverses old
      // We treat this as a deliberate correction — the new baseline overrides the old.
      newRole = 'baseline';
      reverseOld = !!existingBaseline.journal_batch_id;
      postJournal = true;
    } else {
      // Otherwise, it’s system-generated (snapshot or calculated)
      newRole = 'checkpoint';
      reverseOld = false;
      postJournal = false;
    }

    // If replacing a baseline, flip old to checkpoint and reverse its journal (if any)
    // If a new baseline is being created, demote the old baseline to checkpoint
    // and reverse its journal (if one existed) to maintain a clean audit trail.
    if (existingBaseline && newRole === 'baseline') {
      await tx('bank_account_opening_balances')
        .where({ id: existingBaseline.id })
        .update({
          role: 'checkpoint',
          updated_by_id: userId,
          updated_at: tx.fn.now(),
        });

      if (reverseOld && existingBaseline.journal_batch_id) {
        await reverseJournalRecord({
          journalBatchId: existingBaseline.journal_batch_id,
          companyId: bankAccount.company_id,
          reversalReason: `Superseded by opening balance dated ${asOfDateYmd}`,
          userId,
          trx: tx,
        });
      }
    }

    // Insert new opening balance
    const inserted = await tx('bank_account_opening_balances')
      .insert({
        bank_account_id,
        as_of_date: asOfDateYmd,
        amount,
        origin,
        role: newRole,
        coverage_start,
        coverage_end,
        metadata: { ...metadata, coverage_start, coverage_end },
        created_by_id: userId,
        updated_by_id: userId,
      })
      .returning('*')
      .catch(async (e) => {
        if (e?.code === '23505') {
          const winner = await tx('bank_account_opening_balances')
            .where({ bank_account_id, role: 'baseline', is_deleted: false })
            .first();
          if (winner) return [winner];
        }
        throw e;
      });

    const x = await tx('bank_account_current_native_balances')
      .where({
        bank_account_id: bank_account_id,
      })
      .first();
    if (!x) {
      await updateBankCurrentBalance({
        companyId: bankAccount.company_id,
        bankAccountId: bank_account_id,
        balance: amount,
        client: tx,
      });
    }
    const newBalance = inserted[0];

    let journalBatchId: string | undefined;

    // 7) Journal only for baseline (pre-conversion; we already enforce pre-conv above)
    if (postJournal && newRole === 'baseline') {
      journalBatchId = await postBaselineJournal();
      await tx('bank_account_opening_balances')
        .where({ id: newBalance.id })
        .update({ journal_batch_id: journalBatchId });
    }

    return successResponse('Opening balance created successfully', {
      openingBalanceId: newBalance.id,
      journalBatchId,
      openingBalanceCoaId: equityCoaId,
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

/**
 * Get the best (most recent) opening balance before a specific date
 * Searches ALL opening balances (active AND inactive) to find the most recent one
 * This is critical for finding checkpoint balances created during backfills
 *
 * @param bankAccountId - UUID of the bank account
 * @param beforeDate - Date (YYYY-MM-DD) to search before
 * @param trx - Optional Knex transaction
 * @returns Most recent opening balance before the date, or null
 */
export async function getBestOpeningBalanceBeforeDate({
  bankAccountId,
  beforeDate,
  trx,
}: {
  bankAccountId: string;
  beforeDate: string; // YYYY-MM-DD format
  trx?: Knex.Transaction;
}): Promise<BankAccountOpeningBalances | null> {
  const client = trx || db;

  const result = await client('bank_account_opening_balances')
    .where({
      bank_account_id: bankAccountId,
      is_deleted: false,
    })
    .where('as_of_date', '<', beforeDate)
    .orderBy('as_of_date', 'desc')
    .first();

  return result || null;
}
