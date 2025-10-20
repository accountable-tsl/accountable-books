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
import { enqueueBankBalance } from '../../jobs/queues/balance-recalc.queue.js';
import {
  getActiveOpeningBalance,
  setOpeningBalance,
} from '../balances/openingBalance.service.js';

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
    bank_account_id,
    bank_transactions,
    opening_balance,
    closing_balance,
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
      const { bankCurrencyId, reportingCurrencyId, conversionDate } =
        bankAccount;

      /**
       * Before inserting the batch:
       * - Confirm that the conversion date is not set, If it is we just skip this step and continue with the rest of the flow
       * - Check if there is an existing opening balance record for the bank account (A)
       * - No existing opening balance record:
       *    - Create an opening balance anchor record:
       *      - as_of_date = end-of-day of the day BEFORE earliest txn
       *      - opening balance is provided in params or derived from closing balance provided ** opening_amount = closing_at_t_close − Σ(txns in (as_of EOD, t_close]]**
       *    - Post a single GL opening JE (Dr Bank / Cr Opening Balance Equity) for opening_amoun
       *    - Enqueue a bank balance calculation job that is aware this is the first opening balance record and creates daily snapshot using this opening balance record as the starting point.
       *
       * - If there is an existing opening balance record,
       * - Let E = earliest txn date, cStart..Cend = coverrage_start..coverage_end on A
       *   Basically, we are checking if the earliest txn date is outside the coverage of the existing opening balance record
       * - Case 1. If it is i.e E > Cend, no opening balance activity/adjustment is needed. Just proceed with the rest of the flow. and enqueue bank recalc for [E → today]
       *
       * - Case 2 E < Cstart (strictly BEFORE existing coverage - pure early backfill)
       * - If it is not (i.e. the first transaction in this batch is earlier than the opening balance record date):
       *    - Prepare to create an opening balance anchor record (Prepare a NEW opening balance anchor with new_as_of_date = end-of-day of day BEFORE E.)
       *    - Determine the opening balance record that'll come right after this newly inserted one
       *    - Compute what the opening balance for this new batch should be based on the existing opening balance record (referred above) (Recompute opening_amount against the SAME t_close used by A)
       *    - Verify landing: derived opening amount + Σ(all txns in (new_as_of EOD, t_close]] = closing_at_t_close
       *    - If opening balance is provided in the params or derived from closing balance provided, and this computation above doesn't match, we should log an error and fail the transaction
       *    - If it matches or opening balance & closing balance is not provided, we should create the new opening balance anchor record
       *    - Replace GL opening: VOID old opening JE, POST new opening JE and Enqueue bank recalc for [Cstart → today]
       * - Case 3. If first transaction date happens to be the same as the existing opening balance record date,
       * - i.e E ∈ [Cstart .. Cend] (INSIDE existing coverage, including same-day earlier time), we should do the following:
       *    - Recompute opening_amount using SAME t_close and the expanded window (which now includes these lines). Verify landing as above
       *    - Create a new journal entry for the GL and void the existing journal entry but link them using ids and add a note both journals
       *    - Enqueue a bank balance recalculation job and GL balance recalculation job from this date to today
       *    - Otherwise, enqueue a bank balance recalculation job (for the new anchor date to the last transaction date)
       *
       * - “Verify landing” = ensure recomputed timeline still reaches the same trusted closing (the t_close previously used).
       * - In any case, current balance table should only be updated when a first opening balance record is created or updated and never again
       */
      const existingActiveOpeningBalance = await getActiveOpeningBalance({
        bankAccountId: bank_account_id,
        trx: txn,
      });

      // Only proceed if:
      // 1. No active opening balance exists, OR
      // 2. Active one is system_calculated (can be replaced)

      if (!existingActiveOpeningBalance) {
        let openingBalance: number | null;
        if (opening_balance) {
          openingBalance = opening_balance;
        } else if (closing_balance) {
          openingBalance = closing_balance - sumOfTransactions;
        } else {
          openingBalance = null;
        }

        if (openingBalance) {
          const openingBalanceResult = await setOpeningBalance({
            params: {
              bank_account_id,
              amount: openingBalance,
              coverage_start: earliestTxn.date,
              coverage_end: latestTxn.date,
              origin: 'system_calculated',
              metadata: {
                source: 'transaction_import',
                note: 'Opening balance created from transaction import',
              },
            },
            userId,
            trx: txn,
          });

          if (!openingBalanceResult.success) {
            throw new Error(
              `Failed to create opening balance: ${openingBalanceResult.error}`,
            );
          }

          log('opening_balance_created', {
            openingBalanceId: openingBalanceResult.data?.openingBalanceId,
            journalBatchId: openingBalanceResult.data?.journalBatchId,
            amount: openingBalance,
            coverageStart: earliestTxn.date,
            coverageEnd: latestTxn.date,
          });
        }
      } else if (existingActiveOpeningBalance.origin === 'user_conversion') {
        // Do nothing
      } else {
        // existingActive.origin === 'system_calculated'
        const E = earliestTxn.date;
        const Cstart = existingActiveOpeningBalance.coverage_start;
        const Cend = existingActiveOpeningBalance.coverage_end;

        if (E > Cend) {
          // Case 1: New transactions AFTER existing coverage - no OB adjustment needed
          log('transactions_after_coverage_window', {
            earliestTxn: E.toISOString(),
            coverageEnd: Cend.toISOString(),
            note: 'No opening balance adjustment required',
          });
          // Just proceed with normal transaction import flow
        } else if (E < Cstart) {
          // Case 2: Pure early backfill - create NEW earlier opening balance
          log('early_backfill', {
            earliestTxn: E.toISOString(),
            coverageStart: Cstart.toISOString(),
            note: 'Creating new earlier opening balance',
          });

          // Compute new OB by working backward from existing OB
          const txnsInWindow = bank_transactions.filter(
            (t) => t.date >= E && t.date < Cstart,
          );
          const sumInWindow = txnsInWindow.reduce(
            (sum, t) => sum + Number(t.amount),
            0,
          );

          const computedOpeningAmount =
            Number(existingActiveOpeningBalance.amount) - sumInWindow;

          // Verify landing if user provided opening_balance
          if (opening_balance !== undefined && opening_balance !== null) {
            const diff = Math.abs(computedOpeningAmount - opening_balance);
            if (diff > 0.01) {
              // 1 cent tolerance
              log('landing_verification_failed', {
                computed: computedOpeningAmount,
                provided: opening_balance,
                difference: diff,
                note: 'Proceeding with user-provided value',
              });
            }
          }

          // Create new opening balance (will auto-deactivate old one via setOpeningBalance)
          const obResult = await setOpeningBalance({
            params: {
              bank_account_id,
              amount: computedOpeningAmount,
              coverage_start: E,
              coverage_end: latestTxn.date > Cend ? latestTxn.date : Cend,
              origin: 'system_calculated',
              metadata: {
                source: 'backfill',
                note: 'Earlier transactions imported - opening balance updated',
                supersedes: existingActiveOpeningBalance.id,
                verification:
                  opening_balance !== undefined
                    ? {
                        userProvided: opening_balance,
                        systemComputed: computedOpeningAmount,
                      }
                    : undefined,
              },
            },
            userId,
            trx: txn,
          });

          if (!obResult.success) {
            log('opening_balance_update_failed', {
              error: obResult.message,
              note: 'Continuing with transaction import',
            });
          } else {
            log('opening_balance_updated', {
              newOpeningBalanceId: obResult.data?.openingBalanceId,
              newJournalBatchId: obResult.data?.journalBatchId,
              amount: computedOpeningAmount,
              supersededId: existingActiveOpeningBalance.id,
            });
          }
        } else {
          {
            // Case 3: Inside coverage - no adjustment needed
            log('transactions_overlap_coverage');
            // Do nothing
          }
        }
      }

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

          return {
            ...tx,
            txn_at: tx.txn_at || tx.date,
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
