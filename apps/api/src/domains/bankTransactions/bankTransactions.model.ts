import { knexClient } from '../../db/knexClient.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  bankTransactionBatchInput,
  type BankTransactionFilters,
  type BankTransactionInput,
  bankTransactionsFilters,
  type NewBankTransaction,
  type BankTransactionBatchInput,
  deleteBankTransactionsInput,
  type DeleteBankTransactionsInput,
} from './bankTransactions.types.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { categorizationStatus } from '../../core/types/core.js';
import {
  buildBankTransactionQuery,
  generateBatchFingerprint,
} from './bankTransactions.utils.js';
import { ensurePartitionsForDates } from '../../shared/services/partitionManagement.service.js';
import { logger } from '../../shared/utils/logger.js';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { generateFingerprintSync } from '../../shared/index.js';
import {
  enqueueTransactionEnrichment,
  handleTransactionsDeleted,
  emitTxnDeletedEvent,
} from '../categorization/index.js';
import { enqueueBankBalance } from '../balances/index.js';

export async function addNewBankTransactions({
  userId,
  companyId,
  data,
  trx,
}: {
  userId: string;
  companyId: string;
  data: BankTransactionBatchInput;
  trx?: Knex.Transaction;
}) {
  const traceId = randomUUID();
  const startTime = Date.now();

  const log = (phase: string, data?: Record<string, any>) => {
    const duration_ms = Date.now() - startTime;
    logger.info(
      {
        traceId,
        phase,
        duration_ms,
        companyId,
        ...data,
      },
      `[${traceId}] BankTxn.${phase} (${duration_ms}ms)`,
    );
  };

  // Input validation
  log('started', {
    transactionCount: data.bank_transactions?.length || 0,
    bankAccountId: data.bank_account_id,
    source: data.source,
  });

  const validate = bankTransactionBatchInput.safeParse(data);
  if (!validate.success) {
    log('validation_failed', { issues: validate.error.issues });
    return errorResponse('Invalid input provided', {
      issues: validate.error.issues,
      traceId,
    });
  }

  const {
    source,
    provider_key: batch_provider_key,
    bank_account_id,
    bank_transactions,
    metadata,
  } = validate.data;
  log('validation_complete');

  // const sameBankAccountIds = bank_transactions.every(
  //   (tx, _, arr) => tx.bank_account_id === arr[0].bank_account_id,
  // );

  // Enforce single-account invariant
  if (!allSameAccount(bank_transactions, bank_account_id)) {
    return errorResponse(
      'All transactions must belong to the same bank account',
      { traceId },
    );
  }

  // Ensure partitions exist for all transaction dates BEFORE starting the main transaction
  // This prevents DDL-within-transaction conflicts
  const transactionDates: Date[] = [];
  let sumOfTransactions: number = 0.0;
  let earliestTxn = bank_transactions[0];
  let latestTxn = bank_transactions[0];

  for (const txn of bank_transactions) {
    transactionDates.push(txn.date);
    sumOfTransactions += Number(txn.amount);
    if (txn.date < earliestTxn.date) earliestTxn = txn;
    if (txn.date > latestTxn.date) latestTxn = txn;
  }

  await ensurePartitionsForDates('bank_transactions', transactionDates);
  try {
    // Main transaction execution
    const executeTransaction = async (txn: Knex.Transaction) => {
      // Get company UUID
      const companyUUID = await getCompanyUUID(companyId, txn);
      if (!companyUUID) {
        return errorResponse('Company not found');
      }

      // Verify bank account id exists and retrieve currency as well
      const bankAccount = await txn('bank_accounts as ba')
        .select(
          'ba.currency_id as bankCurrencyId',
          'c.reporting_currency_id as reportingCurrencyId',
          'c.conversion_date as conversionDate',
        )
        .join('companies as c', 'ba.company_id', 'c.id')
        .where({
          'ba.id': bank_account_id,
          'ba.company_id': companyUUID,
          'ba.is_deleted': false,
        })
        .first();

      if (!bankAccount) {
        return errorResponse(`Bank account not found: ${bank_account_id}`, {
          bank_account_id,
          traceId,
        });
      }
      const { bankCurrencyId, reportingCurrencyId } = bankAccount;

      // Build batch insert object
      // Determine start and end dates
      // const { startDate, endDate } = getMinMaxDates(bank_transactions);
      const startDate = earliestTxn.date;
      const endDate = latestTxn.date;
      const fingerprint = generateBatchFingerprint(bank_transactions);
      const [batch] = await txn('bank_transaction_batches')
        .insert({
          bank_account_id,
          start_date: startDate,
          end_date: endDate,
          source,
          fingerprint,
          import_row_count: bank_transactions.length,
          metadata,
          created_by_id: userId,
          updated_by_id: userId,
        })
        .onConflict(['bank_account_id', 'fingerprint'])
        .ignore()
        .returning(['id', 'start_date', 'end_date', 'fingerprint']);

      if (!batch) {
        log('duplicate_batch', { fingerprint });
        return errorResponse('This batch was previously imported', {
          bank_account_id,
          fingerprint,
          traceId,
        });
      }

      log('batch_created', {
        batchId: batch.id,
        dateRange: `${startDate} to ${endDate}`,
        fingerprint,
      });

      // Extract contacts, perhaps create a set of unique contacts and insert them
      const uniquePayees = [
        ...new Set(
          bank_transactions
            .map((tx) => tx.payee?.trim())
            .filter((payee): payee is string => !!payee),
        ),
      ];

      if (uniquePayees.length > 0) {
        await txn('contacts')
          .insert(
            uniquePayees.map((payee) => ({
              company_id: companyUUID,
              display_name: payee,
              normalized_name: payee.toLowerCase(),
              created_by_id: userId,
              updated_by_id: userId,
            })),
          )
          .onConflict(['company_id', 'normalized_name'])
          .ignore();

        log('contacts_created', { count: uniquePayees.length });
      }

      const createdContacts = uniquePayees.length
        ? await txn('contacts')
            .select(['id', 'normalized_name'])
            .where({ company_id: companyUUID })
            .whereIn(
              'normalized_name',
              uniquePayees.map((p) => p.toLowerCase()),
            )
        : [];

      const contactIdByName = new Map(
        createdContacts.map((r) => [r.normalized_name, r.id as string]),
      );

      const sameCurrency = reportingCurrencyId === bankCurrencyId;

      // Pre-fetch all unique exchange rates in one optimized query
      const uniqueDates = !sameCurrency
        ? [...new Set(bank_transactions.map((tx) => tx.date))]
        : [];

      const fxRates = new Map<string, number>();

      if (uniqueDates.length > 0) {
        const fxStartTime = Date.now();

        // Fetch all required exchange rates in parallel
        const ratePromises = uniqueDates.map(async (date) => {
          const rate = await determineExchangeRate({
            date,
            fromCurrencyId: bankCurrencyId,
            toCurrencyId: reportingCurrencyId,
          });
          return { date, rate };
        });

        const rates = await Promise.all(ratePromises);

        // Build rate map and check for missing rates
        const missingDates: string[] = [];
        rates.forEach(({ date, rate }) => {
          if (rate === null) {
            missingDates.push(date.toISOString());
          } else {
            fxRates.set(date.toISOString(), Number(rate));
          }
        });

        if (missingDates.length > 0) {
          throw new Error(
            `Missing exchange rates for dates: ${missingDates.join(', ')}`,
          );
        }

        log('fx_rates_fetched', {
          uniqueDates: uniqueDates.length,
          fetchTime_ms: Date.now() - fxStartTime,
        });
      }

      // Prepare transactions (now synchronous since rates are pre-fetched)
      const preparedTransactions: NewBankTransaction[] = bank_transactions.map(
        (tx) => {
          const rate = sameCurrency ? 1 : fxRates.get(tx.date.toISOString());

          if (!rate) {
            throw new Error(`Missing exchange rate for ${tx.date}`);
          }

          const generatedExternalId = generateExternalId({
            date: tx.date,
            amount: tx.amount,
            payee: tx.payee || '',
            description: tx.description || '',
            bankAccountId: bank_account_id,
          });

          const contactId = tx.payee
            ? contactIdByName.get(tx.payee.trim().toLowerCase())
            : undefined;

          const txSource =
            (batch_provider_key && source === 'bank_feed'
              ? batch_provider_key
              : source) || null;

          return {
            ...tx,
            txn_at: tx.txn_at || tx.date,
            bank_account_id,
            contact_id: contactId,
            contact_type_snapshot: tx.contact_type_snapshot ?? null,
            external_id: tx.external_id || generatedExternalId,
            amount: Number(tx.amount),
            system_exchange_rate: Number(rate),
            categorization_status: categorizationStatus.enum.uncategorized,
            bank_transaction_batch_id: batch.id,
            created_by_id: userId,
            updated_by_id: userId,
            source: txSource,
          };
        },
      );

      log('transactions_prepared', {
        count: preparedTransactions.length,
      });

      const insertedTxns = await txn('bank_transactions')
        .insert(preparedTransactions)
        .onConflict(['bank_account_id', 'external_id', 'date'])
        .ignore()
        .returning('id');

      const inserted = insertedTxns.length;
      const skipped = preparedTransactions.length - inserted;

      log('transactions_inserted', {
        inserted,
        skipped,
        totalProcessed: preparedTransactions.length,
      });

      // Trigger balance recalculation if transactions were inserted
      if (inserted > 0) {
        try {
          const earliestTxnAt = preparedTransactions.reduce<Date | null>(
            (earliest, txn) => {
              const txnAt = txn.txn_at as Date | undefined;
              if (!txnAt) {
                return earliest;
              }
              return !earliest || txnAt < earliest ? txnAt : earliest;
            },
            null,
          );

          if (earliestTxnAt) {
            const recalcFrom = earliestTxnAt.toISOString().split('T')[0];
            await enqueueBankBalance({
              companyId: companyUUID,
              bankAccountId: bank_account_id,
              recalcFrom,
              triggeredBy:
                source === 'file_import' ? 'csv_upload' : 'transaction',
            });

            log('balance_recalc_queued', {
              bankAccountId: bank_account_id,
              recalcFrom,
            });
          }
        } catch (error) {
          // Don't fail the transaction if balance recalc enqueue fails, Log and notify
          // TODO: Add to notification system later
          log('balance_recalc_enqueue_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            bankAccountId: bank_account_id,
          });
        }

        // Trigger transaction enrichment for categorization
        try {
          const insertedTransactionIds = insertedTxns.map((txn) => txn.id);
          await enqueueTransactionEnrichment({
            companyId: companyUUID,
            bankAccountId: bank_account_id,
            bankTransactionIds: insertedTransactionIds,
            source: 'ingestion',
          });

          log('enrichment_queued', {
            bankAccountId: bank_account_id,
            transactionCount: insertedTransactionIds.length,
          });
        } catch (error) {
          // Don't fail the transaction if enrichment enqueue fails, just log
          log('enrichment_enqueue_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            bankAccountId: bank_account_id,
          });
        }
      }

      log('completed', {
        inserted,
        skipped,
        totalDuration_ms: Date.now() - startTime,
        metrics: {
          transactionCount: bank_transactions.length,
          uniqueDates: uniqueDates.length,
          uniquePayees: uniquePayees.length,
          avgTimePerTransaction:
            (Date.now() - startTime) / bank_transactions.length,
        },
      });

      return successResponse(
        `${inserted} transactions processed successfully. ${skipped ? `${skipped} duplicates skipped` : ''}`,
        {
          inserted,
          skipped,
          batchId: batch.id,
          traceId,
        },
      );
    };

    // Execute within transaction
    return trx
      ? await executeTransaction(trx)
      : await knexClient.transaction(executeTransaction);
  } catch (error) {
    const errorData = {
      error: error instanceof Error ? error.message : 'Unknown error',
      phase: 'transaction_processing',
      transactionCount: bank_transactions.length,
      duration_ms: Date.now() - startTime,
    };

    log('error', errorData);

    return errorResponse('Failed to process transactions', {
      ...errorData,
      traceId,
    });
  }
}

export async function getBankTransactions(
  companyId: string,
  filters: BankTransactionFilters,
) {
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

    const [transactions, countResult] = await Promise.all([
      transactionsQuery,
      countQuery,
    ]);

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

export async function deleteBankTransactions({
  companyId,
  userId,
  input,
  trx,
}: {
  companyId: string;
  userId: string;
  input: DeleteBankTransactionsInput;
  trx?: Knex.Transaction;
}) {
  const validate = deleteBankTransactionsInput.safeParse(input);
  if (!validate.success) {
    return errorResponse('Invalid request body', validate.error.flatten());
  }

  const { bankTransactionIds, reason } = validate.data;

  try {
    const execute = async (txn: Knex.Transaction) => {
      const companyUUID = await getCompanyUUID(companyId, txn);
      if (!companyUUID) {
        return {
          response: errorResponse('Company not found'),
        };
      }

      const deletedRows = await txn('bank_transactions')
        .where('company_id', companyUUID)
        .whereIn('id', bankTransactionIds)
        .andWhere('is_deleted', false)
        .update({
          is_deleted: true,
          deleted_at: txn.fn.now(),
          updated_at: txn.fn.now(),
          updated_by_id: userId,
        })
        .returning('id');

      const deletedIds = deletedRows.map((row) => row.id);

      if (deletedIds.length > 0) {
        await handleTransactionsDeleted({
          bankTransactionIds: deletedIds,
          reason,
          trx: txn,
        });
      }

      return {
        response: successResponse('Transactions deleted', {
          deleted: deletedIds.length,
        }),
        companyUUID,
        deletedIds,
      };
    };

    const result = trx
      ? await execute(trx)
      : await knexClient.transaction(execute);

    if ('companyUUID' in result && (result.deletedIds?.length ?? 0) > 0) {
      await emitTxnDeletedEvent({
        company_uuid: result.companyUUID!,
        bank_transaction_ids: result.deletedIds || [],
        reason: reason ?? null,
      });
    }

    return result.response;
  } catch (error) {
    logger.error(
      {
        companyId,
        userId,
        bankTransactionIds,
        error,
      },
      'Failed to delete bank transactions',
    );
    return errorResponse('Failed to delete bank transactions');
  }
}

function allSameAccount(txns: BankTransactionInput[], bankAccountId: string) {
  return (
    txns.length > 0 && txns.every((t) => t.bank_account_id === bankAccountId)
  );
}

function getMinMaxDates(transactions: BankTransactionInput[]) {
  if (transactions.length === 0) {
    throw new Error('Cannot compute date range from empty list');
  }

  let minDate = new Date(transactions[0].date);
  let maxDate = minDate;

  for (let i = 1; i < transactions.length; i++) {
    const date = new Date(transactions[i].date);
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
  }

  return {
    startDate: minDate.toISOString().split('T')[0],
    endDate: maxDate.toISOString().split('T')[0],
  };
}

function generateExternalId(input: {
  date: Date;
  amount: number;
  payee: string;
  description: string;
  bankAccountId: string;
}): string {
  const { date, amount, payee, description, bankAccountId } = input;
  const formattedDate = date.toISOString().split('T')[0]; // dayjs(date).format('YYYY-MM-DD');
  const amountHash = Number(amount).toFixed(4);
  const payeeNorm = (payee || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const descNorm = (description || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return generateFingerprintSync(
    `${formattedDate}|${amountHash}|${payeeNorm}|${descNorm}|${bankAccountId}`,
  );
}
