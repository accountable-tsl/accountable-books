import { randomUUID } from 'crypto';
import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { generateFingerprintSync } from '../../shared/index.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { logger } from '../../shared/utils/logger.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  ACTIVITY_EVENT_TYPE,
  writeActivityEventIntent,
} from '../activity/index.js';
import { scheduleBankBalanceAfterCommit } from '../balances/index.js';
import {
  emitTxnDeletedEvent,
  handleTransactionsDeleted,
  scheduleTransactionEnrichmentAfterCommit,
} from '../categorization/index.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { scheduleOutboxDispatchKickAfterCommit } from '../work/outbox.queue.js';
import { writeBankAccountWorkMaterializationIntent } from '../work/work-materialization-intent.js';
import {
  bankTransactionBatchInput,
  bankTransactionsFilters,
  deleteBankTransactionsInput,
  reverseBankTransactionBatchInput,
} from './bankTransactions.types.js';
import {
  buildBankTransactionQuery,
  generateBatchFingerprint,
} from './bankTransactions.utils.js';

// Contact resolution retired (v1): import disabled, callers commented out below.
// import { createBankTransactionContactResolutions } from './contactResolution.service.js';

import type {
  BankTransaction,
  BankTransactionBatchInput,
  BankTransactionContactResolutionInput,
  BankTransactionFilters,
  BankTransactionInput,
  BankTransactionWithFilteredFields,
  DeleteBankTransactionsInput,
  NewBankTransaction,
  ReverseBankTransactionBatchInput,
} from './bankTransactions.types.js';

const FX_PREFETCH_BATCH_SIZE = 10;

async function prefetchExchangeRatesByDate(input: {
  dates: Date[];
  fromCurrencyId: string;
  toCurrencyId: string;
}) {
  const uniqueDateKeys = Array.from(
    new Set(input.dates.map((date) => toYMD(date))),
  );
  const fxRates = new Map<string, number>();
  const missingDates: string[] = [];

  for (let i = 0; i < uniqueDateKeys.length; i += FX_PREFETCH_BATCH_SIZE) {
    const batchDateKeys = uniqueDateKeys.slice(i, i + FX_PREFETCH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batchDateKeys.map(async (dateKey) => {
        const rate = await determineExchangeRate({
          date: dateKey,
          fromCurrencyId: input.fromCurrencyId,
          toCurrencyId: input.toCurrencyId,
        });

        return { dateKey, rate };
      }),
    );

    batchResults.forEach(({ dateKey, rate }) => {
      if (rate === null) {
        missingDates.push(dateKey);
        return;
      }

      fxRates.set(dateKey, Number(rate));
    });
  }

  return { uniqueDateKeys, fxRates, missingDates };
}

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
    source_metadata,
    connection_credential_id,
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

  let sumOfTransactions: number = 0.0;
  let earliestTxn = bank_transactions[0];
  let latestTxn = bank_transactions[0];

  for (const txn of bank_transactions) {
    sumOfTransactions += Number(txn.amount);
    if (txn.transaction_date < earliestTxn.transaction_date) earliestTxn = txn;
    if (txn.transaction_date > latestTxn.transaction_date) latestTxn = txn;
  }

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
          'ba.connection_credential_id as connectionCredentialId',
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
      const { bankCurrencyId, reportingCurrencyId, connectionCredentialId } =
        bankAccount;

      if (
        source === 'bank_feed' &&
        connection_credential_id !== connectionCredentialId
      ) {
        return errorResponse(
          'Bank feed batch credential does not match the bank account',
          { bank_account_id, traceId },
        );
      }

      // Build batch insert object
      // Determine start and end dates
      // const { startDate, endDate } = getMinMaxDates(bank_transactions);
      const startDate = earliestTxn.transaction_date;
      const endDate = latestTxn.transaction_date;
      const fingerprint = generateBatchFingerprint(bank_transactions);
      const [batch] = await txn('bank_transaction_batches')
        .insert({
          bank_account_id,
          company_id: companyUUID,
          connection_credential_id,
          start_date: startDate,
          end_date: endDate,
          source,
          fingerprint,
          import_row_count: bank_transactions.length,
          source_metadata,
          status: 'active',
          created_by_id: userId,
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

      const sameCurrency = reportingCurrencyId === bankCurrencyId;

      // Pre-fetch all unique exchange rates in one optimized query
      const fxRates = new Map<string, number>();
      let uniqueDateKeys: string[] = [];

      if (!sameCurrency) {
        const fxStartTime = Date.now();
        const prefetched = await prefetchExchangeRatesByDate({
          dates: bank_transactions.map((tx) => tx.transaction_date),
          fromCurrencyId: bankCurrencyId,
          toCurrencyId: reportingCurrencyId,
        });
        uniqueDateKeys = prefetched.uniqueDateKeys;
        prefetched.fxRates.forEach((rate, dateKey) => {
          fxRates.set(dateKey, rate);
        });

        if (prefetched.missingDates.length > 0) {
          throw new Error(
            `Missing exchange rates for dates: ${prefetched.missingDates.join(', ')}`,
          );
        }

        log('fx_rates_fetched', {
          uniqueDates: uniqueDateKeys.length,
          fetchTime_ms: Date.now() - fxStartTime,
        });
      }

      // Prepare transactions (now synchronous since rates are pre-fetched)
      const generatedKeyOccurrences = new Map<string, number>();
      const contactResolutionByIdempotencyKey = new Map<
        string,
        BankTransactionContactResolutionInput
      >();
      const preparedTransactions: NewBankTransaction[] = bank_transactions.map(
        (tx) => {
          const { contact_resolution, ...rawTransaction } = tx;
          const rate = sameCurrency
            ? 1
            : fxRates.get(toYMD(tx.transaction_date));

          if (rate == null) {
            throw new Error(`Missing exchange rate for ${tx.transaction_date}`);
          }

          const generatedIdempotencyKey = generateIdempotencyKey({
            date: tx.transaction_date,
            amount: tx.amount,
            payee: tx.payee || '',
            description: tx.description || '',
            bankAccountId: bank_account_id,
          });
          const occurrence =
            (generatedKeyOccurrences.get(generatedIdempotencyKey) ?? 0) + 1;
          generatedKeyOccurrences.set(generatedIdempotencyKey, occurrence);
          const idempotencyKey =
            tx.idempotency_key || `${generatedIdempotencyKey}:${occurrence}`;

          if (contact_resolution) {
            contactResolutionByIdempotencyKey.set(
              idempotencyKey,
              contact_resolution,
            );
          }

          return {
            ...rawTransaction,
            transaction_at: tx.transaction_at || tx.transaction_date,
            bank_account_id,
            company_id: companyUUID,
            payee: normalizeOptionalText(tx.payee),
            reference: normalizeOptionalText(tx.reference),
            description: normalizeOptionalText(tx.description),
            additional_notes: normalizeOptionalText(tx.additional_notes),
            idempotency_key: idempotencyKey,
            source_payload: tx.source_payload ?? {},
            amount: Number(tx.amount),
            system_exchange_rate: Number(rate),
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
        .onConflict(['bank_account_id', 'idempotency_key'])
        .ignore()
        .returning([
          'id',
          'idempotency_key',
          'payee',
          'description',
          'source_payload',
          'amount',
        ]);

      const inserted = insertedTxns.length;
      const skipped = preparedTransactions.length - inserted;

      log('transactions_inserted', {
        inserted,
        skipped,
        totalProcessed: preparedTransactions.length,
      });

      // Contact resolution retired (v1) — block disabled.
      /*
      if (inserted > 0) {
        try {
          const resolutionMetrics = await txn.transaction(
            async (resolutionTrx) =>
              await createBankTransactionContactResolutions({
                trx: resolutionTrx,
                companyId: companyUUID,
                userId,
                source,
                transactions: insertedTxns.map((insertedTxn) => {
                  const importResolution =
                    contactResolutionByIdempotencyKey.get(
                      insertedTxn.idempotency_key,
                    );

                  return {
                    id: insertedTxn.id,
                    idempotency_key: insertedTxn.idempotency_key,
                    payee: insertedTxn.payee,
                    description: insertedTxn.description,
                    source_payload: insertedTxn.source_payload,
                    importResolution: importResolution
                      ? {
                          contactId: importResolution.contact_id,
                          contactType: importResolution.contact_type ?? null,
                          reason: importResolution.reason ?? null,
                        }
                      : null,
                  };
                }),
              }),
          );

          log('contact_resolution_created', resolutionMetrics);
        } catch (error) {
          log('contact_resolution_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            inserted,
          });
        }
      }
      */

      // Trigger balance recalculation if transactions were inserted
      if (inserted > 0) {
        try {
          const recalcFrom = toYMD(startDate);
          await scheduleBankBalanceAfterCommit(
            {
              companyId: companyUUID,
              bankAccountId: bank_account_id,
              recalcFrom,
              triggeredBy:
                source === 'file_import' ? 'csv_upload' : 'transaction',
            },
            txn,
          );

          log('balance_recalc_scheduled', {
            bankAccountId: bank_account_id,
            recalcFrom,
          });
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
          await scheduleTransactionEnrichmentAfterCommit(
            {
              companyId: companyUUID,
              bankAccountId: bank_account_id,
              bankTransactionIds: insertedTransactionIds,
              source: 'ingestion',
            },
            txn,
          );

          log('enrichment_scheduled', {
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

        // Durable work-materialization hand-off. Written in the SAME save
        // transaction as the source rows (so it never exists for rolled-back
        // imports) and debounced per affected bank account. Reconciliation
        // reads current domain facts, so the payload ids are informational.
        // NOT swallowed: this insert is part of the atomic save; a failure must
        // roll the import back rather than commit source rows without the
        // durable hand-off.
        const insertedTransactionIds = insertedTxns.map((row) => row.id);
        const insertedTotalRow = await txn('bank_transactions')
          .whereIn('id', insertedTransactionIds)
          .first<{
            inserted_total: string;
          }>(txn.raw('COALESCE(SUM(amount), 0)::text as inserted_total'));
        const insertedTotal = insertedTotalRow?.inserted_total ?? '0';
        const { scopeKey } = await writeBankAccountWorkMaterializationIntent(
          txn,
          {
            clientCompanyId: companyUUID,
            bankAccountId: bank_account_id,
            change: {
              type: 'bank_transactions_changed',
              companyId: companyUUID,
              bankAccountId: bank_account_id,
              bankTransactionIds: insertedTransactionIds,
            },
          },
        );
        await scheduleOutboxDispatchKickAfterCommit(txn);
        log('work_materialization_intent_written', {
          bankAccountId: bank_account_id,
          scopeKey,
          transactionCount: insertedTransactionIds.length,
        });

        const activityEventType =
          source === 'bank_feed'
            ? ACTIVITY_EVENT_TYPE.BANK_TRANSACTIONS_SYNCED
            : ACTIVITY_EVENT_TYPE.BANK_TRANSACTIONS_IMPORTED;
        await writeActivityEventIntent(txn, {
          clientCompanyId: companyUUID,
          actor:
            source === 'bank_feed'
              ? { type: 'system' }
              : { type: 'user', userId },
          sourceEntity: { type: 'bank_transaction_batch', id: batch.id },
          eventType: activityEventType,
          itemCount: insertedTransactionIds.length,
          amount: insertedTotal,
          currencyId: bankCurrencyId,
          idempotencyKey: `activity:${activityEventType}:${batch.id}`,
          metadata: {
            source,
            bankAccountId: bank_account_id,
            connectionCredentialId: connection_credential_id ?? null,
            startDate: toYMD(startDate),
            endDate: toYMD(endDate),
            skippedDuplicates: skipped,
            sampledBankTransactionIds: insertedTransactionIds.slice(0, 10),
            sampledBankTransactionCount: Math.min(
              insertedTransactionIds.length,
              10,
            ),
          },
        });
        log('activity_intent_written', {
          eventType: activityEventType,
          batchId: batch.id,
          transactionCount: insertedTransactionIds.length,
        });
      }

      log('completed', {
        inserted,
        skipped,
        totalDuration_ms: Date.now() - startTime,
        metrics: {
          transactionCount: bank_transactions.length,
          uniqueDates: uniqueDateKeys.length,
          uniquePayees: new Set(
            bank_transactions
              .map((tx) => tx.payee?.trim())
              .filter((payee): payee is string => Boolean(payee)),
          ).size,
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

export type BankPostingSource = {
  amount: number;
  systemExchangeRate: number;
  coaId: string;
  currencyId: string;
};

/**
 * Posting-relevant facts for a set of bank transactions, keyed by id: the native
 * amount and system FX rate, plus the owning bank account's COA and currency.
 * Company-scoped through the bank account join, so a foreign id never resolves.
 * Lets the ledger posting service validate bank legs without owning bank SQL.
 */
export async function getBankPostingSources({
  companyId,
  bankTransactionIds,
  trx,
}: {
  companyId: string;
  bankTransactionIds: string[];
  trx?: Knex.Transaction;
}): Promise<Map<string, BankPostingSource>> {
  const sources = new Map<string, BankPostingSource>();
  if (bankTransactionIds.length === 0) {
    return sources;
  }

  const client = trx || knexClient;
  const rows = await client('bank_transactions as bt')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .where({
      'ba.company_id': companyId,
      'bt.is_deleted': false,
      'ba.is_deleted': false,
    })
    .whereIn('bt.id', bankTransactionIds)
    .select(
      'bt.id',
      'bt.amount',
      'bt.system_exchange_rate',
      'ba.coa_id',
      'ba.currency_id',
    );

  for (const row of rows) {
    sources.set(row.id, {
      amount: Number(row.amount),
      systemExchangeRate: Number(row.system_exchange_rate),
      coaId: row.coa_id,
      currencyId: row.currency_id,
    });
  }

  return sources;
}

/**
 * Get bank transactions by IDs
 *
 * This function retrieves bank transactions by their IDs. It supports
 * filtering out auto-generated fields (database + computed fields).
 *
 * @param bankTransactionIds - Array of bank transaction IDs
 * @param excludeAutoGeneratedFields - If true, excludes auto-generated fields from results
 * @param trx - Optional database transaction
 * @returns Array of bank transactions
 * @throws AppError if bankTransactionIds is empty
 */
export async function getBankTransactionsByIds({
  bankTransactionIds,
  excludeAutoGeneratedFields = false,
  trx,
}: {
  bankTransactionIds: string[];
  excludeAutoGeneratedFields?: boolean;
  trx?: Knex.Transaction;
}): Promise<Array<BankTransaction | BankTransactionWithFilteredFields>> {
  const client = trx || knexClient;

  if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0) {
    throw new AppError('bankTransactionIds must be a non-empty array');
  }

  const query = client('bank_transactions as bt')
    .whereIn('bt.id', bankTransactionIds)
    .where('bt.is_deleted', false)
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    // Contact resolution retired (v1) — bcr + resolved_contact joins disabled; resolved fields default to null.
    /*
    .leftJoin(
      'bank_transaction_contact_resolutions as bcr',
      function joinBcr() {
        this.on('bcr.bank_transaction_id', '=', 'bt.id').andOn(
          'bcr.company_id',
          '=',
          'bt.company_id',
        );
      },
    )
    .leftJoin('contacts as resolved_contact', function joinResolvedContact() {
      this.on('resolved_contact.id', '=', 'bcr.contact_id')
        .andOn('resolved_contact.company_id', '=', 'bcr.company_id')
        .andOnVal('resolved_contact.status', '=', 'active')
        .andOnVal('resolved_contact.is_deleted', '=', false);
    })
    */
    .select(
      'bt.*',
      'ba.coa_id as bank_account_coa_id',
      'ba.currency_id as bank_account_currency_id',
      client.raw('NULL as resolved_contact_id'),
      client.raw('NULL as resolved_contact_type'),
      /*
      client.raw(
        `CASE
          WHEN bcr.status IN ('inferred', 'confirmed', 'manual_override')
            THEN resolved_contact.id
          ELSE NULL
        END as resolved_contact_id`,
      ),
      client.raw(
        `CASE
          WHEN bcr.status IN ('inferred', 'confirmed', 'manual_override')
            AND resolved_contact.id IS NOT NULL
            THEN bcr.contact_type
          ELSE NULL
        END as resolved_contact_type`,
      ),
      */
    );

  const transactions = await query.orderBy('bt.created_at', 'asc');

  if (!transactions.length) return [];

  if (excludeAutoGeneratedFields) {
    return transactions.map((transaction) => {
      const txn = transaction as BankTransaction & {
        absolute_amount?: number;
        search_text?: string;
        bank_account_coa_id: string;
        bank_account_currency_id: string;
      };
      const {
        created_at,
        updated_at,
        is_deleted,
        deleted_at,
        absolute_amount,
        search_text,
        ...t
      } = txn;
      return t;
    });
  }

  return transactions;
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

      const postedLinkedRows = await txn('bank_transactions')
        .where('company_id', companyUUID)
        .whereIn('id', bankTransactionIds)
        .andWhere('is_deleted', false)
        .whereNotNull('ledger_transaction_id')
        .select('id', 'ledger_transaction_id');

      if (postedLinkedRows.length > 0) {
        return {
          response: errorResponse(
            'Cannot delete bank transactions that have posted ledger transactions. Reverse or supersede the ledger transaction first.',
            {
              bankTransactionIds: postedLinkedRows.map((row) => row.id),
            },
          ),
        };
      }

      const deletedRows = await txn('bank_transactions')
        .where('company_id', companyUUID)
        .whereIn('id', bankTransactionIds)
        .andWhere('is_deleted', false)
        .update({
          is_deleted: true,
          deleted_at: txn.fn.now(),
          deleted_by_id: userId,
          deletion_origin: 'user_action',
          deletion_reason: reason ?? 'Deleted by user',
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

export async function reverseBankTransactionBatch({
  companyId,
  userId,
  batchId,
  input,
  trx,
}: {
  companyId: string;
  userId: string;
  batchId: string;
  input: ReverseBankTransactionBatchInput;
  trx?: Knex.Transaction;
}) {
  const validate = reverseBankTransactionBatchInput.safeParse(input);
  if (!validate.success) {
    return errorResponse('Invalid request body', validate.error.flatten());
  }

  try {
    const execute = async (txn: Knex.Transaction) => {
      const companyUUID = await getCompanyUUID(companyId, txn);
      if (!companyUUID) {
        throw new AppError('Company not found');
      }

      const batch = await txn('bank_transaction_batches as btb')
        .where({
          'btb.id': batchId,
          'btb.company_id': companyUUID,
        })
        .forUpdate('btb')
        .first([
          'btb.id',
          'btb.bank_account_id',
          'btb.start_date',
          'btb.status',
        ]);

      if (!batch) {
        throw new AppError('Bank transaction batch not found');
      }
      if (batch.status === 'reversed') {
        throw new AppError('Bank transaction batch has already been reversed');
      }

      const postedLinkedRows = await txn('bank_transactions')
        .where({
          bank_transaction_batch_id: batch.id,
          bank_account_id: batch.bank_account_id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .whereNotNull('ledger_transaction_id')
        .select('id', 'ledger_transaction_id');

      if (postedLinkedRows.length > 0) {
        throw new AppError(
          'Cannot reverse a bank transaction batch containing transactions that have posted ledger transactions. Reverse or supersede the ledger transactions first.',
          {
            bankTransactionIds: postedLinkedRows.map((row) => row.id),
          },
        );
      }

      const deletedRows = await txn('bank_transactions')
        .where({
          bank_transaction_batch_id: batch.id,
          bank_account_id: batch.bank_account_id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .update({
          is_deleted: true,
          deleted_at: txn.fn.now(),
          deleted_by_id: userId,
          deletion_origin: 'batch_reversal',
          deletion_reason: validate.data.reason,
          updated_at: txn.fn.now(),
          updated_by_id: userId,
        })
        .returning('id');

      const deletedIds = deletedRows.map((row) => row.id);
      await handleTransactionsDeleted({
        bankTransactionIds: deletedIds,
        reason: validate.data.reason,
        trx: txn,
      });

      await txn('bank_transaction_batches').where({ id: batch.id }).update({
        status: 'reversed',
        reversed_at: txn.fn.now(),
        reversed_by_id: userId,
        reversal_reason: validate.data.reason,
      });

      return {
        bankAccountId: batch.bank_account_id as string,
        companyUUID,
        deletedIds,
        recalcFrom: toYMD(batch.start_date),
      };
    };

    const result = trx
      ? await execute(trx)
      : await knexClient.transaction(execute);

    if (result.deletedIds.length > 0) {
      try {
        await emitTxnDeletedEvent({
          company_uuid: result.companyUUID,
          bank_transaction_ids: result.deletedIds,
          reason: validate.data.reason,
        });
      } catch (error) {
        logger.error(
          {
            batchId,
            companyId,
            error,
          },
          'Bank transaction batch reversed but deletion event emission failed',
        );
      }
    }

    try {
      await scheduleBankBalanceAfterCommit({
        companyId: result.companyUUID,
        bankAccountId: result.bankAccountId,
        recalcFrom: result.recalcFrom,
        triggeredBy: 'soft_delete',
        userId,
      });
    } catch (error) {
      logger.error(
        {
          batchId,
          companyId,
          error,
        },
        'Bank transaction batch reversed but balance recalculation enqueue failed',
      );
    }

    return successResponse('Bank transaction batch reversed', {
      batchId,
      deletedTransactions: result.deletedIds.length,
    });
  } catch (error) {
    logger.error(
      {
        batchId,
        companyId,
        userId,
        error,
      },
      'Failed to reverse bank transaction batch',
    );
    return errorResponse(
      error instanceof AppError
        ? error.message
        : 'Failed to reverse bank transaction batch',
    );
  }
}

function allSameAccount(txns: BankTransactionInput[], bankAccountId: string) {
  return (
    txns.length > 0 && txns.every((t) => t.bank_account_id === bankAccountId)
  );
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function generateIdempotencyKey(input: {
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
