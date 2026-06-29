import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { AppError } from '../../shared/utils/response.utils.js';
import {
  buildMonetaryMap,
  prefetchMonetaryCoaIds,
} from '../chart-of-accounts/coa-monetary.js';
import {
  processFxPositionsParamsSchema,
  reverseFxPositionMovementsParamsSchema,
  upsertFxPositionParamsSchema,
} from './fx.types.js';

import type {
  DetermineMonetaryEntriesParams,
  DetermineMonetaryResult,
  FxTransactionIdGenerator,
  MonetaryEntry,
  ProcessFxPositionsParams,
  ProcessFxPositionsResult,
  ReverseFxPositionMovementsParams,
  UpsertFxPositionParams,
} from './fx.types.js';

const FX_AMOUNT_SCALE = 3;

type FxPositionRow = {
  id: string;
  company_id: string;
  fx_transaction_id: string;
  account_id: string;
  foreign_currency_id: string;
  open_fx_amount: string | number;
  carrying_rate: string | number;
  carrying_base_amount: string | number;
  state: 'open' | 'closed';
  metadata: Record<string, unknown> | null;
};

type FxMovementRow = {
  id: string;
  company_id: string;
  fx_position_id: string;
  fx_transaction_id: string;
  account_id: string;
  foreign_currency_id: string;
  source_type: string;
  source_id: string | null;
  ledger_transaction_id: string | null;
  ledger_entry_id: string | null;
  movement_type: string;
  movement_date: string | Date;
  foreign_amount_delta: string | number;
  base_amount_delta: string | number;
  rate: string | number;
  created_by_id: string;
};

function roundFxAmount(value: number): number {
  const factor = 10 ** FX_AMOUNT_SCALE;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toDbAmount(value: number): string {
  return roundFxAmount(value).toFixed(FX_AMOUNT_SCALE);
}

function movementTypeForDelta({
  existing,
  foreignDelta,
  openAfter,
  override,
}: {
  existing: FxPositionRow | undefined;
  foreignDelta: number;
  openAfter: number;
  override?: UpsertFxPositionParams['movement_type'];
}): NonNullable<UpsertFxPositionParams['movement_type']> {
  if (override) return override;
  if (!existing) return 'opened';
  if (openAfter === 0) return 'fully_settled';

  const openBefore = Number(existing.open_fx_amount);
  const sameDirection =
    openBefore === 0 || Math.sign(openBefore) === Math.sign(foreignDelta);
  const exposureIncreased =
    sameDirection && Math.abs(openAfter) > Math.abs(openBefore);

  return exposureIncreased ? 'increased' : 'partially_settled';
}

/**
 * Determine which entries are monetary (create FX exposure).
 *
 * @deprecated Use `prefetchMonetaryCoaIds` and `buildMonetaryMap` from
 * `chart-of-accounts/coa-monetary` instead.
 */
export async function determineMonetaryEntries(
  params: DetermineMonetaryEntriesParams,
): Promise<DetermineMonetaryResult> {
  const { entries, companyId, reportingCurrencyId, trx } = params;

  if (entries.length === 0) {
    return {
      monetaryMap: new Map(),
      monetaryEntries: [],
    };
  }

  const monetaryCoaIds = await prefetchMonetaryCoaIds(
    companyId,
    entries.map((e) => e.coa_id),
    trx,
  );
  const monetaryMap = buildMonetaryMap(
    entries,
    reportingCurrencyId,
    monetaryCoaIds,
  );

  const monetaryEntries: Array<{ index: number; entry: MonetaryEntry }> = [];
  for (let i = 0; i < entries.length; i++) {
    if (!monetaryMap.get(i)) continue;
    const entry = entries[i]!;
    monetaryEntries.push({
      index: i,
      entry: {
        coa_id: entry.coa_id,
        source_currency_id: entry.source_currency_id,
        source_amount: 0,
        amount: 0,
        is_monetary: true,
      },
    });
  }

  return { monetaryMap, monetaryEntries };
}

/**
 * Create or update an FX position
 *
 * If position exists:
 * - Updates open_fx_amount += source_amount (sign-aware)
 * - Updates carrying_base_amount += amount
 * - Updates carrying_rate to latest rate
 * - Closes position if open_fx_amount becomes 0
 *
 * If position doesn't exist:
 * - Creates new position with initial values
 */
export async function upsertFxPosition(
  params: UpsertFxPositionParams,
): Promise<{
  positionId: string;
  movementId: string;
  state: 'open' | 'closed';
}> {
  const { trx, ...paramsWithoutTrx } = params;

  // Validate input parameters
  const validationResult =
    upsertFxPositionParamsSchema.safeParse(paramsWithoutTrx);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new AppError(
      `Invalid FX position parameters: ${errorMessages}`,
      validationResult.error.format(),
    );
  }

  const {
    companyId,
    fx_transaction_id,
    account_id,
    foreign_currency_id,
    source_amount,
    amount,
    exchange_rate,
    source_type,
    source_id,
    ledger_transaction_id,
    ledger_entry_id,
    movement_date,
    created_by_id,
    movement_type,
    reversal_of_movement_id,
    metadata,
  } = validationResult.data;

  const existing = await trx('fx_positions')
    .where({
      company_id: companyId,
      fx_transaction_id,
      account_id,
      foreign_currency_id,
    })
    .forUpdate()
    .first<FxPositionRow>();

  const openBefore = existing ? Number(existing.open_fx_amount) : 0;
  const carryingBefore = existing ? Number(existing.carrying_base_amount) : 0;
  const openAfter = roundFxAmount(openBefore + source_amount);
  const carryingAfter = roundFxAmount(carryingBefore + amount);
  const state = openAfter === 0 ? 'closed' : 'open';
  const resolvedMovementType = movementTypeForDelta({
    existing,
    foreignDelta: source_amount,
    openAfter,
    override: movement_type,
  });

  let positionId: string;
  if (existing) {
    positionId = existing.id;
    await trx('fx_positions')
      .where({
        id: existing.id,
      })
      .update({
        open_fx_amount: toDbAmount(openAfter),
        carrying_base_amount: toDbAmount(carryingAfter),
        carrying_rate: exchange_rate,
        state,
        updated_at: trx.fn.now(),
      });
  } else {
    const [created] = await trx('fx_positions')
      .insert({
        company_id: companyId,
        fx_transaction_id,
        account_id,
        foreign_currency_id,
        open_fx_amount: toDbAmount(openAfter),
        carrying_rate: exchange_rate,
        carrying_base_amount: toDbAmount(carryingAfter),
        state,
        metadata: metadata ?? {},
      })
      .returning<{ id: string }[]>('id');
    if (!created) throw new Error('Failed to create FX position');
    positionId = created.id;
  }

  const [movement] = await trx('fx_position_movements')
    .insert({
      company_id: companyId,
      fx_position_id: positionId,
      source_type,
      source_id: source_id ?? null,
      ledger_transaction_id: ledger_transaction_id ?? null,
      ledger_entry_id: ledger_entry_id ?? null,
      movement_type: resolvedMovementType,
      movement_date,
      foreign_amount_delta: toDbAmount(source_amount),
      base_amount_delta: toDbAmount(amount),
      rate: exchange_rate,
      open_fx_amount_before: toDbAmount(openBefore),
      open_fx_amount_after: toDbAmount(openAfter),
      carrying_base_amount_before: toDbAmount(carryingBefore),
      carrying_base_amount_after: toDbAmount(carryingAfter),
      realized_gain_loss_amount: null,
      unrealized_gain_loss_amount: null,
      reversal_of_movement_id: reversal_of_movement_id ?? null,
      metadata: metadata ?? {},
      created_by_id,
    })
    .returning<{ id: string }[]>('id');

  if (!movement) throw new Error('Failed to create FX position movement');

  return { positionId, movementId: movement.id, state };
}

export async function reverseFxPositionMovementsForLedgerTransaction(
  params: ReverseFxPositionMovementsParams,
): Promise<{ movementsReversed: number; positionsClosed: number }> {
  const { trx, ...paramsWithoutTrx } = params;

  const validationResult =
    reverseFxPositionMovementsParamsSchema.safeParse(paramsWithoutTrx);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new AppError(
      `Invalid FX movement reversal parameters: ${errorMessages}`,
      validationResult.error.format(),
    );
  }

  const {
    companyId,
    ledgerTransactionId,
    reversingLedgerTransactionId,
    movementDate,
    createdById,
    movementType,
  } = validationResult.data;

  const sourceMovements = await trx('fx_position_movements as fpm')
    .leftJoin('fx_position_movements as reversal', function joinReversal() {
      this.on('reversal.reversal_of_movement_id', 'fpm.id').andOn(
        'reversal.company_id',
        'fpm.company_id',
      );
    })
    .join('fx_positions as fp', 'fp.id', 'fpm.fx_position_id')
    .where('fpm.company_id', companyId)
    .where('fpm.ledger_transaction_id', ledgerTransactionId)
    .whereNull('reversal.id')
    .whereNotIn('fpm.movement_type', ['reversed', 'superseded_reversed'])
    .orderBy('fpm.created_at', 'desc')
    .select<FxMovementRow[]>(
      'fpm.id',
      'fpm.company_id',
      'fpm.fx_position_id',
      'fpm.source_type',
      'fpm.source_id',
      'fpm.ledger_transaction_id',
      'fpm.ledger_entry_id',
      'fpm.movement_type',
      'fpm.movement_date',
      'fpm.foreign_amount_delta',
      'fpm.base_amount_delta',
      'fpm.rate',
      'fpm.created_by_id',
      'fp.fx_transaction_id',
      'fp.account_id',
      'fp.foreign_currency_id',
    );

  let positionsClosed = 0;

  for (const movement of sourceMovements) {
    const position = await trx('fx_positions')
      .where({
        id: movement.fx_position_id,
        company_id: companyId,
      })
      .first<FxPositionRow>();

    if (!position) {
      throw new Error(`FX position not found: ${movement.fx_position_id}`);
    }

    const result = await upsertFxPosition({
      companyId,
      fx_transaction_id: position.fx_transaction_id,
      account_id: position.account_id,
      foreign_currency_id: position.foreign_currency_id,
      source_amount: -Number(movement.foreign_amount_delta),
      amount: -Number(movement.base_amount_delta),
      exchange_rate: Number(movement.rate),
      source_type:
        movementType === 'superseded_reversed'
          ? 'ledger_supersession'
          : 'ledger_reversal',
      source_id: reversingLedgerTransactionId ?? ledgerTransactionId,
      ledger_transaction_id: reversingLedgerTransactionId ?? null,
      ledger_entry_id: null,
      movement_date: movementDate,
      created_by_id: createdById,
      movement_type: movementType,
      reversal_of_movement_id: movement.id,
      metadata: {
        reversed_ledger_transaction_id: ledgerTransactionId,
        original_movement_type: movement.movement_type,
      },
      trx,
    });

    if (result.state === 'closed') {
      positionsClosed += 1;
    }
  }

  return {
    movementsReversed: sourceMovements.length,
    positionsClosed,
  };
}

/**
 * Process FX positions for a batch of entries
 *
 * This is a convenience function that:
 * 1. Determines which entries are monetary
 * 2. Generates fx_transaction_id for each monetary entry
 * 3. Upserts FX positions
 *
 * @param params - Processing parameters including entries and generator function
 * @returns Summary of positions created/updated/closed
 */
export async function processFxPositions(
  params: ProcessFxPositionsParams,
): Promise<ProcessFxPositionsResult> {
  const { fxTransactionIdGenerator, trx, ...paramsWithoutFunctions } = params;

  // Validate input parameters
  const validationResult = processFxPositionsParamsSchema.safeParse(
    paramsWithoutFunctions,
  );
  if (!validationResult.success) {
    const errorMessages = validationResult.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new AppError(
      `Invalid FX positions processing parameters: ${errorMessages}`,
      validationResult.error.format(),
    );
  }

  const {
    entries,
    companyId,
    reportingCurrencyId,
    movementDate,
    createdById,
    sourceType,
  } = validationResult.data;

  // Step 1: Determine which entries are monetary
  const determinationResult = await determineMonetaryEntries({
    entries: entries.map((e) => ({
      coa_id: e.coa_id,
      source_currency_id: e.source_currency_id,
      is_monetary: e.is_monetary,
    })),
    companyId,
    reportingCurrencyId,
    trx,
  });

  // Step 2: Process each monetary entry
  let positionsCreated = 0;
  let positionsUpdated = 0;
  let positionsClosed = 0;

  for (const {
    index,
    entry: baseEntry,
  } of determinationResult.monetaryEntries) {
    const fullEntry = entries[index]!;

    // Generate fx_transaction_id
    const fx_transaction_id = fxTransactionIdGenerator(
      {
        ...baseEntry,
        source_amount: fullEntry.source_amount,
        amount: fullEntry.amount,
      },
      {
        companyId,
        reportingCurrencyId,
      },
    );

    if (!fx_transaction_id) {
      throw new Error(
        `fx_transaction_id generator returned empty for entry at index ${index}`,
      );
    }

    // Check if position exists before upsert
    const existing = await trx('fx_positions')
      .where({
        company_id: companyId,
        fx_transaction_id,
        account_id: fullEntry.coa_id,
        foreign_currency_id: fullEntry.source_currency_id,
      })
      .first();

    const wasClosed = existing?.state === 'closed';

    // Calculate exchange rate
    // Priority: custom_exchange_rate > calculated from amount/source_amount > system_exchange_rate > 1
    let exchange_rate = 1;
    if (fullEntry.custom_exchange_rate !== undefined) {
      exchange_rate = fullEntry.custom_exchange_rate;
    } else if (fullEntry.source_amount !== 0 && fullEntry.amount !== 0) {
      // Calculate from already-converted amount
      exchange_rate = fullEntry.amount / fullEntry.source_amount;
    } else if (fullEntry.system_exchange_rate !== undefined) {
      exchange_rate = fullEntry.system_exchange_rate;
    }

    // Upsert position
    await upsertFxPosition({
      companyId,
      fx_transaction_id,
      account_id: fullEntry.coa_id,
      foreign_currency_id: fullEntry.source_currency_id,
      source_amount: fullEntry.source_amount,
      amount: fullEntry.amount,
      exchange_rate,
      source_type: sourceType,
      source_id: null,
      movement_date: movementDate,
      created_by_id: createdById,
      trx,
    });

    // Track statistics
    if (!existing) {
      positionsCreated++;
    } else {
      positionsUpdated++;
    }

    // Check if position was closed
    const after = await trx('fx_positions')
      .where({
        company_id: companyId,
        fx_transaction_id,
        account_id: fullEntry.coa_id,
        foreign_currency_id: fullEntry.source_currency_id,
      })
      .first();

    if (after?.state === 'closed' && !wasClosed) {
      positionsClosed++;
    }
  }

  return {
    positionsCreated,
    positionsUpdated,
    positionsClosed,
  };
}
