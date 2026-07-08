import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
import { generateV7Ids } from '../../shared/db/generate-ids.js';
import { AppError, toYMD } from '../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyBankTxn,
  lockKeyCompany,
  lockKeyJournalBatch,
} from '../../shared/services/advisoryLocks.service.js';
import { getIdentifierType } from '../../shared/utils/formatting.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { resolveActorUserId } from '../audit/index.js';
import { getBankPostingSources } from '../bankTransactions/bankTransactions.model.js';
import {
  isMonetaryEntry,
  prefetchMonetaryCoaIds,
} from '../chart-of-accounts/coa-monetary.js';
import { runConstraints } from '../constraints/constraint-runner.js';
import { upsertFxPosition } from '../fx/fx.service.js';
import { makeFxTransactionId } from '../fx/fx.utils.js';
import { getCompanySetting } from '../settings/settings.service.js';
import { writeLedgerPostAuditBatch } from './ledgers.audit.js';
import { enqueueLedgerPostProcessing } from './ledgers.post-processing.js';
import { ledgerTransactionInput } from './ledgers.types.js';
import {
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
} from './ledgers.utils.js';

import type { AuditActorInput, AuditContextInput } from '../audit/index.js';
import type { BankPostingSource } from '../bankTransactions/bankTransactions.model.js';
import type {
  LedgerEntry,
  LedgerEntryInput,
  LedgerTransactionInput,
  NewLedgerEntry,
  PostLedgerTransactionsInput,
} from './ledgers.types.js';

// --- Types ---

type PreparedEntry = LedgerEntryInput & {
  is_monetary: boolean;
  contact_id: string | null;
  contact_type: LedgerEntryInput['contact_type'];
  fx_transaction_id: string | null;
};

type Company = { id: string; reporting_currency_id: string };

type PreparedLedger = {
  input: LedgerTransactionInput;
  entries: PreparedEntry[];
  systemExRate: number;
  customExRate: number;
  coaBounds: Map<string, { min: string; max: string }>;
  warnings: string[];
  isFx: boolean;
};

type TxnValidationError = {
  sourceId: string;
  message: string;
  details?: unknown;
};

type BatchFacts = {
  bankSources: Map<string, BankPostingSource>;
  monetaryCoaIds: Set<string>;
  trackFxPositions: boolean;
};

type LedgerEntryFxRow = {
  id: string;
  ledger_transaction_id: string;
  coa_id: string;
  source_currency_id: string;
  source_amount: string | number;
  amount: string | number;
  is_monetary: boolean;
  fx_transaction_id: string | null;
  fs_date: string | Date;
};

type IdentifiedLedger = PreparedLedger & {
  id: string;
};

type PersistContext = {
  actingUserId: string;
  actor: AuditActorInput;
  requestContext: AuditContextInput;
};

// --- Constants ---

const INSERT_CHUNK = 500;
const MAX_BATCH_SIZE = 1000;

// --- Gate ---

const resolveCompany = (
  companyId: string,
  trx: Knex.Transaction,
): Promise<Company | undefined> =>
  trx('companies')
    .where(
      getIdentifierType(companyId) === 'uuid'
        ? { id: companyId }
        : { short_code: companyId },
    )
    .where({ is_deleted: false })
    .first('id', 'reporting_currency_id');

const findAlreadyPosted = (
  companyUUID: string,
  sourceIds: string[],
  trx: Knex.Transaction,
): Promise<string[]> => {
  if (sourceIds.length === 0) {
    return Promise.resolve([]);
  }
  return trx('ledger_transactions')
    .where({ company_id: companyUUID, status: 'posted' })
    .whereIn('source_transaction_id', sourceIds)
    .pluck('source_transaction_id');
};

// --- Prefetch ---

const assertReferencedIds = async (
  table: 'contacts' | 'projects',
  ids: string[],
  companyId: string,
  trx: Knex.Transaction,
): Promise<void> => {
  if (ids.length === 0) return;

  const query = trx(table).whereIn('id', ids).where({ company_id: companyId });
  if (table === 'contacts') {
    query.where({ is_deleted: false, status: 'active' });
  } else {
    query.where({ is_deleted: false });
  }

  const found = new Set((await query.pluck('id')).map(String));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return;

  throw new AppError(`Invalid ${table} IDs: ${missing.join(', ')}`);
};

const loadBatchFacts = async (
  companyUUID: string,
  transactions: LedgerTransactionInput[],
  trx: Knex.Transaction,
): Promise<BatchFacts> => {
  const bankIds = transactions
    .filter((t) => t.transaction_source === 'bank_transaction')
    .map((t) => t.source_transaction_id);

  const bankSources = await getBankPostingSources({
    companyId: companyUUID,
    bankTransactionIds: bankIds,
    trx,
  });

  const contactIds = new Set<string>();
  const projectIds = new Set<string>();
  const coaIds = new Set<string>();

  for (const tx of transactions) {
    if (tx.contact_id) contactIds.add(tx.contact_id);
    for (const entry of tx.entries) {
      coaIds.add(entry.coa_id);
      if (entry.project_id) projectIds.add(entry.project_id);
      if (entry.is_bank_leg || !entry.contact_id) continue;
      contactIds.add(entry.contact_id);
    }
  }

  await assertReferencedIds('contacts', [...contactIds], companyUUID, trx);
  await assertReferencedIds('projects', [...projectIds], companyUUID, trx);

  const monetaryCoaIds = await prefetchMonetaryCoaIds(companyUUID, coaIds, trx);

  const fxSettingsResult = await getCompanySetting({
    companyId: companyUUID,
    settingKeys: ['track_fx_positions'],
    trx,
  });
  const trackFxPositions =
    fxSettingsResult.success && fxSettingsResult.data
      ? fxSettingsResult.data.track_fx_positions
      : false;

  return { bankSources, monetaryCoaIds, trackFxPositions };
};

// --- Prepare ---

const assertBankLeg = (
  transaction: LedgerTransactionInput,
  isBank: boolean,
  bankSource: BankPostingSource | null,
): void => {
  const sourceId = transaction.source_transaction_id;
  const bankLegs = transaction.entries.filter((e) => e.is_bank_leg === true);

  if (!isBank && bankLegs.length > 0) {
    throw new AppError('Only bank transactions may carry a bank leg', {
      sourceId,
    });
  }
  if (!isBank) return;

  if (bankLegs.length !== 1) {
    throw new AppError('A bank transaction must have exactly one bank leg', {
      sourceId,
    });
  }
  if (!bankSource) {
    throw new AppError(`Bank transaction not found for company: ${sourceId}`, {
      sourceId,
    });
  }

  const bankLeg = bankLegs[0];
  if (bankLeg.contact_id) {
    throw new AppError('Bank legs must not carry a contact', { sourceId });
  }

  if (bankLeg.coa_id !== bankSource.coaId) {
    throw new AppError(
      `Bank leg COA ${bankLeg.coa_id} does not match bank account COA ${bankSource.coaId}`,
      { sourceId },
    );
  }
  if (bankLeg.source_currency_id !== bankSource.currencyId) {
    throw new AppError(
      `Bank leg currency ${bankLeg.source_currency_id} does not match bank account currency ${bankSource.currencyId}`,
      { sourceId },
    );
  }

  const amountCheck = validateBankLegAmount({
    entries: [bankLeg],
    bankTransactionAmount: bankSource.amount,
  });
  if (!amountCheck.valid) {
    throw new AppError(amountCheck.error!, { sourceId });
  }
};

const constraintEntryLabel = (
  entry: LedgerTransactionInput['entries'][number],
  index: number,
): string => {
  const line = index + 1;
  const role = entry.is_bank_leg ? 'bank leg' : `line ${line}`;
  return `${role} (coa ${entry.coa_id})`;
};

const runTransactionConstraints = async (
  companyId: string,
  transaction: LedgerTransactionInput,
  fx: { systemExRate: number; customExRate: number },
  trx: Knex.Transaction,
): Promise<string[]> => {
  const sourceId = transaction.source_transaction_id;
  const entries = transaction.entries.map((entry, index) => ({
    id: constraintEntryLabel(entry, index),
    amount: entry.source_amount,
    coa_id: entry.coa_id,
    fs_date: toYMD(entry.fs_date),
    project_id: entry.project_id ?? null,
    is_bank_leg: entry.is_bank_leg ?? false,
    system_exchange_rate: fx.systemExRate,
    custom_exchange_rate: fx.customExRate,
  }));

  const result = await runConstraints(
    {
      companyUUID: companyId,
      transaction_date: toYMD(transaction.transaction_date),
      entries,
    },
    trx,
  );

  if (!result.isValid) {
    const constraintErrors = result.errors.map((e) => ({
      code: e.code,
      message: e.message,
    }));
    throw new AppError(
      `Transaction ${sourceId}: ${result.errors.map((e) => e.message).join('; ')}`,
      { sourceId, constraintErrors },
      true,
    );
  }

  return result.warnings.map((w) => w.message);
};

const prepareOne = async (
  company: Company,
  transaction: LedgerTransactionInput,
  facts: BatchFacts,
  trx: Knex.Transaction,
): Promise<PreparedLedger> => {
  const isBank = transaction.transaction_source === 'bank_transaction';
  const bankSource =
    facts.bankSources.get(transaction.source_transaction_id) ?? null;

  assertBankLeg(transaction, isBank, bankSource);

  const { systemExRate, customExRate, warnings } = await resolveFx({
    entries: transaction.entries,
    ledgerTxDate: new Date(transaction.transaction_date),
    sourceCurrencyId: transaction.source_transaction_currency_id,
    reportingCurrencyId: company.reporting_currency_id,
    bankTxnSystemRate: bankSource?.systemExchangeRate ?? null,
    trx,
  });

  const constraintWarnings = await runTransactionConstraints(
    company.id,
    transaction,
    { systemExRate, customExRate },
    trx,
  );

  const isFx =
    transaction.source_transaction_currency_id !==
    company.reporting_currency_id;

  const entries: PreparedEntry[] = transaction.entries.map((entry) => ({
    ...entry,
    is_monetary: isMonetaryEntry(
      entry,
      company.reporting_currency_id,
      facts.monetaryCoaIds,
    ),
    contact_id: entry.is_bank_leg
      ? null
      : (entry.contact_id ?? transaction.contact_id ?? null),
    contact_type: entry.is_bank_leg
      ? null
      : (entry.contact_type ?? transaction.contact_type ?? null),
    fx_transaction_id: null,
  }));

  return {
    input: transaction,
    entries,
    systemExRate,
    customExRate,
    coaBounds: processEntriesDates(transaction.entries).bounds,
    warnings: [...warnings, ...constraintWarnings],
    isFx,
  };
};

const prepareBatch = async (
  company: Company,
  transactions: LedgerTransactionInput[],
  facts: BatchFacts,
  trx: Knex.Transaction,
): Promise<{ prepared: PreparedLedger[]; errors: TxnValidationError[] }> => {
  const prepared: PreparedLedger[] = [];
  const errors: TxnValidationError[] = [];

  for (const transaction of transactions) {
    try {
      prepared.push(await prepareOne(company, transaction, facts, trx));
    } catch (err) {
      const sourceId = transaction.source_transaction_id;
      if (err instanceof AppError) {
        errors.push({
          sourceId,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
        continue;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ sourceId, message });
    }
  }

  return { prepared, errors };
};

// --- Persist ---

const assignLedgerIds = (
  prepared: PreparedLedger[],
  ids: string[],
): IdentifiedLedger[] =>
  prepared.map((p, i) => {
    const id = ids[i];
    const fxTransactionId =
      p.isFx && p.entries.some((e) => e.is_monetary)
        ? makeFxTransactionId({ type: 'LEDGER_TX', ledgerTransactionId: id })
        : null;

    return {
      ...p,
      id,
      entries: p.entries.map((entry) => ({
        ...entry,
        fx_transaction_id: entry.is_monetary ? fxTransactionId : null,
      })),
    };
  });

type SourceLink = { sourceId: string; ledgerTransactionId: string };

const linkSourceTable = async (
  table: 'bank_transactions' | 'journal_batches',
  links: SourceLink[],
  trx: Knex.Transaction,
): Promise<void> => {
  if (links.length === 0) return;

  const valuesSql = links.map(() => '(?::uuid, ?::uuid)').join(', ');
  const bindings = links.flatMap((l) => [l.sourceId, l.ledgerTransactionId]);

  const result = await trx.raw(
    `UPDATE ${table} AS t
     SET ledger_transaction_id = v.ledger_id
     FROM (VALUES ${valuesSql}) AS v(source_id, ledger_id)
     WHERE t.id = v.source_id
       AND t.ledger_transaction_id IS NULL`,
    bindings,
  );

  const updated = Number(result.rowCount ?? 0);
  if (updated !== links.length) {
    throw new AppError('Failed to link source entities', {
      table,
      expected: links.length,
      updated,
    });
  }
};

const linkSourceEntities = async (
  identified: IdentifiedLedger[],
  trx: Knex.Transaction,
): Promise<void> => {
  const bankLinks: SourceLink[] = [];
  const journalLinks: SourceLink[] = [];

  for (const p of identified) {
    const link = {
      sourceId: p.input.source_transaction_id,
      ledgerTransactionId: p.id,
    };

    if (p.input.transaction_source === 'bank_transaction') {
      bankLinks.push(link);
    } else if (p.input.transaction_source === 'manual_journal') {
      journalLinks.push(link);
    }
  }

  await linkSourceTable('bank_transactions', bankLinks, trx);
  await linkSourceTable('journal_batches', journalLinks, trx);
};

const batchNeedsFxPositions = (
  trackFxPositions: boolean,
  identified: IdentifiedLedger[],
): boolean =>
  trackFxPositions &&
  identified.some(
    (ledger) =>
      ledger.isFx &&
      ledger.entries.some(
        (entry) => entry.is_monetary && entry.fx_transaction_id,
      ),
  );

const FX_ENTRY_COLUMNS = [
  'id',
  'ledger_transaction_id',
  'coa_id',
  'source_currency_id',
  'source_amount',
  'amount',
  'is_monetary',
  'fx_transaction_id',
  'fs_date',
] as const satisfies readonly (keyof LedgerEntry)[];

const writeFxPositionsForLedgerEntries = async (
  trx: Knex.Transaction,
  input: {
    companyId: string;
    createdById: string;
    customExRateByLedgerTxnId: Map<string, number>;
    entries: LedgerEntryFxRow[];
  },
): Promise<void> => {
  for (const entry of input.entries) {
    if (!entry.is_monetary || !entry.fx_transaction_id) {
      continue;
    }

    const customExRate = input.customExRateByLedgerTxnId.get(
      entry.ledger_transaction_id,
    );
    if (customExRate === undefined) {
      throw new AppError(
        'Missing custom exchange rate for FX position upsert',
        {
          ledgerTransactionId: entry.ledger_transaction_id,
          ledgerEntryId: entry.id,
        },
      );
    }

    await upsertFxPosition({
      companyId: input.companyId,
      fx_transaction_id: entry.fx_transaction_id,
      account_id: entry.coa_id,
      foreign_currency_id: entry.source_currency_id,
      source_amount: Number(entry.source_amount),
      amount: Number(entry.amount),
      exchange_rate: customExRate,
      source_type: 'ledger_entry',
      source_id: entry.id,
      ledger_transaction_id: entry.ledger_transaction_id,
      ledger_entry_id: entry.id,
      movement_date: toYMD(entry.fs_date),
      created_by_id: input.createdById,
      trx,
    });
  }
};

function batchCoaBounds(
  coaBoundsByTransaction: Iterable<Map<string, { min: string; max: string }>>,
): Map<string, { min: string }> {
  const merged = new Map<string, { min: string }>();

  for (const coaBounds of coaBoundsByTransaction) {
    for (const [coaId, range] of coaBounds) {
      const existing = merged.get(coaId);
      if (!existing || range.min < existing.min) {
        merged.set(coaId, { min: range.min });
      }
    }
  }

  return merged;
}

const persistBatch = async (
  company: Company,
  prepared: PreparedLedger[],
  ctx: PersistContext,
  facts: BatchFacts,
  trx: Knex.Transaction,
): Promise<{ postedCount: number; ledgerTransactionIds: string[] }> => {
  const ids = await generateV7Ids(prepared.length, trx);
  if (ids.length !== prepared.length) {
    throw new AppError('Failed to allocate ledger transaction IDs', {
      count: prepared.length,
      expected: prepared.length,
      received: ids.length,
    });
  }

  const identified = assignLedgerIds(prepared, ids);

  const headerRows = identified.map((p) => {
    const { entries: _entries, ...header } = p.input;
    return {
      ...header,
      id: p.id,
      company_id: company.id,
      status: 'posted' as const,
      created_by_id: ctx.actingUserId,
      updated_by_id: ctx.actingUserId,
    };
  });
  await trx.batchInsert('ledger_transactions', headerRows, INSERT_CHUNK);

  const entryRows: NewLedgerEntry[] = identified.flatMap((p) =>
    p.entries.map((entry) => ({
      ...entry,
      company_id: company.id,
      ledger_transaction_id: p.id,
      is_bank_leg: entry.is_bank_leg ?? false,
      system_exchange_rate: p.systemExRate,
      custom_exchange_rate: p.customExRate,
      updated_by_id: ctx.actingUserId,
    })),
  );
  const ledgerTransactionIds = identified.map((ledger) => ledger.id);
  const needsFxPositions = batchNeedsFxPositions(
    facts.trackFxPositions,
    identified,
  );

  if (needsFxPositions) {
    const insertedFxEntries: LedgerEntryFxRow[] = await trx
      .batchInsert<
        LedgerEntry,
        LedgerEntryFxRow[]
      >('ledger_entries', entryRows, INSERT_CHUNK)
      .returning(FX_ENTRY_COLUMNS);

    await writeFxPositionsForLedgerEntries(trx, {
      companyId: company.id,
      createdById: ctx.actingUserId,
      customExRateByLedgerTxnId: new Map(
        identified.map((ledger) => [ledger.id, ledger.customExRate]),
      ),
      entries: insertedFxEntries,
    });
  } else {
    await trx.batchInsert('ledger_entries', entryRows, INSERT_CHUNK);
  }

  await linkSourceEntities(identified, trx);

  await writeLedgerPostAuditBatch({
    companyId: company.id,
    actor: ctx.actor,
    context: ctx.requestContext,
    records: identified.map((p) => ({
      ledgerTransactionId: p.id,
      transactionSource: p.input.transaction_source,
      categorizationSource: p.input.categorization_source,
      sourceTransactionId: p.input.source_transaction_id,
      transactionDate: p.input.transaction_date,
      sourceTransactionAmount: p.input.source_transaction_amount ?? null,
      sourceTransactionCurrencyId: p.input.source_transaction_currency_id,
      categorizationCandidateId: p.input.categorization_candidate_id ?? null,
      isFx: p.isFx,
      entries: p.entries.map((entry) => ({
        coaId: entry.coa_id,
        sourceAmount: entry.source_amount,
        fsDate: entry.fs_date,
        isBankLeg: entry.is_bank_leg ?? false,
        contactId: entry.contact_id ?? null,
      })),
    })),
    trx,
  });

  await enqueueLedgerPostProcessing(trx, {
    companyId: company.id,
    glRecalcBounds: batchCoaBounds(
      identified.map((record) => record.coaBounds),
    ),
    postedLedgerTransactions: identified.map((record) => ({
      id: record.id,
      transactionSource: record.input.transaction_source,
      sourceTransactionId: record.input.source_transaction_id,
    })),
    bankSources: facts.bankSources,
    triggeredBy: 'ledger_entry',
  });

  return {
    postedCount: identified.length,
    ledgerTransactionIds,
  };
};

// --- Entry point ---

export async function postLedgerTransactions(
  input: PostLedgerTransactionsInput,
) {
  const parsed = ledgerTransactionInput
    .array()
    .min(1)
    .safeParse(input.transactions);
  if (!parsed.success) {
    return errorResponse(
      'Invalid ledger transactions',
      z.flattenError(parsed.error),
    );
  }

  const transactions = parsed.data;
  if (transactions.length > MAX_BATCH_SIZE) {
    return errorResponse(
      `Cannot post more than ${MAX_BATCH_SIZE} ledger transactions at once`,
      { count: transactions.length, max: MAX_BATCH_SIZE },
    );
  }

  const run = async (trx: Knex.Transaction) => {
    const company = await resolveCompany(input.companyId, trx);
    if (!company?.reporting_currency_id) {
      return errorResponse('Company not found', { companyId: input.companyId });
    }

    const sourceLockKeys = transactions.map((t) =>
      t.transaction_source === 'bank_transaction'
        ? lockKeyBankTxn(t.source_transaction_id)
        : lockKeyJournalBatch(t.source_transaction_id),
    );
    await acquireAdvisoryXactLocks(trx, [
      lockKeyCompany(company.id),
      ...sourceLockKeys,
    ]);

    const sourceIds = transactions.map((t) => t.source_transaction_id);
    const alreadyPosted = await findAlreadyPosted(company.id, sourceIds, trx);
    if (alreadyPosted.length > 0) {
      return errorResponse('Ledger transactions already posted', {
        alreadyPosted,
      });
    }

    const facts = await loadBatchFacts(company.id, transactions, trx);
    if (input.skipFxPositionTracking) {
      facts.trackFxPositions = false;
    }
    const { prepared, errors } = await prepareBatch(
      company,
      transactions,
      facts,
      trx,
    );

    if (errors.length > 0) {
      return errorResponse('Validation failed for ledger transactions', {
        validationErrors: errors,
        totalTransactions: transactions.length,
        failedCount: errors.length,
      });
    }

    const actingUserId = await resolveActorUserId(input.actor, trx);
    const { postedCount, ledgerTransactionIds } = await persistBatch(
      company,
      prepared,
      {
        actingUserId,
        actor: input.actor,
        requestContext: input.requestContext,
      },
      facts,
      trx,
    );

    return successResponse('Ledger transactions posted', {
      postedCount,
      ledgerTransactionIds,
    });
  };

  try {
    return await (input.trx ? run(input.trx) : knexClient.transaction(run));
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse('Failed to post ledger transactions', err);
    }
    return errorResponse('Failed to post ledger transactions', {
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
