import type { Knex } from 'knex';

import { toYMD } from '../../../shared/utils/date.utils.js';

import type {
  CandidateDisposition,
  CandidateOutcome,
} from './candidates.types.js';

type CandidateDispositionInput = {
  candidateId: string;
  bankTransactionId: string;
  companyId: string;
  disposition: CandidateDisposition;
  actorUserId?: string | null;
  runId?: string | null;
  relatedCandidateId?: string | null;
  ledgerTransactionId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

type CandidateRow = {
  id: string;
  bank_transaction_id: string;
  company_id: string;
  review_state: 'pending_review' | 'closed';
  is_deleted: boolean;
};

type LedgerRow = {
  id: string;
  company_id: string;
  source_transaction_id: string;
  categorization_candidate_id: string | null;
  status: string;
};

type ComparableLine = {
  coaId: string;
  sourceCurrencyId: string;
  sourceAmount: string;
  customExchangeRate: string;
  fsDate: string;
  projectId: string | null;
  contactId: string | null;
  contactType: string | null;
};

export async function appendCandidateDisposition(
  trx: Knex.Transaction,
  input: CandidateDispositionInput,
): Promise<void> {
  const idempotencyKey =
    input.idempotencyKey ??
    [
      'candidate',
      input.candidateId,
      input.disposition,
      input.relatedCandidateId ?? 'none',
      input.ledgerTransactionId ?? 'none',
    ].join(':');

  await trx('categorization_candidate_dispositions')
    .insert({
      candidate_id: input.candidateId,
      bank_transaction_id: input.bankTransactionId,
      company_id: input.companyId,
      disposition: input.disposition,
      actor_user_id: input.actorUserId ?? null,
      run_id: input.runId ?? null,
      related_candidate_id: input.relatedCandidateId ?? null,
      ledger_transaction_id: input.ledgerTransactionId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      idempotency_key: idempotencyKey,
    })
    .onConflict('idempotency_key')
    .ignore();
}

export async function closeCandidateReview(
  trx: Knex.Transaction,
  candidateId: string,
): Promise<void> {
  await trx('categorization_candidates')
    .where({ id: candidateId, review_state: 'pending_review' })
    .update({ review_state: 'closed', updated_at: trx.fn.now() });
}

export async function closePendingCandidatesAsPosted(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankTransactionId: string;
    ledgerTransactionId: string;
    actorUserId?: string | null;
    runId?: string | null;
  },
): Promise<string[]> {
  const rows = (await trx<CandidateRow>('categorization_candidates')
    .where({
      company_id: input.companyId,
      bank_transaction_id: input.bankTransactionId,
      review_state: 'pending_review',
      is_deleted: false,
    })
    .forUpdate()) as CandidateRow[];

  for (const row of rows) {
    await closeCandidateReview(trx, row.id);
    await appendCandidateDisposition(trx, {
      candidateId: row.id,
      bankTransactionId: row.bank_transaction_id,
      companyId: row.company_id,
      disposition: 'posted',
      actorUserId: input.actorUserId ?? null,
      runId: input.runId ?? null,
      ledgerTransactionId: input.ledgerTransactionId,
      idempotencyKey: `candidate:${row.id}:posted:${input.ledgerTransactionId}`,
    });
  }

  return rows.map((row) => row.id);
}

export async function rejectPendingCandidate(
  trx: Knex.Transaction,
  input: {
    candidateId: string;
    bankTransactionId: string;
    companyId: string;
    actorUserId: string;
    reason?: string | null;
  },
): Promise<
  | {
      rejected: true;
      candidateId: string;
      bankTransactionId: string;
      bankAccountId: string;
    }
  | { rejected: false; reason: string }
> {
  const row = await trx('categorization_candidates as cc')
    .join('bank_transactions as bt', 'bt.id', 'cc.bank_transaction_id')
    .where({
      'cc.id': input.candidateId,
      'cc.bank_transaction_id': input.bankTransactionId,
      'cc.company_id': input.companyId,
      'cc.is_deleted': false,
    })
    .forUpdate()
    .first(
      'cc.id',
      'cc.bank_transaction_id',
      'cc.company_id',
      'cc.review_state',
      'bt.bank_account_id',
      'bt.ledger_transaction_id',
      'bt.is_deleted as bank_transaction_is_deleted',
    );

  if (!row) {
    return { rejected: false, reason: 'candidate_not_found' };
  }

  if (
    row.review_state !== 'pending_review' ||
    row.ledger_transaction_id ||
    row.bank_transaction_is_deleted
  ) {
    return { rejected: false, reason: 'candidate_not_pending_review' };
  }

  await closeCandidateReview(trx, row.id);
  await appendCandidateDisposition(trx, {
    candidateId: row.id,
    bankTransactionId: row.bank_transaction_id,
    companyId: row.company_id,
    disposition: 'rejected',
    actorUserId: input.actorUserId,
    reason: input.reason ?? null,
    idempotencyKey: `candidate:${row.id}:rejected`,
  });

  return {
    rejected: true,
    candidateId: row.id,
    bankTransactionId: row.bank_transaction_id,
    bankAccountId: row.bank_account_id,
  };
}

export async function recordCandidateOutcomeForLedger(
  trx: Knex.Transaction,
  input: {
    candidateId: string;
    ledgerTransactionId: string;
    comparisonBasis: string;
  },
): Promise<CandidateOutcome> {
  const candidate = (await trx<CandidateRow>('categorization_candidates')
    .where({ id: input.candidateId, is_deleted: false })
    .first()) as CandidateRow | undefined;

  const ledger = (await trx<LedgerRow>('ledger_transactions')
    .where({ id: input.ledgerTransactionId, status: 'posted' })
    .first(
      'id',
      'company_id',
      'source_transaction_id',
      'categorization_candidate_id',
    )) as LedgerRow | undefined;

  if (!candidate) {
    throw new Error(
      `Candidate not found for outcome comparison: ${input.candidateId}`,
    );
  }
  if (!ledger) {
    throw new Error(
      `Posted ledger transaction not found for outcome comparison: ${input.ledgerTransactionId}`,
    );
  }
  if (
    ledger.company_id !== candidate.company_id ||
    ledger.source_transaction_id !== candidate.bank_transaction_id
  ) {
    throw new Error(
      `Candidate ${candidate.id} does not match ledger transaction ${ledger.id}`,
    );
  }

  const suggestedFacts = await loadCandidateComparableFacts(trx, candidate.id);
  const postedFacts = await loadLedgerComparableFacts(trx, ledger.id);

  const outcome = compareFacts({
    candidateId: input.candidateId,
    linkedCandidateId: ledger?.categorization_candidate_id ?? null,
    suggestedFacts,
    postedFacts,
  });

  await trx('categorization_candidate_outcomes')
    .insert({
      candidate_id: input.candidateId,
      bank_transaction_id: candidate.bank_transaction_id,
      company_id: candidate.company_id,
      ledger_transaction_id: input.ledgerTransactionId,
      outcome,
      comparison_basis: input.comparisonBasis,
      suggested_facts: JSON.stringify(suggestedFacts),
      posted_facts: JSON.stringify(postedFacts),
      differences: JSON.stringify(
        buildDifferences(suggestedFacts, postedFacts),
      ),
    })
    .onConflict('candidate_id')
    .merge({
      ledger_transaction_id: input.ledgerTransactionId,
      outcome,
      comparison_basis: input.comparisonBasis,
      suggested_facts: JSON.stringify(suggestedFacts),
      posted_facts: JSON.stringify(postedFacts),
      differences: JSON.stringify(
        buildDifferences(suggestedFacts, postedFacts),
      ),
      updated_at: trx.fn.now(),
    });

  return outcome;
}

export async function recordCandidateOutcomesForBankTransaction(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankTransactionId: string;
    ledgerTransactionId: string;
    comparisonBasis: string;
  },
): Promise<void> {
  const candidates = await trx<CandidateRow>('categorization_candidates')
    .where({
      company_id: input.companyId,
      bank_transaction_id: input.bankTransactionId,
      is_deleted: false,
    })
    .select('id');

  for (const candidate of candidates) {
    await recordCandidateOutcomeForLedger(trx, {
      candidateId: candidate.id,
      ledgerTransactionId: input.ledgerTransactionId,
      comparisonBasis: input.comparisonBasis,
    });
  }
}

async function loadCandidateComparableFacts(
  trx: Knex.Transaction,
  candidateId: string,
): Promise<ComparableLine[]> {
  const rows = await trx('categorization_candidate_lines')
    .where({
      candidate_id: candidateId,
      is_deleted: false,
      is_bank_leg: false,
    })
    .select(
      'coa_id',
      'source_currency_id',
      'signed_native_amount',
      'custom_exchange_rate',
      'fs_date',
      'project_id',
      'contact_id',
      'contact_type',
    );

  return sortFacts(
    rows.map((row) => ({
      coaId: row.coa_id,
      sourceCurrencyId: row.source_currency_id,
      sourceAmount: normalizeDecimal(row.signed_native_amount, 6),
      customExchangeRate: normalizeDecimal(row.custom_exchange_rate, 10),
      fsDate: normalizeDate(row.fs_date),
      projectId: row.project_id ?? null,
      contactId: row.contact_id ?? null,
      contactType: row.contact_type ?? null,
    })),
  );
}

async function loadLedgerComparableFacts(
  trx: Knex.Transaction,
  ledgerTransactionId: string,
): Promise<ComparableLine[]> {
  const rows = await trx('ledger_entries')
    .where({
      ledger_transaction_id: ledgerTransactionId,
      is_bank_leg: false,
    })
    .select(
      'coa_id',
      'source_currency_id',
      'source_amount',
      'custom_exchange_rate',
      'fs_date',
      'project_id',
      'contact_id',
      'contact_type',
    );

  return sortFacts(
    rows.map((row) => ({
      coaId: row.coa_id,
      sourceCurrencyId: row.source_currency_id,
      sourceAmount: normalizeDecimal(row.source_amount, 6),
      customExchangeRate: normalizeDecimal(row.custom_exchange_rate, 10),
      fsDate: normalizeDate(row.fs_date),
      projectId: row.project_id ?? null,
      contactId: row.contact_id ?? null,
      contactType: row.contact_type ?? null,
    })),
  );
}

function compareFacts(input: {
  candidateId: string;
  linkedCandidateId: string | null;
  suggestedFacts: ComparableLine[];
  postedFacts: ComparableLine[];
}): CandidateOutcome {
  if (input.suggestedFacts.length === 0 || input.postedFacts.length === 0) {
    return 'not_comparable';
  }

  const factsMatch =
    JSON.stringify(input.suggestedFacts) === JSON.stringify(input.postedFacts);
  const postedFromCandidate = input.linkedCandidateId === input.candidateId;

  if (postedFromCandidate && factsMatch) return 'accepted_as_suggested';
  if (postedFromCandidate) return 'posted_with_edits';
  if (factsMatch) return 'independently_matched';
  return 'different';
}

function buildDifferences(
  suggestedFacts: ComparableLine[],
  postedFacts: ComparableLine[],
): Array<Record<string, unknown>> {
  if (JSON.stringify(suggestedFacts) === JSON.stringify(postedFacts)) {
    return [];
  }
  return [{ field: 'lines', suggested: suggestedFacts, posted: postedFacts }];
}

function sortFacts(facts: ComparableLine[]): ComparableLine[] {
  return facts.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

function normalizeDecimal(value: unknown, scale: number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(scale) : String(value);
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return toYMD(value);
  return String(value).slice(0, 10);
}
