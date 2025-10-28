import type { Knex } from 'knex';
import { knexClient } from '../../db/knexClient.js';
import {
  successResponse,
  errorResponse,
} from '../../shared/utils/response.utils.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import {
  type NewLedgerTransactionData,
  type LedgerTransaction,
  type LedgerEntry,
  newLedgerTransactionData,
} from './ledgers.types.js';
import { ensurePartitionsForDates } from '../../shared/services/partitionManagement.service.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import { normalizeContactName } from '../contacts/contacts.model.js';
import { enqueueGLBalance } from '../../jobs/queues/balance-recalc.queue.js';
import { isValidYMD, toDate, toYMD } from '../../shared/utils/date.utils.js';
import { ensureAndFetchFiscalCalendar } from '../reporting/fiscalCalendar/fiscalCalendar.service.js';

/**
 * Create a single ledger transaction
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

    // Resolve or create contact
    let contactId: string | null = null;
    if (ledgerTxInput.contact_id) {
      const exists = await tx('contacts')
        .where({
          id: ledgerTxInput.contact_id,
          company_id: companyUUID,
          is_deleted: false,
        })
        .first();
      if (!exists) {
        throw new Error(`Invalid contact_id: ${ledgerTxInput.contact_id}`);
      }
      contactId = exists.id;
    } else if (ledgerTxInput.contact_name?.trim()) {
      const normalizedName = normalizeContactName(ledgerTxInput.contact_name);

      const existing = await tx('contacts')
        .where({
          company_id: companyUUID,
          normalized_name: normalizedName,
          is_deleted: false,
        })
        .first('id');

      if (existing) {
        contactId = existing.id;
      } else {
        const [created] = await tx('contacts')
          .insert({
            company_id: companyUUID,
            display_name: ledgerTxInput.contact_name.trim(),
            normalized_name: normalizedName,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .returning('id');
        contactId = created.id;
      }
    }

    // Projects: validate IDs; resolve/create by name only when no ID supplied
    const projectIds = new Set<string>();
    const projectNames = new Set<string>();
    for (const t of transactions) {
      if (t.project_id) projectIds.add(t.project_id);
      else if (t.project_name?.trim()) projectNames.add(t.project_name.trim());
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

    const nameToProjectId = new Map<string, string>();
    if (projectNames.size) {
      const existing = await tx('projects')
        .whereIn('name', Array.from(projectNames))
        .where({ company_id: companyUUID, is_deleted: false })
        .select('id', 'name');
      for (const r of existing) nameToProjectId.set(r.name, r.id);

      const toCreate = Array.from(projectNames).filter(
        (n) => !nameToProjectId.has(n),
      );
      if (toCreate.length) {
        const created = await tx('projects')
          .insert(
            toCreate.map((name) => ({
              company_id: companyUUID,
              name,
              created_by_id: userId,
              updated_by_id: userId,
            })),
          )
          .returning(['id', 'name']);
        for (const r of created) nameToProjectId.set(r.name, r.id);
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
            date: new Date(`${p.date}T00:00:00Z`), // stable UTC midnight
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
        source: ledgerTxInput.source,
        description: ledgerTxInput.description,
        reference: ledgerTxInput.reference,
        note: ledgerTxInput.note,
        contact_id: contactId ?? null,
        ...(ledgerTxInput.bank_transaction_date &&
        ledgerTxInput.bank_transaction_id
          ? {
              bank_transaction_id: ledgerTxInput.bank_transaction_id ?? null,
              bank_transaction_date:
                dayYMD(ledgerTxInput.bank_transaction_date) ?? null,
            }
          : {}),
        company_id: companyUUID,
        created_by_id: userId,
        updated_by_id: userId,
      };

      // If no bank linkage, just insert and return
      if (
        !ledgerTxInput.bank_transaction_date ||
        !ledgerTxInput.bank_transaction_id
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
                ledgerTxInput.bank_transaction_date,
              ),
              bank_transaction_id: ledgerTxInput.bank_transaction_id,
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
      const d = dayYMD(t.fs_date);
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
      const resolvedProjectId =
        t.project_id ??
        (t.project_name
          ? (nameToProjectId.get(t.project_name.trim()) ?? null)
          : null);

      return {
        ledger_transaction_id: ledgerTransactionId,
        fs_date: d, // store as DATE-compatible string
        coa_id: t.coa_id,
        source_currency_id: t.source_currency_id,
        source_amount: t.source_amount,
        system_exchange_rate: systemRate,
        custom_exchange_rate: customRate,
        categorization_status: t.categorization_status ?? 'suggested',
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
