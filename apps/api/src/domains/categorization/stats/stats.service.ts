import type { Knex } from 'knex';
import pino from 'pino';

import { knexClient } from '../../../db/knexClient.js';
import { generateChecksumSync, toDate, toYMD } from '../../../shared/index.js';
import { type BaseContactStats } from '../enrichment/enrichment.types.js';

import type {
  BankTransactionContactStat,
  IncrementStats,
  NewStatEntry,
} from './stats.types.js';

const logger = pino();

/**
 * Get contact stats for enrichment
 * Returns null if no stats exist for this contact
 */
export async function getContactStats({
  companyUUID,
  contactFingerprint,
  currencyCode,
  contactId,
  trx,
}: {
  companyUUID: string;
  contactFingerprint: string;
  currencyCode: string;
  contactId?: string | null;
  trx?: Knex.Transaction;
}): Promise<BaseContactStats | null> {
  const db = trx || knexClient;

  const query = db('bank_transaction_contact_stats')
    .where('company_id', companyUUID)
    .where('contact_fingerprint', contactFingerprint)
    .where('currency_code', currencyCode)
    .where('is_deleted', false)
    .first();

  // Add contact_id filter if provided
  if (contactId) {
    query.where('contact_id', contactId);
  } else {
    query.whereNull('contact_id');
  }

  const row = await query;

  if (!row) return null;

  return {
    stats_row_id: row.id,
    stats_replay_seq: Number(row.stats_replay_seq) || 0,
    stats_snapshot_checksum: row.stats_snapshot_checksum || null,
    snapshot_captured_at: row.snapshot_captured_at
      ? row.snapshot_captured_at.toISOString()
      : null,
    totals: {
      transaction_count: Number(row.total_transactions),
      amount_native_sum: Number(row.total_amount_native),
      amount_reporting_sum: Number(row.total_amount_reporting),
      avg_amount_native: Number(row.avg_amount_native),
      avg_amount_reporting: Number(row.avg_amount_reporting),
      stddev_amount_native: Number(row.std_dev_amount_native),
      stddev_amount_reporting: Number(row.std_dev_amount_reporting),
    },
    rolling_30d: {
      transaction_count: Number(row.rolling_30d_txn_count),
      amount_native_sum: Number(row.rolling_30d_total_native),
      amount_reporting_sum: Number(row.rolling_30d_total_reporting),
      avg_amount_native: Number(row.rolling_30d_avg_native),
      avg_amount_reporting: Number(row.rolling_30d_avg_reporting),
      stddev_amount_native: Number(row.rolling_30d_stddev_native),
      stddev_amount_reporting: Number(row.rolling_30d_stddev_reporting),
    },
    rolling_90d: {
      transaction_count: Number(row.rolling_90d_txn_count),
      amount_native_sum: Number(row.rolling_90d_total_native),
      amount_reporting_sum: Number(row.rolling_90d_total_reporting),
      avg_amount_native: Number(row.rolling_90d_avg_native),
      avg_amount_reporting: Number(row.rolling_90d_avg_reporting),
      stddev_amount_native: Number(row.rolling_90d_stddev_native),
      stddev_amount_reporting: Number(row.rolling_90d_stddev_reporting),
    },

    last_transaction_id: row.last_transaction_id,
    last_transaction_date: row.last_transaction_date
      ? toYMD(row.last_transaction_date)
      : null,
  };
}

/**
 * It's very important to understand what this does and that starts from understanding what the tables do
 * - bank_transaction_contact_stats and bank_transaction_contact_stats_entries
 * - bank_transaction_contact_stats:
 *    - one row per (company, currency, contact fingerprint)
 *    - holds the current aggregates—total spend, counts, averages, 30/90‑day rolling windows, last-seen metadata.
 *    - it is the hot cache of pre-categorization history.
 *
 * - bank_transaction_contact_stats_entries:
 *    - the immutable ledger feeding those aggregates in bank_transaction_contact_stats.
 *    - Each row records a single bank transaction’s absolute contribution (amounts, date, fingerprint, checksum) so we can recompute, replay, or delete stats deterministically.
 *    - Without it, we couldn’t reverse a contact’s totals, rebuild rolling windows, or prove which bank lines produced a stat—all critical for replays, audits, and late-arriving data; or at least it'll be more expensive to do so.
 *
 * ----
 * Therefore, to increment stats:
 * - We lock the bank_transaction_contact_stats row and retrieve it's current status
 * - If nothing, we add an entry, mark it zeros
 * - Then we record the transaction's contribution to bank_transaction_contact_stats_entries for idempotency
 * - Only one entry is permitted per bank transaction, and since most fields on bank_transaction table are immutable, what must have brought us here is likely some change in DTO, a replay etc so checksum might have changed
 * - We then update the transaction if it already exists or we insert if it does not exist yet
 * - Then we compute the new balances for bank_transaction_contact_stats using this new amounts - if the amounts do not change, there might be no need to update however, we might have to update checksum and other fields
 * - We use the absolute values of all amounts because we are trying to capture the “volume” dimensions, directions exist in the DTO
 * - Deleted transactions are handled in decrementContactStats
 */

/**
 * Increment contact stats after enriching a transaction
 * Uses upsert pattern with incremental updates
 */
export async function incrementContactStats(
  params: IncrementStats,
  // params: {
  //   companyId: string;
  //   contactFingerprint: string;
  //   normalizedName: string;
  //   currencyCode: string;
  //   contactId?: string | null;
  //   amountNative: number;
  //   amountReporting: number;
  //   transactionDate: Date;
  //   transactionId: string;
  //   snapshotChecksum?: string | null;
  //   snapshotCapturedAt?: Date | null;
  //   statsReplaySeq?: number;
  // },
  trx?: Knex.Transaction,
): Promise<void> {
  const statTable = 'bank_transaction_contact_stats';
  const statEntriesTable = 'bank_transaction_contact_stats_entries';

  // if (!trx) {
  //   await db.transaction(async (transaction) => {
  //     await incrementContactStats(params, transaction);
  //   });
  //   return;
  // }
  const {
    company_uuid,
    currency_code,
    contact_id,
    contact_fingerprint,
    contact_name,
    bank_transaction_date,
    bank_transaction_id,
    amount_native,
    amount_reporting,
    stats_snapshot_checksum,
    stats_replay_seq,
  } = params;
  const normalizedName = contact_name || 'unknown';

  const native_amount_abs = Math.abs(amount_native);
  const reporting_amount_abs = Math.abs(amount_reporting);

  const exec = async (txn: Knex.Transaction): Promise<void> => {
    // Lock stats row for update or create a new one
    const statsQuery = txn(statTable)
      .where({
        company_id: company_uuid,
        contact_fingerprint,
        currency_code,
        is_deleted: false,
      })
      .forUpdate();

    if (contact_id) {
      statsQuery.where('contact_id', contact_id);
    } else {
      statsQuery.whereNull('contact_id');
    }

    let statsRow: BankTransactionContactStat;
    const row = await statsQuery.first();

    if (row) {
      statsRow = row;
    } else {
      // Create a new row
      const [created] = await txn(statTable)
        .insert({
          company_id: company_uuid,
          contact_fingerprint,
          currency_code,
          contact_id,
          normalized_name: normalizedName,
        })
        .returning('*');

      statsRow = created;
      logger.debug(
        {
          normalized_name: normalizedName,
          company_uuid,
          contact_fingerprint,
          currency_code,
          contact_id,
        },
        `Created new bank_transaction_contact_stats row`,
      );
    }

    const baseStatEntryData: NewStatEntry = {
      stats_id: statsRow.id,
      company_id: company_uuid,
      contact_fingerprint,
      currency_code,
      contact_id: contact_id || null,
      bank_transaction_id,
      bank_transaction_date: toYMD(bank_transaction_date),
      native_amount_abs,
      reporting_amount_abs,
      stats_snapshot_checksum: stats_snapshot_checksum || null,
      stats_replay_seq: stats_replay_seq || 0,
    };

    await txn(statEntriesTable)
      .insert(baseStatEntryData)
      .onConflict(['bank_transaction_id', 'bank_transaction_date'])
      .merge(baseStatEntryData);

    const replaySeq =
      stats_replay_seq ?? Number(statsRow.stats_replay_seq || 0);

    const aggregates = await recomputeStatsFromEntries({
      trx: txn,
      statsId: statsRow.id,
      asOfDate: bank_transaction_date,
    });

    const snapshotPayload = {
      totals: aggregates.snapshot.totals,
      rolling_30d: aggregates.snapshot.rolling30d,
      rolling_90d: aggregates.snapshot.rolling90d,
      last_transaction_id: bank_transaction_id,
      last_transaction_date: toYMD(bank_transaction_date),
      stats_replay_seq: replaySeq,
    };
    const newSnapshotChecksum = generateChecksumSync(snapshotPayload, {
      sortKeys: true,
    });

    const toInsert = {
      ...aggregates.metrics,
      normalized_name: normalizedName,
      contact_fingerprint,
      last_transaction_date: toYMD(bank_transaction_date),
      last_transaction_id: bank_transaction_id,
      stats_snapshot_checksum: newSnapshotChecksum,
      stats_replay_seq: replaySeq,
      snapshot_captured_at: txn.fn.now(),
      updated_at: txn.fn.now(),
    };

    await txn(statTable).where('id', statsRow.id).update(toInsert);

    logger.debug(
      {
        company_uuid,
        contact_fingerprint,
        currency_code,
        bank_transaction_id,
        native_amount_abs,
      },
      'Contact stats updated',
    );
  };

  try {
    if (trx) {
      await exec(trx);
    } else {
      await knexClient.transaction(exec);
    }
  } catch (error) {
    logger.error(
      {
        company_uuid,
        contact_fingerprint,
        currency_code,
        bank_transaction_id,
        native_amount_abs,
        error,
      },
      'Error incrementing contact stats',
    );
    throw error;
  }
}

async function calculateRollingWindowFromEntries({
  statsId,
  asOfDate,
  windowInDays,
  trx: db,
}: {
  statsId: string;
  asOfDate: Date;
  windowInDays: number;
  trx: Knex.Transaction;
}) {
  if (windowInDays <= 0 || windowInDays > 120) {
    throw new Error('Invalid windowInDays');
  }

  const windowStart = new Date(asOfDate);
  windowStart.setDate(windowStart.getDate() - windowInDays);

  const rows = await db('bank_transaction_contact_stats_entries')
    .where({ stats_id: statsId, is_deleted: false })
    .andWhere('bank_transaction_date', '>=', toYMD(windowStart))
    .andWhere('bank_transaction_date', '<=', toYMD(asOfDate))
    .select(
      db.raw('COUNT(*) as txn_count'),
      db.raw('SUM(native_amount_abs) as total_native'),
      db.raw('SUM(reporting_amount_abs) as total_reporting'),
      db.raw('SUM(native_amount_abs * native_amount_abs) as total_native_sq'),
      db.raw(
        'SUM(reporting_amount_abs * reporting_amount_abs) as total_reporting_sq',
      ),
    )
    .first();

  const n = Number(rows?.txn_count ?? 0);
  const sumNative = Number(rows?.total_native ?? 0);
  const sumReporting = Number(rows?.total_reporting ?? 0);
  const sumsqNative = Number(rows?.total_native_sq ?? 0);
  const sumsqReporting = Number(rows?.total_reporting_sq ?? 0);

  if (n === 0) {
    return {
      count: 0,
      native: {
        mean: 0,
        stddev_pop: 0,
        sum: 0,
        sumsq: 0,
      },
      reporting: {
        mean: 0,
        stddev_pop: 0,
        sum: 0,
        sumsq: 0,
      },
    };
  }

  const meanNative = sumNative / n;
  const meanReporting = sumReporting / n;

  // Population variance = E[x^2] - (E[x])^2
  const varNativePop = Math.max(sumsqNative / n - meanNative * meanNative, 0);
  const varReportingPop = Math.max(
    sumsqReporting / n - meanReporting * meanReporting,
    0,
  );

  const stdNativePop = Math.sqrt(varNativePop);
  const stdReportingPop = Math.sqrt(varReportingPop);
  return {
    count: n,
    native: {
      mean: meanNative,
      stddev_pop: stdNativePop,
      sum: sumNative,
      sumsq: sumsqNative,
    },
    reporting: {
      mean: meanReporting,
      stddev_pop: stdReportingPop,
      sum: sumReporting,
      sumsq: sumsqReporting,
    },
  };
}

type SnapshotBlock = {
  transaction_count: number;
  amount_native_sum: number;
  amount_reporting_sum: number;
  avg_amount_native: number;
  avg_amount_reporting: number;
  stddev_amount_native: number;
  stddev_amount_reporting: number;
};

type SnapshotSegments = {
  totals: SnapshotBlock;
  rolling30d: SnapshotBlock;
  rolling90d: SnapshotBlock;
};

type MetricsPayload = {
  total_transactions: number;
  total_amount_native: number;
  total_amount_reporting: number;
  total_sumsq_native: number;
  total_sumsq_reporting: number;
  avg_amount_native: number;
  avg_amount_reporting: number;
  std_dev_amount_native: number;
  std_dev_amount_reporting: number;
  rolling_30d_txn_count: number;
  rolling_30d_total_native: number;
  rolling_30d_total_reporting: number;
  rolling_30d_sumsq_native: number;
  rolling_30d_sumsq_reporting: number;
  rolling_30d_avg_native: number;
  rolling_30d_avg_reporting: number;
  rolling_30d_stddev_native: number;
  rolling_30d_stddev_reporting: number;
  rolling_90d_txn_count: number;
  rolling_90d_total_native: number;
  rolling_90d_total_reporting: number;
  rolling_90d_sumsq_native: number;
  rolling_90d_sumsq_reporting: number;
  rolling_90d_avg_native: number;
  rolling_90d_avg_reporting: number;
  rolling_90d_stddev_native: number;
  rolling_90d_stddev_reporting: number;
};

// For now, we recompute all stats from scratch.
// If this becomes a bottleneck, we can optimize
async function recomputeStatsFromEntries({
  trx,
  statsId,
  asOfDate,
}: {
  trx: Knex.Transaction;
  statsId: string;
  asOfDate: string | Date;
}): Promise<{ metrics: MetricsPayload; snapshot: SnapshotSegments }> {
  const asOf =
    typeof asOfDate === 'string' ? toDate(asOfDate, 'start') : asOfDate;

  const thirtyDaysAgo = toYMD(offsetDate(asOf, 30));
  const ninetyDaysAgo = toYMD(offsetDate(asOf, 90));

  const aggregates = await trx('bank_transaction_contact_stats_entries')
    .where('stats_id', statsId)
    .andWhere('is_deleted', false)
    .select(
      trx.raw('COUNT(*)::bigint as total_count'),
      trx.raw('COALESCE(SUM(native_amount_abs), 0) as total_native'),
      trx.raw('COALESCE(SUM(reporting_amount_abs), 0) as total_reporting'),
      trx.raw(
        'COALESCE(SUM(native_amount_abs * native_amount_abs), 0) as total_native_sq',
      ),
      trx.raw(
        'COALESCE(SUM(reporting_amount_abs * reporting_amount_abs), 0) as total_reporting_sq',
      ),
      trx.raw(
        'COUNT(*) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?) as rolling_30d_count',
        [thirtyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(native_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_30d_native',
        [thirtyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(reporting_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_30d_reporting',
        [thirtyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(native_amount_abs * native_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_30d_native_sq',
        [thirtyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(reporting_amount_abs * reporting_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_30d_reporting_sq',
        [thirtyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COUNT(*) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?) as rolling_90d_count',
        [ninetyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(native_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_90d_native',
        [ninetyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(reporting_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_90d_reporting',
        [ninetyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(native_amount_abs * native_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_90d_native_sq',
        [ninetyDaysAgo, toYMD(asOf)],
      ),
      trx.raw(
        'COALESCE(SUM(reporting_amount_abs * reporting_amount_abs) FILTER (WHERE bank_transaction_date >= ? AND bank_transaction_date <= ?), 0) as rolling_90d_reporting_sq',
        [ninetyDaysAgo, toYMD(asOf)],
      ),
    )
    .first();

  const totalsCount = Number(aggregates?.total_count || 0);
  const totalsNative = Number(aggregates?.total_native || 0);
  const totalsReporting = Number(aggregates?.total_reporting || 0);
  const totalsNativeSq = Number(aggregates?.total_native_sq || 0);
  const totalsReportingSq = Number(aggregates?.total_reporting_sq || 0);

  const avgNative = totalsCount > 0 ? totalsNative / totalsCount : 0;
  const avgReporting = totalsCount > 0 ? totalsReporting / totalsCount : 0;
  const stdDevNative =
    totalsCount > 0
      ? Math.sqrt(Math.max(totalsNativeSq / totalsCount - avgNative ** 2, 0))
      : 0;
  const stdDevReporting =
    totalsCount > 0
      ? Math.sqrt(
          Math.max(totalsReportingSq / totalsCount - avgReporting ** 2, 0),
        )
      : 0;

  const rolling30Count = Number(aggregates?.rolling_30d_count || 0);
  const rolling30Native = Number(aggregates?.rolling_30d_native || 0);
  const rolling30Reporting = Number(aggregates?.rolling_30d_reporting || 0);
  const rolling30NativeSq = Number(aggregates?.rolling_30d_native_sq || 0);
  const rolling30ReportingSq = Number(
    aggregates?.rolling_30d_reporting_sq || 0,
  );

  const rolling90Count = Number(aggregates?.rolling_90d_count || 0);
  const rolling90Native = Number(aggregates?.rolling_90d_native || 0);
  const rolling90Reporting = Number(aggregates?.rolling_90d_reporting || 0);
  const rolling90NativeSq = Number(aggregates?.rolling_90d_native_sq || 0);
  const rolling90ReportingSq = Number(
    aggregates?.rolling_90d_reporting_sq || 0,
  );

  const rolling30 = summarizeWindow(
    rolling30Count,
    rolling30Native,
    rolling30Reporting,
    rolling30NativeSq,
    rolling30ReportingSq,
  );
  const rolling90 = summarizeWindow(
    rolling90Count,
    rolling90Native,
    rolling90Reporting,
    rolling90NativeSq,
    rolling90ReportingSq,
  );
  const metrics: MetricsPayload = {
    total_transactions: totalsCount,
    total_amount_native: totalsNative,
    total_amount_reporting: totalsReporting,
    total_sumsq_native: totalsNativeSq,
    total_sumsq_reporting: totalsReportingSq,
    avg_amount_native: avgNative,
    avg_amount_reporting: avgReporting,
    std_dev_amount_native: stdDevNative,
    std_dev_amount_reporting: stdDevReporting,
    rolling_30d_txn_count: rolling30.count,
    rolling_30d_total_native: rolling30.native.sum,
    rolling_30d_total_reporting: rolling30.reporting.sum,
    rolling_30d_sumsq_native: rolling30.native.sumsq,
    rolling_30d_sumsq_reporting: rolling30.reporting.sumsq,
    rolling_30d_avg_native: rolling30.native.mean,
    rolling_30d_avg_reporting: rolling30.reporting.mean,
    rolling_30d_stddev_native: rolling30.native.stddev,
    rolling_30d_stddev_reporting: rolling30.reporting.stddev,
    rolling_90d_txn_count: rolling90.count,
    rolling_90d_total_native: rolling90.native.sum,
    rolling_90d_total_reporting: rolling90.reporting.sum,
    rolling_90d_sumsq_native: rolling90.native.sumsq,
    rolling_90d_sumsq_reporting: rolling90.reporting.sumsq,
    rolling_90d_avg_native: rolling90.native.mean,
    rolling_90d_avg_reporting: rolling90.reporting.mean,
    rolling_90d_stddev_native: rolling90.native.stddev,
    rolling_90d_stddev_reporting: rolling90.reporting.stddev,
  };

  const snapshot: SnapshotSegments = {
    totals: {
      transaction_count: totalsCount,
      amount_native_sum: totalsNative,
      amount_reporting_sum: totalsReporting,
      avg_amount_native: avgNative,
      avg_amount_reporting: avgReporting,
      stddev_amount_native: stdDevNative,
      stddev_amount_reporting: stdDevReporting,
    },
    rolling30d: {
      transaction_count: rolling30.count,
      amount_native_sum: rolling30.native.sum,
      amount_reporting_sum: rolling30.reporting.sum,
      avg_amount_native: rolling30.native.mean,
      avg_amount_reporting: rolling30.reporting.mean,
      stddev_amount_native: rolling30.native.stddev,
      stddev_amount_reporting: rolling30.reporting.stddev,
    },
    rolling90d: {
      transaction_count: rolling90.count,
      amount_native_sum: rolling90.native.sum,
      amount_reporting_sum: rolling90.reporting.sum,
      avg_amount_native: rolling90.native.mean,
      avg_amount_reporting: rolling90.reporting.mean,
      stddev_amount_native: rolling90.native.stddev,
      stddev_amount_reporting: rolling90.reporting.stddev,
    },
  };

  return { metrics, snapshot };
}

function summarizeWindow(
  count: number,
  nativeSum: number,
  reportingSum: number,
  nativeSumsq: number,
  reportingSumsq: number,
) {
  if (count === 0) {
    return {
      count: 0,
      native: { sum: 0, sumsq: 0, mean: 0, stddev: 0 },
      reporting: { sum: 0, sumsq: 0, mean: 0, stddev: 0 },
    };
  }

  const nativeMean = nativeSum / count;
  const reportingMean = reportingSum / count;

  const nativeVar = Math.max(nativeSumsq / count - nativeMean ** 2, 0);
  const reportingVar = Math.max(reportingSumsq / count - reportingMean ** 2, 0);

  return {
    count,
    native: {
      sum: nativeSum,
      sumsq: nativeSumsq,
      mean: nativeMean,
      stddev: Math.sqrt(nativeVar),
    },
    reporting: {
      sum: reportingSum,
      sumsq: reportingSumsq,
      mean: reportingMean,
      stddev: Math.sqrt(reportingVar),
    },
  };
}

function offsetDate(date: Date, daysBack: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - daysBack);
  return copy;
}

const computeNewStatAmts = ({
  existingTotal,
  existingCount,
  existingSumsq,
  newValue,
  useSample = false, // default population
}: {
  existingTotal: number;
  existingCount: number;
  existingSumsq: number;
  newValue: number;
  useSample?: boolean;
}) => {
  if (existingCount === 0 && (existingTotal !== 0 || existingSumsq !== 0)) {
    throw new Error(
      `existingTotal: ${existingTotal} existingCount: ${existingCount} existingSumsq: ${existingSumsq}`,
    );
  }

  const x = newValue;
  if (existingCount === 0) {
    return { total: x, count: 1, avg: x, sumsq: x * x, stddev: 0 };
  }
  const count = existingCount + 1;
  const total = existingTotal + x;
  const mean = total / count;
  const sumsq = existingSumsq + x * x;
  // Population variance = E[x^2] - (E[x])^2
  const varPop = Math.max(sumsq / count - mean * mean, 0);
  const stddev_pop = Math.sqrt(varPop);
  if (!useSample) {
    return { total, count, avg: mean, sumsq, stddev: stddev_pop };
  }

  // Sample variance = (Σx^2 - n*mean^2)/(n-1)
  const varSamp =
    count > 1 ? Math.max((sumsq - count * mean * mean) / (count - 1), 0) : 0;
  return { total, count, avg: mean, sumsq, stddev: Math.sqrt(varSamp) };
};

/**
 * Decrement contact stats (for transaction deletion)
 * This is a placeholder - full implementation would reverse the increment logic
 */
export async function decrementContactStats(
  params: { bankTransactionId: string },
  trx?: Knex.Transaction,
): Promise<void> {
  const statEntriesTable = 'bank_transaction_contact_stats_entries';
  const statTable = 'bank_transaction_contact_stats';

  const exec = async (txn: Knex.Transaction) => {
    const entry = await txn(statEntriesTable)
      .where({ bank_transaction_id: params.bankTransactionId })
      .forUpdate()
      .first();

    if (!entry) {
      logger.warn(
        { bank_transaction_id: params.bankTransactionId },
        'No stats contribution found for transaction deletion',
      );
      return;
    }

    if (entry.is_deleted) {
      logger.debug(
        { bank_transaction_id: params.bankTransactionId },
        'Stats contribution already marked deleted',
      );
      return;
    }

    await txn(statEntriesTable).where({ id: entry.id }).update({
      is_deleted: true,
      updated_at: txn.fn.now(),
    });

    const statsRow = await txn(statTable)
      .where({ id: entry.stats_id })
      .forUpdate()
      .first();

    if (!statsRow) {
      logger.warn(
        {
          bank_transaction_id: params.bankTransactionId,
          stats_id: entry.stats_id,
        },
        'Stats row missing while attempting decrement',
      );
      return;
    }

    const latestContribution = await txn(statEntriesTable)
      .where({
        stats_id: entry.stats_id,
        is_deleted: false,
      })
      .orderBy('bank_transaction_date', 'desc')
      .orderBy('updated_at', 'desc')
      .first();

    const nextReplaySeq = Number(statsRow.stats_replay_seq || 0) + 1;

    if (!latestContribution) {
      await txn(statTable).where({ id: statsRow.id }).update({
        total_transactions: 0,
        total_amount_native: 0,
        total_amount_reporting: 0,
        total_sumsq_native: 0,
        total_sumsq_reporting: 0,
        avg_amount_native: 0,
        avg_amount_reporting: 0,
        std_dev_amount_native: 0,
        std_dev_amount_reporting: 0,
        rolling_30d_txn_count: 0,
        rolling_30d_total_native: 0,
        rolling_30d_total_reporting: 0,
        rolling_30d_sumsq_native: 0,
        rolling_30d_sumsq_reporting: 0,
        rolling_30d_avg_native: 0,
        rolling_30d_avg_reporting: 0,
        rolling_30d_stddev_native: 0,
        rolling_30d_stddev_reporting: 0,
        rolling_90d_txn_count: 0,
        rolling_90d_total_native: 0,
        rolling_90d_total_reporting: 0,
        rolling_90d_sumsq_native: 0,
        rolling_90d_sumsq_reporting: 0,
        rolling_90d_avg_native: 0,
        rolling_90d_avg_reporting: 0,
        rolling_90d_stddev_native: 0,
        rolling_90d_stddev_reporting: 0,
        last_transaction_id: null,
        last_transaction_date: null,
        stats_snapshot_checksum: null,
        snapshot_captured_at: null,
        stats_replay_seq: nextReplaySeq,
        is_deleted: true,
        deleted_at: txn.fn.now(),
        updated_at: txn.fn.now(),
      });

      logger.info(
        {
          bank_transaction_id: params.bankTransactionId,
          stats_id: entry.stats_id,
        },
        'Stats row soft-deleted after last contribution removed',
      );
      return;
    }

    const aggregates = await recomputeStatsFromEntries({
      trx: txn,
      statsId: entry.stats_id,
      asOfDate: latestContribution.bank_transaction_date,
    });

    const snapshotPayload = {
      totals: aggregates.snapshot.totals,
      rolling_30d: aggregates.snapshot.rolling30d,
      rolling_90d: aggregates.snapshot.rolling90d,
      last_transaction_id: latestContribution.bank_transaction_id,
      last_transaction_date: toYMD(latestContribution.bank_transaction_date),
      stats_replay_seq: nextReplaySeq,
    };

    const newSnapshotChecksum = generateChecksumSync(snapshotPayload, {
      sortKeys: true,
    });

    await txn(statTable)
      .where({ id: entry.stats_id })
      .update({
        ...aggregates.metrics,
        last_transaction_id: latestContribution.bank_transaction_id,
        last_transaction_date: toYMD(latestContribution.bank_transaction_date),
        stats_snapshot_checksum: newSnapshotChecksum,
        stats_replay_seq: nextReplaySeq,
        snapshot_captured_at: txn.fn.now(),
        updated_at: txn.fn.now(),
        is_deleted: false,
        deleted_at: null,
      });

    logger.info(
      {
        bank_transaction_id: params.bankTransactionId,
        stats_id: entry.stats_id,
      },
      'Stats row recomputed after transaction deletion',
    );
  };

  try {
    if (trx) {
      await exec(trx);
    } else {
      await knexClient.transaction(exec);
    }
  } catch (error) {
    logger.error(
      {
        bank_transaction_id: params.bankTransactionId,
        error,
      },
      'Failed to decrement contact stats',
    );
    throw error;
  }
}
