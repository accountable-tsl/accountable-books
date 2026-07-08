import { randomUUID } from 'node:crypto';
import type {
  LedgerIntent,
  LedgerPostingIntent,
} from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDb } from '../../../../config/test-db.js';
import {
  getTestCompanyId,
  getTestUserId,
  US_USER_EMAIL,
} from '../../../../test/helpers.js';
import { knexClient } from '../../../db/knexClient.js';
import {
  ACTIVITY_EVENT_TYPE,
  buildActivityEventScopeKey,
} from '../../activity/index.js';
import { addNewBankTransactions } from '../../bankTransactions/bankTransactions.model.js';
import { dispatchPendingIntents } from '../../outbox/index.js';
import { OUTBOX_INTENT } from '../../outbox/intents.js';
import { materializeWork } from '../../work/work-materialization.js';
import { resolveFirmCompanyId } from '../../work/work-ownership.js';
import {
  getActiveWorkItemBankTransactionIds,
  getWorkQueue,
} from '../../work/work-queue.read.js';
import {
  buildScopeKey,
  WORK_TYPE_CATEGORIZE_TRANSACTIONS,
  WORK_TYPE_REVIEW_SUGGESTIONS,
} from '../../work/work.types.js';
import { postCandidateToLedger } from '../autopost/autopost.service.js';
import {
  getCategorizationTransactions,
  processCategorizationIntent,
} from '../categorization.model.js';

import type { CandidateInput } from '../candidates/candidates.types.js';

// --- Fixtures -------------------------------------------------------------

async function createFreshBankAccount(
  trx: Knex.Transaction,
  companyId: string,
  userId: string,
): Promise<string> {
  const existing = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .first('bank_id', 'coa_id');
  if (!existing) {
    throw new Error('Demo company has no bank account to template from');
  }
  const company = await trx('companies')
    .where({ id: companyId })
    .first('reporting_currency_id');

  const [account] = await trx('bank_accounts')
    .insert({
      display_name: 'Phase2 Materialization Account',
      account_number: `P2M-${randomUUID()}`,
      bank_id: existing.bank_id,
      currency_id: company.reporting_currency_id,
      company_id: companyId,
      coa_id: existing.coa_id,
      connection_status: 'not_connected',
      created_by_id: userId,
    })
    .returning('id');

  return account.id;
}

/** An active, postable COA that is not any bank account's leg COA. */
async function pickPostableCoaId(
  client: Knex,
  companyId: string,
): Promise<string> {
  const bankCoaIds = (
    await client('bank_accounts')
      .where({ company_id: companyId })
      .select('coa_id')
  ).map((row) => row.coa_id);

  const coa = await client('coa')
    .where({
      company_id: companyId,
      is_active: true,
      locked: false,
      is_deleted: false,
    })
    .whereNotIn('id', bankCoaIds)
    .first('id');

  if (!coa) {
    throw new Error('No postable COA found for demo company');
  }
  return coa.id;
}

function depositPayload(bankAccountId: string, count: number) {
  return {
    source: 'manual_entry' as const,
    bank_account_id: bankAccountId,
    source_metadata: {},
    bank_transactions: Array.from({ length: count }).map((_, index) => ({
      transaction_date: new Date(
        `2026-03-${String(index + 1).padStart(2, '0')}`,
      ),
      amount: (index + 1) * 100,
      bank_account_id: bankAccountId,
    })),
  };
}

/**
 * A single-line full categorization. The non-bank leg offsets the bank leg, so
 * `source_amount` is the negative of the bank transaction amount (the ledger
 * balance rule requires the raw signed amounts to sum to zero).
 */
function buildPostIntent(
  bankTransactionId: string,
  coaId: string,
  bankAmount: number,
): LedgerPostingIntent {
  return {
    intent_id: randomUUID(),
    bank_transaction_id: bankTransactionId,
    desired_state: { entries: [{ coa_id: coaId, source_amount: -bankAmount }] },
    timestamp: new Date().toISOString(),
  };
}

function buildRejectIntent(
  bankTransactionId: string,
  candidateId: string,
): LedgerIntent {
  return {
    intent_id: randomUUID(),
    bank_transaction_id: bankTransactionId,
    candidate_id: candidateId,
    action: 'reject_suggestion',
    reason: 'Wrong suggested account',
    timestamp: new Date().toISOString(),
  };
}

function toTestYmd(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

async function insertPendingCandidate(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankTransactionId: string;
    coaId: string;
    reviewState?: 'pending_review' | 'closed';
  },
): Promise<string> {
  const bankTxn = await trx('bank_transactions as bt')
    .join('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
    .where('bt.id', input.bankTransactionId)
    .first(
      'bt.transaction_date',
      'bt.amount',
      'bt.system_exchange_rate',
      'ba.currency_id',
      'ba.coa_id as bank_account_coa_id',
    );
  if (!bankTxn) {
    throw new Error('Bank transaction not found for candidate fixture');
  }

  const transactionDate = toTestYmd(bankTxn.transaction_date);
  const bankAmount = Number(bankTxn.amount);
  const runId = randomUUID();

  const [task] = await trx('categorization_tasks')
    .insert({
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      company_id: input.companyId,
      enriched_transaction: {},
      enrichment_version: 'test',
      source: 'manual',
      metadata: {},
    })
    .returning('id');

  const [prediction] = await trx('categorization_predictions')
    .insert({
      categorization_task_id: task.id,
      run_id: runId,
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      company_id: input.companyId,
      source: 'ml',
      confidence: 0.9,
      metadata: {},
    })
    .returning('id');

  const [candidate] = await trx('categorization_candidates')
    .insert({
      categorization_task_id: task.id,
      run_id: runId,
      bank_transaction_id: input.bankTransactionId,
      bank_transaction_date: transactionDate,
      prediction_id: prediction.id,
      company_id: input.companyId,
      source: 'ml',
      description: 'Suggested categorization',
      confidence: 0.9,
      review_state: input.reviewState ?? 'pending_review',
      metadata: {},
    })
    .returning('id');

  await trx('categorization_candidate_lines').insert([
    {
      candidate_id: candidate.id,
      fs_date: transactionDate,
      source_currency_id: bankTxn.currency_id,
      signed_native_amount: bankAmount,
      system_exchange_rate: Number(bankTxn.system_exchange_rate),
      custom_exchange_rate: Number(bankTxn.system_exchange_rate),
      transaction_side: bankAmount > 0 ? 'debit' : 'credit',
      coa_id: bankTxn.bank_account_coa_id,
      is_bank_leg: true,
      description: 'Bank leg',
    },
    {
      candidate_id: candidate.id,
      fs_date: transactionDate,
      source_currency_id: bankTxn.currency_id,
      signed_native_amount: -bankAmount,
      system_exchange_rate: Number(bankTxn.system_exchange_rate),
      custom_exchange_rate: Number(bankTxn.system_exchange_rate),
      transaction_side: -bankAmount > 0 ? 'debit' : 'credit',
      coa_id: input.coaId,
      is_bank_leg: false,
      description: 'Suggested line',
    },
  ]);

  return candidate.id;
}

async function loadCandidateInput(
  trx: Knex.Transaction,
  candidateId: string,
): Promise<CandidateInput> {
  const candidate = await trx('categorization_candidates')
    .where({ id: candidateId })
    .first(
      'source',
      'categorization_task_id',
      'prediction_id',
      'bank_transaction_id',
      'bank_transaction_date',
      'company_id',
      'contact_id',
      'contact_type',
      'reference',
      'description',
      'confidence',
      'explanation',
      'metadata',
    );
  const lines = await trx('categorization_candidate_lines')
    .where({ candidate_id: candidateId })
    .orderBy('is_bank_leg', 'desc')
    .select(
      'fs_date',
      'transaction_side',
      'coa_id',
      'project_id',
      'contact_id',
      'contact_type',
      'source_currency_id',
      'system_exchange_rate',
      'custom_exchange_rate',
      'signed_native_amount',
      'description',
      'is_bank_leg',
      'split_type',
      'split_value',
      'explanation',
      'metadata',
    );

  if (!candidate || lines.length < 2) {
    throw new Error('Candidate fixture is incomplete');
  }

  return {
    source: candidate.source,
    categorization_task_id: candidate.categorization_task_id,
    prediction_id: candidate.prediction_id,
    bank_transaction_id: candidate.bank_transaction_id,
    bank_transaction_date: toTestYmd(candidate.bank_transaction_date),
    company_id: candidate.company_id,
    contact_id: candidate.contact_id,
    contact_type: candidate.contact_type,
    reference: candidate.reference,
    description: candidate.description,
    confidence: Number(candidate.confidence),
    explanation: candidate.explanation,
    metadata: candidate.metadata ?? {},
    candidate_lines: lines.map((line) => ({
      fs_date: toTestYmd(line.fs_date),
      transaction_side: line.transaction_side,
      coa_id: line.coa_id,
      project_id: line.project_id,
      contact_id: line.contact_id,
      contact_type: line.contact_type,
      source_currency_id: line.source_currency_id,
      system_exchange_rate: Number(line.system_exchange_rate),
      custom_exchange_rate: Number(line.custom_exchange_rate),
      signed_native_amount: Number(line.signed_native_amount),
      description: line.description,
      is_bank_leg: Boolean(line.is_bank_leg),
      split_type: line.split_type,
      split_value: line.split_value == null ? null : Number(line.split_value),
      explanation: line.explanation,
      metadata: line.metadata ?? {},
    })),
  };
}

/** The single open categorize work item for a client (or undefined). */
async function getOpenCategorizeWorkItem(
  firmCompanyId: string,
  clientCompanyId: string,
) {
  const queue = await getWorkQueue({ firmCompanyId });
  return queue.items.find(
    (item) =>
      item.clientCompanyId === clientCompanyId &&
      item.workType === WORK_TYPE_CATEGORIZE_TRANSACTIONS,
  );
}

async function clearCommittedCategorizeWorkItems(
  clientCompanyId: string,
): Promise<void> {
  // Only this suite commits categorize work items for the demo client, so a
  // blanket delete (cascades subjects) is a safe slate. Mirrors the Phase 1
  // committed-data test.
  await knexClient('app.legacy_work_items')
    .where({
      client_company_id: clientCompanyId,
      work_type: WORK_TYPE_CATEGORIZE_TRANSACTIONS,
    })
    .del();
}

// --- Tests ----------------------------------------------------------------

describe('Phase 2: manual post reconciles the firm queue', () => {
  let scopeKey = '';
  let clientCompanyId = '';

  afterEach(async () => {
    // Committed-data cleanup: the per-client work item is the only committed row
    // other tests read; the throwaway account/transactions are soft-delete-only
    // residue (left, as in Phase 1).
    if (clientCompanyId) {
      await clearCommittedCategorizeWorkItems(clientCompanyId);
    }
    if (scopeKey) {
      await knexClient('app.outbox').where({ scope_key: scopeKey }).del();
    }
    scopeKey = '';
    clientCompanyId = '';
  });

  it('closes the queue row as the user posts, deep-links to active subjects, and writes one intent per post', async () => {
    const setup = await getTestDb().transaction();
    let companyId: string;
    let userId: string;
    let firmCompanyId: string;
    let coaId: string;
    try {
      companyId = await getTestCompanyId(setup, 'indDemoUS');
      userId = await getTestUserId(setup, US_USER_EMAIL);
      firmCompanyId = await resolveFirmCompanyId(setup, companyId);
      coaId = await pickPostableCoaId(setup, companyId);
    } finally {
      await setup.rollback();
    }
    clientCompanyId = companyId;

    await clearCommittedCategorizeWorkItems(companyId);

    // --- Import 5 (committed) so the dispatcher (its own trx) can see them ---
    const importTrx = await getTestDb().transaction();
    let bankAccountId = '';
    try {
      bankAccountId = await createFreshBankAccount(
        importTrx,
        companyId,
        userId,
      );
      scopeKey = buildScopeKey({
        type: 'bank_account',
        clientCompanyId: companyId,
        bankAccountId,
      });
      const res = await addNewBankTransactions({
        userId,
        companyId,
        trx: importTrx,
        data: depositPayload(bankAccountId, 5),
      });
      expect(res.success).toBe(true);
      await importTrx.commit();
    } catch (error) {
      await importTrx.rollback();
      throw error;
    }

    // Drain the import's materialization intent → queue shows "Categorize 5".
    await dispatchPendingIntents(10, { scopeKey });

    // Map each transaction to its committed amount for balanced posting.
    const amountById = new Map<string, number>(
      (
        await knexClient('bank_transactions')
          .where({ bank_account_id: bankAccountId, is_deleted: false })
          .select('id', 'amount')
      ).map((row) => [row.id as string, Number(row.amount)]),
    );

    let item = await getOpenCategorizeWorkItem(firmCompanyId, companyId);
    expect(item?.title).toBe('Categorize 5 transactions');
    expect(item?.activeSubjectCount).toBe(5);
    const workItemId = item!.workItemId;

    // Deep-link resolves exactly the 5 active subjects; wrong company leaks none.
    const subjectIds = await getActiveWorkItemBankTransactionIds({
      workItemId,
      clientCompanyId: companyId,
    });
    expect(subjectIds).toHaveLength(5);
    expect(
      await getActiveWorkItemBankTransactionIds({
        workItemId,
        clientCompanyId: randomUUID(),
      }),
    ).toHaveLength(0);

    // Deep-linked read returns exactly those subjects (date range ignored).
    const deepLinkRead = await getCategorizationTransactions({
      companyId,
      workItemId,
    });
    expect(deepLinkRead.data?.transactions).toHaveLength(5);

    const exactDeepLinkRead = await getCategorizationTransactions({
      companyId,
      workItemId,
      dateFrom: '2020-01-01',
      dateTo: '2020-01-02',
      status: ['posted'],
      bankAccountIds: [randomUUID()],
      searchQuery: 'will-not-match',
      limit: 1,
      offset: 1,
    });
    expect(exactDeepLinkRead.data?.transactions).toHaveLength(5);
    expect(exactDeepLinkRead.data?.limit).toBe(5);
    expect(exactDeepLinkRead.data?.offset).toBe(0);

    // --- Post 2 of 5 ---
    const post2 = await processCategorizationIntent({
      companyId,
      userId,
      intents: subjectIds
        .slice(0, 2)
        .map((id) => buildPostIntent(id, coaId, amountById.get(id)!)),
    });
    expect(post2.success).toBe(true);
    expect(post2.data?.summary.created).toBe(2);
    // Fast materialization ran inline and reconciled the scope.
    expect(
      post2.data?.workMaterialization?.scopes.some(
        (s) => s.scopeKey === scopeKey && s.status === 'reconciled',
      ),
    ).toBe(true);

    // Exactly one pending intent for the scope (import's was processed; the post
    // wrote one, debounced per scope).
    const pendingAfterPost = await knexClient('app.outbox').where({
      scope_key: scopeKey,
      status: 'pending',
    });
    expect(pendingAfterPost).toHaveLength(1);

    // Queue shrinks to 3; deep-link now resolves the remaining 3.
    item = await getOpenCategorizeWorkItem(firmCompanyId, companyId);
    expect(item?.title).toBe('Categorize 3 transactions');
    expect(item?.activeSubjectCount).toBe(3);
    const remaining = await getActiveWorkItemBankTransactionIds({
      workItemId,
      clientCompanyId: companyId,
    });
    expect([...remaining].sort()).toEqual([...subjectIds.slice(2)].sort());

    // --- No-op post writes no intent and no materialization metadata ---
    const noop = await processCategorizationIntent({
      companyId,
      userId,
      intents: [buildPostIntent(randomUUID(), coaId, 100)],
    });
    expect(noop.success).toBe(true);
    expect(noop.data?.summary.total_processed).toBe(0);
    expect(noop.data?.workMaterialization).toBeUndefined();

    // --- Post the remaining 3 → grouped row closes ---
    const post3 = await processCategorizationIntent({
      companyId,
      userId,
      intents: remaining.map((id) =>
        buildPostIntent(id, coaId, amountById.get(id)!),
      ),
    });
    expect(post3.success).toBe(true);
    expect(post3.data?.summary.created).toBe(3);

    expect(
      await getOpenCategorizeWorkItem(firmCompanyId, companyId),
    ).toBeUndefined();
    expect(
      await getActiveWorkItemBankTransactionIds({
        workItemId,
        clientCompanyId: companyId,
      }),
    ).toHaveLength(0);
  });
});

describe('Phase 3: candidate review work reconciles through categorization intents', () => {
  let trx: Knex.Transaction;
  let companyId: string;
  let userId: string;
  let firmCompanyId: string;
  let bankAccountId: string;
  let coaId: string;
  let scope: {
    type: 'bank_account';
    clientCompanyId: string;
    bankAccountId: string;
  };

  beforeEach(async () => {
    trx = await getTestDb().transaction();
    companyId = await getTestCompanyId(trx, 'indDemoUS');
    userId = await getTestUserId(trx, US_USER_EMAIL);
    firmCompanyId = await resolveFirmCompanyId(trx, companyId);
    await trx('app.legacy_work_items')
      .where({ client_company_id: companyId })
      .del();
    bankAccountId = await createFreshBankAccount(trx, companyId, userId);
    coaId = await pickPostableCoaId(trx, companyId);
    scope = {
      type: 'bank_account',
      clientCompanyId: companyId,
      bankAccountId,
    };
  });

  afterEach(async () => {
    await trx.rollback();
  });

  async function insertOneCandidateBackedTransaction(): Promise<{
    bankTransactionId: string;
    candidateId: string;
    amount: number;
  }> {
    const res = await addNewBankTransactions({
      userId,
      companyId,
      trx,
      data: depositPayload(bankAccountId, 1),
    });
    expect(res.success).toBe(true);

    const bankTxn = await trx('bank_transactions')
      .where({ bank_account_id: bankAccountId, is_deleted: false })
      .first('id', 'amount');
    if (!bankTxn) {
      throw new Error('Expected imported bank transaction');
    }

    const candidateId = await insertPendingCandidate(trx, {
      companyId,
      bankTransactionId: bankTxn.id,
      coaId,
    });

    return {
      bankTransactionId: bankTxn.id,
      candidateId,
      amount: Number(bankTxn.amount),
    };
  }

  it('rejects a pending candidate through the intent route and restores categorize work', async () => {
    const { bankTransactionId, candidateId } =
      await insertOneCandidateBackedTransaction();

    await materializeWork(scope, trx);
    let queue = await getWorkQueue({ firmCompanyId, trx });
    expect(
      queue.items.find((item) => item.workType === WORK_TYPE_REVIEW_SUGGESTIONS)
        ?.subjects[0].candidateId,
    ).toBe(candidateId);

    const response = await processCategorizationIntent({
      companyId,
      userId,
      trx,
      intents: [buildRejectIntent(bankTransactionId, candidateId)],
    });

    expect(response.success).toBe(true);
    expect(response.data?.summary.rejected).toBe(1);
    expect(response.data?.results[0]).toMatchObject({
      bank_transaction_id: bankTransactionId,
      candidate_id: candidateId,
      operation: 'candidate_rejected',
    });

    const candidate = await trx('categorization_candidates')
      .where({ id: candidateId })
      .first('review_state');
    expect(candidate?.review_state).toBe('closed');

    const disposition = await trx('categorization_candidate_dispositions')
      .where({ candidate_id: candidateId, disposition: 'rejected' })
      .first('id');
    expect(disposition).toBeDefined();

    const rejectionActivity = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scope_key: buildActivityEventScopeKey(
          `activity:${ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_REJECTED}:${candidateId}`,
        ),
        status: 'pending',
      })
      .first('payload');
    expect(rejectionActivity?.payload.event).toMatchObject({
      eventType: ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_REJECTED,
      sourceEntity: {
        type: 'categorization_candidate',
        id: candidateId,
      },
      actor: { type: 'user', userId },
      itemCount: 1,
      workType: WORK_TYPE_REVIEW_SUGGESTIONS,
      metadata: {
        bankTransactionId,
        bankAccountId,
        reason: 'Wrong suggested account',
      },
    });

    await materializeWork(scope, trx);
    queue = await getWorkQueue({ firmCompanyId, trx });
    expect(
      queue.items.find(
        (item) => item.workType === WORK_TYPE_REVIEW_SUGGESTIONS,
      ),
    ).toBeUndefined();

    const categorizeItem = queue.items.find(
      (item) => item.workType === WORK_TYPE_CATEGORIZE_TRANSACTIONS,
    );
    expect(categorizeItem?.subjects[0].bankTransactionId).toBe(
      bankTransactionId,
    );
  });

  it('posts an accepted candidate, records disposition and outcome, and leaves no work after re-runs', async () => {
    const { bankTransactionId, candidateId, amount } =
      await insertOneCandidateBackedTransaction();
    await materializeWork(scope, trx);

    const response = await processCategorizationIntent({
      companyId,
      userId,
      trx,
      intents: [
        {
          ...buildPostIntent(bankTransactionId, coaId, amount),
          candidate_id: candidateId,
          desired_state: { entries: [{ coa_id: coaId }] },
        },
      ],
    });

    expect(response.success).toBe(true);
    expect(response.data?.summary.created).toBe(1);
    const ledgerTransactionId =
      response.data?.results[0]?.ledger_transaction_id;
    expect(ledgerTransactionId).toBeTruthy();

    const candidate = await trx('categorization_candidates')
      .where({ id: candidateId })
      .first('review_state');
    expect(candidate?.review_state).toBe('closed');

    const disposition = await trx('categorization_candidate_dispositions')
      .where({ candidate_id: candidateId, disposition: 'posted' })
      .first('ledger_transaction_id');
    expect(disposition?.ledger_transaction_id).toBeDefined();

    const outcome = await trx('categorization_candidate_outcomes')
      .where({ candidate_id: candidateId })
      .first('outcome', 'comparison_basis');
    expect(outcome).toMatchObject({
      outcome: 'accepted_as_suggested',
      comparison_basis: 'manual_post',
    });

    const manualPostActivity = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scope_key: buildActivityEventScopeKey(
          `activity:${ACTIVITY_EVENT_TYPE.MANUAL_CATEGORIZATION_POSTED}:${ledgerTransactionId}`,
        ),
        status: 'pending',
      })
      .first('payload');
    expect(manualPostActivity?.payload.event).toMatchObject({
      eventType: ACTIVITY_EVENT_TYPE.MANUAL_CATEGORIZATION_POSTED,
      sourceEntity: { type: 'bank_transaction', id: bankTransactionId },
      ledgerTransactionId,
      actor: { type: 'user', userId },
      itemCount: 1,
      workType: WORK_TYPE_REVIEW_SUGGESTIONS,
      metadata: {
        bankTransactionId,
        bankAccountId,
        candidateId,
      },
    });

    await materializeWork(scope, trx);
    await materializeWork(scope, trx);
    const queue = await getWorkQueue({ firmCompanyId, trx });
    expect(
      queue.items.filter((item) => item.clientCompanyId === companyId),
    ).toHaveLength(0);
  });

  it('records activity when a pending candidate is autoposted', async () => {
    const { bankTransactionId, candidateId, amount } =
      await insertOneCandidateBackedTransaction();
    const candidateInput = await loadCandidateInput(trx, candidateId);
    const bankTransaction = await trx('bank_transactions as bt')
      .join('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
      .where('bt.id', bankTransactionId)
      .first('ba.currency_id as bankAccountCurrencyId');
    if (!bankTransaction) {
      throw new Error('Expected bank transaction fixture');
    }

    const result = await postCandidateToLedger({
      candidateInput,
      bankTransaction: {
        id: bankTransactionId,
        bankAccountCurrencyId: bankTransaction.bankAccountCurrencyId,
        transactionValue: amount,
      },
      candidateId,
      companyId,
      runId: randomUUID(),
      trx,
    });

    expect(result.success).toBe(true);
    expect(result.ledgerTransactionId).toBeTruthy();

    const activity = await trx('app.outbox')
      .where({
        intent_type: OUTBOX_INTENT.ACTIVITY_EVENT_REQUESTED,
        scope_key: buildActivityEventScopeKey(
          `activity:${ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_AUTOPOSTED}:${result.ledgerTransactionId}`,
        ),
      })
      .first('payload');
    expect(activity?.payload.event).toMatchObject({
      eventType: ACTIVITY_EVENT_TYPE.CATEGORIZATION_CANDIDATE_AUTOPOSTED,
      sourceEntity: {
        type: 'categorization_candidate',
        id: candidateId,
      },
      ledgerTransactionId: result.ledgerTransactionId,
      actor: { type: 'system' },
      itemCount: 1,
      workType: WORK_TYPE_REVIEW_SUGGESTIONS,
      metadata: {
        bankTransactionId,
        bankAccountId,
      },
    });
  });

  it('does not recreate work for expired source-posted candidate snapshots', async () => {
    const res = await addNewBankTransactions({
      userId,
      companyId,
      trx,
      data: depositPayload(bankAccountId, 1),
    });
    expect(res.success).toBe(true);

    const bankTxn = await trx('bank_transactions')
      .where({ bank_account_id: bankAccountId, is_deleted: false })
      .first('id', 'amount');
    if (!bankTxn) {
      throw new Error('Expected imported bank transaction');
    }

    const response = await processCategorizationIntent({
      companyId,
      userId,
      trx,
      intents: [buildPostIntent(bankTxn.id, coaId, Number(bankTxn.amount))],
    });
    expect(response.success).toBe(true);
    expect(response.data?.summary.created).toBe(1);

    const postedBankTxn = await trx('bank_transactions')
      .where({ id: bankTxn.id })
      .first('ledger_transaction_id');
    expect(postedBankTxn?.ledger_transaction_id).toBeDefined();

    const candidateId = await insertPendingCandidate(trx, {
      companyId,
      bankTransactionId: bankTxn.id,
      coaId,
      reviewState: 'closed',
    });

    await trx('categorization_candidate_dispositions').insert({
      candidate_id: candidateId,
      bank_transaction_id: bankTxn.id,
      company_id: companyId,
      disposition: 'expired_source_posted',
      ledger_transaction_id: postedBankTxn.ledger_transaction_id,
      reason: 'Source transaction was already posted',
      metadata: {},
      idempotency_key: `test:${candidateId}:expired_source_posted`,
    });

    await materializeWork(scope, trx);
    await materializeWork(scope, trx);

    const queue = await getWorkQueue({ firmCompanyId, trx });
    expect(
      queue.items.filter((item) => item.clientCompanyId === companyId),
    ).toHaveLength(0);
  });
});
