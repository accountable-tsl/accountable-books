import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { getBankAccountBalances } from '../balances/balances.model.js';
import {
  type AddBankTransactionsResponse,
  bankTransactionBatchInputCamel,
  type BankTransactionBatchInputCamel,
  type BankTransactionFilters,
  bankTransactionsFilters,
  newBankTransaction,
  type NewBankTransaction,
} from './bankTransactions.types.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { categorizationStatus, debitCredit } from '../../core/types/core.js';
import { snakeToCamel } from '../../shared/utils/formatting.utils.js';
import { buildBankTransactionQuery } from './bankTransactions.utils.js';
import crypto from 'crypto';
import dayjs from 'dayjs';

function generateExternalId(input: {
  date: Date;
  amount: number;
  payee: string;
  description: string;
  bankAccountId: string;
}): string {
  const { date, amount, payee, description, bankAccountId } = input;
  const formattedDate = dayjs(date).format('YYYY-MM-DD');
  const amountHash = Number(amount).toFixed(4);
  const payeeNorm = (payee || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const descNorm = (description || '').toLowerCase().replace(/\s+/g, ' ').trim();

  return crypto
    .createHash('sha256')
    .update(`${formattedDate}|${amountHash}|${payeeNorm}|${descNorm}|${bankAccountId}`)
    .digest('hex');
}

export async function addNewBankTransactions({
  userId,
  companyId,
  data,
}: {
  userId: string;
  companyId: string;
  data: BankTransactionBatchInputCamel;
}): Promise<ApiResponse<AddBankTransactionsResponse>> {
  try {
    const validateInput = bankTransactionBatchInputCamel.safeParse(data);
    if (!validateInput.success) {
      return errorResponse(`Invalid input provided`, validateInput.error.flatten());
    }

    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    const batch = validateInput.data;
    if (!batch.fingerprint) {
      return errorResponse('Fingerprint is required for deduplication');
    }

    const result: ApiResponse<AddBankTransactionsResponse> = await knexClient.transaction(
      async (trx) => {
        // Fetch the relevant bank account, join companies for reportingCurrencyId. Also acts to verify bank account exists
        const bankAccount = await trx('bank_accounts as ba')
          .select(
            'ba.id as bankAccountId',
            'ba.currency_id as bankCurrencyId',
            'c.reporting_currency_id as reportingCurrencyId',
          )
          .join('companies as c', 'ba.company_id', 'c.id')
          .where({
            'ba.id': batch.bank_account_id,
            'ba.company_id': companyUUID,
            'ba.is_deleted': false,
          })
          .first();

        if (!bankAccount) return errorResponse('Bank account not found');
        const { bankAccountId, bankCurrencyId, reportingCurrencyId } = bankAccount;

        // Fetch existing transactions to calculate balanceBefore
        /**
         * I guess  we can just use getBankAccountBalances, not sure which is best
         * const existingTransactions = await trx("BankTransaction").where({ bank_account_id: data.bankAccountId }).orderBy("date", "asc");
         * const balanceBefore = existingTransactions.reduce((total: Decimal, txn: any) => total.plus(new Decimal(txn.amount)),new Decimal(0));
         */
        //

        const balanceBeforeResponse = await getBankAccountBalances(trx, companyUUID, {
          includeStats: true,
          bankAccountIds: [bankAccountId],
        });
        if (!balanceBeforeResponse.success || !balanceBeforeResponse.data) {
          return errorResponse('Failed to calculate balance before new transactions');
        }
        const balanceBeforeObj = balanceBeforeResponse.data[bankAccountId];

        //   ----
        // Sort and Calculate or verify batch total
        const sortedTransactions = [...batch.bank_transactions].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

        let currentRunningBalance = balanceBeforeObj.nativeBalance;
        let batchTotal = 0;

        // Prepare each transaction, resolve system exchange rate
        const preparedTransactions: NewBankTransaction[] = await Promise.all(
          sortedTransactions.map(async (txn) => {
            const txnAmount = Number(txn.amount);
            batchTotal = batchTotal += txnAmount;
            currentRunningBalance = currentRunningBalance += txnAmount;

            // Resolve exchange rate perhaos we could skip this if reportingCurrencyId === bankCurrencyId
            let exr: number;

            if (reportingCurrencyId === bankCurrencyId) {
              exr = 1;
            } else {
              const exchangeRate = await determineExchangeRate(
                txn.date,
                reportingCurrencyId,
                bankCurrencyId,
              );
              if (exchangeRate === null) {
                throw new Error(
                  `Exchange rate not available for ${txn.date}: ${reportingCurrencyId} to ${bankCurrencyId}`,
                );
              }
              exr = Number(exchangeRate);
            }
            const external_id = generateExternalId({
              date: txn.date,
              amount: txn.amount,
              payee: txn.payee || '',
              description: txn.description || '',
              bankAccountId: bankAccountId,
            });

            const txForDb = {
              ...txn,
              external_id,
              amount: txnAmount,
              system_exchange_rate: exr,
              categorization_status: categorizationStatus.enum.uncategorized,
              bank_transaction_batch_id: undefined, // to be set after batch inser
              created_by_id: userId,
              updated_by_id: userId,
            };

            const validateTx = newBankTransaction.safeParse(txForDb);
            if (!validateTx.success) {
              throw new Error(validateTx.error.message);
            }

            // Compose prepared transaction
            return validateTx.data;
          }),
        );

        // Confirm balance after
        const balanceAfter = balanceBeforeObj.nativeBalance + batchTotal;

        let balanceWarning: {
          message: string;
          calculatedBalance: string;
          runningBalance: string;
        } | null = null;
        if (Math.abs(balanceAfter - currentRunningBalance) > 0.0001) {
          balanceWarning = {
            message: 'Balance calculation mismatch detected',
            calculatedBalance: balanceAfter.toString(),
            runningBalance: currentRunningBalance.toString(),
          };
          console.warn('Balance mismatch in batch import:', balanceWarning);
        }

        // Insert bank transaction batch
        const batchInsertResult = await trx('bank_transaction_batches')
          .insert({
            bank_account_id: bankAccountId,
            import_date: new Date(),
            start_date: batch.start_date,
            end_date: batch.end_date,
            source: batch.source,
            balance_before: balanceBeforeObj.nativeBalance,
            balance_after: balanceAfter,
            import_row_count: preparedTransactions.length,
            fingerprint: batch.fingerprint,
            source_metadata: batch.source_metadata || null,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .onConflict(['bank_account_id', 'fingerprint'])
          .ignore()
          .returning(['id', 'start_date', 'end_date', 'balance_before', 'balance_after', 'source']);

        if (!batchInsertResult.length) {
          // Check if batch already exists
          const existingBatch = await trx('bank_transaction_batches')
            .select(['id', 'start_date', 'end_date', 'balance_before', 'balance_after', 'source'])
            .where('bank_account_id', bankAccountId)
            .andWhere('fingerprint', batch.fingerprint)
            .first();

          if (!existingBatch) {
            return errorResponse('An unknown error occurred');
          }

          const countResult = await trx('bank_transactions')
            .where({ bank_transaction_batch_id: existingBatch.id })
            .count<{ count: string }>('* as count')
            .first();

          const count = countResult ? countResult.count : '0';

          return errorResponse('This batch was previously imported', {
            batch: snakeToCamel(existingBatch),
            transactionsCount: Number(count),
            inserted: 0,
            skippedDuplicates: Number(count),
            balanceAfter: existingBatch?.balance_after,
            note: 'This batch was previously imported',
          });
        }

        const thisBatch = batchInsertResult[0];

        // Insert prepared transactions with batch id
        const insertedTxns = await trx('bank_transactions')
          .insert(
            preparedTransactions.map((txn) => ({
              ...txn,
              bank_transaction_batch_id: thisBatch.id,
            })),
          )
          .onConflict(['bank_account_id', 'external_id', 'date'])
          .ignore()
          .returning('id');

        const inserted = insertedTxns.length;
        const skippedDuplicates = preparedTransactions.length - inserted;

        // Return balance sorted by date and created_at if not already sorted
        //   ----
        // Return result
        return successResponse<AddBankTransactionsResponse>('Transactions imported successfully', {
          batch: snakeToCamel(thisBatch) as AddBankTransactionsResponse['batch'],
          transactionsCount: preparedTransactions.length,
          inserted,
          skippedDuplicates,
          batchTotal,
          balanceAfter,
          balanceWarning: balanceWarning
            ? {
                message: balanceWarning.message,
                calculatedBalance: balanceWarning.calculatedBalance,
                runningBalance: balanceWarning.runningBalance,
              }
            : undefined,
        });
      },
    );

    return result;
  } catch (error) {
    return errorResponse('Failed to import transactions', error);
  }
}

// async function recalcBalancesAfterBatchDelete(knex, bankAccountId, deletedBatchStartDate) {
//   // Fetch all batches for the account, ordered by start_date
//   const batches = await knex('bank_transaction_batches')
//     .where('bank_account_id', bankAccountId)
//     .andWhere('start_date', '>', deletedBatchStartDate)
//     .orderBy('start_date');

//   let runningBalance = /* fetch latest balance_before before deleted batch */;

//   for (const batch of batches) {
//     // sum up all transaction amounts in batch
//     const sum = await knex('bank_transactions')
//       .where('bank_transaction_batch_id', batch.id)
//       .andWhere('is_deleted', false)
//       .sum('amount as total')
//       .first();

//     const balanceBefore = runningBalance;
//     const balanceAfter = balanceBefore + Number(sum.total || 0);

//     // update batch balances
//     await knex('bank_transaction_batches')
//       .where('id', batch.id)
//       .update({
//         balance_before: balanceBefore,
//         balance_after: balanceAfter,
//       });

//     runningBalance = balanceAfter;
//   }
// }

export async function getBankTransactions(companyId: string, filters: BankTransactionFilters) {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      return errorResponse('Invalid company ID');
    }

    const validateFilters = bankTransactionsFilters.safeParse(filters);
    if (!validateFilters.success) {
      return errorResponse(validateFilters.error.message);
    }
    const validFilters = validateFilters.data;

    const baseQuery = buildBankTransactionQuery({
      knex: knexClient,
      companyId: companyUUID,
      filters: validFilters,
    });

    const transactionsQuery = baseQuery;

    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .countDistinct('BankTransaction.id as total')
      .first();

    const [transactions, countResult] = await Promise.all([transactionsQuery, countQuery]);

    const total = countResult ? parseInt(String(countResult.total), 10) : 0;

    return successResponse('Bank transactions retrieved successfully', {
      transactions,
      total,
      pageSize: validFilters?.pageSize || total,
      currentPage: validFilters?.currentPage || 1,
    });
  } catch (error) {
    return errorResponse('Failed to get retrieve bank transactions', error);
  }
}
