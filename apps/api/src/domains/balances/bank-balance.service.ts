import type { Knex } from 'knex';
import {
  //   isBefore,
  //   addDays,
  //   format as dateFnsFormat,
  min,
} from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import pino from 'pino';

import { knexClient as db } from '../../db/knexClient.js';
import { getSystemUser } from '../users/users.model.js';
import { bankBalanceRecalcParamsSchema } from './balances.types.js';
import { setBankOpeningBalance } from './opening-balance/opening-balance.service.js';

import type {
  BalanceRecalcResult,
  BankBalanceRecalcParams,
  CompanyContext,
} from './balances.types.js';
import type { BankOpeningBalanceOrigin } from './opening-balance/opening-balance.types.js';

export interface ChooseOpeningInput {
  knex: Queryable;
  companyId: string;
  bankAccountId: string;
  bankAccountCoaId?: string; // required for GL snapshot candidates
  companyTz: string; // e.g., 'Africa/Lagos'
  targetDay: string; // usually params.recalcFrom (YYYY-MM-DD)
}

interface BalanceCheckpoint {
  source: 'opening_balance' | 'snapshot';
  asOfDate: string; // Balance as of end-of-day (YYYY-MM-DD)
  amount: number;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  distanceDays: number;
  id?: string;
  origin?: BankOpeningBalanceOrigin;
}

export interface BankTransactionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  txnAt: string; // ISO timestamp
  amount: number; // signed
  absoluteAmount: number;
  payee?: string | null;
  reference?: string | null;
  description?: string | null;
}

interface DailyMovement {
  day: string; // YYYY-MM-DD
  moneyOut: number;
  moneyIn: number;
  transactionCount: number;
}

interface DailySnapshot {
  bankAccountId?: string;
  day: string; // YYYY-MM-DD
  openingBalance: number;
  moneyOut: number;
  moneyIn: number;
  closingBalance: number;
  transactionCount: number;
}

type RecalcMode = 'forward' | 'backsolve' | 'full_rebuild';

export interface ValidationIssue {
  day?: string;
  code:
    | 'MATH_MISMATCH'
    | 'OPENING_MISMATCH'
    | 'NEGATIVE_COUNT'
    | 'NAN_OR_INF'
    | 'DAY_GAP'
    | 'DAY_ORDER'
    | 'MISSING_DAYS'
    | 'CHECKPOINT_MISMATCH_START'
    | 'CHECKPOINT_MISMATCH_END';
  message: string;
}

const logger = pino();

type Queryable = Knex | Knex.Transaction;

// Constants for balance calculations
const EPS = 1e-6; // Floating point precision threshold

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
  /**
   * Main entry point for bank balance recalculation
   *
   * This method orchestrates the entire balance recalculation process:
   * 1. Validates input parameters
   * 2. Finds the best starting balance checkpoint
   * 3. Determines recalculation window and direction
   * 4. Fetches and processes transactions
   * 5. Calculates daily balance snapshots
   * 6. Validates and persists results
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

    const {
      companyId,
      bankAccountId,
      recalcFrom,
      recalcTo,
      triggeredBy,
      userId,
    } = validationResult.data;

    logger.info(
      {
        companyId,
        bankAccountId,
        recalcFrom,
        triggeredBy,
      },
      'Starting bank balance recalculation',
    );

    // Find the best starting balance checkpoint (opening balance or existing snapshot)
    // This determines our starting point for the recalculation

    try {
      const fromDay = formatDateToYMD(recalcFrom);
      const context = await this.getCompanyContext(companyId);

      let todayYmdString;
      try {
        const tz = context.defaultTimezone || 'UTC';
        todayYmdString = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
      } catch (error) {
        todayYmdString = new Date().toISOString().split('T')[0];
      }

      return await db.transaction(async (trx) => {
        // Identify the best starting balance & coverage window
        const startingPoint = await this.findBestBalanceCheckpoint({
          companyId,
          bankAccountId,
          recalcFrom: fromDay,
          trx,
        });

        if (!startingPoint) {
          throw new Error('No starting balance checkpoint found');
        }

        // Decide recalculation direction, start/end dates
        const recalcWindow = this.determineRecalcWindow({
          recalcFrom: fromDay,
          recalcTo: recalcTo ? formatDateToYMD(recalcTo) : undefined,
          companyTz: context.defaultTimezone,
          checkpoint: startingPoint,
        });

        // Retrieve all transactions affecting that range
        const transactions = await this.fetchBankTransactionsInWindow({
          bankAccountId,
          startDate: recalcWindow.startDate,
          endDate: recalcWindow.endDate,
          trx,
        });

        // Compute per-day movement and daily balances
        const movements = this.buildDailyMovements({
          transactions,
          startDate: recalcWindow.startDate,
          endDate: recalcWindow.endDate,
        });

        let snapshots: DailySnapshot[] = [];

        if (
          recalcWindow.mode === 'forward' ||
          recalcWindow.mode === 'full_rebuild'
        ) {
          snapshots = this.rollForwardDailyBalances(
            recalcWindow.openingBalance,
            movements,
          );
        } else if (recalcWindow.mode === 'backsolve') {
          snapshots = this.rollBackwardDailyBalances(
            recalcWindow.openingBalance,
            movements,
          );
        }

        // Validate the snapshots are continuous and consistent
        const validationResult = this.validateSnapshotContinuity({
          snapshots,
          startDate: recalcWindow.startDate,
          endDate: recalcWindow.endDate,
        });

        if (!validationResult.ok) {
          throw new Error(
            `Continuity validation failed: ${JSON.stringify(validationResult.issues)}`,
          );
        }

        // // Optional: reconcile against the chosen checkpoint for extra safety
        // const cpValidation = this.validateAgainstCheckpoint({
        //   snapshots,
        //   mode: recalcWindow.mode,
        //   checkpoint: startingPoint, // from Step 1
        //   startDate: recalcWindow.startDate,
        //   endDate: recalcWindow.endDate,
        // });
        // if (!cpValidation.ok) {
        //   throw new Error(
        //     `Checkpoint validation failed: ${JSON.stringify(cpValidation.issues)}`,
        //   );
        // }

        // Persist the snapshots to the database idempotently
        await this.persistDailySnapshots({
          companyId,
          bankAccountId,
          snapshots,
          trx,
        });

        // For backsolve mode, create an opening balance checkpoint to help future recalcs
        if (recalcWindow.mode === 'backsolve' && snapshots.length > 0) {
          const firstSnapshot = snapshots[0];
          let userIdentifier;
          if (userId) {
            userIdentifier = userId;
          } else {
            const systemUser = await getSystemUser({ trx });
            if (!systemUser) {
              throw new Error('System user not found');
            }
            userIdentifier = systemUser.id;
          }

          await setBankOpeningBalance({
            params: {
              bank_account_id: bankAccountId,
              amount: Number(firstSnapshot.openingBalance),
              coverage_start: new Date(firstSnapshot.day),
              coverage_end: new Date(recalcWindow.endDate),
              origin: 'system_calculated',
              role: 'checkpoint',
            },
            userId: userIdentifier,
            trx,
          });
        }

        // if (!recalcTo || recalcTo === todayYmdString) {
        await this.refreshCurrentBalance({
          companyId,
          bankAccountId,
          companyTz: context.defaultTimezone,
          lastSnapshot: snapshots.length
            ? snapshots[snapshots.length - 1]
            : null,
          recalcEndDate: recalcWindow.endDate,
          trx,
        });

        // Return the result
        return {
          daysProcessed: snapshots.length,
          snapshotsCreated: snapshots.length,
          finalBalance:
            snapshots.length > 0
              ? Number(
                  snapshots[snapshots.length - 1].closingBalance.toFixed(10),
                )
              : 0,
          lastProcessedDate:
            snapshots.length > 0
              ? snapshots[snapshots.length - 1].day
              : recalcFrom,
        } satisfies BalanceRecalcResult;
      });
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
   * Get company context including timezone and reporting currency
   * Used for timezone-aware date calculations
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
   * Find the best starting balance checkpoint for recalculation
   *
   * Searches for opening balances and snapshots, prioritizing:
   * 1. User-converted opening balances (highest priority)
   * 2. System-calculated opening balances
   * 3. Existing snapshots
   *
   * Returns the closest checkpoint before or at the recalc date
   */
  private async findBestBalanceCheckpoint({
    companyId,
    bankAccountId,
    recalcFrom,
    trx,
  }: {
    companyId: string;
    bankAccountId: string;
    recalcFrom: string; // ISO date string in company timezone
    trx?: Knex.Transaction;
  }): Promise<BalanceCheckpoint | null> {
    const knex = trx || db;

    const [
      pastOpeningBalance,
      futureOpeningBalance,
      pastSnapshot,
      futureSnapshot,
    ] = await Promise.all([
      knex('bank_account_opening_balances')
        .where({ bank_account_id: bankAccountId, is_deleted: false })
        .andWhere('as_of_date', '<', recalcFrom)
        .orderBy('as_of_date', 'desc')
        .limit(1),

      knex('bank_account_opening_balances')
        .where({ bank_account_id: bankAccountId, is_deleted: false })
        .andWhere('as_of_date', '>=', recalcFrom)
        .orderBy('as_of_date', 'asc')
        .limit(1),

      knex('bank_account_daily_native_snapshots')
        .select<
          { day: string; closing_balance: string | number }[]
        >('day', 'closing_balance')
        .where({ company_id: companyId, bank_account_id: bankAccountId })
        .andWhere('day', '<', recalcFrom)
        .orderBy('day', 'desc')
        .limit(1),

      knex('bank_account_daily_native_snapshots')
        .select<
          { day: string; closing_balance: string | number }[]
        >('day', 'closing_balance')
        .where({ company_id: companyId, bank_account_id: bankAccountId })
        .andWhere('day', '>=', recalcFrom)
        .orderBy('day', 'asc')
        .limit(1),
    ]);

    const openingBalances = [...pastOpeningBalance, ...futureOpeningBalance];
    const nativeSnapshots = [...pastSnapshot, ...futureSnapshot];

    const candidates: BalanceCheckpoint[] = [];

    // Opening balances (native currency)
    if (openingBalances.length > 0) {
      for (const ob of openingBalances) {
        const date = formatDateToYMD(ob.as_of_date);
        const dist = daysDiff(date, recalcFrom);

        candidates.push({
          source: 'opening_balance',
          asOfDate: date,
          amount: Number(ob.amount),
          coverageStart: ob.coverage_start,
          coverageEnd: ob.coverage_end,
          distanceDays: dist,
          origin: ob.origin,
          id: ob.id,
        });
      }
    }

    if (nativeSnapshots.length > 0) {
      // Add GL snapshot candidates (already ordered by distance from database)
      for (const s of nativeSnapshots) {
        const date = formatDateToYMD(s.day);
        const dist = daysDiff(date, recalcFrom);

        candidates.push({
          source: 'snapshot',
          asOfDate: date,
          amount: Number(s.closing_balance),
          distanceDays: dist,
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Prefer candidates on/before fromDate; if none, allow future pool
    const strictlyPast = candidates.filter(
      (c) => formatDateToYMD(c.asOfDate) < formatDateToYMD(recalcFrom),
    );
    const pool = strictlyPast.length ? strictlyPast : candidates;

    // Priority: OB(user_conversion) > OB(system_calculated) > native_snapshot
    const priority = (c: BalanceCheckpoint): number => {
      if (c.source === 'opening_balance' && c.origin === 'user_entered')
        return 0;
      if (c.source === 'opening_balance' && c.origin === 'system_calculated')
        return 1;
      if (c.source === 'snapshot') return 2;
      return 2; // gl
    };

    pool.sort((a, b) => {
      const pa = priority(a),
        pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (strictlyPast.length) return b.asOfDate.localeCompare(a.asOfDate); // later past wins
      return a.asOfDate.localeCompare(b.asOfDate); // earlier future wins
    });

    return pool[0];
  }

  /**
   * Determine the recalculation window and direction
   *
   * Three modes:
   * - forward: Checkpoint before start date, calculate forward
   * - backsolve: Checkpoint after start date, calculate backward
   * - full_rebuild: No checkpoint, start from zero
   */
  private determineRecalcWindow({
    recalcFrom,
    recalcTo,
    companyTz,
    checkpoint,
  }: {
    recalcFrom: string;
    recalcTo?: string;
    companyTz: string;
    checkpoint: BalanceCheckpoint | null;
  }): {
    mode: RecalcMode;
    startDate: string;
    endDate: string;
    openingBalance: number;
    note?: string;
  } {
    const todayStr = formatInTimeZone(new Date(), companyTz, 'yyyy-MM-dd');

    const endDate = recalcTo
      ? min([new Date(recalcTo), new Date(todayStr)])
      : new Date(todayStr);
    const endStr = formatInTimeZone(endDate, companyTz, 'yyyy-MM-dd');

    // CASE 1: No checkpoint found - start from zero
    if (!checkpoint) {
      return {
        mode: 'full_rebuild',
        startDate: recalcFrom,
        endDate: endStr,
        openingBalance: 0,
        note: 'No checkpoints found. Starting fresh from requested start date.',
      };
    }

    const checkpointDate = checkpoint.asOfDate;

    // CASE 2: Checkpoint is before start date - calculate forward
    if (new Date(checkpointDate) < new Date(recalcFrom)) {
      // const nextDay = addDays(new Date(checkpointDate), 1);
      const checkpointDateObj = new Date(checkpointDate);
      const recalcFromDate = new Date(recalcFrom);
      const nextDay = new Date(checkpointDateObj.getTime() + 86400000);

      const start =
        nextDay < recalcFromDate
          ? recalcFrom
          : formatInTimeZone(nextDay, companyTz, 'yyyy-MM-dd');

      return {
        mode: 'forward',
        startDate: start,
        endDate: endStr,
        openingBalance: checkpoint.amount,
        note: `Using checkpoint on ${checkpointDate}. Starting forward from ${start}.`,
      };
    }

    // CASE 3: Checkpoint is after start date - calculate backward (backsolve)
    return {
      mode: 'backsolve',
      startDate: recalcFrom,
      endDate: checkpointDate,
      openingBalance: checkpoint.amount, // closing at endDate — orchestrator will backsolve
      note: `Checkpoint is after requested start (${checkpointDate}). Need backsolve from ${recalcFrom} → ${checkpointDate}.`,
    };
  }

  /**
   * Fetch all bank transactions within the specified date window
   * Returns transactions ordered by date and transaction time
   */
  private async fetchBankTransactionsInWindow({
    bankAccountId,
    startDate,
    endDate,
    trx,
  }: {
    bankAccountId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    trx?: Knex.Transaction;
  }): Promise<BankTransactionRecord[]> {
    const knex = trx || db;

    // Defensive check: endDate must be >= startDate
    if (startDate > endDate) {
      throw new Error(
        `Invalid range: startDate (${startDate}) is after endDate (${endDate})`,
      );
    }

    const rows = await knex('bank_transactions as t')
      .select<
        BankTransactionRecord[]
      >(['t.id', 't.date', 't.txn_at as txnAt', 't.amount', 't.absolute_amount as absoluteAmount', 't.payee', 't.reference', 't.description'])
      .where('t.bank_account_id', bankAccountId)
      .andWhere('t.is_deleted', false)
      .andWhereBetween('t.date', [startDate, endDate])
      .orderBy(['t.date', 't.txn_at']);

    return rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      absoluteAmount: Number(r.absoluteAmount),
    }));
  }

  /**
   * Build daily movement summary from transactions
   * Groups transactions by day and calculates money in/out totals
   */
  private buildDailyMovements({
    transactions,
    startDate,
    endDate,
  }: {
    transactions: BankTransactionRecord[];
    startDate: string;
    endDate: string;
  }): DailyMovement[] {
    const map = new Map<
      string,
      { moneyIn: number; moneyOut: number; count: number }
    >();

    for (const tx of transactions) {
      const day = formatDateToYMD(tx.date);
      let bucket = map.get(day);
      if (!bucket) {
        bucket = { moneyIn: 0, moneyOut: 0, count: 0 };
        map.set(day, bucket);
      }

      if (tx.amount > 0) {
        bucket.moneyIn += tx.amount;
      } else {
        bucket.moneyOut += Math.abs(tx.amount);
      }

      bucket.count++;
    }

    // Emit a row for every day in the window (even if no txns)
    const movements: DailyMovement[] = [];
    for (const day of daysInclusive(startDate, endDate)) {
      const b = map.get(day);
      movements.push({
        day,
        moneyOut: b?.moneyOut ?? 0,
        moneyIn: b?.moneyIn ?? 0,
        transactionCount: b?.count ?? 0,
      });
    }
    return movements;
  }

  /**
   * Calculate daily balance snapshots by rolling forward from opening balance
   * Used for forward and full_rebuild modes
   */
  private rollForwardDailyBalances(
    openingAtStartDate: number,
    movements: DailyMovement[],
  ): DailySnapshot[] {
    if (movements.length === 0) return [];

    // Ensure sorted
    if (movements.some((m, i) => i && m.day < movements[i - 1].day)) {
      movements.sort((a, b) => a.day.localeCompare(b.day));
    }

    const output: DailySnapshot[] = [];
    let runningBalance = openingAtStartDate;

    for (const m of movements) {
      const opening = runningBalance;
      const closing = runningBalance + m.moneyIn - m.moneyOut;
      output.push({
        day: m.day,
        openingBalance: opening,
        moneyOut: m.moneyOut,
        moneyIn: m.moneyIn,
        closingBalance: closing,
        transactionCount: m.transactionCount,
      });

      runningBalance = closing;
    }
    return output;
  }

  /**
   * Calculate daily balance snapshots by rolling backward from closing balance
   * Used for backsolve mode when checkpoint is after the start date
   */
  private rollBackwardDailyBalances(
    closingAtEndDate: number,
    movements: DailyMovement[],
  ): DailySnapshot[] {
    if (movements.length === 0) return [];
    // Ensure sorted asc; we’ll traverse reverse
    if (movements.some((m, i) => i && m.day < movements[i - 1].day)) {
      movements.sort((a, b) => a.day.localeCompare(b.day));
    }

    const outRev: DailySnapshot[] = [];
    let closing = closingAtEndDate;

    for (let i = movements.length - 1; i >= 0; i--) {
      const m = movements[i];
      const opening = closing - m.moneyIn + m.moneyOut;
      outRev.push({
        day: m.day,
        openingBalance: opening,
        moneyOut: m.moneyOut,
        moneyIn: m.moneyIn,
        closingBalance: closing,
        transactionCount: m.transactionCount,
      });

      closing = opening;
    }

    // Return in chronological order
    return outRev.reverse();
  }

  /**
   * Persist daily balance snapshots to database
   * Uses upsert to handle conflicts and processes in chunks for performance
   */
  private async persistDailySnapshots({
    companyId,
    bankAccountId,
    snapshots,
    trx,
    chunkSize = 1000,
  }: {
    companyId: string;
    bankAccountId: string;
    snapshots: DailySnapshot[];
    trx?: Knex.Transaction;
    chunkSize?: number;
  }) {
    const knex = trx || db;

    const sanityCheck: string[] = [];
    for (const s of snapshots) {
      // the table has a CHECK constraint; this prevents hard failures before insert
      if (
        Math.abs(s.openingBalance + s.moneyIn - s.moneyOut - s.closingBalance) >
        1e-9
      ) {
        sanityCheck.push(
          `Math check failed for ${s.day}: opening + credits - debits != closing`,
        );
      }
    }

    if (sanityCheck.length > 0) {
      throw new Error(`Sanity check failed: ${sanityCheck.join(', ')}`);
    }

    // columns we update on conflict
    const updateColumns = [
      'opening_balance',
      'money_out',
      'money_in',
      'closing_balance',
      'transaction_count',
    ];

    const tableName = 'bank_account_daily_native_snapshots';

    // WHERE clause to skip updates when nothing changed (null-safe)
    const whereClause = `${tableName}.opening_balance IS DISTINCT FROM EXCLUDED.opening_balance OR
    ${tableName}.money_out IS DISTINCT FROM EXCLUDED.money_out OR
    ${tableName}.money_in IS DISTINCT FROM EXCLUDED.money_in OR
    ${tableName}.closing_balance IS DISTINCT FROM EXCLUDED.closing_balance OR
    ${tableName}.transaction_count IS DISTINCT FROM EXCLUDED.transaction_count
    `;

    // Insert in chunks to keep each statement manageable
    for (let i = 0; i < snapshots.length; i += chunkSize) {
      const chunk = snapshots.slice(i, i + chunkSize);
      const rows = chunk.map((s) => ({
        company_id: companyId,
        bank_account_id: bankAccountId,
        day: s.day,
        opening_balance: s.openingBalance,
        money_out: s.moneyOut,
        money_in: s.moneyIn,
        closing_balance: s.closingBalance,
        transaction_count: s.transactionCount,
      }));

      await knex(tableName)
        .insert(rows)
        .onConflict(['company_id', 'bank_account_id', 'day'])
        .merge(updateColumns)
        .whereRaw(whereClause);
    }
  }

  /**
   * Update the current balance for the bank account
   * Calculates balance from last snapshot + any transactions after
   */
  private async refreshCurrentBalance({
    companyId,
    bankAccountId,
    companyTz,
    lastSnapshot,
    recalcEndDate,
    trx,
  }: {
    companyId: string;
    bankAccountId: string;
    companyTz?: string;
    lastSnapshot: DailySnapshot | null;
    recalcEndDate: string;
    trx: Knex.Transaction;
  }): Promise<void> {
    let today;
    try {
      const tz = companyTz || 'UTC';
      today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
    } catch (error) {
      today = new Date().toISOString().split('T')[0];
    }

    // Verify recalcEndDate is a valid date
    const recalcEndDateObj = new Date(recalcEndDate);
    if (isNaN(recalcEndDateObj.getTime())) {
      throw new Error(`Invalid recalcEndDate: ${recalcEndDate}`);
    }

    let latestSnapshot = lastSnapshot;
    if (!latestSnapshot || latestSnapshot.day < today) {
      latestSnapshot = await this.getLatestSnapshotUpToDay({
        companyId,
        bankAccountId,
        day: today,
        trx,
      });
    }

    if (!latestSnapshot) {
      await this.updateCurrentBalance({
        companyId,
        bankAccountId,
        balance: 0,
        client: trx,
      });
      return;
    }

    if (latestSnapshot.day === today && recalcEndDate === today) {
      await this.updateCurrentBalance({
        companyId,
        bankAccountId,
        balance: latestSnapshot.closingBalance,
        client: trx,
      });
      return;
    }

    const netTail = await this.getTransactionNetAfterDay({
      bankAccountId,
      fromDayExclusive: latestSnapshot.day,
      toDayInclusive: today,
      trx,
    });

    const currentBalance = this.toNumber(
      Number(latestSnapshot.closingBalance) + netTail,
    );

    await this.updateCurrentBalance({
      companyId,
      bankAccountId,
      balance: currentBalance,
      client: trx,
    });
  }

  /**
   * Update the current balance record for a bank account
   * Uses upsert to handle conflicts
   */
  async updateCurrentBalance({
    companyId,
    bankAccountId,
    balance,
    asOf,
    client = db,
  }: {
    companyId: string;
    bankAccountId: string;
    balance: number;
    asOf?: Date;
    client: Queryable;
  }): Promise<void> {
    const now = asOf ?? new Date();

    await client('bank_account_current_native_balances')
      .insert({
        company_id: companyId,
        bank_account_id: bankAccountId,
        native_balance: this.toNumber(balance).toFixed(10),
        as_of_time: now,
      })
      .onConflict(['company_id', 'bank_account_id'])
      .merge({
        native_balance: this.toNumber(balance).toFixed(10),
        as_of_time: now,
      });
  }

  /**
   * Get the latest daily snapshot up to a specific day
   * Used to find the most recent balance before calculating current balance
   */
  private async getLatestSnapshotUpToDay({
    companyId,
    bankAccountId,
    day,
    trx,
  }: {
    companyId: string;
    bankAccountId: string;
    day: string;
    trx?: Knex.Transaction;
  }): Promise<DailySnapshot | null> {
    const knex = trx || db;
    const snapshot = await knex('bank_account_daily_native_snapshots')
      .select(
        'company_id',
        'bank_account_id',
        'day',
        'opening_balance',
        'money_out',
        'money_in',
        'closing_balance',
        'transaction_count',
      )
      .where('company_id', companyId)
      .where('bank_account_id', bankAccountId)
      .andWhere('day', '<=', day)
      .orderBy('day', 'desc')
      .first();

    if (!snapshot) return null;

    return {
      bankAccountId: snapshot.bank_account_id,
      day: snapshot.day,
      openingBalance: Number(snapshot.opening_balance),
      moneyOut: Number(snapshot.money_out),
      moneyIn: Number(snapshot.money_in),
      closingBalance: Number(snapshot.closing_balance),
      transactionCount: Number(snapshot.transaction_count),
    };
  }

  /**
   * Calculate net transaction amount between two dates
   * Used to update current balance from last snapshot
   */
  private async getTransactionNetAfterDay({
    bankAccountId,
    fromDayExclusive,
    toDayInclusive,
    trx,
  }: {
    bankAccountId: string;
    fromDayExclusive: string;
    toDayInclusive: string;
    trx?: Knex.Transaction;
  }): Promise<number> {
    // if (isAfter(parseISO(fromDayExclusive), parseISO(toDayInclusive))) {
    if (fromDayExclusive > toDayInclusive) {
      return 0;
    }

    const knex = trx || db;

    const result = await knex('bank_transactions')
      .where('bank_account_id', bankAccountId)
      .andWhere('is_deleted', false)
      .andWhere('date', '>', fromDayExclusive)
      .andWhere('date', '<=', toDayInclusive)
      .sum<{ net: string | number }>('amount as net')
      .first();

    return this.toNumber(Number(result?.net ?? 0));
  }

  /**
   * Convert value to number with proper precision
   * Matches database NUMERIC(32, 10) precision
   */
  private toNumber(value: string | number): number {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    // Match database precision: NUMERIC(32, 10) = 10 decimal places
    return Math.round(num * 1e10) / 1e10;
  }

  // /**
  //  * Validate and normalize date or date string to YYYY-MM-DD format
  //  * Handles both date-only and ISO datetime strings
  //  */
  // private validateAndNormalizeDate(dateInput: string): string {
  //   // Handle ISO datetime strings (YYYY-MM-DDTHH:mm:ss.sssZ)
  //   const dateOnly = dateInput.split('T')[0];

  //   // Validate format
  //   const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  //   if (!dateRegex.test(dateOnly)) {
  //     throw new Error(
  //       `Invalid date format: "${dateInput}". Expected YYYY-MM-DD format (e.g., "2024-01-15")`,
  //     );
  //   }

  //   // Validate it's a real date
  //   const parsed = new Date(dateOnly);
  //   if (isNaN(parsed.getTime())) {
  //     throw new Error(
  //       `Invalid date: "${dateInput}". Date does not exist (e.g., "2024-13-45" is invalid)`,
  //     );
  //   }

  //   return dateOnly;
  // }

  /**
   * Validate that daily snapshots are continuous and mathematically correct
   * Checks for gaps, ordering issues, and math errors
   */
  private validateSnapshotContinuity({
    snapshots,
    startDate,
    endDate,
  }: {
    snapshots: DailySnapshot[];
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
  }): { ok: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    if (!snapshots.length) {
      issues.push({
        code: 'MISSING_DAYS',
        message: `No snapshots produced for ${startDate}..${endDate}`,
      });
      return { ok: false, issues };
    }

    // Check ordering, gaps, and per-row sanity
    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];

      const nums = [s.openingBalance, s.moneyOut, s.moneyIn, s.closingBalance];

      if (nums.some((n) => !Number.isFinite(n))) {
        issues.push({
          day: s.day,
          code: 'NAN_OR_INF',
          message: 'Found NaN/Infinity value(s).',
        });
      }

      if (!Number.isInteger(s.transactionCount) || s.transactionCount < 0) {
        issues.push({
          day: s.day,
          code: 'NEGATIVE_COUNT',
          message: `Invalid transactionCount=${s.transactionCount}.`,
        });
      }

      // per-row math
      const expected = s.openingBalance + s.moneyIn - s.moneyOut;
      const diff = Math.abs(expected - s.closingBalance);
      if (diff > EPS) {
        issues.push({
          day: s.day,
          code: 'MATH_MISMATCH',
          message: `Row ${i} math failed: opening + credits - debits != closing (expected=${expected}, got=${s.closingBalance})`,
        });
      }

      // order and gaps
      if (i > 0) {
        const prev = snapshots[i - 1];
        const gap = daysDiff(prev.day, s.day);

        if (gap < 1) {
          issues.push({
            day: s.day,
            code: 'DAY_ORDER',
            message: `Days not strictly increasing: prev=${prev.day}, curr=${s.day}`,
          });
        } else if (gap > 1) {
          issues.push({
            day: s.day,
            code: 'DAY_GAP',
            message: `Gap of ${gap - 1} missing day(s) between ${prev.day} and ${s.day}`,
          });
        }

        // continuity check opening = prev closing
        if (Math.abs(s.openingBalance - prev.closingBalance) > EPS) {
          issues.push({
            day: s.day,
            code: 'OPENING_MISMATCH',
            message: `Opening(${s.day}) != Closing(${prev.day}) (diff=${s.openingBalance - prev.closingBalance})`,
          });
        }
      }
    }

    // // Check window coverage: first/last day align to expected
    // const firstDay = snapshots[0].day;
    // const lastDay = snapshots[snapshots.length - 1].day;
    // if (firstDay !== startDate || lastDay !== endDate) {
    //   issues.push({
    //     code: 'MISSING_DAYS',
    //     message: `Output window ${firstDay}..${lastDay} does not match requested ${startDate}..${endDate}`,
    //   });
    // }

    return { ok: issues.length === 0, issues };
  }

  /**
   * Reconcile with a checkpoint on either end.
   * - If mode='forward'/'full_rebuild': first-day opening should match checkpoint if the checkpoint is exactly startDate-1 (closing).
   * - If mode='backsolve': last-day closing should equal the checkpoint closing at endDate.
   */
  private validateAgainstCheckpoint({
    snapshots,
    mode,
    checkpoint,
    startDate,
    endDate,
  }: {
    snapshots: DailySnapshot[];
    mode: RecalcMode;
    checkpoint: BalanceCheckpoint | null;
    startDate: string;
    endDate: string;
  }): { ok: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    if (!checkpoint) return { ok: true, issues };

    if (mode === 'backsolve') {
      // endDate should equal checkpoint.asOfDate
      if (endDate !== checkpoint.asOfDate) {
        issues.push({
          code: 'CHECKPOINT_MISMATCH_END',
          message: `Backsolve endDate ${endDate} != checkpoint.asOfDate ${checkpoint.asOfDate}`,
        });
      } else {
        const last = snapshots[snapshots.length - 1];
        if (Math.abs(last.closingBalance - checkpoint.amount) > EPS) {
          issues.push({
            day: endDate,
            code: 'CHECKPOINT_MISMATCH_END',
            message: `Closing(${endDate}) ${last.closingBalance} != checkpoint.amount ${checkpoint.amount}`,
          });
        }
      }
    } else {
      // forward/full_rebuild: if checkpoint is exactly startDate-1, opening should equal checkpoint closing
      const expectedPrev = formatDateToYMD(
        new Date(new Date(startDate).getTime() - 86400000),
      );

      if (checkpoint.asOfDate === expectedPrev) {
        const first = snapshots[0];
        if (Math.abs(first.openingBalance - checkpoint.amount) > EPS) {
          issues.push({
            day: startDate,
            code: 'CHECKPOINT_MISMATCH_START',
            message: `Opening(${startDate}) ${first.openingBalance} != checkpoint(${expectedPrev}) ${checkpoint.amount}`,
          });
        }
      }
    }

    return { ok: issues.length === 0, issues };
  }
}

// Export singleton instance
export const bankBalanceService = new BankBalanceService();

// function parseYMD(ymd: string): Date {
//   const [y, m, d] = ymd.split('-').map(Number);
//   return new Date(y, m - 1, d);
// }

// function formatYMD(date: Date): string {
//   const y = date.getFullYear();
//   const m = String(date.getMonth() + 1).padStart(2, '0');
//   const d = String(date.getDate()).padStart(2, '0');
//   return `${y}-${m}-${d}`;
// }

// // "Today" as YYYY-MM-DD in the company's timezone
// function todayYMDInTz(tz: string): string {
//   const zoned = toZonedTime(new Date(), tz);
//   return dateFnsFormat(zoned, 'yyyy-MM-dd');
// }

/**
 * Generator function that yields all days inclusive between fromDate and toDate
 * @param fromDate - The start date in YYYY-MM-DD format
 * @param toDate - The end date in YYYY-MM-DD format
 * @returns A generator that yields all days inclusive between fromDate and toDate
 */
function* daysInclusive(fromDate: string, toDate: string): Generator<string> {
  const d = new Date(fromDate);
  const end = new Date(toDate);

  while (d <= end) {
    yield formatDateToYMD(d);
    d.setDate(d.getDate() + 1);
  }
}

// function daysDiff(a: string, b: string): number {
//   return Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86400000);
// }

export function formatDateToYMD(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysDiff(a: Date | string, b: Date | string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    throw new Error('Invalid date input');
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((d2.getTime() - d1.getTime()) / msPerDay);
}
