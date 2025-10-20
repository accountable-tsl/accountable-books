import { knexClient as db } from '../../db/knexClient.js';
import pino from 'pino';
import type { Knex } from 'knex';
import type {
  CompanyContext,
  BankBalanceRecalcParams,
  BankDailySnapshot,
  DailyBalance,
  BalanceRecalcResult,
  BankTransactionForBalance,
} from './balances.types.js';
import { bankBalanceRecalcParamsSchema } from './balances.types.js';
import { getActiveOpeningBalance } from './openingBalance.service.js';

const logger = pino();

type Queryable = Knex | Knex.Transaction;

// Chunking configuration for large datasets
const CHUNK_SIZE = 10000; // Process transactions in chunks of 10k
const LARGE_DATASET_THRESHOLD = 50000; // Use chunking for 50k+ transactions

/**
 * Service for managing bank account balance calculations
 * Handles both current balances and daily snapshots in native currency
 */
class BankBalanceService {
  /**
   * Recalculate bank balance for a specific bank account
   *
   * Note: This uses the company's current timezone for all historical day bucketing.
   * If a company's timezone changes, historical snapshots will remain in their original
   * timezone buckets. I need to consider whether old days should be recalculated when timezone changes.
   */
  async recalculateBalance(
    params: BankBalanceRecalcParams,
  ): Promise<BalanceRecalcResult> {
    // Validate input parameters with detailed error messages
    const validationResult = bankBalanceRecalcParamsSchema.safeParse(params);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(
        `Invalid balance recalculation parameters: ${errorMessages}`,
      );
    }

    const { companyId, bankAccountId, recalcFrom, recalcTo, triggeredBy } =
      validationResult.data;

    logger.info(
      {
        companyId,
        bankAccountId,
        recalcFrom,
        triggeredBy,
      },
      'Starting bank balance recalculation',
    );

    try {
      const fromDay = this.validateAndNormalizeDate(recalcFrom);
      const context = await this.getCompanyContext(companyId);

      const result = await db.transaction(async (trx) => {
        // Check for opening balance first
        const openingBalance = await getActiveOpeningBalance({
          bankAccountId,
          asOfBefore: fromDay,
          trx,
        });

        const baselineSnapshot = await this.getLatestSnapshotBefore(
          companyId,
          bankAccountId,
          fromDay,
          trx,
        );

        // Determine starting balance:
        // 1. If opening balance exists and applies to this period, use it
        // 2. Otherwise use the latest snapshot before fromDay
        // 3. Default to 0 if neither exists
        const startBalance =
          openingBalance &&
          new Date(openingBalance.as_of_date) < new Date(fromDay)
            ? Number(openingBalance.amount)
            : baselineSnapshot
              ? Number(baselineSnapshot.closingBalance)
              : 0;

        await this.deleteSnapshotsFrom(companyId, bankAccountId, fromDay, trx);

        const transactions = await this.getBankTransactionsForRecalc(
          companyId,
          bankAccountId,
          fromDay,
          context.defaultTimezone,
          trx,
          recalcTo,
        );

        if (transactions.length === 0) {
          await this.updateCurrentBalance(
            companyId,
            bankAccountId,
            startBalance,
            trx,
          );
          return {
            daysProcessed: 0,
            snapshotsCreated: 0,
            snapshotsUpdated: 0,
            finalBalance: this.toNumber(startBalance).toFixed(10),
            lastProcessedDate: baselineSnapshot?.day ?? fromDay,
          } satisfies BalanceRecalcResult;
        }

        const dailyBalances = this.rollForwardByDay(transactions, startBalance);
        const upsertResult = await this.replaceDailySnapshots(
          companyId,
          bankAccountId,
          fromDay,
          dailyBalances,
          trx,
          recalcTo,
        );

        const finalBalance = this.toNumber(
          dailyBalances[dailyBalances.length - 1].closing_balance,
        );

        await this.updateCurrentBalance(
          companyId,
          bankAccountId,
          finalBalance,
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
          bankAccountId,
          triggeredBy,
          result,
        },
        'Bank balance recalculation completed',
      );

      return result;
    } catch (error) {
      logger.error(
        {
          companyId,
          bankAccountId,
          triggeredBy,
          error: error instanceof Error ? error.message : error,
        },
        'Bank balance recalculation failed',
      );
      throw error;
    }
  }

  /**
   * Get company context including timezone
   */
  private async getCompanyContext(
    companyId: string,
    client: Queryable = db,
  ): Promise<CompanyContext> {
    const company = await client('companies')
      .select('id', 'default_timezone', 'reporting_currency_id')
      .where((b) => b.where('short_code', companyId).orWhere('id', companyId))
      .where('is_deleted', false)
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
    bankAccountId: string,
    beforeDay: string,
    client: Queryable = db,
  ): Promise<BankDailySnapshot | null> {
    const snapshot = await client('bank_account_daily_native_snapshots')
      .select('company_id', 'bank_account_id', 'day', 'closing_balance')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .where('day', '<', beforeDay)
      .orderBy('day', 'desc')
      .first();

    return snapshot
      ? {
          companyId: snapshot.company_id,
          bankAccountId: snapshot.bank_account_id,
          day: snapshot.day,
          closingBalance: snapshot.closing_balance,
        }
      : null;
  }

  private async deleteSnapshotsFrom(
    companyId: string,
    bankAccountId: string,
    fromDay: string,
    client: Queryable = db,
  ): Promise<void> {
    await client('bank_account_daily_native_snapshots')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .andWhere('day', '>=', fromDay)
      .del();
  }

  /**
   * Get bank transactions for recalculation with company timezone context
   *
   * Note: This implementation supports chunking for large datasets (50k+ transactions).
   * Transactions are processed in chunks of 10k to prevent memory issues and improve performance.
   */
  private async getBankTransactionsForRecalc(
    companyId: string,
    bankAccountId: string,
    fromDay: string,
    timezone: string,
    client: Queryable = db,
    recalcTo?: string,
  ): Promise<BankTransactionForBalance[]> {
    const queryParams = [timezone, companyId, bankAccountId, fromDay];
    let whereClause = `
        WHERE ba.company_id = ?
          AND bt.bank_account_id = ?
          AND (bt.txn_at AT TIME ZONE ?)::date >= ?
          AND bt.is_deleted = false
    `;

    if (recalcTo) {
      whereClause += ` AND (bt.txn_at AT TIME ZONE ?)::date <= ?`;
      queryParams.push(timezone, recalcTo);
    }

    const transactions = await client.raw(
      `
        SELECT
          bt.id,
          bt.txn_at,
          (bt.txn_at AT TIME ZONE ?)::date as local_day,
          bt.amount,
          bt.created_at,
          bt.is_deleted
        FROM bank_transactions bt
        JOIN bank_accounts ba ON bt.bank_account_id = ba.id
        ${whereClause}
        ORDER BY bt.txn_at ASC, bt.created_at ASC, bt.id ASC
      `,
      queryParams,
    );

    return transactions.rows.map((t: any) => ({
      id: t.id,
      txnAt: t.txn_at,
      localDay:
        t.local_day instanceof Date
          ? t.local_day.toISOString().split('T')[0]
          : t.local_day,
      amount: t.amount,
      createdAt: t.created_at,
      isDeleted: t.is_deleted,
    }));
  }

  /**
   * Roll balances forward by day using pre-calculated local days
   * Supports chunking for large datasets to prevent memory issues
   */
  private rollForwardByDay(
    transactions: BankTransactionForBalance[],
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
    if (transactions.length >= LARGE_DATASET_THRESHOLD) {
      logger.info(
        {
          transactionCount: transactions.length,
          chunkSize: CHUNK_SIZE,
        },
        'Processing large transaction dataset with chunking',
      );

      for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
        const chunk = transactions.slice(i, i + CHUNK_SIZE);
        runningBalance = this.processTransactionChunk(
          chunk,
          runningBalance,
          dailyBalances,
        );

        // Log progress for large datasets
        if (i % (CHUNK_SIZE * 5) === 0) {
          logger.debug(
            {
              processed: i + chunk.length,
              total: transactions.length,
              progress: `${Math.round(((i + chunk.length) / transactions.length) * 100)}%`,
            },
            'Chunk processing progress',
          );
        }
      }
    } else {
      // Process all transactions at once for smaller datasets
      runningBalance = this.processTransactionChunk(
        transactions,
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
   * Process a chunk of transactions and update daily balances
   */
  private processTransactionChunk(
    transactions: BankTransactionForBalance[],
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

    for (const transaction of transactions) {
      const localDay =
        typeof transaction.localDay === 'string'
          ? transaction.localDay
          : new Date(transaction.localDay).toISOString().split('T')[0];
      const amount = this.toNumber(transaction.amount);

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
    bankAccountId: string,
    fromDay: string,
    dailyBalances: DailyBalance[],
    client: Queryable = db,
    recalcTo?: string,
  ): Promise<{ created: number; updated: number }> {
    const deleteQuery = client('bank_account_daily_native_snapshots')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
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
        'Inserting large snapshot dataset with batching',
      );

      await this.batchInsertSnapshots(
        companyId,
        bankAccountId,
        dailyBalances,
        now,
        client,
      );
    } else {
      // Insert all snapshots at once for smaller datasets
      await client('bank_account_daily_native_snapshots').insert(
        dailyBalances.map((balance) => ({
          company_id: companyId,
          bank_account_id: bankAccountId,
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
   * Insert snapshots in batches to handle large datasets
   */
  private async batchInsertSnapshots(
    companyId: string,
    bankAccountId: string,
    dailyBalances: DailyBalance[],
    now: Date,
    client: Queryable,
  ): Promise<void> {
    for (let i = 0; i < dailyBalances.length; i += CHUNK_SIZE) {
      const chunk = dailyBalances.slice(i, i + CHUNK_SIZE);

      await client('bank_account_daily_native_snapshots').insert(
        chunk.map((balance) => ({
          company_id: companyId,
          bank_account_id: bankAccountId,
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
          'Snapshot batch insert progress',
        );
      }
    }
  }

  /**
   * Update current bank balance
   */
  private async updateCurrentBalance(
    companyId: string,
    bankAccountId: string,
    balance: number,
    client: Queryable = db,
  ): Promise<void> {
    const now = new Date();

    const existing = await client('bank_account_current_native_balances')
      .select('company_id')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .first();

    const payload = {
      native_balance: this.toNumber(balance).toFixed(10),
      as_of_time: now,
    };

    if (existing) {
      await client('bank_account_current_native_balances')
        .where('company_id', companyId)
        .where('bank_account_id', bankAccountId)
        .update(payload);
    } else {
      await client('bank_account_current_native_balances').insert({
        company_id: companyId,
        bank_account_id: bankAccountId,
        ...payload,
      });
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
export const bankBalanceService = new BankBalanceService();
