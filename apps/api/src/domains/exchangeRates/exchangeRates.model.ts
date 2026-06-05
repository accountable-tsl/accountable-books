import type { Knex } from 'knex';
import { z } from 'zod';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { toYMD } from '../../shared/utils/date.utils.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { newExchangeRate } from './exchangeRate.types.js';
import {
  type FxProviderFailureCategory,
  type FxProviderName,
  type FxProviderRateFound,
  type FxProviderRateNoData,
  resolveFxProviderChain,
} from './exchangeRates.providers.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { ExchangeRateItem, NewExchangeRateInput } from './exchangeRate.types.js';

const DEFAULT_RATE_LOOKBACK_DAYS = 5;
const DEFAULT_FX_REQUEST_TIMEOUT_MS = 5000;
const FX_ALERT_DEBOUNCE_MS = 30 * 60 * 1000;
const fxLogger = createChildLogger({ domain: 'exchange_rates' });
const NOTIFIABLE_FAILURE_CATEGORIES = new Set<FxProviderFailureCategory>([
  'quota_exceeded',
  'auth_error',
  'provider_down',
]);
const lastAlertAtByKey = new Map<string, number>();

type CurrencyCodeRow = { code: string };
type ExchangeRateRow = {
  id: string;
  rate_date: string | Date;
  rate: string | number;
  base_currency_id: string;
  price_currency_id: string;
};
type ProviderAttemptLog = {
  provider: FxProviderName;
  outcome: 'found' | 'no_data' | 'error' | 'skipped_unavailable';
  category?: FxProviderFailureCategory | 'rate_not_found';
  errorMessage?: string;
};
type CandidateAttemptLog = {
  date: string;
  db: 'hit' | 'miss';
  providers: ProviderAttemptLog[];
  resolvedBy?: 'db' | 'provider';
  resolvedProvider?: FxProviderName;
};

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getRateLookbackDays(): number {
  return parsePositiveInt(ENV.FX_LOOKBACK_DAYS, DEFAULT_RATE_LOOKBACK_DAYS);
}

function getFxRequestTimeoutMs(): number {
  return parsePositiveInt(
    ENV.FX_HTTP_TIMEOUT_MS,
    DEFAULT_FX_REQUEST_TIMEOUT_MS,
  );
}

function shouldEmitDebouncedAlert(key: string, nowMs: number): boolean {
  const last = lastAlertAtByKey.get(key);
  if (last && nowMs - last < FX_ALERT_DEBOUNCE_MS) {
    return false;
  }
  lastAlertAtByKey.set(key, nowMs);
  return true;
}

function maybeNotifyProviderFailure(params: {
  provider: FxProviderName;
  category: FxProviderFailureCategory;
  baseCode: string;
  priceCode: string;
  candidateDate: Date;
  error: unknown;
}): void {
  const { provider, category, baseCode, priceCode, candidateDate, error } = params;
  if (!NOTIFIABLE_FAILURE_CATEGORIES.has(category)) return;

  const now = Date.now();
  const dedupeKey = `${provider}:${category}`;
  if (!shouldEmitDebouncedAlert(dedupeKey, now)) return;

  // TODO: Wire this event into the notifications domain (Slack/email/on-call).
  // For now we emit a structured warning to make the signal visible.
  fxLogger.warn(
    {
      event: 'fx-provider-failure',
      provider,
      category,
      pair: `${baseCode}->${priceCode}`,
      candidateDate: toYMD(candidateDate),
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error,
    },
    'FX provider failure',
  );
}

function logFxEvent(
  event: string,
  payload: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  if (level === 'warn') {
    fxLogger.warn({ event, ...payload }, 'FX resolution event');
    return;
  }

  fxLogger.info({ event, ...payload }, 'FX resolution event');
}

export async function createNewExRates(
  data: NewExchangeRateInput[],
  chunkSize: number = 100,
  knex: Knex = knexClient,
) {
  const validatedData = newExchangeRate.array().safeParse(data);

  if (!validatedData.success) {
    return errorResponse(
      'Invalid input provided',
      z.flattenError(validatedData.error),
    );
  }

  try {
    const result = await knex.transaction(async (trx) => {
      let totalInserted = 0;
      const rows = validatedData.data.map((row) => ({
        rate_date: toYMD(row.rate_date),
        base_currency_id: row.base_currency_id,
        price_currency_id: row.price_currency_id,
        rate: row.rate.toString(),
        source: row.source,
        provider: row.provider ?? null,
        provider_as_of: row.provider_as_of ?? null,
        ingested_at: new Date(),
      }));

      for (let i = 0; i < rows.length; i += chunkSize) {
        const insertedRows = await trx('exchange_rates')
          .insert(rows.slice(i, i + chunkSize))
          .onConflict(['rate_date', 'base_currency_id', 'price_currency_id'])
          .ignore()
          .returning('id');

        totalInserted += insertedRows.length;
      }

      return totalInserted;
    });

    return successResponse(
      `${data.length} exchange rates processed. ${result} inserted, duplicates skipped.`,
      result,
    );
  } catch (error: unknown) {
    return errorResponse('Failed to create exchange rates');
  }
}

function normalizeUtcDate(input: Date | string): Date {
  const date = new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function isSameUtcDate(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

function getEffectiveTargetDate(requestedDate: Date): Date {
  const todayUtc = normalizeUtcDate(new Date());
  if (isSameUtcDate(requestedDate, todayUtc)) {
    // Exchange-rate consumers use prior-day closing rates for same-day requests.
    const yesterday = new Date(todayUtc);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return yesterday;
  }
  return requestedDate;
}

function buildCandidateDates(requestedDate: Date, lookbackDays: number): Date[] {
  const effectiveDate = getEffectiveTargetDate(requestedDate);
  return Array.from({ length: lookbackDays + 1 }, (_, offset) => {
    const candidate = new Date(effectiveDate);
    candidate.setUTCDate(candidate.getUTCDate() - offset);
    return candidate;
  });
}

async function getCurrencyCodes(
  knex: Knex,
  fromCurrencyId: string,
  toCurrencyId: string,
): Promise<{
  fromCurrency?: CurrencyCodeRow;
  toCurrency?: CurrencyCodeRow;
}> {
  const [fromCurrency, toCurrency] = await Promise.all([
    knex('currencies')
      .where({ id: fromCurrencyId })
      .select('code')
      .first() as Promise<CurrencyCodeRow | undefined>,
    knex('currencies')
      .where({ id: toCurrencyId })
      .select('code')
      .first() as Promise<CurrencyCodeRow | undefined>,
  ]);

  return { fromCurrency, toCurrency };
}

async function findDbRateForDate(
  knex: Knex,
  params: {
    fromCurrencyId: string;
    toCurrencyId: string;
    candidateDate: Date;
  },
): Promise<ExchangeRateRow | undefined> {
  const { fromCurrencyId, toCurrencyId, candidateDate } = params;

  return (await knex('exchange_rates')
    .select('id', 'rate_date', 'rate', 'base_currency_id', 'price_currency_id')
    .where({
      base_currency_id: fromCurrencyId,
      price_currency_id: toCurrencyId,
      rate_date: toYMD(candidateDate),
    })
    .first()) as ExchangeRateRow | undefined;
}

async function persistProviderRate(
  knex: Knex,
  params: {
    candidateDate: Date;
    fromCurrencyId: string;
    toCurrencyId: string;
    rate: number;
    provider: string;
    providerAsOf: Date | null;
  },
): Promise<ExchangeRateRow> {
  const {
    candidateDate,
    fromCurrencyId,
    toCurrencyId,
    rate,
    provider,
    providerAsOf,
  } = params;

  const row = {
    rate_date: toYMD(candidateDate),
    base_currency_id: fromCurrencyId,
    price_currency_id: toCurrencyId,
    rate: rate.toString(),
    source: 'api' as const,
    provider,
    provider_as_of: providerAsOf,
    ingested_at: new Date(),
  };

  await knex('exchange_rates')
    .insert(row)
    .onConflict(['rate_date', 'base_currency_id', 'price_currency_id'])
    .ignore();

  const persisted = (await knex('exchange_rates')
    .select('id', 'rate_date', 'rate', 'base_currency_id', 'price_currency_id')
    .where({
      base_currency_id: fromCurrencyId,
      price_currency_id: toCurrencyId,
      rate_date: toYMD(candidateDate),
    })
    .first()) as ExchangeRateRow | undefined;

  if (!persisted) {
    throw new Error('Failed to retrieve persisted rate after insert');
  }

  return persisted;
}

async function fetchProviderRateForCandidate(params: {
  baseCode: string;
  priceCode: string;
  candidateDate: Date;
  unavailableProviders: Set<FxProviderName>;
}): Promise<{
  result: FxProviderRateFound | FxProviderRateNoData;
  attempts: ProviderAttemptLog[];
}> {
  const { baseCode, priceCode, candidateDate, unavailableProviders } = params;
  const timeoutMs = getFxRequestTimeoutMs();
  const providerChain = resolveFxProviderChain(ENV.FX_PROVIDER_ORDER);
  const attempts: ProviderAttemptLog[] = [];

  for (const provider of providerChain) {
    if (unavailableProviders.has(provider.name)) {
      attempts.push({
        provider: provider.name,
        outcome: 'skipped_unavailable',
      });
      continue;
    }

    const result = await provider.fetchHistoricalRate({
      baseCode,
      priceCode,
      targetDate: candidateDate,
      timeoutMs,
    });

    if (result.status === 'error') {
      unavailableProviders.add(result.provider);
      attempts.push({
        provider: result.provider,
        outcome: 'error',
        category: result.category,
        errorMessage:
          result.error instanceof Error ? result.error.message : String(result.error),
      });
      maybeNotifyProviderFailure({
        provider: result.provider,
        category: result.category,
        baseCode,
        priceCode,
        candidateDate,
        error: result.error,
      });
      continue;
    }

    if (result.status === 'found') {
      if (unavailableProviders.has(result.provider)) {
        attempts.push({
          provider: result.provider,
          outcome: 'skipped_unavailable',
        });
        continue;
      }
      attempts.push({
        provider: result.provider,
        outcome: 'found',
      });
      return { result, attempts };
    }

    attempts.push({
      provider: provider.name,
      outcome: 'no_data',
      category: 'rate_not_found',
    });
  }

  return { result: { status: 'no_data' }, attempts };
}

/**
 * Fetches exchange rate between two currencies for a given date.
 * First checks database for existing rates within a lookback window,
 * then falls back to external API if not found.
 *
 * @param date - Target date for exchange rate
 * @param fromCurrencyId - Source currency ID
 * @param toCurrencyId - Target currency ID
 * @param knex - Knex database instance or transaction
 * @returns Promise resolving to exchange rate result
 */
export async function fetchExchangeRate(
  date: Date | string,
  fromCurrencyId: string,
  toCurrencyId: string,
  knex: Knex = knexClient,
): Promise<ApiResponse<ExchangeRateItem>> {
  try {
    if (fromCurrencyId === toCurrencyId) {
      return successResponse('Base and target currencies are identical', {
        id: 'SYNTHETIC',
        date: toYMD(date),
        fromCurrencyId,
        toCurrencyId,
        rate: Number(1),
      });
    }

    const { fromCurrency, toCurrency } = await getCurrencyCodes(
      knex,
      fromCurrencyId,
      toCurrencyId,
    );

    if (!fromCurrency?.code || !toCurrency?.code) {
      return errorResponse('Invalid currency IDs', {
        missingFrom: !fromCurrency?.code,
        missingTo: !toCurrency?.code,
      });
    }

    const requestedDate = normalizeUtcDate(date);
    const effectiveDate = getEffectiveTargetDate(requestedDate);
    const candidateDates = buildCandidateDates(
      requestedDate,
      getRateLookbackDays(),
    );
    const unavailableProviders = new Set<FxProviderName>();
    const candidateAttempts: CandidateAttemptLog[] = [];

    logFxEvent('request_started', {
      pair: `${fromCurrency.code}->${toCurrency.code}`,
      requestedDate: toYMD(requestedDate),
      effectiveDate: toYMD(effectiveDate),
      lookbackDays: getRateLookbackDays(),
      candidates: candidateDates.map((candidateDate) => toYMD(candidateDate)),
    });

    for (let idx = 0; idx < candidateDates.length; idx++) {
      const candidateDate = candidateDates[idx]!;
      const candidateAttempt: CandidateAttemptLog = {
        date: toYMD(candidateDate),
        db: 'miss',
        providers: [],
      };
      const dbRate = await findDbRateForDate(knex, {
        fromCurrencyId,
        toCurrencyId,
        candidateDate,
      });

      if (dbRate) {
        candidateAttempt.db = 'hit';
        candidateAttempt.resolvedBy = 'db';
        candidateAttempts.push(candidateAttempt);
        logFxEvent('resolved', {
          pair: `${fromCurrency.code}->${toCurrency.code}`,
          requestedDate: toYMD(requestedDate),
          effectiveDate: toYMD(effectiveDate),
          candidateDate: toYMD(candidateDate),
          candidateOffset: idx,
          layer: 'db',
          outcome: 'hit',
        });
        return successResponse(
          idx === 0 ? 'Exact rate found' : 'Closest available rate found',
          {
            id: dbRate.id,
            date: toYMD(dbRate.rate_date),
            rate: Number(dbRate.rate),
            fromCurrencyId: dbRate.base_currency_id,
            toCurrencyId: dbRate.price_currency_id,
          },
        );
      }

      const providerFetch = await fetchProviderRateForCandidate({
        baseCode: fromCurrency.code,
        priceCode: toCurrency.code,
        candidateDate,
        unavailableProviders,
      });
      candidateAttempt.providers = providerFetch.attempts;

      if (providerFetch.result.status !== 'found') {
        candidateAttempts.push(candidateAttempt);
        continue;
      }

      candidateAttempt.resolvedBy = 'provider';
      candidateAttempt.resolvedProvider = providerFetch.result.provider;
      candidateAttempts.push(candidateAttempt);
      const persistedRate = await persistProviderRate(knex, {
        candidateDate,
        fromCurrencyId,
        toCurrencyId,
        rate: providerFetch.result.rate,
        provider: providerFetch.result.provider,
        providerAsOf: providerFetch.result.providerAsOf,
      });
      logFxEvent('resolved', {
        pair: `${fromCurrency.code}->${toCurrency.code}`,
        requestedDate: toYMD(requestedDate),
        effectiveDate: toYMD(effectiveDate),
        candidateDate: toYMD(candidateDate),
        candidateOffset: idx,
        layer: 'api',
        provider: providerFetch.result.provider,
        outcome: 'persisted',
      });

      return successResponse('Exchange rate persisted or already existed', {
        id: persistedRate.id,
        date: toYMD(persistedRate.rate_date),
        fromCurrencyId: persistedRate.base_currency_id,
        toCurrencyId: persistedRate.price_currency_id,
        rate: Number(persistedRate.rate),
      });
    }

    const providerOutcomes = candidateAttempts.flatMap((attempt) =>
      attempt.providers.map((providerAttempt) => ({
        provider: providerAttempt.provider,
        outcome: providerAttempt.outcome,
        category: providerAttempt.category,
      })),
    );
    logFxEvent(
      'miss',
      {
        pair: `${fromCurrency.code}->${toCurrency.code}`,
        requestedDate: toYMD(requestedDate),
        effectiveDate: toYMD(effectiveDate),
        datesAttempted: candidateDates.map((candidateDate) => toYMD(candidateDate)),
        providerOutcomes,
      },
      'warn',
    );

    return errorResponse(
      `Exchange rate for ${fromCurrency.code} → ${toCurrency.code} not available across ${candidateDates.length} candidate date(s)`,
      {
        from: fromCurrency.code,
        to: toCurrency.code,
        datesAttempted: candidateDates.map((candidateDate) => toYMD(candidateDate)),
        requestedDate: toYMD(requestedDate),
        effectiveDate: toYMD(effectiveDate),
        finalReason: 'rate_not_found',
        candidateAttempts,
      },
      { code: ErrorCode.NOT_FOUND, report: true },
    );
  } catch (error: unknown) {
    return errorResponse(
      'An unexpected error occurred while fetching exchange rate',
      error,
    );
  }
}
