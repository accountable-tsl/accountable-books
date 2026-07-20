import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '../../config/env.js';
import {
  classifyProviderFailure,
  resolveFxProviderChain,
} from './exchangeRates.providers.js';

const { mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    isAxiosError: (error: unknown) => Boolean((error as any)?.isAxiosError),
  },
}));

afterEach(() => {
  mockAxiosGet.mockReset();
  delete ENV.EXCHANGERATE_API_KEY;
  delete ENV.FIXER_API_KEY;
});

describe('classifyProviderFailure', () => {
  it('classifies quota errors from provider payloads', () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { error: 'quota-reached' },
      },
      message: 'quota reached',
      code: undefined,
    };

    expect(classifyProviderFailure(error)).toBe('quota_exceeded');
  });

  it('classifies rate limits from status codes', () => {
    const error = {
      isAxiosError: true,
      response: { status: 429, data: {} },
      message: 'too many requests',
      code: undefined,
    };

    expect(classifyProviderFailure(error)).toBe('rate_limited');
  });

  it('classifies auth issues from missing key style messages', () => {
    const error = new Error('unauthorized: invalid key');
    expect(classifyProviderFailure(error)).toBe('auth_error');
  });

  it('classifies outage style network errors', () => {
    const error = {
      isAxiosError: true,
      response: undefined,
      message: 'socket timeout',
      code: 'ETIMEDOUT',
    };

    expect(classifyProviderFailure(error)).toBe('provider_down');
  });

  it('rejects invalid provider-order configuration loudly', () => {
    expect(() =>
      resolveFxProviderChain('openexchangerates,not-a-provider'),
    ).toThrow(/Invalid FX_PROVIDER_ORDER entries/);
  });

  it('treats exchangerate_api application errors as provider errors', async () => {
    ENV.EXCHANGERATE_API_KEY = 'test-key';
    mockAxiosGet.mockResolvedValue({
      data: {
        result: 'error',
        'error-type': 'invalid-key',
      },
    });

    const [provider] = resolveFxProviderChain('exchangerate_api');
    const result = await provider!.fetchHistoricalRate({
      baseCode: 'USD',
      priceCode: 'NGN',
      targetDate: new Date('2026-06-01T00:00:00.000Z'),
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      status: 'error',
      provider: 'exchangerate_api',
      category: 'auth_error',
    });
  });

  it('treats fixer application errors as provider errors', async () => {
    ENV.FIXER_API_KEY = 'test-key';
    mockAxiosGet.mockResolvedValue({
      data: {
        success: false,
        error: {
          code: 105,
          info: 'Access Restricted - Your current Subscription Plan does not support this API Function.',
        },
      },
    });

    const [provider] = resolveFxProviderChain('fixer');
    const result = await provider!.fetchHistoricalRate({
      baseCode: 'USD',
      priceCode: 'NGN',
      targetDate: new Date('2026-06-01T00:00:00.000Z'),
      timeoutMs: 1000,
    });

    expect(result).toMatchObject({
      status: 'error',
      provider: 'fixer',
      category: 'auth_error',
    });
  });
});
