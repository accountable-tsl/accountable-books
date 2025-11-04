import { knexClient } from '../../../db/knexClient.js';
import type { Knex } from 'knex';
import type { ContactStats } from './enrichment.types.js';
import pino from 'pino';

const logger = pino();

/**
 * Get contact stats for enrichment
 * Returns null if no stats exist for this contact
 */
export async function getContactStats({
  companyId,
  contactFingerprint,
  currencyCode,
  contactId,
  db,
}: {
  companyId: string;
  contactFingerprint: string;
  currencyCode: string;
  contactId?: string | null;
  db?: Knex | Knex.Transaction;
}): Promise<ContactStats | null> {
  const database = db || knexClient;

  const query = database('bank_transaction_contact_stats')
    .where('company_id', companyId)
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
    id: row.id,
    companyId: row.company_id,
    contactId: row.contact_id,
    contactFingerprint: row.contact_fingerprint,
    normalizedName: row.normalized_name,
    currencyCode: row.currency_code,
    totalTransactions: Number(row.total_transactions),
    totalAmountNative: Number(row.total_amount_native),
    totalAmountReporting: Number(row.total_amount_reporting),
    avgAmountNative: Number(row.avg_amount_native),
    avgAmountReporting: Number(row.avg_amount_reporting),
    stdDevAmountNative: Number(row.std_dev_amount_native),
    stdDevAmountReporting: Number(row.std_dev_amount_reporting),
    rolling30dTxnCount: Number(row.rolling_30d_txn_count),
    rolling30dTotalNative: Number(row.rolling_30d_total_native),
    rolling30dTotalReporting: Number(row.rolling_30d_total_reporting),
    rolling30dAvgNative: Number(row.rolling_30d_avg_native),
    rolling30dAvgReporting: Number(row.rolling_30d_avg_reporting),
    rolling30dStddevNative: Number(row.rolling_30d_stddev_native),
    rolling30dStddevReporting: Number(row.rolling_30d_stddev_reporting),
    rolling90dTxnCount: Number(row.rolling_90d_txn_count),
    rolling90dTotalNative: Number(row.rolling_90d_total_native),
    rolling90dTotalReporting: Number(row.rolling_90d_total_reporting),
    rolling90dAvgNative: Number(row.rolling_90d_avg_native),
    rolling90dAvgReporting: Number(row.rolling_90d_avg_reporting),
    rolling90dStddevNative: Number(row.rolling_90d_stddev_native),
    rolling90dStddevReporting: Number(row.rolling_90d_stddev_reporting),
    lastTransactionId: row.last_transaction_id,
    lastTransactionDate: row.last_transaction_date,
    statsSnapshotChecksum: row.stats_snapshot_checksum || null,
    statsReplaySeq: Number(row.stats_replay_seq || 0),
    snapshotCapturedAt: row.snapshot_captured_at
      ? new Date(row.snapshot_captured_at).toISOString()
      : null,
  };
}

/**
 * Increment contact stats after enriching a transaction
 * Uses upsert pattern with incremental updates
 */
export async function incrementContactStats(
  params: {
    companyId: string;
    contactFingerprint: string;
    normalizedName: string;
    currencyCode: string;
    contactId?: string | null;
    amountNative: number;
    amountReporting: number;
    transactionDate: Date;
    transactionId: string;
    snapshotChecksum?: string | null;
    snapshotCapturedAt?: Date | null;
    statsReplaySeq?: number;
  },
  trx?: Knex.Transaction,
): Promise<void> {
  /*
   * LEGACY implementation retained for reference.
   * The previous version incremented aggregates inline and recomputed rolling windows
   * from the `categorization_tasks` table which caused circular dependencies.
   */
  // const db = trx || knexClient;
  // ...

  const db = trx || knexClient;

  if (!trx) {
    await db.transaction(async (transaction) => {
      await incrementContactStats(params, transaction);
    });
    return;
  }

  const {
    companyId,
    contactFingerprint,
    normalizedName,
    currencyCode,
    contactId,
    amountNative,
    amountReporting,
    transactionDate,
    transactionId,
    snapshotChecksum,
    snapshotCapturedAt,
    statsReplaySeq,
  } = params;

  const absAmountNative = Math.abs(amountNative);
  const absAmountReporting = Math.abs(amountReporting);

  try {
    // Lock stats row for update or create a new one
    const statsQuery = db('bank_transaction_contact_stats')
      .where('company_id', companyId)
      .where('contact_fingerprint', contactFingerprint)
      .where('currency_code', currencyCode)
      .where('is_deleted', false)
      .forUpdate();

    if (contactId) {
      statsQuery.where('contact_id', contactId);
    } else {
      statsQuery.whereNull('contact_id');
    }

    let statsRow = await statsQuery.first();

    if (!statsRow) {
      const insertPayload = {
        company_id: companyId,
        contact_id: contactId || null,
        contact_fingerprint: contactFingerprint,
        normalized_name: normalizedName,
        currency_code: currencyCode,
        total_transactions: 0,
        total_amount_native: 0,
        total_amount_reporting: 0,
        avg_amount_native: 0,
        avg_amount_reporting: 0,
        std_dev_amount_native: 0,
        std_dev_amount_reporting: 0,
        rolling_30d_txn_count: 0,
        rolling_30d_total_native: 0,
        rolling_30d_total_reporting: 0,
        rolling_30d_avg_native: 0,
        rolling_30d_avg_reporting: 0,
        rolling_30d_stddev_native: 0,
        rolling_30d_stddev_reporting: 0,
        rolling_90d_txn_count: 0,
        rolling_90d_total_native: 0,
        rolling_90d_total_reporting: 0,
        rolling_90d_avg_native: 0,
        rolling_90d_avg_reporting: 0,
        rolling_90d_stddev_native: 0,
        rolling_90d_stddev_reporting: 0,
        last_transaction_id: null,
        last_transaction_date: null,
        stats_snapshot_checksum: snapshotChecksum || null,
        stats_replay_seq: statsReplaySeq ?? 0,
        snapshot_captured_at: snapshotCapturedAt || null,
      };

      const [created] = await db('bank_transaction_contact_stats')
        .insert(insertPayload)
        .returning('*');

      statsRow = created;

      logger.debug(
        { contactFingerprint, companyId },
        'Contact stats row created',
      );
    }

    const statsRowId = statsRow.id;

    // Record transaction contribution (upsert for idempotency)
    await db('bank_transaction_contact_stats_entries')
      .insert({
        stats_id: statsRowId,
        company_id: companyId,
        contact_id: contactId || null,
        contact_fingerprint: contactFingerprint,
        currency_code: currencyCode,
        transaction_id: transactionId,
        transaction_date: transactionDate,
        amount_native_abs: absAmountNative,
        amount_reporting_abs: absAmountReporting,
        snapshot_checksum: snapshotChecksum || null,
        stats_replay_seq: statsReplaySeq ?? Number(statsRow.stats_replay_seq || 0),
        is_deleted: false,
      })
      .onConflict('transaction_id')
      .merge({
        stats_id: statsRowId,
        company_id: companyId,
        contact_id: contactId || null,
        contact_fingerprint: contactFingerprint,
        currency_code: currencyCode,
        transaction_date: transactionDate,
        amount_native_abs: absAmountNative,
        amount_reporting_abs: absAmountReporting,
        snapshot_checksum: snapshotChecksum || null,
        stats_replay_seq: statsReplaySeq ?? Number(statsRow.stats_replay_seq || 0),
        is_deleted: false,
        updated_at: db.fn.now(),
      });

    // Aggregate totals
    const totals = await db('bank_transaction_contact_stats_entries')
      .where('stats_id', statsRowId)
      .andWhere('is_deleted', false)
      .select(
        db.raw('COUNT(*)::bigint as txn_count'),
        db.raw('COALESCE(SUM(amount_native_abs), 0) as total_native'),
        db.raw('COALESCE(SUM(amount_reporting_abs), 0) as total_reporting'),
        db.raw(
          'COALESCE(SUM(amount_native_abs * amount_native_abs), 0) as total_native_sq',
        ),
        db.raw(
          'COALESCE(SUM(amount_reporting_abs * amount_reporting_abs), 0) as total_reporting_sq',
        ),
      )
      .first();

    const totalsCount = Number(totals?.txn_count || 0);
    const totalsNative = Number(totals?.total_native || 0);
    const totalsReporting = Number(totals?.total_reporting || 0);
    const totalsNativeSq = Number(totals?.total_native_sq || 0);
    const totalsReportingSq = Number(totals?.total_reporting_sq || 0);

    const aggregateAvgNative =
      totalsCount > 0 ? totalsNative / totalsCount : 0;
    const aggregateAvgReporting =
      totalsCount > 0 ? totalsReporting / totalsCount : 0;

    const aggregateStdDevNative =
      totalsCount > 0
        ? Math.sqrt(
            Math.max(
              totalsNativeSq / totalsCount - aggregateAvgNative ** 2,
              0,
            ),
          )
        : 0;
    const aggregateStdDevReporting =
      totalsCount > 0
        ? Math.sqrt(
            Math.max(
              totalsReportingSq / totalsCount - aggregateAvgReporting ** 2,
              0,
            ),
          )
        : 0;

    const rolling30d = await calculateRollingWindowFromEntries(
      db,
      statsRowId,
      transactionDate,
      30,
    );
    const rolling90d = await calculateRollingWindowFromEntries(
      db,
      statsRowId,
      transactionDate,
      90,
    );

    await db('bank_transaction_contact_stats')
      .where('id', statsRowId)
      .update({
        normalized_name: normalizedName,
        contact_id: contactId || statsRow.contact_id,
        total_transactions: totalsCount,
        total_amount_native: totalsNative,
        total_amount_reporting: totalsReporting,
        avg_amount_native: aggregateAvgNative,
        avg_amount_reporting: aggregateAvgReporting,
        std_dev_amount_native: aggregateStdDevNative,
        std_dev_amount_reporting: aggregateStdDevReporting,
        rolling_30d_txn_count: rolling30d.count,
        rolling_30d_total_native: rolling30d.totalNative,
        rolling_30d_total_reporting: rolling30d.totalReporting,
        rolling_30d_avg_native: rolling30d.avgNative,
        rolling_30d_avg_reporting: rolling30d.avgReporting,
        rolling_30d_stddev_native: rolling30d.stddevNative,
        rolling_30d_stddev_reporting: rolling30d.stddevReporting,
        rolling_90d_txn_count: rolling90d.count,
        rolling_90d_total_native: rolling90d.totalNative,
        rolling_90d_total_reporting: rolling90d.totalReporting,
        rolling_90d_avg_native: rolling90d.avgNative,
        rolling_90d_avg_reporting: rolling90d.avgReporting,
        rolling_90d_stddev_native: rolling90d.stddevNative,
        rolling_90d_stddev_reporting: rolling90d.stddevReporting,
        last_transaction_id: transactionId,
        last_transaction_date: transactionDate,
        stats_snapshot_checksum: snapshotChecksum || statsRow.stats_snapshot_checksum || null,
        stats_replay_seq: statsReplaySeq ?? Number(statsRow.stats_replay_seq || 0),
        snapshot_captured_at:
          snapshotCapturedAt || statsRow.snapshot_captured_at || null,
        updated_at: db.fn.now(),
      });

    logger.debug(
      { contactFingerprint, companyId },
      'Contact stats updated from contribution log',
    );
  } catch (error) {
    logger.error(
      { error, contactFingerprint, companyId },
      'Error incrementing contact stats with contribution log',
    );
    throw error;
  }
}

/**
 * Calculate rolling window stats from bank_transactions table
 * This is a simplified version - production would track individual transaction contributions
 */
// async function calculateRollingWindow(
//   db: Knex | Knex.Transaction,
//   companyId: string,
//   contactFingerprint: string,
//   currencyCode: string,
//   windowStart: Date,
//   contactId?: string | null,
// ): Promise<{
//   count: number;
//   totalNative: number;
//   totalReporting: number;
//   avgNative: number;
//   avgReporting: number;
//   stddevNative: number;
//   stddevReporting: number;
// }> {
//   // Legacy implementation commented out. See contribution-log based version below.
// }

async function calculateRollingWindowFromEntries(
  db: Knex | Knex.Transaction,
  statsId: string,
  asOfDate: Date,
  windowInDays: number,
): Promise<{
  count: number;
  totalNative: number;
  totalReporting: number;
  avgNative: number;
  avgReporting: number;
  stddevNative: number;
  stddevReporting: number;
}> {
  const windowStart = new Date(asOfDate);
  windowStart.setDate(windowStart.getDate() - windowInDays);

  const rows = await db('bank_transaction_contact_stats_entries')
    .where('stats_id', statsId)
    .andWhere('is_deleted', false)
    .andWhere('transaction_date', '>=', windowStart)
    .andWhere('transaction_date', '<=', asOfDate)
    .select(
      db.raw('COUNT(*)::bigint as txn_count'),
      db.raw('COALESCE(SUM(amount_native_abs), 0) as total_native'),
      db.raw('COALESCE(SUM(amount_reporting_abs), 0) as total_reporting'),
      db.raw(
        'COALESCE(SUM(amount_native_abs * amount_native_abs), 0) as total_native_sq',
      ),
      db.raw(
        'COALESCE(SUM(amount_reporting_abs * amount_reporting_abs), 0) as total_reporting_sq',
      ),
    )
    .first();

  const count = Number(rows?.txn_count || 0);
  const totalNative = Number(rows?.total_native || 0);
  const totalReporting = Number(rows?.total_reporting || 0);
  const totalNativeSq = Number(rows?.total_native_sq || 0);
  const totalReportingSq = Number(rows?.total_reporting_sq || 0);

  const avgNative = count > 0 ? totalNative / count : 0;
  const avgReporting = count > 0 ? totalReporting / count : 0;

  const stddevNative =
    count > 0
      ? Math.sqrt(Math.max(totalNativeSq / count - avgNative ** 2, 0))
      : 0;
  const stddevReporting =
    count > 0
      ? Math.sqrt(Math.max(totalReportingSq / count - avgReporting ** 2, 0))
      : 0;

  return {
    count,
    totalNative,
    totalReporting,
    avgNative,
    avgReporting,
    stddevNative,
    stddevReporting,
  };
}

/**
 * Decrement contact stats (for transaction deletion)
 * This is a placeholder - full implementation would reverse the increment logic
 */
export async function decrementContactStats(
  params: {
    companyId: string;
    contactFingerprint: string;
    currencyCode: string;
    contactId?: string | null;
    amountNative: number;
    amountReporting: number;
    transactionDate: Date;
    transactionId: string;
    statsReplaySeq?: number;
  },
  trx?: Knex.Transaction,
): Promise<void> {
  const db = trx || knexClient;

  // For MVP, we'll recalculate rolling windows on deletion
  // Production implementation would track individual transaction contributions

  logger.warn(
    { ...params },
    'decrementContactStats called - recalculation not yet implemented',
  );
}
