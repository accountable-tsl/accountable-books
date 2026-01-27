import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { AppError, errorResponse } from '../../shared/utils/response.utils.js';
import {
  processFxPositionsParamsSchema,
  upsertFxPositionParamsSchema,
} from './fx.types.js';

import type {
  DetermineMonetaryEntriesParams,
  DetermineMonetaryResult,
  FxTransactionIdGenerator,
  MonetaryEntry,
  ProcessFxPositionsParams,
  ProcessFxPositionsResult,
  UpsertFxPositionParams,
} from './fx.types.js';

/**
 * Determine which entries are monetary (create FX exposure)
 *
 * Logic:
 * 1. If entry has explicit is_monetary, use that
 * 2. Else if account type has default_monetary=true, entry is monetary
 * 3. Else if source_currency_id !== reporting_currency_id, entry is monetary
 * 4. Else entry is not monetary
 */
export async function determineMonetaryEntries(
  params: DetermineMonetaryEntriesParams,
): Promise<DetermineMonetaryResult> {
  const { entries, companyId, reportingCurrencyId, trx } = params;
  const db = trx ?? knexClient;

  if (entries.length === 0) {
    return {
      monetaryMap: new Map(),
      monetaryEntries: [],
    };
  }

  // Batch fetch account types' default_monetary for all COAs
  const uniqueCoaIds = Array.from(new Set(entries.map((e) => e.coa_id)));
  const coaRows = await db('coa')
    .join('account_types', 'coa.account_type_id', 'account_types.id')
    .where('coa.company_id', companyId)
    .whereIn('coa.id', uniqueCoaIds)
    .where('coa.is_deleted', false)
    .select('coa.id', 'account_types.default_monetary');

  const coaMonetary = new Map<string, boolean>(
    coaRows.map((r: any) => [r.id, r.default_monetary ?? false]),
  );

  // Determine monetary status for each entry
  const monetaryMap = new Map<number, boolean>();
  const monetaryEntries: Array<{ index: number; entry: MonetaryEntry }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    let isMonetary: boolean;

    // Priority 1: Explicit override
    if (entry.is_monetary !== undefined) {
      isMonetary = entry.is_monetary;
    }
    // Priority 2: Account type default
    else if (coaMonetary.get(entry.coa_id) === true) {
      isMonetary = true;
    }
    // Priority 3: Currency mismatch
    else if (entry.source_currency_id !== reportingCurrencyId) {
      isMonetary = true;
    }
    // Default: not monetary
    else {
      isMonetary = false;
    }

    monetaryMap.set(i, isMonetary);

    if (isMonetary) {
      monetaryEntries.push({
        index: i,
        entry: {
          coa_id: entry.coa_id,
          source_currency_id: entry.source_currency_id,
          source_amount: 0, // Will be filled by caller
          amount: 0, // Will be filled by caller
          is_monetary: isMonetary,
        },
      });
    }
  }

  return {
    monetaryMap,
    monetaryEntries,
  };
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
): Promise<void> {
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
  } = validationResult.data;

  // Find existing position
  const existing = await trx('fx_positions')
    .where({
      company_id: companyId,
      fx_transaction_id,
    })
    .first();

  if (existing) {
    // Update existing position
    const newOpenFxAmount = Number(existing.open_fx_amount) + source_amount;
    const newCarryingBaseAmount =
      Number(existing.carrying_base_amount) + amount;
    const newState = newOpenFxAmount === 0 ? 'closed' : 'open';

    await trx('fx_positions')
      .where({
        company_id: companyId,
        fx_transaction_id,
      })
      .update({
        open_fx_amount: newOpenFxAmount,
        carrying_base_amount: newCarryingBaseAmount,
        carrying_rate: exchange_rate,
        state: newState,
        updated_at: trx.fn.now(),
      });
  } else {
    // Create new position
    const initialState = source_amount === 0 ? 'closed' : 'open';

    await trx('fx_positions').insert({
      company_id: companyId,
      fx_transaction_id,
      account_id,
      foreign_currency_id,
      open_fx_amount: source_amount,
      carrying_rate: exchange_rate,
      carrying_base_amount: amount,
      state: initialState,
    });
  }
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

  const { entries, companyId, reportingCurrencyId } = validationResult.data;

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
