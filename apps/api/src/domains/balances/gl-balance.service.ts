import type { Knex } from 'knex';

import { knexClient as db } from '../../db/knexClient.js';
import {
  addDaysToYMD,
  isValidYMD,
  toYMD,
} from '../../shared/utils/date.utils.js';
import { getFiscalCalendar } from '../reporting/fiscal-calendar/fiscal-calendar.service.js';
import { glBalanceRecalcParamsSchema } from './balances.types.js';

import type { DebitCredit } from '../../core/types/core.js';
import type { FinancialStatementKey } from '../../core/types/db.types.js';
import type { FiscalPeriodType } from '../reporting/fiscal-calendar/fiscal-calendar.types.js';
import type {
  BalanceRecalcResult,
  CompanyContext,
  GLBalanceRecalcParams,
} from './balances.types.js';

type Queryable = Knex | Knex.Transaction;

type GuardOutput = {
  companyUUID: string;
  coaUUID: string;
  startYMD: string; // inclusive
  endYMD: string; // inclusive
  tz: 'UTC'; // we compute in UTC day-buckets
  isBalSheetAccount: boolean;
};

interface LedgerEntryRow {
  id: string;
  ledger_transaction_id: string;
  fs_date: string | Date;
  amount: string | number;
  transaction_side: DebitCredit;
  coa_id: string;
}

type DayAgg = {
  day: string;
  debits: number;
  credits: number;
  delta: number;
  txCount: number;
};

type Snapshot = {
  company_id: string;
  coa_id: string;
  day: string;
  opening_balance: number;
  day_debits: number;
  day_credits: number;
  closing_balance: number;
  transaction_count: number;
};

const GL_LOCK_NS = 0x47_4c; // arbitrary small namespace for pg advisory locks

// stable hash → 32-bit int
function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Service for managing GL (General Ledger) balance calculations
 * Handles both current balances and daily snapshots
 */
class GLBalanceService {
  async recalculateBalance(
    params: GLBalanceRecalcParams,
    trx?: Knex.Transaction,
  ): Promise<BalanceRecalcResult> {
    // Validate input parameters with detailed error messages
    const v = glBalanceRecalcParamsSchema.safeParse(params);
    if (!v.success) {
      const errorMessages = v.error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(
        `Invalid GL balance recalculation parameters: ${errorMessages}`,
      );
    }

    const exec = async (txn: Knex.Transaction) => {
      const { companyUUID, coaUUID, startYMD, endYMD, isBalSheetAccount } =
        await this.guardAndLock(
          {
            companyId: v.data.companyId,
            coaId: v.data.coaId,
            recalcFrom: v.data.recalcFrom,
            recalcTo: v.data.recalcTo,
          },
          txn,
        );

      const { balance: startingBalance, recalcStartDate } =
        await this.pickPrevClose({
          companyUUID,
          coaId: coaUUID,
          startYMD,
          trx: txn,
        });

      // Fetch ledger entries
      const ledgerEntries = await this.fetchEntries({
        companyUUID,
        coaId: coaUUID,
        fromDay: recalcStartDate,
        recalcTo: endYMD,
        trx: txn,
      });

      const aggs = this.aggregateByDay(ledgerEntries);

      const snapshots = await this.buildDailySnapshots({
        companyUUID,
        coaId: coaUUID,
        openingBalance: startingBalance,
        dayAggregates: aggs,
        isBalSheetAccount,
        rangeStartYMD: recalcStartDate,
        rangeEndYMD: endYMD,
        trx: txn,
      });

      await this.upsertDailySnapshots(snapshots, txn);

      await this.recomputePeriodBalances({
        companyUUID,
        coaId: coaUUID,
        startYMD,
        endYMD,
        trx: txn,
      });

      await this.updateCurrentBalance({
        companyUUID,
        coaId: coaUUID,
        asOfYMD: endYMD,
        trx: txn,
      });

      // Calculate final balance from the last snapshot
      const lastSnapshot =
        snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
      const finalBalance = lastSnapshot
        ? Number(lastSnapshot.closing_balance)
        : 0;
      const lastProcessedDate = lastSnapshot ? lastSnapshot.day : endYMD;

      return {
        daysProcessed: snapshots.length,
        snapshotsCreated: snapshots.length,
        finalBalance,
        lastProcessedDate,
      };
    };
    if (trx) {
      return await exec(trx);
    } else {
      return await db.transaction(exec);
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

  // Normalize inputs → expand to a concrete [startYMD, endYMD] → assert fiscal periods are present
  // & open → acquire PG advisory lock (companyId, coaId) → return normalized context.
  private async guardAndLock(
    args: {
      companyId: string; // id or short_code
      coaId: string;
      recalcFrom: string; // YMD (min)
      recalcTo?: string; // YMD (max) optional
      requireOpenMonthly?: boolean; // default true
      idempotencyKey?: string;
    },
    trx?: Knex.Transaction,
  ): Promise<GuardOutput> {
    const {
      companyId,
      coaId,
      recalcFrom,
      recalcTo,
      requireOpenMonthly = true,
    } = args;

    if (!companyId?.trim()) {
      throw new Error('companyId required');
    }
    if (!coaId?.trim()) {
      throw new Error('coaId required');
    }
    if (!isValidYMD(recalcFrom)) {
      throw new Error(`Invalid recalcFrom: ${recalcFrom}`);
    }
    if (recalcTo && !isValidYMD(recalcTo)) {
      throw new Error(`Invalid recalcTo: ${recalcTo}`);
    }

    const todayYMD = toYMD(new Date());
    const startYMD = recalcFrom;
    const endYMD = recalcTo
      ? recalcTo > todayYMD
        ? todayYMD
        : recalcTo
      : todayYMD;

    if (startYMD > endYMD) {
      throw new Error(`Range invalid: ${startYMD} > ${endYMD}`);
    }

    const exec = async (txn: Knex.Transaction): Promise<GuardOutput> => {
      // Resolve company + coa (and soft-delete guards)
      const company =
        (await txn('companies')
          .where((b) =>
            b.where('id', companyId).orWhere('short_code', companyId),
          )
          .where({ is_deleted: false })
          .first('id')) ?? null;
      if (!company) throw new Error(`Company not found: ${companyId}`);
      const companyUUID = company.id as string;

      const coa =
        (await txn('coa')
          .select(['coa.id as id', 'fs.key as key'])
          .join('account_types as at', 'coa.account_type_id', 'at.id')
          .join('account_elements as ae', 'at.account_element_id', 'ae.id')
          .join(
            'financial_statements as fs',
            'ae.financial_statement_id',
            'fs.id',
          )
          .where({
            'coa.id': coaId,
            'coa.company_id': companyUUID,
            'coa.is_deleted': false,
          })
          .first()) ?? null;

      if (!coa) throw new Error(`COA not found: ${coaId}`);
      const coaUUID = coa.id as string;
      const fsKey = coa.key as FinancialStatementKey;

      // Period coverage + open-status assertion (monthly only)
      // We use daterange overlap so any stray dates fail loudly.
      const periods = await getFiscalCalendar({
        companyId: companyUUID,
        startYMD,
        endYMD,
        periodTypes: ['monthly'],
        trx: txn,
      });

      // Coverage check: every day in [start..end] must be inside exactly one monthly row.
      // (Cheap heuristic) ensure first period starts <= start and last period ends >= end.
      if (
        !periods.length ||
        periods[0].start_date > startYMD ||
        periods[periods.length - 1].end_date < endYMD
      ) {
        throw new Error(
          `Fiscal calendar coverage missing for ${startYMD}..${endYMD}. Run fillCoverageGaps/monthly generation.`,
        );
      }

      if (requireOpenMonthly) {
        const closedHit = periods.find((p) => p.status !== 'open');
        if (closedHit) {
          throw new Error(
            `Monthly period ${closedHit.start_date}..${closedHit.end_date} is ${closedHit.status}. Posting/recalc blocked.`,
          );
        }
      }

      // Acquire pg advisory lock inside this transaction.
      // Use a 2-key lock: (namespace, hash(companyId:coaId))
      const key = hash32(`${companyUUID}:${coaUUID}`);
      await txn.raw('SELECT pg_advisory_xact_lock(?, ?)', [GL_LOCK_NS, key]);

      return {
        companyUUID,
        coaUUID,
        startYMD,
        endYMD,
        tz: 'UTC',
        isBalSheetAccount: fsKey === 'bs',
      };
    };

    if (trx) {
      return await exec(trx);
    } else {
      return await db.transaction(exec);
    }
  }

  /**
   * Get fiscal year start dates within a date range for efficient lookup.
   * Returns a Set of YMD strings representing fiscal year start dates.
   */
  private async getFiscalYearStartSet({
    companyUUID,
    startYMD,
    endYMD,
    trx,
  }: {
    companyUUID: string;
    startYMD: string;
    endYMD: string;
    trx?: Knex.Transaction;
  }): Promise<Set<string>> {
    const knex = trx ?? db;
    const rows = await knex('fiscal_calendar')
      .select('start_date')
      .where({ company_id: companyUUID, period_type: 'yearly' })
      .andWhere('start_date', '>=', startYMD)
      .andWhere('start_date', '<=', endYMD);

    return new Set(rows.map((r) => toYMD(r.start_date)));
  }

  /**
   * Pick the prior closing snapshot (<= startYMD-1) without bridging.
   * Returns:
   * - balance: prior closing balance (number, minor units)
   * - snapshotDay: YMD of the snapshot used, or null if none
   * - recalcStartDate: YMD day to begin recomputation (startYMD if exact or none; day after snapshot otherwise)
   */

  private async pickPrevClose({
    companyUUID,
    coaId,
    startYMD,
    trx,
  }: {
    companyUUID: string;
    coaId: string;
    startYMD: string;
    trx?: Knex.Transaction;
  }): Promise<{
    balance: number;
    snapshotDay: string | null;
    recalcStartDate: string;
  }> {
    if (!isValidYMD(startYMD)) {
      throw new Error(`Invalid start date: ${startYMD}`);
    }

    const knex = trx ?? db;

    const dayBefore = addDaysToYMD(startYMD, -1);

    const snapshot = await knex('gl_daily_balance_snapshots')
      .select('day', 'closing_balance')
      .where({ company_id: companyUUID, coa_id: coaId })
      .andWhere('day', '<=', dayBefore)
      .orderBy('day', 'desc')
      .first<{ day: string | Date; closing_balance: string | number }>();

    if (!snapshot) {
      // No snapshot at all before start date, start from zero
      return {
        balance: 0,
        snapshotDay: null,
        recalcStartDate: startYMD,
      };
    }

    const balance =
      typeof snapshot.closing_balance === 'number'
        ? snapshot.closing_balance
        : Number(snapshot.closing_balance);

    const snapshotDay = toYMD(snapshot.day);

    if (snapshotDay === dayBefore) {
      // Perfect: we have a snapshot exactly at (start - 1)
      return {
        balance,
        snapshotDay,
        recalcStartDate: startYMD,
      };
    }

    // Found a snapshot, but it's not at (start - 1)
    // Suggest starting from the day after the snapshot
    return {
      balance,
      snapshotDay,
      recalcStartDate: addDaysToYMD(snapshotDay, 1),
    };
  }

  private async fetchEntries(p: {
    companyUUID: string;
    coaId: string;
    fromDay: string;
    recalcTo?: string;
    trx?: Knex.Transaction;
  }): Promise<LedgerEntryRow[]> {
    const { companyUUID, coaId, fromDay, recalcTo, trx } = p;
    if (!isValidYMD(fromDay)) throw new Error(`Invalid fromDay: ${fromDay}`);
    if (recalcTo && (!isValidYMD(recalcTo) || recalcTo < fromDay)) {
      throw new Error(`Invalid recalcTo: ${recalcTo}`);
    }

    const knex = trx ?? db;

    const query = knex('ledger_entries as le')
      .join('coa', 'le.coa_id', 'coa.id')
      .select([
        'le.id',
        'le.ledger_transaction_id',
        'le.fs_date',
        'le.amount',
        'le.transaction_side',
        'coa.id as coa_id',
      ])
      .where('coa.company_id', companyUUID)
      .andWhere('le.coa_id', coaId)
      .andWhere('le.is_deleted', false)
      .andWhere('le.fs_date', '>=', fromDay);

    if (recalcTo) {
      query.andWhere('le.fs_date', '<=', recalcTo);
    }

    return await query
      .orderBy('le.fs_date', 'asc')
      .orderBy('le.created_at', 'asc')
      .orderBy('le.id', 'asc');
  }

  private aggregateByDay(entries: LedgerEntryRow[]): DayAgg[] {
    const map = new Map<string, DayAgg>();

    for (const e of entries) {
      const day = toYMD(e.fs_date);
      const amt = Number(e.amount);

      let agg = map.get(day);
      if (!agg) {
        agg = { day, debits: 0, credits: 0, delta: 0, txCount: 0 };
        map.set(day, agg);
      }
      if (e.transaction_side !== 'debit' && e.transaction_side !== 'credit') {
        throw new Error(`Unknown transaction side ${e.transaction_side}`);
      }
      if (e.transaction_side === 'debit') {
        agg.debits += Math.abs(amt);
      } else {
        agg.credits += Math.abs(amt);
      }

      agg.txCount++;
      agg.delta += amt;
    }

    // Return ordered by day to make roll-forward trivial
    return Array.from(map.values()).sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  private async buildDailySnapshots({
    companyUUID,
    coaId,
    openingBalance,
    dayAggregates,
    isBalSheetAccount,
    rangeStartYMD,
    rangeEndYMD,
    trx,
  }: {
    companyUUID: string;
    coaId: string;
    openingBalance: number;
    dayAggregates: DayAgg[];
    isBalSheetAccount: boolean;
    rangeStartYMD?: string;
    rangeEndYMD?: string;
    trx?: Knex.Transaction;
  }): Promise<Snapshot[]> {
    if (!dayAggregates.length && (!rangeStartYMD || !rangeEndYMD)) return [];

    const startDateYMD = rangeStartYMD ?? dayAggregates[0].day;
    const endDateYMD =
      rangeEndYMD ?? dayAggregates[dayAggregates.length - 1].day;

    function generateDateRange(start: string, end: string): string[] {
      if (!isValidYMD(start) || !isValidYMD(end) || start > end) {
        throw new Error(`Invalid date span: ${start}..${end}`);
      }
      const days: string[] = [];
      let c = start;

      while (c <= end) {
        days.push(c);
        c = addDaysToYMD(c, 1);
      }

      return days;
    }

    const dateRange = generateDateRange(startDateYMD, endDateYMD);
    const dayAggMap = new Map(dayAggregates.map((agg) => [agg.day, agg]));

    // Pre-fetch fiscal year starts for P&L accounts
    const fyStartSet = isBalSheetAccount
      ? new Set<string>()
      : await this.getFiscalYearStartSet({
          companyUUID,
          startYMD: startDateYMD,
          endYMD: endDateYMD,
          trx,
        });

    const rows = [];
    let running = openingBalance;

    for (const day of dateRange) {
      const a = dayAggMap.get(day) ?? {
        day,
        debits: 0,
        credits: 0,
        delta: 0,
        txCount: 0,
      };

      // Reset opening balance to zero for P&L accounts at fiscal year start
      const opening = !isBalSheetAccount && fyStartSet.has(day) ? 0 : running;
      const closing = opening + a.delta;

      if (!Number.isFinite(closing)) {
        throw new Error(`Non-finite closing on ${a.day}`);
      }

      rows.push({
        company_id: companyUUID,
        coa_id: coaId,
        day,
        opening_balance: opening,
        day_debits: a.debits,
        day_credits: a.credits,
        closing_balance: closing,
        transaction_count: a.txCount,
      });

      running = closing; // carry forward
    }

    return rows;
  }

  private async upsertDailySnapshots(rows: Snapshot[], trx?: Knex.Transaction) {
    if (!rows.length) return 0;
    const knex = trx ?? db;

    const tableName = 'gl_daily_balance_snapshots';
    const batchSize = 500;
    let updated = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      const res = await knex(tableName)
        .insert(batch)
        .onConflict(['company_id', 'coa_id', 'day'])
        .merge({
          opening_balance: knex.raw('excluded.opening_balance'),
          day_debits: knex.raw('excluded.day_debits'),
          day_credits: knex.raw('excluded.day_credits'),
          closing_balance: knex.raw('excluded.closing_balance'),
          transaction_count: knex.raw('excluded.transaction_count'),
          updated_at: knex.fn.now(),
        })
        // Only update when something actually changed to avoid bloat
        .whereRaw(
          `(${tableName}.opening_balance, ${tableName}.day_debits, ${tableName}.day_credits, ${tableName}.closing_balance, ${tableName}.transaction_count) IS DISTINCT FROM (excluded.opening_balance, excluded.day_debits, excluded.day_credits, excluded.closing_balance, excluded.transaction_count)`,
        )
        .returning('day');

      updated += res.length;
    }

    return updated;
  }

  async recomputePeriodBalances({
    companyUUID,
    coaId,
    startYMD,
    endYMD,
    periodTypes = ['monthly', 'quarterly', 'yearly'],
    trx,
  }: {
    companyUUID: string;
    coaId: string;
    startYMD: string; // YMD inclusive
    endYMD: string; // YMD inclusive
    periodTypes?: FiscalPeriodType[];
    trx?: Knex.Transaction;
  }) {
    if (!isValidYMD(startYMD) || !isValidYMD(endYMD) || startYMD > endYMD) {
      throw new Error(`Invalid range: ${startYMD}..${endYMD}`);
    }

    const exec = async (txn: Knex.Transaction) => {
      // Get relevant fiscal periods (include open and closed)
      const fiscalPeriods = await getFiscalCalendar({
        companyId: companyUUID,
        startYMD,
        endYMD,
        periodTypes,
        statuses: ['open', 'closed'],
        trx: txn,
      });

      if (fiscalPeriods.length === 0) {
        return { rowsUpserted: 0 };
      }

      //  Calculate the expanded date range covering all periods
      let minPeriodStart = fiscalPeriods[0].start_date;
      let maxPeriodEnd = fiscalPeriods[0].end_date;
      for (const p of fiscalPeriods) {
        if (p.start_date < minPeriodStart) minPeriodStart = p.start_date;
        if (p.end_date > maxPeriodEnd) maxPeriodEnd = p.end_date;
      }

      // 3) Load daily balances for the expanded range, normalize and index by day
      const dailyRows = await txn('gl_daily_balance_snapshots')
        .select(
          'company_id',
          'coa_id',
          'day',
          'opening_balance',
          'day_debits',
          'day_credits',
          'closing_balance',
          'transaction_count',
        )
        .where({ company_id: companyUUID, coa_id: coaId })
        .andWhereBetween('day', [minPeriodStart, maxPeriodEnd]);

      if (dailyRows.length === 0) {
        return { rowsUpserted: 0 };
      }

      // Normalize day to YMD (robust to Date/strings)
      const byDay = new Map<string, Omit<Snapshot, 'coa_id' | 'company_id'>>();
      for (const r of dailyRows) {
        const y = toYMD(r.day);
        byDay.set(y, {
          day: y,
          opening_balance: r.opening_balance,
          day_debits: r.day_debits,
          day_credits: r.day_credits,
          closing_balance: r.closing_balance,
          transaction_count: r.transaction_count,
        });
      }

      // Group daily balances by fiscal period and calculate aggregates
      const aggregates = [];
      for (const period of fiscalPeriods) {
        let d = period.start_date;

        let firstDay: string | null = null;
        let lastDay: string | null = null;
        let debits = 0;
        let credits = 0;
        let txCount = 0;

        while (d <= period.end_date) {
          const row = byDay.get(d);
          if (row) {
            if (!firstDay) firstDay = d;
            lastDay = d;
            debits += Number(row.day_debits || 0);
            credits += Number(row.day_credits || 0);
            txCount += Number(row.transaction_count || 0);
          }
          d = addDaysToYMD(d, 1);
        }

        if (!firstDay || !lastDay) continue;

        const firstRow = byDay.get(firstDay);
        const lastRow = byDay.get(lastDay);

        if (!firstRow || !lastRow) {
          throw new Error(
            `Missing daily balance data for period ${period.start_date}..${period.end_date}`,
          );
        }

        aggregates.push({
          company_id: companyUUID,
          coa_id: coaId,
          fiscal_year: period.fiscal_year,
          fiscal_period: period.period_number,
          period_type: period.period_type,
          period_start_date: period.start_date,
          period_end_date: period.end_date,
          opening_balance: this.toNumber(firstRow.opening_balance || 0),
          period_debits: debits,
          period_credits: credits,
          closing_balance: this.toNumber(lastRow.closing_balance || 0),
          transaction_count: txCount,
          created_at: txn.raw('NOW()'),
          updated_at: txn.raw('NOW()'),
        });
      }

      if (!aggregates.length) {
        return { rowsUpserted: 0 };
      }
      // Batch upsert the period balances
      await txn('gl_period_balances')
        .insert(aggregates)
        .onConflict([
          'company_id',
          'coa_id',
          'fiscal_year',
          'fiscal_period',
          'period_type',
        ])
        .merge({
          period_start_date: txn.raw('EXCLUDED.period_start_date'),
          period_end_date: txn.raw('EXCLUDED.period_end_date'),
          opening_balance: txn.raw('EXCLUDED.opening_balance'),
          period_debits: txn.raw('EXCLUDED.period_debits'),
          period_credits: txn.raw('EXCLUDED.period_credits'),
          closing_balance: txn.raw('EXCLUDED.closing_balance'),
          transaction_count: txn.raw('EXCLUDED.transaction_count'),
          updated_at: txn.raw('NOW()'),
        });

      return { rowsUpserted: aggregates.length };
    };

    if (trx) {
      return await exec(trx);
    } else {
      return await db.transaction(exec);
    }
  }

  /**
   * Update current GL balance
   */
  private async updateCurrentBalance({
    companyUUID,
    coaId,
    asOfYMD,
    trx,
  }: {
    companyUUID: string;
    coaId: string;
    asOfYMD: string;
    trx?: Knex.Transaction;
  }): Promise<void> {
    const knex = trx ?? db;

    const last = await knex('gl_daily_balance_snapshots')
      .select('closing_balance', 'day')
      .where({ company_id: companyUUID, coa_id: coaId })
      .andWhere('day', '<=', asOfYMD)
      .orderBy('day', 'desc')
      .first();

    if (!last) {
      return;
    }

    await knex('gl_current_balances')
      .insert({
        company_id: companyUUID,
        coa_id: coaId,
        as_of_time: knex.raw('NOW()'),
        reporting_currency_balance: Number(last.closing_balance || 0),
      })
      .onConflict(['company_id', 'coa_id'])
      .merge({
        as_of_time: knex.raw('GREATEST(gl_current_balances.as_of_time, NOW())'),
        reporting_currency_balance: Number(last.closing_balance || 0),
      });
  }

  private readonly SCALE = 3;
  private toNumber(value: string | number): number {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    const factor = 10 ** this.SCALE;
    return Math.round(num * factor) / factor;
  }
}

// Export singleton instance
export const glBalanceService = new GLBalanceService();
