import type { Knex } from 'knex';

// ── Types ─────────────────────────────────────────────────────────────

export type ConditionCheckResult = {
  code: string;
  severity: 'hard' | 'warning';
  isActive: boolean;
  message: string;
  details: Record<string, unknown>;
};

export type PeriodRange = {
  start_date: string;
  end_date: string;
  fiscal_year: number;
  period_number: number;
  period_type: string;
};

// ── 1. Uncategorized transactions ─────────────────────────────────────

export async function checkUncategorizedTransactions(
  companyId: string,
  period: PeriodRange,
  trx: Knex.Transaction,
): Promise<ConditionCheckResult> {
  const hasLedgerEntry = trx('ledger_transactions')
    .whereRaw('ledger_transactions.source_transaction_id = bt.id')
    .where('ledger_transactions.transaction_source', 'bank_transaction')
    .where('ledger_transactions.status', 'posted')
    .limit(1);

  const row = await trx('bank_transactions as bt')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .where({ 'ba.company_id': companyId })
    .whereBetween('bt.transaction_date', [period.start_date, period.end_date])
    .where('bt.is_deleted', false)
    .whereNotExists(hasLedgerEntry)
    .count('* as count')
    .first();

  const count = row ? parseInt(String(row.count), 10) : 0;
  const isActive = count > 0;

  return {
    code: 'uncategorized_transactions',
    severity: 'warning',
    isActive,
    message: isActive
      ? `${count} uncategorized transactions found`
      : 'No uncategorized transactions',
    details: { count },
  };
}

// ── 2. Draft journals ────────────────────────────────────────────────

export async function checkDraftJournals(
  companyId: string,
  period: PeriodRange,
  trx: Knex.Transaction,
): Promise<ConditionCheckResult> {
  const row = await trx('journal_entries')
    .join(
      'journal_batches',
      'journal_entries.journal_batch_id',
      'journal_batches.id',
    )
    .where('journal_batches.company_id', companyId)
    .whereBetween('journal_batches.date', [period.start_date, period.end_date])
    .where('journal_batches.status', 'draft')
    .count('* as count')
    .first();

  const count = row ? parseInt(String(row.count), 10) : 0;
  const isActive = count > 0;

  return {
    code: 'draft_journals',
    severity: 'hard',
    isActive,
    message: isActive
      ? `${count} unposted journal entries found`
      : 'No draft journals in period',
    details: { count },
  };
}

// ── 3. Later periods closed ───────────────────────────────────────────

export async function checkLaterPeriodsClosed(
  companyId: string,
  period: PeriodRange,
  trx: Knex.Transaction,
): Promise<ConditionCheckResult> {
  const row = await trx('fiscal_calendar')
    .where({ company_id: companyId, period_type: period.period_type })
    .where(function () {
      this.where('fiscal_year', '>', period.fiscal_year).orWhere(function () {
        this.where('fiscal_year', period.fiscal_year).where(
          'period_number',
          '>',
          period.period_number,
        );
      });
    })
    .where('status', 'closed')
    .count('* as count')
    .first();

  const count = row ? parseInt(String(row.count), 10) : 0;
  const isActive = count > 0;

  return {
    code: 'later_periods_closed',
    severity: 'warning',
    isActive,
    message: isActive
      ? 'Later periods are already closed'
      : 'No later periods closed',
    details: { count },
  };
}

// ── 4. Bank connection health ───────────────────────────────────────

export async function checkBankConnectionHealth(
  companyId: string,
  trx: Knex.Transaction,
): Promise<ConditionCheckResult> {
  const rows = await trx('bank_accounts')
    .where({ company_id: companyId, is_deleted: false })
    .whereIn('connection_status', ['revoked', 'error'])
    .select('id');

  const bankAccountIds = rows.map((r: { id: string }) => r.id);
  const count = bankAccountIds.length;
  const isActive = count > 0;

  return {
    code: 'disconnected_bank',
    severity: 'hard',
    isActive,
    message: isActive
      ? `${count} bank account${count === 1 ? '' : 's'} disconnected or in error`
      : 'All bank accounts healthy',
    details: { count, bankAccountIds },
  };
}

// ── 5. Open client queries (stub) ──────────────────────────────────────

export async function checkOpenClientQueries(
  _companyId: string,
  _trx: Knex.Transaction,
): Promise<ConditionCheckResult> {
  return {
    code: 'open_client_queries',
    severity: 'warning',
    isActive: false,
    message: 'No client queries system yet',
    details: {},
  };
}
