import type { Knex } from 'knex';
import z from 'zod';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';
import { ensurePartitionsForDates } from '../../shared/services/partitionManagement.service.js';
import { isValidYMD, toDate, toYMD } from '../../shared/utils/date.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { enqueueGLBalance } from '../balances/index.js';
import { runConstraints } from '../constraints/constraint-runner.js';
import { normalizeContactName } from '../contacts/contacts.model.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import {
  determineMonetaryEntries,
  makeFxTransactionId,
  upsertFxPosition,
} from '../fx/index.js';
import { ensureAndFetchFiscalCalendar } from '../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { getCompanySetting } from '../settings/settings.service.js';
import {
  type LedgerEntry,
  type LedgerTransaction,
  type NewLedgerEntry,
  type NewLedgerTransaction,
  type NewLedgerTransactionData,
  newLedgerTransactionData,
} from './ledgers.types.js';
import {
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
  validateIds,
} from './ledgers.utils.js';

/**
 * Create a single ledger transaction
 */
export async function createLedgerRecordOld({
  data,
  companyId,
  userId,
  trx,
}: {
  data: NewLedgerTransactionData;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ ledgerTransactionId: string }>> {
  // Helpers
  const dayYMD = (d: string | Date) => {
    const ymd = toYMD(d);
    if (!isValidYMD(ymd)) throw new Error(`Invalid fs_date: ${String(d)}`);
    return ymd;
  };

  // Validate payload
  const v = newLedgerTransactionData.safeParse(data);
  if (!v.success) {
    throw new Error(`Invalid input: ${v.error.message}`);
  }

  const { transactions, ...ledgerTxInput } = v.data;
  if (transactions.length === 0) {
    throw new Error('No entries');
  }

  // Ledger transaction integrity check: validate zero-sum
  const total = transactions.reduce((sum, t) => sum + t.source_amount, 0);
  if (Math.abs(total) > 0) {
    throw new Error(`Total amount must be 0. Got: ${total}`);
  }

  const exec = async (tx: Knex.Transaction) => {
    const company =
      (await tx('companies')
        .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
        .where('is_deleted', false)
        .first('id', 'reporting_currency_id')) ?? null;

    if (!company || !company.reporting_currency_id || !company.id) {
      throw new Error(`Company not found: ${companyId}`);
    }
    const companyUUID = company.id;
    const reportingCurrencyId = company.reporting_currency_id;

    await tx.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [companyUUID]);

    // Validate all COAs exist
    // COA validation (+ default monetary flag)
    const uniqueCoaIds = Array.from(new Set(transactions.map((t) => t.coa_id)));
    const coaRows = await tx('coa')
      .join('account_types', 'coa.account_type_id', 'account_types.id')
      .where('coa.company_id', companyUUID)
      .whereIn('coa.id', uniqueCoaIds)
      .where('coa.is_deleted', false)
      .select('coa.id', 'account_types.default_monetary');

    const coaMonetary = new Map<string, boolean>(
      coaRows.map((r: any) => [r.id, r.default_monetary]),
    );
    const missingCoa = uniqueCoaIds.filter((id) => !coaMonetary.has(id));
    if (missingCoa.length) {
      throw new Error(`Invalid COA IDs: ${missingCoa.join(', ')}`);
    }

    // // Resolve or create contact
    // let contactId: string | null = null;
    // if (ledgerTxInput.contact_id) {
    //   const exists = await tx('contacts')
    //     .where({
    //       id: ledgerTxInput.contact_id,
    //       company_id: companyUUID,
    //       is_deleted: false,
    //     })
    //     .first();
    //   if (!exists) {
    //     throw new Error(`Invalid contact_id: ${ledgerTxInput.contact_id}`);
    //   }
    //   contactId = exists.id;
    // } else if (ledgerTxInput.contact_name?.trim()) {
    //   const normalizedName = normalizeContactName(ledgerTxInput.contact_name);

    //   const existing = await tx('contacts')
    //     .where({
    //       company_id: companyUUID,
    //       normalized_name: normalizedName,
    //       is_deleted: false,
    //     })
    //     .first('id');

    //   if (existing) {
    //     contactId = existing.id;
    //   } else {
    //     const [created] = await tx('contacts')
    //       .insert({
    //         company_id: companyUUID,
    //         display_name: ledgerTxInput.contact_name.trim(),
    //         normalized_name: normalizedName,
    //         created_by_id: userId,
    //         updated_by_id: userId,
    //       })
    //       .returning('id');
    //     contactId = created.id;
    //   }
    // }

    // Projects: validate IDs only (no auto-creation)
    const projectIds = new Set<string>();
    for (const t of transactions) {
      if (t.project_id) projectIds.add(t.project_id);
    }

    if (projectIds.size) {
      const validProjectIds = await tx('projects')
        .whereIn('id', Array.from(projectIds))
        .where({ company_id: companyUUID, is_deleted: false })
        .pluck('id');

      const validSet = new Set(validProjectIds as string[]);
      const invalid = Array.from(projectIds).filter((id) => !validSet.has(id));
      if (invalid.length > 0) {
        throw new Error(`Invalid project IDs: ${invalid.join(', ')}`);
      }
    }

    // Fiscal periods
    // Validate fiscal periods exist and are open
    let minYMD: string | null = null;
    let maxYMD: string | null = null;
    for (const t of transactions) {
      const d = dayYMD(t.fs_date);
      if (!minYMD || d < minYMD) minYMD = d;
      if (!maxYMD || d > maxYMD) maxYMD = d;
    }
    if (!minYMD || !maxYMD) {
      throw new Error('No fs_date(s) provided');
    }

    await ensureAndFetchFiscalCalendar({
      companyId: companyUUID,
      startYMD: minYMD,
      endYMD: maxYMD,
      fetchTypes: ['monthly'],
      requireMonthlyOpen: true,
      trx: tx,
    });

    // Fetch exchange rates in batch
    // FX prefetch per (day, source_currency)
    const rateKey = (d: string, ccy: string) => `${d}|${ccy}`;

    const fxPairs: { date: string; fromCurrencyId: string }[] = [];
    const fxKeySet = new Set<string>();
    for (const t of transactions) {
      if (t.source_currency_id !== reportingCurrencyId) {
        const d = dayYMD(t.fs_date);
        const k = rateKey(d, t.source_currency_id);
        if (!fxKeySet.has(k)) {
          fxKeySet.add(k);
          fxPairs.push({ date: d, fromCurrencyId: t.source_currency_id });
        }
      }
    }
    const fxRateMap = new Map<string, number>();
    if (fxPairs.length) {
      const results = await Promise.all(
        fxPairs.map(async (p) => {
          const rate = await determineExchangeRate({
            // date: new Date(`${p.date}T00:00:00Z`), // stable UTC midnight
            date: p.date,
            fromCurrencyId: p.fromCurrencyId,
            toCurrencyId: reportingCurrencyId,
          });
          return { key: rateKey(p.date, p.fromCurrencyId), rate };
        }),
      );
      const missing: string[] = [];
      for (const r of results) {
        if (r.rate == null) missing.push(r.key);
        else fxRateMap.set(r.key, Number(r.rate));
      }
      if (missing.length) {
        throw new Error(`Missing exchange rates for: ${missing.join(', ')}`);
      }
    }

    // Ensure partitions for ledger entries exist
    const transactionDates = transactions.map((t) =>
      toDate(t.fs_date, 'start'),
    );
    await ensurePartitionsForDates('ledger_entries', transactionDates, tx);

    // Idempotent insert of ledger_transaction guarded by unique index
    let ledgerTransactionId: string;
    {
      const toInsert = {
        date: ledgerTxInput.date,
        transaction_source: ledgerTxInput.transaction_source,
        categorization_source: ledgerTxInput.categorization_source,
        description: ledgerTxInput.description,
        reference: ledgerTxInput.reference,
        note: ledgerTxInput.note,
        // contact_id: contactId ?? null,
        // contact_type_snapshot: ledgerTxInput.contact_type_snapshot ?? null,
        ...(ledgerTxInput.source_transaction_id &&
        ledgerTxInput.source_transaction_date
          ? {
              source_transaction_id:
                ledgerTxInput.source_transaction_id ?? null,
              source_transaction_date:
                dayYMD(ledgerTxInput.source_transaction_date) ?? null,
            }
          : {}),
        company_id: companyUUID,
        created_by_id: userId,
        updated_by_id: userId,
      };

      // If no bank linkage, just insert and return
      if (
        !ledgerTxInput.source_transaction_date ||
        !ledgerTxInput.source_transaction_id
      ) {
        const [row] = await tx('ledger_transactions')
          .insert(toInsert)
          .returning('id');
        ledgerTransactionId = row.id;
      } else {
        // Upsert (ignore on conflict) and fetch id if existed
        const ret = await tx('ledger_transactions')
          .insert(toInsert)
          .onConflict([
            'company_id',
            'bank_transaction_date',
            'bank_transaction_id',
          ])
          .ignore()
          .returning('id');

        if (ret.length) {
          ledgerTransactionId = ret[0].id;
        } else {
          const existing = await tx('ledger_transactions')
            .where({
              company_id: companyUUID,
              bank_transaction_date: dayYMD(
                ledgerTxInput.source_transaction_date,
              ),
              source_transaction_id: ledgerTxInput.source_transaction_id,
              is_deleted: false,
            })
            .first('id');
          if (!existing)
            throw new Error(
              'Unexpected: ledger transaction not found after conflict',
            );
          ledgerTransactionId = existing.id;
        }
      }
    }

    // Build ledger entries
    const entries = transactions.map((t) => {
      const d = toYMD(t.fs_date);
      let systemRate = 1;
      let customRate = 1;
      if (t.source_currency_id !== reportingCurrencyId) {
        const r = fxRateMap.get(rateKey(d, t.source_currency_id));
        if (!r)
          throw new Error(
            `Exchange rate missing at build: ${d}|${t.source_currency_id}`,
          );
        systemRate = r;
        customRate = t.custom_exchange_rate ?? r;
      }
      const resolvedProjectId = t.project_id ?? null;

      return {
        ledger_transaction_id: ledgerTransactionId,
        fs_date: d, // store as DATE-compatible string
        coa_id: t.coa_id,
        source_currency_id: t.source_currency_id,
        source_amount: t.source_amount,
        system_exchange_rate: systemRate,
        custom_exchange_rate: customRate,
        description: t.description,
        project_id: resolvedProjectId,
        is_monetary: t.is_monetary ?? coaMonetary.get(t.coa_id) ?? false,
        fx_transaction_id: t.fx_transaction_id ?? null,
        updated_by_id: userId,
      };
    });

    // Insert all ledger entries
    await tx('ledger_entries').insert(entries);

    // Enqueue gl balance calculation using per-COA earliest and latest dates
    // Build a map of { coaId -> { min: YYYY-MM-DD, max: YYYY-MM-DD } } from processed transactions
    // Enqueue GL balance recalcs per-COA with min affected day
    const bounds = new Map<string, { min: string; max: string }>();
    for (const t of transactions) {
      const d = dayYMD(t.fs_date);
      const b = bounds.get(t.coa_id);
      if (!b) bounds.set(t.coa_id, { min: d, max: d });
      else {
        if (d < b.min) b.min = d;
        if (d > b.max) b.max = d;
      }
    }
    for (const [coaId, b] of bounds) {
      await enqueueGLBalance({
        companyId: companyUUID,
        coaId,
        recalcFrom: b.min,
        triggeredBy: 'ledger_entry',
      });
    }

    return successResponse('Ledger transaction created', {
      ledgerTransactionId,
    });
  };

  // Execute the transaction
  try {
    return trx ? await exec(trx) : await knexClient.transaction(exec);
  } catch (err) {
    if (trx) {
      throw new Error(
        `Failed to create ledger entries: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }
    return errorResponse('Failed to create ledger entries', err);
  }
}

/**
 * Create a ledger transaction and its entries atomically
 *
 * This is a refactored version that:
 * - Does NOT auto-create contacts/projects (requires IDs)
 * - Uses constraint validation system
 * - Validates bank transaction amounts
 * - Checks FX convention (warning only)
 */
export async function createLedgerRecord({
  data,
  companyId,
  userId,
  trx,
}: {
  data: NewLedgerTransactionData;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse> {
  // Phase 1: Validate input
  const validate = newLedgerTransactionData.safeParse(data);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const { transactions: entries, ...ledgerTx } = validate.data;

  if (entries.length === 0) {
    return errorResponse('No entries provided');
  }

  // convenience
  const isBankTransaction = ledgerTx.transaction_source === 'bank_transaction';
  const sourceTxId = ledgerTx.source_transaction_id;
  const sourceTxDate = ledgerTx.source_transaction_date;
  const sourceTxAmount = ledgerTx.source_transaction_amount;
  const sourceTxCurrencyId = ledgerTx.source_transaction_currency_id;

  const requiredBankTxSourceFieldsExist =
    !!sourceTxId && !!sourceTxDate && !!sourceTxAmount;
  if (isBankTransaction && !requiredBankTxSourceFieldsExist) {
    return errorResponse(
      'Bank transaction must have source_transaction_id, source_transaction_date and source_transaction_amount',
    );
  }

  const exec = async (txn: Knex.Transaction) => {
    const result: {
      ledgerTransactionId: string;
      warnings: {
        [key: string]: string;
      };
    } = {
      ledgerTransactionId: '',
      warnings: {},
    };
    // Company resolution & advisory lock
    const company: { id: string; reporting_currency_id: string } =
      (await txn('companies')
        .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
        .where('is_deleted', false)
        .first('id', 'reporting_currency_id')) ?? null;

    if (!company || !company.reporting_currency_id || !company.id) {
      throw new AppError(`Company not found: ${companyId}`);
    }
    const companyUUID = company.id;
    const reportingCurrencyId = company.reporting_currency_id;

    // Check if FX tracking is enabled for this company
    const fxSettingsResult = await getCompanySetting({
      companyId: companyUUID,
      settingKeys: ['track_fx_positions'],
      trx: txn,
    });
    const trackFxPositions =
      fxSettingsResult.success && fxSettingsResult.data
        ? fxSettingsResult.data.track_fx_positions
        : false;

    // Check if transaction already exists (for bank transactions) - fail early
    // This prevents doing expensive work if the transaction is a duplicate
    if (isBankTransaction && requiredBankTxSourceFieldsExist) {
      const existing = await txn('ledger_transactions')
        .where({
          company_id: companyUUID,
          source_transaction_id: sourceTxId,
          source_transaction_date: toYMD(sourceTxDate),
          is_deleted: false,
        })
        .first('id');

      if (existing) {
        throw new AppError(
          `Ledger transaction already exists for bank transaction ${sourceTxId}`,
          {
            existingLedgerTransactionId: existing.id,
            sourceTransactionId: sourceTxId,
            sourceTransactionDate: sourceTxDate,
          },
        );
      }
    }

    // Advisory lock for company-level serialization
    await txn.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [companyUUID]);

    // Advisory lock for bank transaction (if linked) to prevent race conditions
    if (sourceTxId && isBankTransaction) {
      await txn.raw(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        `bank_txn:${sourceTxId}`,
      ]);
    }

    // Ensure partitions exist (must be inside transaction to prevent race conditions)
    const { transactionDates, bounds, minYMD, maxYMD } =
      processEntriesDates(entries);
    await ensurePartitionsForDates('ledger_entries', transactionDates, txn);

    // Phase 3 Pre-constraint validations

    // 3a.Validate bank leg entries only allowed for bank transactions
    const bankLegs = entries.filter((e) => e.is_bank_leg === true);
    if (bankLegs.length > 0 && !isBankTransaction) {
      throw new AppError('Bank leg entries only allowed for bank transactions');
    }

    if ((isBankTransaction && bankLegs.length === 0) || bankLegs.length > 1) {
      throw new AppError(
        'Bank transaction must have exactly one bank leg entry',
      );
    }

    // 3b. CRITICAL: Bank transaction validation and bank leg matching
    let bankTxn: {
      amount: number;
      system_exchange_rate: number;
      bank_coa_id: string;
      bank_currency_id: string;
      contact_id?: string | null;
      contact_type_snapshot?: string | null;
    } | null = null;

    if (isBankTransaction && requiredBankTxSourceFieldsExist) {
      // Fetch bank transaction with bank account details
      const bankTxnResult = await txn('bank_transactions as bt')
        .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
        .where({
          'bt.id': sourceTxId,
          'bt.date': toYMD(sourceTxDate),
          'ba.company_id': companyUUID,
          'bt.is_deleted': false,
        })
        .first(
          'bt.amount',
          'bt.system_exchange_rate',
          'bt.contact_id',
          'bt.contact_type_snapshot',
          'ba.coa_id as bank_coa_id',
          'ba.currency_id as bank_currency_id',
        );

      if (!bankTxnResult) {
        throw new AppError(
          `Bank transaction not found or does not belong to company: ${sourceTxId}`,
        );
      }

      bankTxn = {
        amount: Number(bankTxnResult.amount),
        system_exchange_rate: Number(bankTxnResult.system_exchange_rate),
        bank_coa_id: bankTxnResult.bank_coa_id,
        bank_currency_id: bankTxnResult.bank_currency_id,
        contact_id: bankTxnResult.contact_id ?? null,
        contact_type_snapshot: bankTxnResult.contact_type_snapshot ?? null,
      };

      const bankLeg = bankLegs[0];

      // Validate bank leg COA matches bank account COA
      if (bankLeg.coa_id !== bankTxn.bank_coa_id) {
        throw new AppError(
          `Bank leg COA (${bankLeg.coa_id}) does not match bank account COA (${bankTxn.bank_coa_id})`,
        );
      }

      // Validate bank leg currency matches bank account currency
      if (bankLeg.source_currency_id !== bankTxn.bank_currency_id) {
        throw new AppError(
          `Bank leg currency (${bankLeg.source_currency_id}) does not match bank account currency (${bankTxn.bank_currency_id})`,
        );
      }

      // Validate bank leg amount matches bank transaction amount (both in native currency)
      const bankValidation = validateBankLegAmount({
        entries: [bankLeg],
        bankTransactionAmount: bankTxn.amount,
      });

      if (!bankValidation.valid) {
        throw new AppError(bankValidation.error!);
      }
    }

    // 3c. Contact validation (batch)
    // Resolve contact: use bank transaction contact if no transaction contact provided
    // let transactionContactId = ledgerTx.contact_id ?? null;
    // let transactionContactType = ledgerTx.contact_type_snapshot ?? null;

    // if (!transactionContactId && bankTxn?.contact_id) {
    //   transactionContactId = bankTxn.contact_id;
    //   transactionContactType =
    //     (bankTxn.contact_type_snapshot as typeof transactionContactType) ??
    //     null;

    //   logger.debug(
    //     {
    //       companyId: companyUUID,
    //       bankTransactionId: ledgerTx.source_transaction_id,
    //       contactId: transactionContactId,
    //     },
    //     'Using bank transaction contact as default for ledger transaction',
    //   );
    // }
    // const entryContactIds = new Set<string>(
    //   entries.filter((e) => e.contact_id).map((e) => e.contact_id!),
    // );

    // if (transactionContactId) {
    //   const contactExists = await txn('contacts')
    //     .where({
    //       id: transactionContactId,
    //       company_id: companyUUID,
    //       is_deleted: false,
    //     })
    //     .first('id');

    //   if (!contactExists) {
    //     return errorResponse(`Contact not found: ${transactionContactId}`);
    //   }
    // }

    // if (entryContactIds.size > 0) {
    //   const validContacts = await txn('contacts')
    //     .whereIn('id', Array.from(entryContactIds))
    //     .where({ company_id: companyUUID, is_deleted: false })
    //     .pluck('id');

    //   const validSet = new Set(validContacts as string[]);
    //   const invalid = Array.from(entryContactIds).filter(
    //     (id) => !validSet.has(id),
    //   );

    //   if (invalid.length > 0) {
    //     throw new AppError(`Invalid contact IDs: ${invalid.join(', ')}`);
    //   }
    // }

    // // 3d. Project validation (batch)
    // const entryProjectIds = new Set<string>(
    //   entries.filter((e) => e.project_id).map((e) => e.project_id!),
    // );

    // if (entryProjectIds.size > 0) {
    //   const validProjects = await txn('projects')
    //     .whereIn('id', Array.from(entryProjectIds))
    //     .where({ company_id: companyUUID, is_deleted: false })
    //     .pluck('id');

    //   const validSet = new Set(validProjects as string[]);
    //   const invalid = Array.from(entryProjectIds).filter(
    //     (id) => !validSet.has(id),
    //   );

    //   if (invalid.length > 0) {
    //     return errorResponse(`Invalid project IDs: ${invalid.join(', ')}`);
    //   }
    // }

    // Wanna refactor this to see first
    // Contact and project ID validation
    const [transactionContactId, transactionContactType] = (() => {
      let id = ledgerTx.contact_id ?? null;
      let type = ledgerTx.contact_type ?? null;

      // Fallback logic
      if (!id && bankTxn?.contact_id) {
        id = bankTxn.contact_id;
        type = (bankTxn.contact_type_snapshot as typeof type) ?? null;
      }

      return [id, type];
    })();

    const allContactIds = new Set<string>();
    const allProjectIds = new Set<string>();

    if (transactionContactId) {
      allContactIds.add(transactionContactId);
    }

    for (const e of entries) {
      if (e.contact_id) {
        allContactIds.add(e.contact_id);
      }

      if (e.project_id) {
        allProjectIds.add(e.project_id);
      }
    }

    const contactIds = Array.from(allContactIds);
    const projectIds = Array.from(allProjectIds);

    await validateIds('contacts', contactIds, companyUUID, txn);
    await validateIds('projects', projectIds, companyUUID, txn);

    // FX
    // Same FX rate shall apply to all entries
    // If source currency === reporting currency, rate = 1
    // If one entry have custom exchange rate, we'll use it for as custom rate for all entries
    // If more than one entry have custom exchange rate, and they are different, we'll flag it as an error and return a warning, we'll use system exchange rate for all entries
    // In all other cases, we'll use system exchange rate for all entries
    // We should also check if any entry has suspicious FX rate maybe (very small, very large), and flag it as a warning
    // We should also keep a warning if the converted amount that'll result is suspiciously small or large
    // We only multiply txn amount by exchange rate, not divide. So reporting currency has to be price currency
    // You multiply when converting the base currency amount into the price currency

    const {
      systemExRate,
      customExRate,
      warnings: fxWarnings,
    } = await resolveFx({
      entries,
      ledgerTxDate: new Date(ledgerTx.date),
      sourceCurrencyId: sourceTxCurrencyId,
      reportingCurrencyId,
      bankTxnSystemRate: bankTxn?.system_exchange_rate,
    });

    if (fxWarnings.length > 0) {
      result.warnings.fxWarnings = fxWarnings.join(', ');
    }

    // Phase 4: Data transformation & FX rate fetching

    // // Fetch system exchange rates for FX entries
    // // For bank leg, use bank transaction system exchange rate if available
    // const fxPairs: { date: string; fromCurrencyId: string }[] = [];
    // const fxKeySet = new Set<string>();
    // const rateKey = (d: string, ccy: string) => `${d}|${ccy}`;

    // for (const entry of entries) {
    //   if (entry.source_currency_id !== reportingCurrencyId) {
    //     // If this is a bank leg and we have bank transaction rate, use it
    //     if (entry.is_bank_leg && bankTxn) {
    //       // Bank leg rate is already in bankTxn.system_exchange_rate
    //       // We'll handle this in the rate map below
    //       continue;
    //     }

    //     const d = dayYMD(entry.fs_date);
    //     const k = rateKey(d, entry.source_currency_id);
    //     if (!fxKeySet.has(k)) {
    //       fxKeySet.add(k);
    //       fxPairs.push({ date: d, fromCurrencyId: entry.source_currency_id });
    //     }
    //   }
    // }

    // const fxRateMap = new Map<string, number>();
    // if (fxPairs.length) {
    //   const results = await Promise.all(
    //     fxPairs.map(async (p) => {
    //       const rate = await determineExchangeRate({
    //         date: p.date,
    //         fromCurrencyId: p.fromCurrencyId,
    //         toCurrencyId: reportingCurrencyId,
    //       });
    //       return { key: rateKey(p.date, p.fromCurrencyId), rate };
    //     }),
    //   );

    //   const missing: string[] = [];
    //   for (const r of results) {
    //     if (r.rate == null) missing.push(r.key);
    //     else fxRateMap.set(r.key, Number(r.rate));
    //   }

    //   if (missing.length) {
    //     return errorResponse(
    //       `Missing exchange rates for: ${missing.join(', ')}`,
    //     );
    //   }
    // }

    // // Add bank leg rate to map if bank transaction exists
    // if (bankTxn && bankLegs.length > 0) {
    //   const bankLeg = bankLegs[0]!;
    //   const d = dayYMD(bankLeg.fs_date);
    //   const k = rateKey(d, bankLeg.source_currency_id);
    //   fxRateMap.set(k, bankTxn.system_exchange_rate);
    // }

    // // Transform for constraint validation
    // const constraintEntries = entries.map((entry, index) => {
    //   const d = dayYMD(entry.fs_date);
    //   const k = rateKey(d, entry.source_currency_id);
    //   const systemRate = fxRateMap.get(k) ?? 1;

    //   return {
    //     id: `${index}`,
    //     amount: entry.source_amount,
    //     coa_id: entry.coa_id,
    //     fs_date: d,
    //     project_id: entry.project_id ?? null,
    //     is_bank_leg: entry.is_bank_leg ?? false,
    //     system_exchange_rate: systemRate,
    //     custom_exchange_rate: entry.custom_exchange_rate ?? systemRate,
    //   };
    // });

    const constraintEntries = entries.map((entry, index) => {
      return {
        id: `${index}`,
        amount: entry.source_amount,
        coa_id: entry.coa_id,
        fs_date: toYMD(entry.fs_date),
        project_id: entry.project_id ?? null,
        is_bank_leg: entry.is_bank_leg ?? false,
        system_exchange_rate: systemExRate,
        custom_exchange_rate: customExRate,
      };
    });

    // Phase 5: Constraint validation
    const constraintResult = await runConstraints({
      companyUUID,
      entries: constraintEntries,
      transaction_date: toYMD(ledgerTx.date),
    });

    if (!constraintResult.isValid) {
      const errorMessages = constraintResult.errors.map((e) => e.message);

      logger.error(
        {
          companyId: companyUUID,
          errors: errorMessages,
          warnings: constraintResult.warnings,
        },
        'Ledger transaction creation failed due to constraint errors',
      );
      throw new AppError(
        errorMessages.join('\n'),
        constraintResult.warnings,
        true,
      );
    }

    if (constraintResult.warnings.length > 0) {
      result.warnings.constraintWarnings = constraintResult.warnings
        .map((w) => w.message)
        .join('\n');
    }

    const ledgerTransaction: NewLedgerTransaction = {
      ...ledgerTx,
      contact_id: transactionContactId,
      contact_type: transactionContactType,
      company_id: companyUUID,
      created_by_id: userId,
      updated_by_id: userId,
    };

    // Insert ledger transaction
    const [row] = await txn('ledger_transactions')
      .insert(ledgerTransaction)
      .returning('id');
    const ledgerTransactionId = row.id;

    // Phase 7: Monetary Entry Determination & FX Position Processing
    // Always determine monetary entries (for is_monetary field on ledger entries)
    // Always generate fx_transaction_id for monetary entries (required metadata, not just for FX tracking)
    // Only create/update fx_positions table if FX tracking is enabled for the company
    const monetaryResult = await determineMonetaryEntries({
      entries,
      companyId: companyUUID,
      reportingCurrencyId,
      trx: txn,
    });
    const monetaryMap = monetaryResult.monetaryMap;

    // Always generate fx_transaction_id for monetary entries (if currency mismatch)
    // This is metadata on the entry itself, not just for fx_positions table
    // Benefits:
    // - Groups related entries (initial, revaluations, settlements, reversals)
    // - Enables retroactive FX position building if company enables tracking later
    // - Required by business rules: "If is_monetary = true then fx_transaction_id must be set"
    let fxTransactionId: string | null = null;
    if (
      sourceTxCurrencyId !== reportingCurrencyId &&
      monetaryResult.monetaryEntries.length > 0
    ) {
      // Generate fx_transaction_id for this ledger transaction
      // All monetary entries in the same transaction share the same fx_transaction_id
      fxTransactionId = makeFxTransactionId({
        type: 'LEDGER_TX',
        ledgerTransactionId,
      });

      // Only create/update fx_positions table if FX tracking is enabled
      if (trackFxPositions) {
        // Process each monetary entry to create/update fx_positions
        for (const {
          index,
          entry: baseEntry,
        } of monetaryResult.monetaryEntries) {
          const fullEntry = entries[index]!;
          const calculatedAmount = fullEntry.source_amount * customExRate;

          await upsertFxPosition({
            companyId: companyUUID,
            fx_transaction_id: fxTransactionId,
            account_id: fullEntry.coa_id,
            foreign_currency_id: fullEntry.source_currency_id,
            source_amount: fullEntry.source_amount,
            amount: calculatedAmount,
            exchange_rate: customExRate,
            trx: txn,
          });
        }
      }
    }

    // Build ledger entries for insertion
    const entriesToInsert: NewLedgerEntry[] = entries.map((e, index) => {
      return {
        ...e,
        ledger_transaction_id: ledgerTransactionId,
        is_bank_leg: e.is_bank_leg ?? false,
        system_exchange_rate: systemExRate,
        custom_exchange_rate: customExRate,
        contact_id: e.contact_id ? e.contact_id : transactionContactId,
        contact_type: e.contact_type ? e.contact_type : transactionContactType,
        is_monetary: monetaryMap.get(index) ?? false,
        fx_transaction_id: monetaryMap.get(index) ? fxTransactionId : null,
        updated_by_id: userId,
      };
    });

    // Insert all entries
    await txn('ledger_entries').insert(entriesToInsert);

    // Phase 7: Balance recalculation
    // const bounds = new Map<string, { min: string; max: string }>();
    // let minYMD: string | null = null;
    // let maxYMD: string | null = null;

    // for (const entry of entries) {
    //   const d = toYMD(entry.fs_date);
    //   if (!minYMD || d < minYMD) minYMD = d;
    //   if (!maxYMD || d > maxYMD) maxYMD = d;

    //   const b = bounds.get(entry.coa_id);
    //   if (!b) {
    //     bounds.set(entry.coa_id, { min: d, max: d });
    //   } else {
    //     if (d < b.min) b.min = d;
    //     if (d > b.max) b.max = d;
    //   }
    // }

    for (const [coaId, range] of bounds) {
      await enqueueGLBalance({
        companyId: companyUUID,
        coaId,
        recalcFrom: range.min,
        triggeredBy: 'ledger_entry',
      });
    }

    return successResponse('Ledger transaction created', {
      ledgerTransactionId,
      affectedCOAs: bounds.size,
      dateRange: { min: minYMD, max: maxYMD },
    });
  };

  try {
    return trx ? await exec(trx) : await knexClient.transaction(exec);
  } catch (err) {
    logger.error(
      {
        error: err,
        companyId,
        userId,
        transactionSource: data.transaction_source,
      },
      'Failed to create ledger transaction',
    );

    if (trx) {
      throw new Error(
        `Failed to create ledger transaction: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }

    return errorResponse(
      'Failed to create ledger transaction',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

/**
 * Get ledger transaction by ID
 */
export async function getLedgerTransaction(
  id: string,
  trx?: Knex.Transaction,
): Promise<LedgerTransaction | null> {
  const client = trx || knexClient;

  const result = await client('ledger_transactions')
    .where('id', id)
    .where('is_deleted', false)
    .first();

  return result || null;
}

/**
 * Get ledger entries for a transaction
 */
export async function getLedgerEntriesForTransaction(
  ledgerTransactionId: string,
  trx?: Knex.Transaction,
): Promise<LedgerEntry[]> {
  const client = trx || knexClient;

  const entries = await client('ledger_entries')
    .where('ledger_transaction_id', ledgerTransactionId)
    .where('is_deleted', false)
    .orderBy('created_at', 'asc');

  return entries;
}
