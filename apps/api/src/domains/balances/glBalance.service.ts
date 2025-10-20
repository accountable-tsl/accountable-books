import pino from 'pino';
import type { Knex } from 'knex';
import type {
  CompanyContext,
  GLBalanceRecalcParams,
  GLDailySnapshot,
  DailyBalance,
  BalanceRecalcResult,
  LedgerEntryForBalance,
} from './balances.types.js';
import { glBalanceRecalcParamsSchema } from './balances.types.js';
import { knexClient as db } from '../../db/knexClient.js';

const logger = pino();

type Queryable = Knex | Knex.Transaction;

// Chunking configuration for large datasets
const CHUNK_SIZE = 10000; // Process ledger entries in chunks of 10k
const LARGE_DATASET_THRESHOLD = 50000; // Use chunking for 50k+ entries

/**
 * Service for managing GL (General Ledger) balance calculations
 * Handles both current balances and daily snapshots
 */
class GLBalanceService {
  /**
   * Recalculate GL balance for a specific COA account
   *
   * Note: This uses the company's current timezone for all historical day bucketing.
   * If a company's timezone changes, historical snapshots will remain in their original
   * timezone buckets. I need to consider whether old days should be recalculated when timezone changes.
   */
  async recalculateBalance(
    params: GLBalanceRecalcParams,
  ): Promise<BalanceRecalcResult> {
    // Validate input parameters with detailed error messages
    const validationResult = glBalanceRecalcParamsSchema.safeParse(params);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(
        `Invalid GL balance recalculation parameters: ${errorMessages}`,
      );
    }

    const { companyId, coaId, recalcFrom, recalcTo, triggeredBy } =
      validationResult.data;

    logger.info(
      {
        companyId,
        coaId,
        recalcFrom,
        triggeredBy,
      },
      'Starting GL balance recalculation',
    );

    const fromDay = this.validateAndNormalizeDate(recalcFrom);

    try {
      const context = await this.getCompanyContext(companyId);

      const result = await db.transaction(async (trx) => {
        const baselineSnapshot = await this.getLatestSnapshotBefore(
          companyId,
          coaId,
          fromDay,
          trx,
        );
        const startBalance = baselineSnapshot
          ? this.toNumber(baselineSnapshot.reportingCurrencyBalance)
          : 0;

        await this.deleteSnapshotsFrom(companyId, coaId, fromDay, trx);

        const entries = await this.getLedgerEntriesForRecalc(
          companyId,
          coaId,
          fromDay,
          context.defaultTimezone,
          trx,
          recalcTo,
        );

        if (entries.length === 0) {
          await this.updateCurrentBalance(companyId, coaId, startBalance, trx);
          return {
            daysProcessed: 0,
            snapshotsCreated: 0,
            snapshotsUpdated: 0,
            finalBalance: this.toNumber(startBalance).toFixed(10),
            lastProcessedDate: baselineSnapshot?.day ?? fromDay,
          } satisfies BalanceRecalcResult;
        }

        const dailyBalances = this.rollForwardByDay(entries, startBalance);
        const upsertResult = await this.replaceDailySnapshots(
          companyId,
          coaId,
          fromDay,
          dailyBalances,
          trx,
          recalcTo,
        );

        const finalBalance = this.toNumber(
          dailyBalances[dailyBalances.length - 1].closing_balance,
        );

        await this.updateCurrentBalance(companyId, coaId, finalBalance, trx);

        // NEW: Aggregate to period balances
        await this.aggregateToPeriodBalances(
          companyId,
          coaId,
          fromDay,
          recalcTo || dailyBalances[dailyBalances.length - 1]?.day || fromDay,
          trx,
        );

        return {
          daysProcessed: dailyBalances.length,
          snapshotsCreated: upsertResult.created,
          snapshotsUpdated: upsertResult.updated,
          finalBalance: finalBalance.toFixed(10),
          lastProcessedDate: dailyBalances[dailyBalances.length - 1].day,
        } satisfies BalanceRecalcResult;
      });

      logger.info(
        {
          companyId,
          coaId,
          triggeredBy,
          result,
        },
        'GL balance recalculation completed',
      );

      return result;
    } catch (error) {
      logger.error(
        {
          companyId,
          coaId,
          triggeredBy,
          error: error instanceof Error ? error.message : error,
        },
        'GL balance recalculation failed',
      );
      throw error;
    }
  }

  /**
   * Get company context including timezone and reporting currency
   */
  private async getCompanyContext(
    companyId: string,
    client: Queryable = db,
  ): Promise<CompanyContext> {
    const company = await client('companies')
      .select('id', 'default_timezone', 'reporting_currency_id')
      .where('id', companyId)
      .first();

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    return {
      companyId: company.id,
      defaultTimezone: company.default_timezone,
      reportingCurrencyId: company.reporting_currency_id,
    };
  }

  /**
   * Get the latest daily snapshot before a given day
   */
  private async getLatestSnapshotBefore(
    companyId: string,
    coaId: string,
    beforeDay: string,
    client: Queryable = db,
  ): Promise<GLDailySnapshot | null> {
    const snapshot = await client('gl_daily_balance_snapshots')
      .select('company_id', 'coa_id', 'day', 'reporting_currency_balance')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .where('day', '<', beforeDay)
      .orderBy('day', 'desc')
      .first();

    return snapshot
      ? {
          companyId: snapshot.company_id,
          coaId: snapshot.coa_id,
          day: snapshot.day,
          reportingCurrencyBalance: snapshot.reporting_currency_balance,
        }
      : null;
  }

  private async deleteSnapshotsFrom(
    companyId: string,
    coaId: string,
    fromDay: string,
    client: Queryable = db,
  ): Promise<void> {
    await client('gl_daily_balance_snapshots')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .andWhere('day', '>=', fromDay)
      .del();
  }

  /**
   * Get ledger entries for recalculation with company timezone context
   *
   * Note: This implementation supports chunking for large datasets (50k+ entries).
   * Ledger entries are processed in chunks of 10k to prevent memory issues and improve performance.
   */
  private async getLedgerEntriesForRecalc(
    companyId: string,
    coaId: string,
    fromDay: string,
    timezone: string,
    client: Queryable = db,
    recalcTo?: string,
  ): Promise<LedgerEntryForBalance[]> {
    const queryParams = [timezone, companyId, coaId, fromDay];
    let whereClause = `
        WHERE coa.company_id = ?
          AND le.coa_id = ?
          AND (lt.date AT TIME ZONE ?)::date >= ?
          AND le.is_deleted = false
    `;

    if (recalcTo) {
      whereClause += ` AND (lt.date AT TIME ZONE ?)::date <= ?`;
      queryParams.push(timezone, recalcTo);
    }

    const entries = await client.raw(
      `
        SELECT
          le.id,
          le.ledger_transaction_id,
          lt.date as ledger_transaction_date,
          (lt.date AT TIME ZONE ?)::date as local_day,
          le.amount,
          le.created_at,
          le.is_deleted
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le.ledger_transaction_id = lt.id
        JOIN coa ON le.coa_id = coa.id
        WHERE coa.company_id = ?
          AND le.coa_id = ?
          AND (lt.date AT TIME ZONE ?)::date >= ?
          AND le.is_deleted = false
        ORDER BY lt.date ASC, le.created_at ASC, le.id ASC
      `,
      queryParams,
    );

    return entries.rows.map((e: any) => ({
      id: e.id,
      ledgerTransactionId: e.ledger_transaction_id,
      ledgerTransactionDate: e.ledger_transaction_date,
      localDay:
        e.local_day instanceof Date
          ? e.local_day.toISOString().split('T')[0]
          : e.local_day,
      amount: e.amount,
      createdAt: e.created_at,
      isDeleted: e.is_deleted,
    }));
  }

  /**
   * Roll balances forward by day using pre-calculated local days
   * Supports chunking for large datasets to prevent memory issues
   */
  private rollForwardByDay(
    entries: LedgerEntryForBalance[],
    startBalance: number,
  ): DailyBalance[] {
    const dailyBalances: Map<
      string,
      {
        opening: number;
        debits: number;
        credits: number;
        closing: number;
        count: number;
      }
    > = new Map();
    let runningBalance = this.toNumber(startBalance);

    // Use chunking for large datasets
    if (entries.length >= LARGE_DATASET_THRESHOLD) {
      logger.info(
        {
          entryCount: entries.length,
          chunkSize: CHUNK_SIZE,
        },
        'Processing large ledger entry dataset with chunking',
      );

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        runningBalance = this.processEntryChunk(
          chunk,
          runningBalance,
          dailyBalances,
        );

        // Log progress for large datasets
        if (i % (CHUNK_SIZE * 5) === 0) {
          logger.debug(
            {
              processed: i + chunk.length,
              total: entries.length,
              progress: `${Math.round(((i + chunk.length) / entries.length) * 100)}%`,
            },
            'Chunk processing progress',
          );
        }
      }
    } else {
      // Process all entries at once for smaller datasets
      runningBalance = this.processEntryChunk(
        entries,
        runningBalance,
        dailyBalances,
      );
    }

    return Array.from(dailyBalances.entries()).map(([day, data]) => ({
      day,
      opening_balance: this.toNumber(data.opening),
      day_debits: this.toNumber(data.debits),
      day_credits: this.toNumber(data.credits),
      closing_balance: this.toNumber(data.closing),
      transaction_count: data.count,
    }));
  }

  /**
   * Process a chunk of ledger entries and update daily balances
   */
  private processEntryChunk(
    entries: LedgerEntryForBalance[],
    startBalance: number,
    dailyBalances: Map<
      string,
      {
        opening: number;
        debits: number;
        credits: number;
        closing: number;
        count: number;
      }
    >,
  ): number {
    let runningBalance = startBalance;

    for (const entry of entries) {
      const localDay = entry.localDay;
      const amount = this.toNumber(entry.amount);

      // Apply rounding after each addition to prevent float drift across large sequences
      runningBalance = this.toNumber(runningBalance + amount);

      const existing = dailyBalances.get(localDay);
      if (existing) {
        existing.closing = runningBalance;
        existing.count++;
        if (amount > 0) {
          existing.debits += amount;
        } else {
          existing.credits += Math.abs(amount);
        }
      } else {
        dailyBalances.set(localDay, {
          opening: runningBalance - amount,
          debits: amount > 0 ? amount : 0,
          credits: amount < 0 ? Math.abs(amount) : 0,
          closing: runningBalance,
          count: 1,
        });
      }
    }

    return runningBalance;
  }

  /**
   * Replace daily snapshots from a given day
   * Supports batch inserts for large datasets
   */
  private async replaceDailySnapshots(
    companyId: string,
    coaId: string,
    fromDay: string,
    dailyBalances: DailyBalance[],
    client: Queryable = db,
    recalcTo?: string,
  ): Promise<{ created: number; updated: number }> {
    const deleteQuery = client('gl_daily_balance_snapshots')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .andWhere('day', '>=', fromDay);

    if (recalcTo) {
      deleteQuery.andWhere('day', '<=', recalcTo);
    }

    await deleteQuery.del();

    if (dailyBalances.length === 0) {
      return { created: 0, updated: 0 };
    }

    const now = new Date();

    // Use batch inserts for large datasets
    if (dailyBalances.length >= LARGE_DATASET_THRESHOLD) {
      logger.info(
        {
          snapshotCount: dailyBalances.length,
          chunkSize: CHUNK_SIZE,
        },
        'Inserting large GL snapshot dataset with batching',
      );

      await this.batchInsertSnapshots(
        companyId,
        coaId,
        dailyBalances,
        now,
        client,
      );
    } else {
      // Insert all snapshots at once for smaller datasets
      await client('gl_daily_balance_snapshots').insert(
        dailyBalances.map((balance) => ({
          company_id: companyId,
          coa_id: coaId,
          day: balance.day,
          opening_balance: this.toNumber(balance.opening_balance).toFixed(10),
          day_debits: this.toNumber(balance.day_debits).toFixed(10),
          day_credits: this.toNumber(balance.day_credits).toFixed(10),
          closing_balance: this.toNumber(balance.closing_balance).toFixed(10),
          transaction_count: balance.transaction_count,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    return { created: dailyBalances.length, updated: 0 };
  }

  /**
   * Insert GL snapshots in batches to handle large datasets
   */
  private async batchInsertSnapshots(
    companyId: string,
    coaId: string,
    dailyBalances: DailyBalance[],
    now: Date,
    client: Queryable,
  ): Promise<void> {
    for (let i = 0; i < dailyBalances.length; i += CHUNK_SIZE) {
      const chunk = dailyBalances.slice(i, i + CHUNK_SIZE);

      await client('gl_daily_balance_snapshots').insert(
        chunk.map((balance) => ({
          company_id: companyId,
          coa_id: coaId,
          day: balance.day,
          opening_balance: this.toNumber(balance.opening_balance).toFixed(10),
          day_debits: this.toNumber(balance.day_debits).toFixed(10),
          day_credits: this.toNumber(balance.day_credits).toFixed(10),
          closing_balance: this.toNumber(balance.closing_balance).toFixed(10),
          transaction_count: balance.transaction_count,
          created_at: now,
          updated_at: now,
        })),
      );

      // Log progress for large datasets
      if (i % (CHUNK_SIZE * 5) === 0) {
        logger.debug(
          {
            inserted: i + chunk.length,
            total: dailyBalances.length,
            progress: `${Math.round(((i + chunk.length) / dailyBalances.length) * 100)}%`,
          },
          'GL snapshot batch insert progress',
        );
      }
    }
  }

  /**
   * Update current GL balance
   */
  private async updateCurrentBalance(
    companyId: string,
    coaId: string,
    balance: number,
    client: Queryable = db,
  ): Promise<void> {
    const now = new Date();

    const existing = await client('gl_current_balances')
      .select('company_id')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .first();

    const payload = {
      reporting_currency_balance: this.toNumber(balance).toFixed(10),
      as_of_time: now,
    };

    if (existing) {
      await client('gl_current_balances')
        .where('company_id', companyId)
        .where('coa_id', coaId)
        .update(payload);
    } else {
      await client('gl_current_balances').insert({
        company_id: companyId,
        coa_id: coaId,
        ...payload,
      });
    }
  }

  /**
   * Aggregate daily snapshots to period balances
   */
  private async aggregateToPeriodBalances(
    companyId: string,
    coaId: string,
    fromDate: string,
    toDate: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    // TODO: Implement fiscal calendar service
    // const { ensureFiscalPeriodExists } = await import(
    //   './fiscal-calendar.service.js'
    // );
    const { endOfMonth, format } = await import('date-fns');

    const months = await trx('gl_daily_balance_snapshots')
      .where({ company_id: companyId, coa_id: coaId })
      .whereBetween('day', [fromDate, toDate])
      .select(trx.raw(`DISTINCT DATE_TRUNC('month', day)::date as month_start`))
      .orderBy('month_start');

    for (const { month_start } of months) {
      // TODO: Implement fiscal period creation
      // await ensureFiscalPeriodExists(companyId, month_start, 'monthly', trx);

      const year = new Date(month_start).getFullYear();
      const month = new Date(month_start).getMonth() + 1;

      const monthEnd = endOfMonth(new Date(month_start));
      const dailySnapshots = await trx('gl_daily_balance_snapshots')
        .where({ company_id: companyId, coa_id: coaId })
        .whereBetween('day', [month_start, format(monthEnd, 'yyyy-MM-dd')])
        .orderBy('day');

      if (dailySnapshots.length === 0) continue;

      const opening = dailySnapshots[0].opening_balance;
      const closing = dailySnapshots[dailySnapshots.length - 1].closing_balance;
      const totalDebits = dailySnapshots.reduce(
        (sum, s) => sum + parseFloat(s.day_debits),
        0,
      );
      const totalCredits = dailySnapshots.reduce(
        (sum, s) => sum + parseFloat(s.day_credits),
        0,
      );
      const totalCount = dailySnapshots.reduce(
        (sum, s) => sum + s.transaction_count,
        0,
      );

      await trx('gl_period_balances')
        .insert({
          company_id: companyId,
          coa_id: coaId,
          fiscal_year: year,
          fiscal_period: month,
          period_type: 'monthly',
          period_start_date: month_start,
          period_end_date: format(monthEnd, 'yyyy-MM-dd'),
          opening_balance: opening,
          period_debits: totalDebits,
          period_credits: totalCredits,
          closing_balance: closing,
          transaction_count: totalCount,
        })
        .onConflict([
          'company_id',
          'coa_id',
          'fiscal_year',
          'fiscal_period',
          'period_type',
        ])
        .merge();
    }
  }

  private toNumber(value: string | number): number {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    // Match database precision: NUMERIC(32, 10) = 10 decimal places
    return Math.round(num * 1e10) / 1e10;
  }

  /**
   * Validate and normalize date string to YYYY-MM-DD format
   */
  private validateAndNormalizeDate(dateInput: string): string {
    // Handle ISO datetime strings (YYYY-MM-DDTHH:mm:ss.sssZ)
    const dateOnly = dateInput.split('T')[0];

    // Validate format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateOnly)) {
      throw new Error(
        `Invalid date format: "${dateInput}". Expected YYYY-MM-DD format (e.g., "2024-01-15")`,
      );
    }

    // Validate it's a real date
    const parsed = new Date(dateOnly);
    if (isNaN(parsed.getTime())) {
      throw new Error(
        `Invalid date: "${dateInput}". Date does not exist (e.g., "2024-13-45" is invalid)`,
      );
    }

    return dateOnly;
  }
}

// Export singleton instance
export const glBalanceService = new GLBalanceService();
