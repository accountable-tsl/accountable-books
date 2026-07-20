import axios from 'axios';

import { ENV } from '../../config/env.js';

export type FxProviderName = 'openexchangerates' | 'exchangerate_api' | 'fixer';

export type FxProviderRateFound = {
  status: 'found';
  provider: FxProviderName;
  rate: number;
  providerAsOf: Date | null;
};

export type FxProviderRateNoData = {
  status: 'no_data';
};

export type FxProviderRateError = {
  status: 'error';
  provider: FxProviderName;
  category: FxProviderFailureCategory;
  error: unknown;
};

export type FxProviderRateResult =
  | FxProviderRateFound
  | FxProviderRateNoData
  | FxProviderRateError;

export type FxProviderFetchParams = {
  baseCode: string;
  priceCode: string;
  targetDate: Date;
  timeoutMs: number;
};

export type FxProviderFailureCategory =
  | 'quota_exceeded'
  | 'rate_limited'
  | 'auth_error'
  | 'provider_down'
  | 'unknown_error';

export type FxProvider = {
  name: FxProviderName;
  fetchHistoricalRate: (
    params: FxProviderFetchParams,
  ) => Promise<FxProviderRateResult>;
};

const DEFAULT_PROVIDER_ORDER: FxProviderName[] = [
  'openexchangerates',
  'exchangerate_api',
  'fixer',
];

function toYmdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function extractLowercaseErrorText(input: unknown): string {
  if (typeof input === 'string') return input.toLowerCase();
  if (input === null || input === undefined) return '';
  try {
    return JSON.stringify(input).toLowerCase();
  } catch {
    return String(input).toLowerCase();
  }
}

function buildProviderPayloadError(
  provider: FxProviderName,
  payload: unknown,
): FxProviderRateError {
  const errorText = extractLowercaseErrorText(payload);

  return {
    status: 'error',
    provider,
    category: classifyProviderFailure(
      new Error(errorText || `${provider} error`),
    ),
    error: payload,
  };
}

export function classifyProviderFailure(
  error: unknown,
): FxProviderFailureCategory {
  const networkCodes = new Set([
    'ECONNABORTED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
  ]);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const errorText = extractLowercaseErrorText(
      error.response?.data || error.message,
    );

    const hasQuotaSignal =
      errorText.includes('quota') ||
      errorText.includes('monthly limit') ||
      errorText.includes('usage limit') ||
      errorText.includes('plan-upgrade-required') ||
      errorText.includes('quota-reached');
    if (hasQuotaSignal) return 'quota_exceeded';

    if (status === 429 || errorText.includes('rate limit'))
      return 'rate_limited';

    const hasAuthSignal =
      status === 401 ||
      status === 403 ||
      errorText.includes('invalid access key') ||
      errorText.includes('missing access key') ||
      errorText.includes('invalid api key') ||
      errorText.includes('invalid key') ||
      errorText.includes('invalid-key') ||
      errorText.includes('access restricted') ||
      errorText.includes('inactive-account') ||
      errorText.includes('forbidden') ||
      errorText.includes('unauthorized');
    if (hasAuthSignal) return 'auth_error';

    if (
      (status !== undefined && status >= 500) ||
      networkCodes.has(error.code || '')
    ) {
      return 'provider_down';
    }

    if (!error.response) return 'provider_down';

    return 'unknown_error';
  }

  if (error instanceof Error) {
    const text = `${error.name} ${error.message}`.toLowerCase();
    if (text.includes('quota')) return 'quota_exceeded';
    if (text.includes('rate limit') || text.includes('too many requests')) {
      return 'rate_limited';
    }
    if (
      text.includes('auth') ||
      text.includes('unauthorized') ||
      text.includes('invalid access key') ||
      text.includes('invalid api key') ||
      text.includes('invalid-key') ||
      text.includes('invalid key') ||
      text.includes('access restricted') ||
      text.includes('forbidden')
    ) {
      return 'auth_error';
    }
    if (
      text.includes('timeout') ||
      text.includes('network') ||
      text.includes('socket')
    ) {
      return 'provider_down';
    }
  }

  return 'unknown_error';
}

const openExchangeRatesProvider: FxProvider = {
  name: 'openexchangerates',
  fetchHistoricalRate: async ({
    baseCode,
    priceCode,
    targetDate,
    timeoutMs,
  }) => {
    const appId = String(ENV.OPENEXCHANGERATES_APP_ID || '').trim();
    if (!appId) {
      return {
        status: 'error',
        provider: 'openexchangerates',
        category: 'auth_error',
        error: new Error('OPENEXCHANGERATES_APP_ID is not configured'),
      };
    }

    try {
      const ymd = toYmdUtc(targetDate);
      const response = await axios.get(
        `https://openexchangerates.org/api/historical/${ymd}.json`,
        {
          timeout: timeoutMs,
          params: {
            app_id: appId,
            base: baseCode,
            symbols: priceCode,
          },
        },
      );

      const data = response?.data;
      const rawRate = data?.rates?.[priceCode];
      if (
        !rawRate ||
        !Number.isFinite(Number(rawRate)) ||
        Number(rawRate) <= 0
      ) {
        return { status: 'no_data' };
      }

      return {
        status: 'found',
        provider: 'openexchangerates',
        rate: Number(rawRate),
        providerAsOf: data?.timestamp
          ? new Date(Number(data.timestamp) * 1000)
          : null,
      };
    } catch (error) {
      return {
        status: 'error',
        provider: 'openexchangerates',
        category: classifyProviderFailure(error),
        error,
      };
    }
  },
};

const exchangeRateApiProvider: FxProvider = {
  name: 'exchangerate_api',
  fetchHistoricalRate: async ({
    baseCode,
    priceCode,
    targetDate,
    timeoutMs,
  }) => {
    const apiKey = String(ENV.EXCHANGERATE_API_KEY || '').trim();
    if (!apiKey) {
      return {
        status: 'error',
        provider: 'exchangerate_api',
        category: 'auth_error',
        error: new Error('EXCHANGERATE_API_KEY is not configured'),
      };
    }

    try {
      const year = targetDate.getUTCFullYear();
      const month = targetDate.getUTCMonth() + 1;
      const day = targetDate.getUTCDate();
      const response = await axios.get(
        `https://v6.exchangerate-api.com/v6/${apiKey}/history/${baseCode}/${year}/${month}/${day}`,
        { timeout: timeoutMs },
      );

      const data = response?.data;
      if (
        data?.result === 'error' &&
        data['error-type'] === 'no-data-available'
      ) {
        return { status: 'no_data' };
      }
      if (data?.result === 'error') {
        return buildProviderPayloadError('exchangerate_api', data);
      }

      const rawRate = data?.conversion_rates?.[priceCode];
      if (
        !rawRate ||
        !Number.isFinite(Number(rawRate)) ||
        Number(rawRate) <= 0
      ) {
        return { status: 'no_data' };
      }

      return {
        status: 'found',
        provider: 'exchangerate_api',
        rate: Number(rawRate),
        providerAsOf: null,
      };
    } catch (error) {
      return {
        status: 'error',
        provider: 'exchangerate_api',
        category: classifyProviderFailure(error),
        error,
      };
    }
  },
};

const fixerProvider: FxProvider = {
  name: 'fixer',
  fetchHistoricalRate: async ({
    baseCode,
    priceCode,
    targetDate,
    timeoutMs,
  }) => {
    const apiKey = String(ENV.FIXER_API_KEY || '').trim();
    if (!apiKey) {
      return {
        status: 'error',
        provider: 'fixer',
        category: 'auth_error',
        error: new Error('FIXER_API_KEY is not configured'),
      };
    }

    try {
      const ymd = toYmdUtc(targetDate);
      const response = await axios.get(`https://data.fixer.io/api/${ymd}`, {
        timeout: timeoutMs,
        params: {
          access_key: apiKey,
          base: baseCode,
          symbols: priceCode,
        },
      });

      const data = response?.data;
      if (data?.success === false) {
        return buildProviderPayloadError('fixer', data);
      }

      const rawRate = data?.rates?.[priceCode];
      if (
        !rawRate ||
        !Number.isFinite(Number(rawRate)) ||
        Number(rawRate) <= 0
      ) {
        return { status: 'no_data' };
      }

      return {
        status: 'found',
        provider: 'fixer',
        rate: Number(rawRate),
        providerAsOf: data?.timestamp
          ? new Date(Number(data.timestamp) * 1000)
          : null,
      };
    } catch (error) {
      return {
        status: 'error',
        provider: 'fixer',
        category: classifyProviderFailure(error),
        error,
      };
    }
  },
};

const PROVIDERS_BY_NAME: Record<FxProviderName, FxProvider> = {
  openexchangerates: openExchangeRatesProvider,
  exchangerate_api: exchangeRateApiProvider,
  fixer: fixerProvider,
};

export function resolveFxProviderChain(
  orderValue: string | undefined,
): FxProvider[] {
  if (!orderValue || orderValue.trim().length === 0) {
    return DEFAULT_PROVIDER_ORDER.map((name) => PROVIDERS_BY_NAME[name]);
  }

  const requested = orderValue
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set<FxProviderName>();
  const resolved: FxProvider[] = [];
  const invalid: string[] = [];

  for (const token of requested) {
    const name = token as FxProviderName;
    const provider = PROVIDERS_BY_NAME[name];
    if (!provider) {
      invalid.push(token);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    resolved.push(provider);
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid FX_PROVIDER_ORDER entries: ${invalid.join(', ')}. Allowed values: ${DEFAULT_PROVIDER_ORDER.join(', ')}`,
    );
  }

  if (resolved.length === 0) {
    throw new Error(
      `FX_PROVIDER_ORDER did not resolve to any providers. Allowed values: ${DEFAULT_PROVIDER_ORDER.join(', ')}`,
    );
  }

  return resolved;
}
