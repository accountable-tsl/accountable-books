import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as currencyUtils from '../../currencies/currencies.utils.js';
import * as exchangeRateUtils from '../../exchangeRates/exchangeRates.utils.js';
import {
  processEntriesDates,
  resolveFx,
  validateBankLegAmount,
  validateIds,
} from '../ledgers.utils.js';

import type { LedgerEntryInput } from '../ledgers.types.js';

describe('validateBankLegAmount', () => {
  it('should validate when bank leg matches bank transaction amount (same sign)', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -1000, is_bank_leg: true },
        { source_amount: 1000, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should validate when bank leg matches bank transaction amount (different sign, same magnitude)', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: 1000, is_bank_leg: true },
        { source_amount: -1000, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should allow small difference within tolerance (0.01)', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -1000.005, is_bank_leg: true },
        { source_amount: 1000.005, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(true);
  });

  it('should fail when bank leg amount differs beyond tolerance', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -1050, is_bank_leg: true },
        { source_amount: 1050, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not match');
    expect(result.error).toContain('50.00');
  });

  it('should fail when no bank leg is present', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -1000, is_bank_leg: false },
        { source_amount: 1000, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Bank transaction must have exactly one bank leg',
    );
  });

  it('should fail when multiple bank legs are present', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -500, is_bank_leg: true },
        { source_amount: -500, is_bank_leg: true },
        { source_amount: 1000, is_bank_leg: false },
      ],
      bankTransactionAmount: -1000,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Bank transaction cannot have multiple bank legs',
    );
  });

  it('should handle large amounts correctly', () => {
    const result = validateBankLegAmount({
      entries: [
        { source_amount: -1_000_000, is_bank_leg: true },
        { source_amount: 1_000_000, is_bank_leg: false },
      ],
      bankTransactionAmount: -1_000_000,
    });

    expect(result.valid).toBe(true);
  });
});

describe('validateIds', () => {
  let mockQueryBuilder: any;
  let mockTxn: any;

  beforeEach(() => {
    // Create a mock query builder that chains methods
    mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      pluck: vi.fn(),
    };

    // Create a mock transaction that returns the query builder when called with a table name
    mockTxn = vi.fn((table: string) => mockQueryBuilder);

    vi.clearAllMocks();
  });

  it('should pass when all IDs are valid', async () => {
    const validIds = ['id-1', 'id-2', 'id-3'];
    mockQueryBuilder.pluck.mockResolvedValue(validIds);

    const result = await validateIds(
      'contacts',
      validIds,
      'company-123',
      mockTxn as any,
    );

    expect(result).toEqual(new Set(validIds));

    expect(mockTxn).toHaveBeenCalledWith('contacts');
    expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith('id', validIds);
    expect(mockQueryBuilder.where).toHaveBeenCalledWith({
      company_id: 'company-123',
    });
    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('should throw when some IDs are invalid', async () => {
    const requestedIds = ['id-1', 'id-2', 'id-3'];
    const foundIds = ['id-1', 'id-2']; // id-3 missing
    mockQueryBuilder.pluck.mockResolvedValue(foundIds);

    await expect(
      validateIds('contacts', requestedIds, 'company-123', mockTxn as any),
    ).rejects.toThrow('Invalid contacts IDs: id-3');
  });

  it('should throw when multiple IDs are invalid', async () => {
    const requestedIds = ['id-1', 'id-2', 'id-3', 'id-4'];
    const foundIds = ['id-1', 'id-3'];
    mockQueryBuilder.pluck.mockResolvedValue(foundIds);

    await expect(
      validateIds('projects', requestedIds, 'company-123', mockTxn as any),
    ).rejects.toThrow('Invalid projects IDs: id-2, id-4');
    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('should not throw when empty array is provided', async () => {
    const result = await validateIds(
      'contacts',
      [],
      'company-123',
      mockTxn as any,
    );

    expect(result).toEqual(new Set());

    expect(mockTxn).not.toHaveBeenCalled();
  });
});

describe('resolveFx', () => {
  const mockGetCurrencyById = vi.spyOn(currencyUtils, 'getCurrencyById');
  const mockDetermineExchangeRate = vi.spyOn(
    exchangeRateUtils,
    'determineExchangeRate',
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrencyById.mockImplementation(async (id) => {
      const currencies: Record<string, any> = {
        'usd-id': { code: 'USD', id: 'usd-id' },
        'eur-id': { code: 'EUR', id: 'eur-id' },
        'ngn-id': { code: 'NGN', id: 'ngn-id' },
        'lbp-id': { code: 'LBP', id: 'lbp-id' },
      };
      return currencies[id] || { code: 'XXX', id };
    });
  });

  it('should return rate 1 for same currency (no FX)', async () => {
    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'usd-id',
          source_amount: -1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'usd-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.systemExRate).toBe(1);
    expect(result.customExRate).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('should use bank transaction system rate when provided', async () => {
    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'eur-id',
          source_amount: -1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'eur-id',
      reportingCurrencyId: 'usd-id',
      bankTxnSystemRate: 1.12,
    });

    expect(result.systemExRate).toBe(1.12);
    expect(result.customExRate).toBe(1.12);
  });

  it('should fetch system rate when bank transaction rate not provided', async () => {
    mockDetermineExchangeRate.mockResolvedValue(1.15);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'eur-id',
          source_amount: -1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'eur-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.systemExRate).toBe(1.15);
    expect(mockDetermineExchangeRate).toHaveBeenCalledWith({
      date: '2025-01-15',
      fromCurrencyId: 'eur-id',
      toCurrencyId: 'usd-id',
    });
  });

  it('should throw when exchange rate cannot be determined', async () => {
    mockDetermineExchangeRate.mockResolvedValue(null);

    await expect(
      resolveFx({
        entries: [
          {
            fs_date: '2025-01-15',
            coa_id: 'coa-1',
            source_currency_id: 'eur-id',
            source_amount: -1000,
            description: 'Test',
          },
        ],
        ledgerTxDate: new Date('2025-01-15'),
        sourceCurrencyId: 'eur-id',
        reportingCurrencyId: 'usd-id',
      }),
    ).rejects.toThrow('Failed to determine exchange rate');
  });

  it('should use custom rate when provided on single entry', async () => {
    mockDetermineExchangeRate.mockResolvedValue(1.15);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'eur-id',
          source_amount: -1000,
          description: 'Test',
          custom_exchange_rate: 1.18,
        },
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-2',
          source_currency_id: 'eur-id',
          source_amount: 1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'eur-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.systemExRate).toBe(1.15);
    expect(result.customExRate).toBe(1.18);
  });

  it('should use custom rate when all entries have same custom rate', async () => {
    mockDetermineExchangeRate.mockResolvedValue(1.15);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'eur-id',
          source_amount: -1000,
          description: 'Test',
          custom_exchange_rate: 1.18,
        },
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-2',
          source_currency_id: 'eur-id',
          source_amount: 1000,
          description: 'Test',
          custom_exchange_rate: 1.18,
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'eur-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.systemExRate).toBe(1.15);
    expect(result.customExRate).toBe(1.18);
  });

  it('should warn and use system rate when conflicting custom rates', async () => {
    mockDetermineExchangeRate.mockResolvedValue(1.15);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'eur-id',
          source_amount: -1000,
          description: 'Test',
          custom_exchange_rate: 1.18,
        },
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-2',
          source_currency_id: 'eur-id',
          source_amount: 1000,
          description: 'Test',
          custom_exchange_rate: 1.22,
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'eur-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.customExRate).toBe(1.15);
    expect(result.warnings).toContain(
      'Conflicting custom FX rates detected for EUR → USD on 2025-01-15. Using system rate.',
    );
  });

  it('should warn for suspiciously large FX rate', async () => {
    mockDetermineExchangeRate.mockResolvedValue(15000);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'ngn-id',
          source_amount: -1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'ngn-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.warnings).toContain('Suspiciously large FX rate: 15000');
  });

  it('should warn for suspiciously small FX rate', async () => {
    mockDetermineExchangeRate.mockResolvedValue(0.000001);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'lbp-id',
          source_amount: -1000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'lbp-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.warnings).toContain('Suspiciously small FX rate: 0.000001.');
  });

  it('should warn for extremely small converted amount', async () => {
    mockDetermineExchangeRate.mockResolvedValue(0.00001);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'lbp-id',
          source_amount: -50,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'lbp-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.warnings.some((w) => w.includes('extremely small'))).toBe(
      true,
    );
  });

  it('should warn for extremely large converted amount', async () => {
    mockDetermineExchangeRate.mockResolvedValue(1500);

    const result = await resolveFx({
      entries: [
        {
          fs_date: '2025-01-15',
          coa_id: 'coa-1',
          source_currency_id: 'ngn-id',
          source_amount: -1_000_000,
          description: 'Test',
        },
      ],
      ledgerTxDate: new Date('2025-01-15'),
      sourceCurrencyId: 'ngn-id',
      reportingCurrencyId: 'usd-id',
    });

    expect(result.warnings.some((w) => w.includes('extremely large'))).toBe(
      true,
    );
  });

  it('should throw for invalid exchange rate (negative)', async () => {
    mockDetermineExchangeRate.mockResolvedValue(-1);

    await expect(
      resolveFx({
        entries: [
          {
            fs_date: '2025-01-15',
            coa_id: 'coa-1',
            source_currency_id: 'eur-id',
            source_amount: -1000,
            description: 'Test',
          },
        ],
        ledgerTxDate: new Date('2025-01-15'),
        sourceCurrencyId: 'eur-id',
        reportingCurrencyId: 'usd-id',
      }),
    ).rejects.toThrow('Invalid exchange rate');
  });

  it('should throw for invalid exchange rate (infinity)', async () => {
    mockDetermineExchangeRate.mockResolvedValue(Infinity);

    await expect(
      resolveFx({
        entries: [
          {
            fs_date: '2025-01-15',
            coa_id: 'coa-1',
            source_currency_id: 'eur-id',
            source_amount: -1000,
            description: 'Test',
            custom_exchange_rate: Infinity,
          },
        ],
        ledgerTxDate: new Date('2025-01-15'),
        sourceCurrencyId: 'eur-id',
        reportingCurrencyId: 'usd-id',
      }),
    ).rejects.toThrow('Invalid exchange rate');
  });
});

describe('processEntriesDates', () => {
  it('should process single entry correctly', () => {
    const entries: LedgerEntryInput[] = [
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: -1000,
        description: 'Test',
      },
    ];

    const result = processEntriesDates(entries);

    expect(result.minYMD).toBe('2025-01-15');
    expect(result.maxYMD).toBe('2025-01-15');
    expect(result.bounds.size).toBe(1);
    expect(result.bounds.get('coa-1')).toEqual({
      min: '2025-01-15',
      max: '2025-01-15',
    });
  });

  it('should process multiple entries with same date and COA', () => {
    const entries: LedgerEntryInput[] = [
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: -1000,
        description: 'Test',
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: 1000,
        description: 'Test',
      },
    ];

    const result = processEntriesDates(entries);

    expect(result.minYMD).toBe('2025-01-15');
    expect(result.maxYMD).toBe('2025-01-15');
    expect(result.bounds.size).toBe(1);
    expect(result.bounds.get('coa-1')).toEqual({
      min: '2025-01-15',
      max: '2025-01-15',
    });
  });

  it('should calculate correct date range across multiple dates', () => {
    const entries: LedgerEntryInput[] = [
      {
        fs_date: '2025-01-10',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: -1000,
        description: 'Test',
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: 500,
        description: 'Test',
      },
      {
        fs_date: '2025-01-20',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: 500,
        description: 'Test',
      },
    ];

    const result = processEntriesDates(entries);

    expect(result.minYMD).toBe('2025-01-10');
    expect(result.maxYMD).toBe('2025-01-20');
    expect(result.bounds.get('coa-1')).toEqual({
      min: '2025-01-10',
      max: '2025-01-20',
    });
  });

  it('should track separate bounds per COA', () => {
    const entries: LedgerEntryInput[] = [
      {
        fs_date: '2025-01-10',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: -1000,
        description: 'Test',
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-2',
        source_currency_id: 'usd-id',
        source_amount: 500,
        description: 'Test',
      },
      {
        fs_date: '2025-01-20',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: 500,
        description: 'Test',
      },
    ];

    const result = processEntriesDates(entries);

    expect(result.minYMD).toBe('2025-01-10');
    expect(result.maxYMD).toBe('2025-01-20');
    expect(result.bounds.size).toBe(2);
    expect(result.bounds.get('coa-1')).toEqual({
      min: '2025-01-10',
      max: '2025-01-20',
    });
    expect(result.bounds.get('coa-2')).toEqual({
      min: '2025-01-15',
      max: '2025-01-15',
    });
  });

  it('should handle entries with different COAs and dates', () => {
    const entries: LedgerEntryInput[] = [
      {
        fs_date: '2025-01-05',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: -500,
        description: 'Test',
      },
      {
        fs_date: '2025-01-10',
        coa_id: 'coa-2',
        source_currency_id: 'usd-id',
        source_amount: -300,
        description: 'Test',
      },
      {
        fs_date: '2025-01-15',
        coa_id: 'coa-3',
        source_currency_id: 'usd-id',
        source_amount: -200,
        description: 'Test',
      },
      {
        fs_date: '2025-01-20',
        coa_id: 'coa-1',
        source_currency_id: 'usd-id',
        source_amount: 1000,
        description: 'Test',
      },
    ];

    const result = processEntriesDates(entries);

    expect(result.minYMD).toBe('2025-01-05');
    expect(result.maxYMD).toBe('2025-01-20');
    expect(result.bounds.size).toBe(3);
    expect(result.bounds.get('coa-1')).toEqual({
      min: '2025-01-05',
      max: '2025-01-20',
    });
    expect(result.bounds.get('coa-2')).toEqual({
      min: '2025-01-10',
      max: '2025-01-10',
    });
    expect(result.bounds.get('coa-3')).toEqual({
      min: '2025-01-15',
      max: '2025-01-15',
    });
  });

  it('should handle empty entries array', () => {
    const result = processEntriesDates([]);

    expect(result.minYMD).toBeNull();
    expect(result.maxYMD).toBeNull();
    expect(result.bounds.size).toBe(0);
  });
});
