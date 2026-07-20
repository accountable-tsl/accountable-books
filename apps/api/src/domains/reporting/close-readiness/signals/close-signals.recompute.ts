import type { Knex } from 'knex';

import { knexClient as db } from '../../../../db/knexClient.js';
import { toYMD } from '../../../../shared/utils/date.utils.js';
import { getLogger } from '../../../../shared/utils/logger.js';
import { enqueueCloseSignalEval } from './close-signal-eval.queue.js';

import type { FiscalPeriodType } from '../../fiscal-calendar/fiscal-calendar.types.js';

const logger = getLogger({ component: 'close-signals-recompute' });

/**
 * Upper bound on how many transactions a single recompute fans out. A monthly
 * period far exceeding this is unexpected; we cap and warn rather than enqueue
 * an unbounded burst.
 */
const MAX_RECOMPUTE_TRANSACTIONS = 5000;

export type RecomputePeriodSignalsResult = {
  enqueued: number;
  capped: boolean;
};

type PeriodDateRow = {
  start_date: string;
  end_date: string;
};

export type RecomputePeriodSelector = {
  fiscalYear: number;
  periodNumber: number;
  periodType?: FiscalPeriodType;
};

/**
 * Re-enqueue signal evaluation for every posted ledger transaction in a period.
 * This is the deferred-backfill's small, justified cousin: it closes the window
 * where a debounce-dropped trailing edit left a transaction's signals stale,
 * run exactly when correctness matters (formal close or a manual refresh).
 *
 * Bounded to the period's posted transactions and capped; no polling, no
 * always-on backfill. Enqueue is deduped by transaction id, so overlapping
 * recomputes collapse to one pending evaluation per transaction.
 */
export async function recomputePeriodSignals(
  companyId: string,
  period: RecomputePeriodSelector,
  trx?: Knex.Transaction,
): Promise<RecomputePeriodSignalsResult> {
  const queryable = trx ?? db;
  const periodType = period.periodType ?? 'monthly';

  const fiscalPeriod = await queryable('fiscal_calendar')
    .where({
      company_id: companyId,
      fiscal_year: period.fiscalYear,
      period_number: period.periodNumber,
      period_type: periodType,
    })
    .first<PeriodDateRow | undefined>(
      queryable.raw('start_date::text as start_date'),
      queryable.raw('end_date::text as end_date'),
    );

  if (!fiscalPeriod) {
    logger.warn(
      { companyId, ...period, periodType },
      'No fiscal period found; skipping close signal recompute',
    );
    return { enqueued: 0, capped: false };
  }

  const startDate = toYMD(fiscalPeriod.start_date);
  const endDate = toYMD(fiscalPeriod.end_date);

  const rows = await queryable('ledger_transactions')
    .where({ company_id: companyId, status: 'posted' })
    .whereBetween('transaction_date', [startDate, endDate])
    .orderBy('transaction_date')
    .limit(MAX_RECOMPUTE_TRANSACTIONS + 1)
    .select<{ id: string }[]>('id');

  const capped = rows.length > MAX_RECOMPUTE_TRANSACTIONS;
  const targets = capped ? rows.slice(0, MAX_RECOMPUTE_TRANSACTIONS) : rows;

  if (capped) {
    logger.warn(
      {
        companyId,
        ...period,
        periodType,
        cap: MAX_RECOMPUTE_TRANSACTIONS,
      },
      'Period exceeds the recompute cap; only the first batch is enqueued',
    );
  }

  let enqueued = 0;
  for (const row of targets) {
    const job = await enqueueCloseSignalEval({
      companyId,
      ledgerTransactionId: row.id,
      triggeredBy: 'manual',
    });
    if (job) enqueued += 1;
  }

  logger.info(
    {
      companyId,
      ...period,
      periodType,
      transactions: targets.length,
      enqueued,
      capped,
    },
    'Recomputed close review signals for period',
  );

  return { enqueued, capped };
}
