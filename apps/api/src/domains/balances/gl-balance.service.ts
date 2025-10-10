import { Decimal } from 'decimal.js';
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
import { knexClient as db } from '../../db/knexClient.js';

const logger = pino();

type Queryable = Knex | Knex.Transaction;

/**
 * Service for managing GL (General Ledger) balance calculations
 * Handles both current balances and daily snapshots
 */
class GLBalanceService {
  /**
   * Recalculate GL balance for a specific COA account
   */
  async recalculateBalance(
    params: GLBalanceRecalcParams,
  ): Promise<BalanceRecalcResult> {
    const { companyId, coaId, recalcFrom, triggeredBy } = params;

    logger.info(
      {
        companyId,
        coaId,
        recalcFrom,
        triggeredBy,
      },
      'Starting GL balance recalculation',
    );

    const fromDay = recalcFrom.split('T')[0];

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
          ? this.toDecimal(baselineSnapshot.reportingCurrencyBalance)
          : new Decimal(0);

        await this.deleteSnapshotsFrom(companyId, coaId, fromDay, trx);

        const entries = await this.getLedgerEntriesForRecalc(
          companyId,
          coaId,
          fromDay,
          context.defaultTimezone,
          trx,
        );

        if (entries.length === 0) {
          await this.updateCurrentBalance(companyId, coaId, startBalance, trx);
          return {
            daysProcessed: 0,
            snapshotsCreated: 0,
            snapshotsUpdated: 0,
            finalBalance: startBalance.toString(),
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
        );

        const finalBalance = this.toDecimal(
          dailyBalances[dailyBalances.length - 1].balance,
        );

        await this.updateCurrentBalance(companyId, coaId, finalBalance, trx);

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
   */
  private async getLedgerEntriesForRecalc(
    companyId: string,
    coaId: string,
    fromDay: string,
    timezone: string,
    client: Queryable = db,
  ): Promise<LedgerEntryForBalance[]> {
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
      [timezone, companyId, coaId, timezone, fromDay],
    );

    return entries.rows.map((e: any) => ({
      id: e.id,
      ledgerTransactionId: e.ledger_transaction_id,
      ledgerTransactionDate: e.ledger_transaction_date,
      localDay: e.local_day,
      amount: e.amount,
      createdAt: e.created_at,
      isDeleted: e.is_deleted,
    }));
  }

  /**
   * Roll balances forward by day using pre-calculated local days
   */
  private rollForwardByDay(
    entries: LedgerEntryForBalance[],
    startBalance: Decimal,
  ): DailyBalance[] {
    const dailyBalances: Map<string, { balance: Decimal; count: number }> =
      new Map();
    let runningBalance = startBalance;

    for (const entry of entries) {
      const localDay = entry.localDay;
      const amount = this.toDecimal(entry.amount);

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
    coaId: string,
    fromDay: string,
    dailyBalances: DailyBalance[],
    client: Queryable = db,
  ): Promise<{ created: number; updated: number }> {
    await client('gl_daily_balance_snapshots')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .andWhere('day', '>=', fromDay)
      .del();

    if (dailyBalances.length === 0) {
      return { created: 0, updated: 0 };
    }

    const now = new Date();

    await client('gl_daily_balance_snapshots').insert(
      dailyBalances.map((balance) => ({
        company_id: companyId,
        coa_id: coaId,
        day: balance.day,
        reporting_currency_balance: this.toDecimal(balance.balance).toString(),
        created_at: now,
        updated_at: now,
      })),
    );

    return { created: dailyBalances.length, updated: 0 };
  }

  /**
   * Update current GL balance
   */
  private async updateCurrentBalance(
    companyId: string,
    coaId: string,
    balance: Decimal,
    client: Queryable = db,
  ): Promise<void> {
    const now = new Date();

    const existing = await client('gl_current_balances')
      .select('company_id')
      .where('company_id', companyId)
      .where('coa_id', coaId)
      .first();

    const payload = {
      reporting_currency_balance: balance.toString(),
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

  private toDecimal(value: string | Decimal): Decimal {
    return Decimal.isDecimal(value) ? (value as Decimal) : new Decimal(value);
  }
}

// Export singleton instance
export const glBalanceService = new GLBalanceService();
