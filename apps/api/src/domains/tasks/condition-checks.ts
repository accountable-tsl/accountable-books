import type { Knex } from 'knex';

import { toYMD } from '../../shared/utils/date.utils.js';
import { projectConnectionStatus } from '../banking/bank-account-projections.js';

import type { BankConnectionAuthorizationStatus } from '../banking/bank-connections/bank-connections.types.js';

// ── Types ─────────────────────────────────────────────────────────────

export type ConditionCheckResult = {
  code: string;
  severity: 'hard' | 'warning';
  isActive: boolean;
  message: string;
  details: Record<string, unknown>;
};

export type PeriodRange = {
  fiscal_calendar_id: string;
  start_date: string;
  end_date: string;
  fiscal_year: number;
  period_number: number;
  period_type: string;
};

/** Map a fiscal_calendar row into the shape condition checks expect. */
export function periodRangeFromFiscalCalendar(period: {
  id: string;
  start_date: string | Date;
  end_date: string | Date;
  fiscal_year: number;
  period_number: number;
  period_type: string;
}): PeriodRange {
  return {
    fiscal_calendar_id: period.id,
    start_date: toYMD(period.start_date),
    end_date: toYMD(period.end_date),
    fiscal_year: period.fiscal_year,
    period_number: period.period_number,
    period_type: period.period_type,
  };
}

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
    .where('journal_entries.entry_status', 'active')
    .where('journal_entries.is_deleted', false)
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
  const rows = await trx('bank_accounts_metrics_view')
    .where({ company_id: companyId })
    .select<
      {
        id: string;
        authorization_status: BankConnectionAuthorizationStatus | null;
        bank_account_feed_id: string | null;
        feed_revoked_at: Date | null;
      }[]
    >('id', 'authorization_status', 'bank_account_feed_id', 'feed_revoked_at');

  const bankAccountIds = rows
    .filter((row) => {
      const status = projectConnectionStatus({
        hasEverHadFeed: row.bank_account_feed_id !== null,
        activeFeed:
          row.bank_account_feed_id !== null && row.feed_revoked_at === null
            ? {
                initial_sync_completed_at: null,
                last_successful_sync_at: null,
              }
            : null,
        latestFeedRevoked: row.feed_revoked_at !== null,
        connectionAuthorizationStatus: row.authorization_status,
      });
      return status === 'error' || status === 'revoked';
    })
    .map((row) => row.id);
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
