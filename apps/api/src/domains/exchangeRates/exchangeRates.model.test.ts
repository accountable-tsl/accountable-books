import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '../../config/env.js';
import { ErrorCode } from '../../shared/utils/response.utils.js';
import { fetchExchangeRate } from './exchangeRates.model.js';

import type { FxProvider } from './exchangeRates.providers.js';

const { mockResolveFxProviderChain, mockFxLoggerWarn } = vi.hoisted(() => ({
  mockResolveFxProviderChain: vi.fn(),
  mockFxLoggerWarn: vi.fn(),
}));

vi.mock('./exchangeRates.providers.js', async () => {
  const actual = await vi.importActual('./exchangeRates.providers.js');
  return {
    ...actual,
    resolveFxProviderChain: mockResolveFxProviderChain,
  };
});

vi.mock('../../shared/utils/logger.js', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: mockFxLoggerWarn,
  }),
}));

type CurrencyRow = { id: string; code: string };
type ExchangeRateRow = {
  id: string;
  rate_date: string;
  base_currency_id: string;
  price_currency_id: string;
  rate: string;
  source?: string;
  provider?: string | null;
  provider_as_of?: Date | null;
};

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createFakeKnex(seed?: {
  currencies?: CurrencyRow[];
  exchangeRates?: ExchangeRateRow[];
}) {
  const state = {
    currencies: [...(seed?.currencies ?? [])],
    exchange_rates: [...(seed?.exchangeRates ?? [])],
  };

  let nextId = 1000;

  const knex = ((tableName: 'currencies' | 'exchange_rates') => {
    const whereParts: Record<string, unknown>[] = [];
    let selectColumns: string[] | null = null;
    let pendingInsertRows: Record<string, unknown>[] = [];
    let conflictColumns: string[] = [];

    function runFilter() {
      const rows = [...state[tableName]];
      return rows.filter((row) =>
        whereParts.every((criteria) =>
          Object.entries(criteria).every(
            ([key, value]) => (row as any)[key] === value,
          ),
        ),
      );
    }

    function projectRow(row: Record<string, unknown>) {
      if (!selectColumns || selectColumns.length === 0) return row;
      return selectColumns.reduce<Record<string, unknown>>((acc, col) => {
        acc[col] = row[col];
        return acc;
      }, {});
    }

    const queryBuilder = {
      where(criteria: Record<string, unknown>) {
        whereParts.push(criteria);
        return queryBuilder;
      },
      select(...columns: string[]) {
        selectColumns = columns;
        return queryBuilder;
      },
      async first() {
        const filtered = runFilter();
        const row = filtered[0];
        return row ? projectRow(row as Record<string, unknown>) : undefined;
      },
      insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
        pendingInsertRows = Array.isArray(rows) ? rows : [rows];
        return queryBuilder;
      },
      onConflict(columns: string[]) {
        conflictColumns = columns;
        return queryBuilder;
      },
      async ignore() {
        const inserted: Record<string, unknown>[] = [];
        for (const row of pendingInsertRows) {
          const exists = state[tableName].some((existing) =>
            conflictColumns.every((col) => (existing as any)[col] === row[col]),
          );
          if (exists) continue;

          const finalRow = {
            id: String(nextId++),
            ...row,
          };
          (state[tableName] as any[]).push(finalRow);
          inserted.push(finalRow);
        }
        return inserted;
      },
    };

    return queryBuilder;
  }) as any;

  return { knex, state };
}

function createProvider(
  name: FxProvider['name'],
  impl: FxProvider['fetchHistoricalRate'],
): FxProvider {
  return {
    name,
    fetchHistoricalRate: vi.fn(impl),
  };
}

describe('fetchExchangeRate regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T10:00:00.000Z'));
    mockResolveFxProviderChain.mockReset();
    ENV.FX_LOOKBACK_DAYS = '2';
    ENV.FX_HTTP_TIMEOUT_MS = '5000';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockFxLoggerWarn.mockReset();
  });

  it('uses yesterday as first candidate when requested date is today UTC', async () => {
    const provider = createProvider(
      'openexchangerates',
      async ({ targetDate }) => ({
        status: 'found',
        provider: 'openexchangerates',
        rate: 1.25,
        providerAsOf: targetDate,
      }),
    );
    mockResolveFxProviderChain.mockReturnValue([provider]);

    const { knex, state } = createFakeKnex({
      currencies: [
        { id: 'from-id', code: 'USD' },
        { id: 'to-id', code: 'NGN' },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-06-02',
      'from-id',
      'to-id',
      knex,
    );

    expect(result.success).toBe(true);
    expect(provider.fetchHistoricalRate).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(provider.fetchHistoricalRate).mock.calls[0]![0];
    expect(toYmd(firstCall.targetDate)).toBe('2026-06-01');
    expect(state.exchange_rates).toHaveLength(1);
    expect(state.exchange_rates[0]?.rate_date).toBe('2026-06-01');
  });

  it('short-circuits provider calls when DB has exact match', async () => {
    const provider = createProvider('openexchangerates', async () => ({
      status: 'no_data',
    }));
    mockResolveFxProviderChain.mockReturnValue([provider]);

    const { knex } = createFakeKnex({
      currencies: [
        { id: 'from-id', code: 'USD' },
        { id: 'to-id', code: 'EUR' },
      ],
      exchangeRates: [
        {
          id: '100',
          rate_date: '2026-05-31',
          base_currency_id: 'from-id',
          price_currency_id: 'to-id',
          rate: '0.91',
          source: 'seed',
        },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-05-31',
      'from-id',
      'to-id',
      knex,
    );

    expect(result.success).toBe(true);
    expect(result.data?.rate).toBe(0.91);
    expect(provider.fetchHistoricalRate).not.toHaveBeenCalled();
  });

  it('falls back across providers in configured order', async () => {
    const primary = createProvider('openexchangerates', async () => ({
      status: 'no_data',
    }));
    const secondary = createProvider(
      'exchangerate_api',
      async ({ targetDate }) => ({
        status: 'found',
        provider: 'exchangerate_api',
        rate: 812.42,
        providerAsOf: targetDate,
      }),
    );
    const tertiary = createProvider('fixer', async () => ({
      status: 'no_data',
    }));

    mockResolveFxProviderChain.mockReturnValue([primary, secondary, tertiary]);

    const { knex, state } = createFakeKnex({
      currencies: [
        { id: 'usd-id', code: 'USD' },
        { id: 'ngn-id', code: 'NGN' },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-05-30',
      'usd-id',
      'ngn-id',
      knex,
    );

    expect(result.success).toBe(true);
    expect(primary.fetchHistoricalRate).toHaveBeenCalledTimes(1);
    expect(secondary.fetchHistoricalRate).toHaveBeenCalledTimes(1);
    expect(tertiary.fetchHistoricalRate).not.toHaveBeenCalled();
    expect(state.exchange_rates).toHaveLength(1);
    expect(state.exchange_rates[0]?.provider).toBe('exchangerate_api');
    expect(Number(state.exchange_rates[0]?.rate)).toBe(812.42);
  });

  it('skips a provider after outright failure within same request', async () => {
    const primary = createProvider('openexchangerates', async () => ({
      status: 'error',
      provider: 'openexchangerates',
      category: 'provider_down',
      error: new Error('timeout'),
    }));
    const secondary = createProvider(
      'exchangerate_api',
      async ({ targetDate }) => {
        if (toYmd(targetDate) === '2026-05-30') {
          return { status: 'no_data' } as const;
        }
        return {
          status: 'found',
          provider: 'exchangerate_api',
          rate: 1.11,
          providerAsOf: targetDate,
        } as const;
      },
    );

    mockResolveFxProviderChain.mockReturnValue([primary, secondary]);

    const { knex } = createFakeKnex({
      currencies: [
        { id: 'usd-id', code: 'USD' },
        { id: 'eur-id', code: 'EUR' },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-05-30',
      'usd-id',
      'eur-id',
      knex,
    );

    expect(result.success).toBe(true);
    expect(primary.fetchHistoricalRate).toHaveBeenCalledTimes(1);
    expect(secondary.fetchHistoricalRate).toHaveBeenCalledTimes(2);
    expect(mockFxLoggerWarn).toHaveBeenCalledOnce();
  });

  it('persists provider result and returns hydrated DB row', async () => {
    const provider = createProvider('fixer', async ({ targetDate }) => ({
      status: 'found',
      provider: 'fixer',
      rate: 100.01,
      providerAsOf: targetDate,
    }));
    mockResolveFxProviderChain.mockReturnValue([provider]);

    const { knex, state } = createFakeKnex({
      currencies: [
        { id: 'gbp-id', code: 'GBP' },
        { id: 'ngn-id', code: 'NGN' },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-05-29',
      'gbp-id',
      'ngn-id',
      knex,
    );

    expect(result.success).toBe(true);
    expect(result.data?.rate).toBe(100.01);
    expect(state.exchange_rates).toHaveLength(1);
    expect(state.exchange_rates[0]).toMatchObject({
      base_currency_id: 'gbp-id',
      price_currency_id: 'ngn-id',
      rate_date: '2026-05-29',
      source: 'api',
      provider: 'fixer',
    });
  });

  it('returns structured miss diagnostics when no candidates resolve', async () => {
    const primary = createProvider('openexchangerates', async () => ({
      status: 'no_data',
    }));
    const secondary = createProvider('exchangerate_api', async () => ({
      status: 'no_data',
    }));
    mockResolveFxProviderChain.mockReturnValue([primary, secondary]);

    const { knex } = createFakeKnex({
      currencies: [
        { id: 'usd-id', code: 'USD' },
        { id: 'eur-id', code: 'EUR' },
      ],
    });

    const result = await fetchExchangeRate(
      '2026-05-30',
      'usd-id',
      'eur-id',
      knex,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(ErrorCode.NOT_FOUND);
    expect(result.error).toMatchObject({
      from: 'USD',
      to: 'EUR',
      requestedDate: '2026-05-30',
      effectiveDate: '2026-05-30',
      finalReason: 'rate_not_found',
      datesAttempted: ['2026-05-30', '2026-05-29', '2026-05-28'],
    });
    expect((result.error as any).candidateAttempts).toHaveLength(3);
    expect((result.error as any).candidateAttempts[0]).toMatchObject({
      date: '2026-05-30',
      db: 'miss',
      providers: [
        {
          provider: 'openexchangerates',
          outcome: 'no_data',
          category: 'rate_not_found',
        },
        {
          provider: 'exchangerate_api',
          outcome: 'no_data',
          category: 'rate_not_found',
        },
      ],
    });
    expect(primary.fetchHistoricalRate).toHaveBeenCalledTimes(3);
    expect(secondary.fetchHistoricalRate).toHaveBeenCalledTimes(3);
  });
});
