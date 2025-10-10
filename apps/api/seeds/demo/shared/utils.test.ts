import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import type { Knex } from 'knex';
import {
  resolveFiltersToIds,
  deleteDemoData,
  loadDemoCompanies,
  getCompanyIdMap,
  getCompanyId,
  getFilteredCompanyIds,
  getDemoCompanies,
  clearCompanyCache,
  loadAccountTypes,
  getAccountTypeByKey,
  getAccountTypeMap,
  clearAccountTypesCache,
  loadBanks,
  getBankMap,
  clearBanksCache,
  loadDemoUsers,
  getDemoUserByEmail,
  getDemoUserMap,
  clearDemoUsersCache,
  clearAllCaches,
} from './utils.js';
import {
  DEMO_COMPANIES,
  US_DEMO_COMPANIES,
} from '../config/002_companies/companies.data.js';

// Mock transaction and query builders
let mockTransaction: any;

const mockQueryBuilder = {
  where: vi.fn().mockReturnThis(),
  whereIn: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  join: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  first: vi.fn(),
  clone: vi.fn().mockReturnThis(),
  clearSelect: vi.fn().mockReturnThis(),
  toSQL: vi.fn(),
};

const createMockCompanies = () => [
  { id: 'company-1', short_code: 'bizDemoUS', is_demo_company: true },
  { id: 'company-2', short_code: 'firmDemoUS', is_demo_company: true },
  { id: 'company-3', short_code: 'indDemoUS', is_demo_company: true },
];

const createMockAccountTypes = () => [
  { id: 'at-1', key: 'asset', label: 'Assets' },
  { id: 'at-2', key: 'liability', label: 'Liabilities' },
  { id: 'at-3', key: 'equity', label: 'Equity' },
];

const createMockBanks = () => [
  { id: 'bank-1', key: 'chase', display_name: 'Chase Bank' },
  { id: 'bank-2', key: 'wells_fargo', display_name: 'Wells Fargo' },
  { id: 'bank-3', key: 'access_bank', display_name: 'Access Bank' },
];

const createMockUsers = () => [
  {
    id: 'user-1',
    email: 'alice@us-demo.com',
    firstname: 'Alice',
    lastname: 'Smith',
  },
  {
    id: 'user-2',
    email: 'ngozi@ng-demo.com',
    firstname: 'Ngozi',
    lastname: 'Okafor',
  },
];

beforeEach(() => {
  vi.clearAllMocks();

  mockTransaction = vi.fn((tableName: string) => {
    const builder = { ...mockQueryBuilder };

    switch (tableName) {
      case 'companies':
        builder.select.mockResolvedValue(createMockCompanies());
        break;
      case 'account_types':
        builder.select.mockResolvedValue(createMockAccountTypes());
        break;
      case 'banks':
        builder.select.mockResolvedValue(createMockBanks());
        break;
      case 'users':
        builder.select.mockResolvedValue(createMockUsers());
        break;
      default:
        builder.select.mockResolvedValue([]);
    }

    return builder;
  });
});

afterEach(() => {
  clearAllCaches();
});

describe('resolveFiltersToIds', () => {
  test('returns empty array for empty filter', () => {
    const result = resolveFiltersToIds({});
    expect(result).toEqual([]);
  });

  test('returns all US company shortCodes when filtering by US country', () => {
    const result = resolveFiltersToIds({ countryCodes: ['US'] });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.country.code === 'US',
    ).map((c) => c.shortCode);

    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all NG company shortCodes when filtering by NG country', () => {
    const result = resolveFiltersToIds({ countryCodes: ['NG'] });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.country.code === 'NG',
    ).map((c) => c.shortCode);

    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all business company shortCodes when filtering by business type', () => {
    const result = resolveFiltersToIds({ companyTypes: ['business'] });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.companyType === 'business',
    ).map((c) => c.shortCode);

    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns all individual company shortCodes when filtering by individual type', () => {
    const result = resolveFiltersToIds({ companyTypes: ['individual'] });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.companyType === 'individual',
    ).map((c) => c.shortCode);

    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns valid company shortCode when filtering by existing company shortCode', () => {
    const validShortCode = US_DEMO_COMPANIES[0].shortCode;
    const result = resolveFiltersToIds({ companyIds: [validShortCode] });

    expect(result).toEqual([validShortCode]);
  });

  test('filters out invalid company shortCodes', () => {
    const validShortCode = US_DEMO_COMPANIES[0].shortCode;
    const invalidShortCode = 'invalid-company-id';
    const result = resolveFiltersToIds({
      companyIds: [validShortCode, invalidShortCode],
    });

    expect(result).toEqual([validShortCode]);
  });

  test('returns empty array for only invalid company shortCodes', () => {
    const result = resolveFiltersToIds({
      companyIds: ['invalid-id-1', 'invalid-id-2'],
    });

    expect(result).toEqual([]);
  });

  test('combines multiple filters with OR logic', () => {
    const result = resolveFiltersToIds({
      countryCodes: ['NG'],
      companyTypes: ['individual'],
    });

    const ngCompanies = DEMO_COMPANIES.filter(
      (c) => c.country.code === 'NG',
    ).map((c) => c.shortCode);
    const individualCompanies = DEMO_COMPANIES.filter(
      (c) => c.companyType === 'individual',
    ).map((c) => c.shortCode);
    const expectedIds = [...new Set([...ngCompanies, ...individualCompanies])];

    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('handles multiple country codes', () => {
    const result = resolveFiltersToIds({ countryCodes: ['US', 'NG'] });

    expect(result).toHaveLength(6); // All companies
    expect(result.sort()).toEqual(
      DEMO_COMPANIES.map((c) => c.shortCode).sort(),
    );
  });

  test('handles multiple company types', () => {
    const result = resolveFiltersToIds({
      companyTypes: ['business', 'individual'],
    });
    const expectedIds = DEMO_COMPANIES.filter(
      (c) => c.companyType === 'business' || c.companyType === 'individual',
    ).map((c) => c.shortCode);

    expect(result).toHaveLength(4);
    expect(result.sort()).toEqual(expectedIds.sort());
  });

  test('returns unique shortCodes when filters overlap', () => {
    const usBusinessShortCode = US_DEMO_COMPANIES[1].shortCode;
    const result = resolveFiltersToIds({
      countryCodes: ['US'],
      companyTypes: ['business'],
      companyIds: [usBusinessShortCode],
    });

    // Should not duplicate the US business company shortCode
    const uniqueIds = [...new Set(result)];
    expect(result).toEqual(uniqueIds);
  });
});

describe('deleteDemoData', () => {
  test('should build and execute delete query with default parameters', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);

    // Reset the mock to set up the proper chain
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockTransaction.mockReturnValue(mockQueryBuilder);

    await deleteDemoData({
      trx: mockTransaction,
      table: 'test_table',
    });

    expect(mockTransaction).toHaveBeenCalledWith('test_table');
    expect(mockQueryBuilder.join).toHaveBeenCalledWith(
      'companies',
      'test_table.company_id',
      'companies.id',
    );
    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      'companies.is_demo_company',
      true,
    );
    expect(mockQueryBuilder.delete).toHaveBeenCalled();
  });

  test('should apply filters when provided', async () => {
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockTransaction.mockReturnValue(mockQueryBuilder);

    await deleteDemoData({
      trx: mockTransaction,
      table: 'test_table',
      filters: { countryCodes: ['US'] },
    });

    expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith(
      'companies.short_code',
      expect.any(Array),
    );
    expect(mockQueryBuilder.delete).toHaveBeenCalled();
  });

  test('should return early when requireFilters is true and no filters resolve', async () => {
    mockTransaction.mockClear(); // Clear previous calls

    await deleteDemoData({
      trx: mockTransaction,
      table: 'test_table',
      filters: { companyIds: ['nonexistent'] },
      requireFilters: true,
    });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test('should execute before hook if provided', async () => {
    const beforeFn = vi.fn();
    const mockQueryBuilder = {
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockTransaction.mockReturnValue(mockQueryBuilder);

    await deleteDemoData({
      trx: mockTransaction,
      table: 'test_table',
      before: beforeFn,
    });

    expect(beforeFn).toHaveBeenCalled();
    expect(mockQueryBuilder.delete).toHaveBeenCalled();
  });

  test('should return SQL when dryRun is true', async () => {
    const mockSQL = { sql: 'DELETE FROM test_table', bindings: [] };
    const mockQueryClone = {
      clearSelect: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnValue({
        toSQL: vi.fn().mockReturnValue(mockSQL),
      }),
    };
    mockQueryBuilder.clone = vi.fn().mockReturnValue(mockQueryClone);

    const result = await deleteDemoData({
      trx: mockTransaction,
      table: 'test_table',
      dryRun: true,
    });

    expect(result).toEqual(mockSQL);
    expect(mockQueryClone.clearSelect).toHaveBeenCalled();
  });

  test('should throw error for disallowed table when allowTables is provided', async () => {
    await expect(
      deleteDemoData({
        trx: mockTransaction,
        table: 'forbidden_table',
        allowTables: ['allowed_table'],
      }),
    ).rejects.toThrow('Deletion from table forbidden_table is not allowed');
  });
});

describe('Company Cache Functions', () => {
  test('loadDemoCompanies should cache results', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    // First call
    const result1 = await loadDemoCompanies(mockTransaction);
    // Second call should use cache
    const result2 = await loadDemoCompanies(mockTransaction);

    expect(result1).toEqual(mockCompanies);
    expect(result2).toEqual(mockCompanies);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('loadDemoCompanies should refresh cache when requested', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    await loadDemoCompanies(mockTransaction);
    await loadDemoCompanies(mockTransaction, true); // refresh

    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  test('getCompanyIdMap should return shortCode to ID mapping', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    const result = await getCompanyIdMap(mockTransaction);

    expect(result.get('bizDemoUS')).toBe('company-1');
    expect(result.get('firmDemoUS')).toBe('company-2');
    expect(result.get('indDemoUS')).toBe('company-3');
  });

  test('getCompanyId should return ID for valid shortCode', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    const result = await getCompanyId(mockTransaction, 'bizDemoUS');
    expect(result).toBe('company-1');
  });

  test('getCompanyId should return undefined for invalid shortCode', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    const result = await getCompanyId(mockTransaction, 'nonexistent');
    expect(result).toBeUndefined();
  });

  test('clearCompanyCache should clear the cache', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    await loadDemoCompanies(mockTransaction);
    clearCompanyCache();
    await loadDemoCompanies(mockTransaction);

    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });
});

describe('Account Types Cache Functions', () => {
  test('loadAccountTypes should cache results', async () => {
    const mockTypes = createMockAccountTypes();
    mockQueryBuilder.select.mockResolvedValue(mockTypes);

    const result1 = await loadAccountTypes(mockTransaction);
    const result2 = await loadAccountTypes(mockTransaction);

    expect(result1).toEqual(mockTypes);
    expect(result2).toEqual(mockTypes);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('getAccountTypeByKey should return correct account type', async () => {
    const mockTypes = createMockAccountTypes();
    mockQueryBuilder.select.mockResolvedValue(mockTypes);

    const result = await getAccountTypeByKey(mockTransaction, 'asset');
    expect(result).toEqual({ id: 'at-1', key: 'asset', label: 'Assets' });
  });

  test('getAccountTypeMap should return key to ID mapping', async () => {
    const mockTypes = createMockAccountTypes();
    mockQueryBuilder.select.mockResolvedValue(mockTypes);

    const result = await getAccountTypeMap(mockTransaction);
    expect(result.get('asset')).toBe('at-1');
    expect(result.get('liability')).toBe('at-2');
    expect(result.get('equity')).toBe('at-3');
  });
});

describe('Banks Cache Functions', () => {
  test('loadBanks should cache results', async () => {
    const mockBanks = createMockBanks();
    mockQueryBuilder.select.mockResolvedValue(mockBanks);

    const result1 = await loadBanks(mockTransaction);
    const result2 = await loadBanks(mockTransaction);

    expect(result1).toEqual(mockBanks);
    expect(result2).toEqual(mockBanks);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('getBankMap should return key to ID mapping', async () => {
    const mockBanks = createMockBanks();
    mockQueryBuilder.select.mockResolvedValue(mockBanks);

    const result = await getBankMap(mockTransaction);
    expect(result.get('chase')).toBe('bank-1');
    expect(result.get('wells_fargo')).toBe('bank-2');
    expect(result.get('access_bank')).toBe('bank-3');
  });
});

describe('Demo Users Cache Functions', () => {
  test('loadDemoUsers should cache results', async () => {
    const mockUsers = createMockUsers();
    mockQueryBuilder.select.mockResolvedValue(mockUsers);

    const result1 = await loadDemoUsers(mockTransaction);
    const result2 = await loadDemoUsers(mockTransaction);

    expect(result1).toEqual(mockUsers);
    expect(result2).toEqual(mockUsers);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('getDemoUserByEmail should return correct user', async () => {
    const mockUsers = createMockUsers();
    mockQueryBuilder.select.mockResolvedValue(mockUsers);

    const result = await getDemoUserByEmail(
      mockTransaction,
      'alice@us-demo.com',
    );
    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@us-demo.com',
      firstname: 'Alice',
      lastname: 'Smith',
    });
  });

  test('getDemoUserMap should return email to ID mapping', async () => {
    const mockUsers = createMockUsers();
    mockQueryBuilder.select.mockResolvedValue(mockUsers);

    const result = await getDemoUserMap(mockTransaction);
    expect(result.get('alice@us-demo.com')).toBe('user-1');
    expect(result.get('ngozi@ng-demo.com')).toBe('user-2');
  });
});

describe('Cache Management', () => {
  test('clearAllCaches should clear all caches', () => {
    // This is a simple function that calls other clear functions
    // The individual cache clearing is tested in their respective sections
    expect(() => clearAllCaches()).not.toThrow();
  });
});

describe('getFilteredCompanyIds', () => {
  test('should return filtered company database IDs', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    const result = await getFilteredCompanyIds(mockTransaction, {
      countryCodes: ['US'],
    });
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getDemoCompanies', () => {
  test('should return filtered demo company records', async () => {
    const mockCompanies = createMockCompanies();
    mockQueryBuilder.select.mockResolvedValue(mockCompanies);

    const result = await getDemoCompanies(mockTransaction, {
      countryCodes: ['US'],
    });
    expect(result).toBeInstanceOf(Array);
  });
});
