import { beforeEach, describe, expect, it, vi } from 'vitest';

import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { getAllCurrencies } from './currencies.model.js';

vi.mock('../../db/knexClient.js', () => ({
  knexClient: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('currencies.model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns currencies with camelCase minorUnit field', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);

    const select = vi.fn().mockResolvedValue([
      {
        id: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d',
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        minor_unit: 2,
      },
    ]);

    vi.mocked(knexClient).mockReturnValue({ select } as unknown as ReturnType<
      typeof knexClient
    >);

    const result = await getAllCurrencies({ skipCache: true });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: 'f3a1b0b1-c658-4af8-b5d0-b93467829a4d',
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        minorUnit: 2,
      },
    ]);
    expect(
      (result.data?.[0] as Record<string, unknown>).minor_unit,
    ).toBeUndefined();
    expect(redis.set).toHaveBeenCalledOnce();
  });

  it('returns NOT_FOUND when currencies table is empty', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);

    const select = vi.fn().mockResolvedValue([]);
    vi.mocked(knexClient).mockReturnValue({ select } as unknown as ReturnType<
      typeof knexClient
    >);

    const result = await getAllCurrencies({ skipCache: true });

    expect(result.success).toBe(false);
    expect(result.message).toBe('No currencies found');
    expect(result.code).toBe('NOT_FOUND');
    expect(redis.set).not.toHaveBeenCalled();
  });
});
