import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
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
} from './bankTransactions.types.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { categorizationStatus } from '../../core/types/core.js';
import {
  buildBankTransactionQuery,
  generateBatchFingerprint,
} from './bankTransactions.utils.js';
import { ensurePartitionsForDates } from '../../shared/services/partitionManagement.service.js';
import { logger } from '../../shared/utils/logger.js';
import crypto from 'crypto';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

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

  const { source, bank_account_id, bank_transactions, metadata } =
    validate.data;
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
  const transactionDates = bank_transactions.map((txn) => new Date(txn.date));
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
      const { startDate, endDate } = getMinMaxDates(bank_transactions);
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

          return {
            ...tx,
            bank_account_id,
            contact_id: contactId,
            external_id: tx.external_id || generatedExternalId,
            amount: Number(tx.amount),
            system_exchange_rate: Number(rate),
            categorization_status: categorizationStatus.enum.uncategorized,
            bank_transaction_batch_id: batch.id,
            created_by_id: userId,
            updated_by_id: userId,
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

  return crypto
    .createHash('sha256')
    .update(
      `${formattedDate}|${amountHash}|${payeeNorm}|${descNorm}|${bankAccountId}`,
    )
    .digest('hex');
}
