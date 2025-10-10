import { knexClient as db } from '../../db/knexClient.js';
import { Decimal } from 'decimal.js';
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

const logger = pino();

type Queryable = Knex | Knex.Transaction;

/**
 * Service for managing bank account balance calculations
 * Handles both current balances and daily snapshots in native currency
 */
class BankBalanceService {
  /**
   * Recalculate bank balance for a specific bank account
   */
  async recalculateBalance(
    params: BankBalanceRecalcParams,
  ): Promise<BalanceRecalcResult> {
    const { companyId, bankAccountId, recalcFrom, triggeredBy } = params;

    logger.info(
      {
        companyId,
        bankAccountId,
        recalcFrom,
        triggeredBy,
      },
      'Starting bank balance recalculation',
    );

    const fromDay = recalcFrom.split('T')[0];

    try {
      const context = await this.getCompanyContext(companyId);

      const result = await db.transaction(async (trx) => {
        const baselineSnapshot = await this.getLatestSnapshotBefore(
          companyId,
          bankAccountId,
          fromDay,
          trx,
        );
        const startBalance = baselineSnapshot
          ? this.toDecimal(baselineSnapshot.nativeBalance)
          : new Decimal(0);

        await this.deleteSnapshotsFrom(companyId, bankAccountId, fromDay, trx);

        const transactions = await this.getBankTransactionsForRecalc(
          companyId,
          bankAccountId,
          fromDay,
          context.defaultTimezone,
          trx,
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
            finalBalance: startBalance.toString(),
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
        );

        const finalBalance = this.toDecimal(
          dailyBalances[dailyBalances.length - 1].balance,
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
          finalBalance: finalBalance.toString(),
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
    bankAccountId: string,
    beforeDay: string,
    client: Queryable = db,
  ): Promise<BankDailySnapshot | null> {
    const snapshot = await client('bank_account_daily_native_snapshots')
      .select('company_id', 'bank_account_id', 'day', 'native_balance')
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
          nativeBalance: snapshot.native_balance,
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
   */
  private async getBankTransactionsForRecalc(
    companyId: string,
    bankAccountId: string,
    fromDay: string,
    timezone: string,
    client: Queryable = db,
  ): Promise<BankTransactionForBalance[]> {
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
        WHERE ba.company_id = ?
          AND bt.bank_account_id = ?
          AND (bt.txn_at AT TIME ZONE ?)::date >= ?
          AND bt.is_deleted = false
        ORDER BY bt.txn_at ASC, bt.created_at ASC, bt.id ASC
      `,
      [timezone, companyId, bankAccountId, timezone, fromDay],
    );

    return transactions.rows.map((t: any) => ({
      id: t.id,
      txnAt: t.txn_at,
      localDay: t.local_day,
      amount: t.amount,
      createdAt: t.created_at,
      isDeleted: t.is_deleted,
    }));
  }

  /**
   * Roll balances forward by day using pre-calculated local days
   */
  private rollForwardByDay(
    transactions: BankTransactionForBalance[],
    startBalance: Decimal,
  ): DailyBalance[] {
    const dailyBalances: Map<string, { balance: Decimal; count: number }> =
      new Map();
    let runningBalance = startBalance;

    for (const transaction of transactions) {
      const localDay = transaction.localDay;
      const amount = this.toDecimal(transaction.amount);

      runningBalance = runningBalance.plus(amount);

      const existing = dailyBalances.get(localDay);
      if (existing) {
        existing.balance = runningBalance;
        existing.count++;
      } else {
        dailyBalances.set(localDay, {
          balance: runningBalance,
          count: 1,
        });
      }
    }

    return Array.from(dailyBalances.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, data]) => ({
        day,
        balance: data.balance,
        transactionCount: data.count,
      }));
  }

  /**
   * Replace daily snapshots from a given day
   */
  private async replaceDailySnapshots(
    companyId: string,
    bankAccountId: string,
    fromDay: string,
    dailyBalances: DailyBalance[],
    client: Queryable = db,
  ): Promise<{ created: number; updated: number }> {
    await client('bank_account_daily_native_snapshots')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .andWhere('day', '>=', fromDay)
      .del();

    if (dailyBalances.length === 0) {
      return { created: 0, updated: 0 };
    }

    const now = new Date();

    await client('bank_account_daily_native_snapshots').insert(
      dailyBalances.map((balance) => ({
        company_id: companyId,
        bank_account_id: bankAccountId,
        day: balance.day,
        native_balance: this.toDecimal(balance.balance).toString(),
        created_at: now,
        updated_at: now,
      })),
    );

    return { created: dailyBalances.length, updated: 0 };
  }

  /**
   * Update current bank balance
   */
  private async updateCurrentBalance(
    companyId: string,
    bankAccountId: string,
    balance: Decimal,
    client: Queryable = db,
  ): Promise<void> {
    const now = new Date();

    const existing = await client('bank_account_current_native_balances')
      .select('company_id')
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .first();

    const payload = {
      native_balance: balance.toString(),
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

  private toDecimal(value: string | Decimal): Decimal {
    return Decimal.isDecimal(value) ? (value as Decimal) : new Decimal(value);
  }
}

// Export singleton instance
export const bankBalanceService = new BankBalanceService();
