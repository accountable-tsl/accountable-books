import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../db/knexClient.js';
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
import { getBankPostingSources } from '../bankTransactions/bankTransactions.model.js';
import { runConstraints } from '../constraints/constraint-runner.js';
import { ledgerTransactionInput } from './ledgers.types.js';
import {
  fetchLookupMap,
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
} from './ledgers.utils.js';

import type { BankPostingSource } from '../bankTransactions/bankTransactions.model.js';
import type { ContactType } from '../contacts/index.js';
import type {
  LedgerTransactionInput,
  PostLedgerTransactionsInput,
} from './ledgers.types.js';

type ResolvedCompany = { id: string; reporting_currency_id: string };

type PostingContact = { id: string; type: ContactType | null };

// Resolved once per batch so per-posting preparation reads from memory instead of
// re-querying the same bank accounts and contact resolutions N times.
type BatchContext = {
  bankSources: Map<string, BankPostingSource>;
  bankContacts: Map<string, PostingContact>;
};

type PreparedPosting = {
  transaction: LedgerTransactionInput;
  contact: PostingContact | null;
  systemExRate: number;
  customExRate: number;
  bounds: Map<string, { min: string; max: string }>;
  warnings: string[];
};

const resolveCompany = (
  companyId: string,
  trx: Knex.Transaction,
): Promise<ResolvedCompany | undefined> =>
  trx('companies')
    .where(
      getIdentifierType(companyId) === 'uuid'
        ? { id: companyId }
        : { short_code: companyId },
    )
    .where({ is_deleted: false })
    .first('id', 'reporting_currency_id');

// A source_transaction_id is a UUID from disjoint id-spaces (bank transaction vs
// journal batch), so company + source ids + status='posted' is an exact match.
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

// One round-trip each for bank sources, bank contact resolutions, and contact /
// project existence across the whole batch. fetchLookupMap throws if any id is
// unknown, so these two calls validate every referenced contact and project.
const prefetchBatchContext = async (
  companyUUID: string,
  transactions: LedgerTransactionInput[],
  trx: Knex.Transaction,
): Promise<BatchContext> => {
  const bankIds = transactions
    .filter((t) => t.transaction_source === 'bank_transaction')
    .map((t) => t.source_transaction_id);

  const bankSources = await getBankPostingSources({
    companyId: companyUUID,
    bankTransactionIds: bankIds,
    trx,
  });

  // const resolutions = await getBankTransactionContactResolutions({
  //   companyId: companyUUID,
  //   bankTransactionIds: bankIds,
  //   trx,
  // });
  const bankContacts = new Map<string, PostingContact>();
  // for (const [id, r] of resolutions) {
  //   if (r.contact_id) {
  //     bankContacts.set(id, { id: r.contact_id, type: r.contact_type });
  //   }
  // }

  const allEntries = transactions.flatMap((t) => t.entries);
  const contactIds = new Set<string>([
    // ...[...bankContacts.values()].map((c) => c.id),
    ...transactions.flatMap((t) => (t.contact_id ? [t.contact_id] : [])),
    ...allEntries.flatMap((e) => (e.contact_id ? [e.contact_id] : [])),
  ]);
  const projectIds = new Set<string>(
    allEntries.flatMap((e) => (e.project_id ? [e.project_id] : [])),
  );

  await fetchLookupMap({
    table: 'contacts',
    ids: [...contactIds],
    companyId: companyUUID,
    txn: trx,
  });
  await fetchLookupMap({
    table: 'projects',
    ids: [...projectIds],
    companyId: companyUUID,
    txn: trx,
  });

  return { bankSources, bankContacts };
};

// In-memory check that a bank leg matches its account, run against the prefetched
// source. Pure: journals must carry no bank leg; bank txns need exactly one.
const assertBankLeg = (
  transaction: LedgerTransactionInput,
  isBank: boolean,
  bankSource: BankPostingSource | null,
): void => {
  const sourceId = transaction.source_transaction_id;
  const fail = (message: string): never => {
    throw new AppError(message, { sourceId });
  };
  const bankLegs = transaction.entries.filter((e) => e.is_bank_leg === true);

  if (!isBank) {
    if (bankLegs.length > 0)
      fail('Only bank transactions may carry a bank leg');
    return;
  }

  if (bankLegs.length !== 1)
    fail('A bank transaction must have exactly one bank leg');
  if (!bankSource) {
    throw new AppError(`Bank transaction not found for company: ${sourceId}`, {
      sourceId,
    });
  }

  const bankLeg = bankLegs[0]!;
  if (bankLeg.coa_id !== bankSource.coaId) {
    fail(
      `Bank leg COA ${bankLeg.coa_id} does not match bank account COA ${bankSource.coaId}`,
    );
  }
  if (bankLeg.source_currency_id !== bankSource.currencyId) {
    fail(
      `Bank leg currency ${bankLeg.source_currency_id} does not match bank account currency ${bankSource.currencyId}`,
    );
  }

  const amountCheck = validateBankLegAmount({
    entries: [bankLeg],
    bankTransactionAmount: bankSource.amount,
  });
  if (!amountCheck.valid) fail(amountCheck.error!);
};

// Run the accounting constraint suite (debits=credits, period open, COA active,
// single bank leg, ...). Throws on any error; returns non-blocking warnings.
const checkConstraints = async (
  companyUUID: string,
  transaction: LedgerTransactionInput,
  fx: { systemExRate: number; customExRate: number },
  trx: Knex.Transaction,
): Promise<string[]> => {
  const entries = transaction.entries.map((e, index) => ({
    id: `${index}`,
    amount: e.source_amount,
    coa_id: e.coa_id,
    fs_date: toYMD(e.fs_date),
    project_id: e.project_id ?? null,
    is_bank_leg: e.is_bank_leg ?? false,
    system_exchange_rate: fx.systemExRate,
    custom_exchange_rate: fx.customExRate,
  }));

  const result = await runConstraints(
    {
      companyUUID,
      transaction_date: toYMD(transaction.transaction_date),
      entries,
    },
    trx,
  );

  if (!result.isValid) {
    throw new AppError(
      result.errors.map((e) => e.message).join('\n'),
      {
        sourceId: transaction.source_transaction_id,
      },
      true,
    );
  }

  return result.warnings.map((w) => w.message);
};

// Header-only contact rule: an explicit header contact wins; otherwise a bank
// posting snapshots its resolved contact. Entries keep a contact only when one
// was provided explicitly.
const resolveHeaderContact = (
  transaction: LedgerTransactionInput,
  isBank: boolean,
  ctx: BatchContext,
): PostingContact | null => {
  if (transaction.contact_id) {
    return {
      id: transaction.contact_id,
      type: transaction.contact_type ?? null,
    };
  }
  return isBank
    ? (ctx.bankContacts.get(transaction.source_transaction_id) ?? null)
    : null;
};

const preparePosting = async (
  company: ResolvedCompany,
  transaction: LedgerTransactionInput,
  ctx: BatchContext,
  trx: Knex.Transaction,
): Promise<PreparedPosting> => {
  const sourceId = transaction.source_transaction_id;
  const isBank = transaction.transaction_source === 'bank_transaction';
  const bankSource = ctx.bankSources.get(sourceId) ?? null;

  assertBankLeg(transaction, isBank, bankSource);

  const contact = resolveHeaderContact(transaction, isBank, ctx);

  const { systemExRate, customExRate, warnings } = await resolveFx({
    entries: transaction.entries,
    ledgerTxDate: new Date(transaction.transaction_date),
    sourceCurrencyId: transaction.source_transaction_currency_id,
    reportingCurrencyId: company.reporting_currency_id,
    bankTxnSystemRate: bankSource?.systemExchangeRate ?? null,
    trx,
  });

  const constraintWarnings = await checkConstraints(
    company.id,
    transaction,
    { systemExRate, customExRate },
    trx,
  );

  return {
    transaction,
    contact,
    systemExRate,
    customExRate,
    bounds: processEntriesDates(transaction.entries).bounds,
    warnings: [...warnings, ...constraintWarnings],
  };
};

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

    const ctx = await prefetchBatchContext(company.id, transactions, trx);

    const prepared: PreparedPosting[] = [];
    for (const transaction of transactions) {
      prepared.push(await preparePosting(company, transaction, ctx, trx));
    }

    // PHASE C (next): persist ledger_transactions + ledger_entries + fx positions
    // + source links, write the audit_events row, and enqueue the durable
    // GL_BALANCE_RECOMPUTE outbox intent per affected COA.
    return successResponse(
      'Validated and prepared ledger transactions (persist pending)',
      {
        prepared: prepared.length,
      },
    );
  };

  try {
    return await (input.trx ? run(input.trx) : knexClient.transaction(run));
  } catch (err) {
    return errorResponse('Failed to post ledger transactions', {
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
