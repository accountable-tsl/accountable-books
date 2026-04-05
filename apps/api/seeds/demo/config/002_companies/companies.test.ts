import type { Knex } from 'knex';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createDemoCompaniesAndUsers,
  deleteDemoCompanies,
} from './companies.fn.js';

// Mock utilities - getDemoUserMap provides user ID lookup, resolveFiltersToIds handles filtering
vi.mock('../../shared/utils.js', () => ({
  resolveFiltersToIds: vi
    .fn()
    .mockReturnValue(['bizDemoUS', 'firmDemoUS', 'indDemoUS']),
  getDemoUserMap: vi.fn().mockResolvedValue(
    new Map([
      ['demo.us@example.com', 'user-1'],
      ['demo.ng@example.com', 'user-2'],
    ]),
  ),
}));

// Mock companies data - provides the demo companies to be created
vi.mock('./companies.data.js', () => ({
  DEMO_COMPANIES_IDS: ['bizDemoUS', 'firmDemoUS', 'indDemoUS'],
  generateDemoCompaniesMap: vi.fn().mockReturnValue([
    {
      company: {
        name: 'Green Tech Demo Inc.',
        shortCode: 'bizDemoUS',
        companyType: 'business',
        accountingBasis: 'modified_accrual_basis',
        country: { code: 'US', id: 'country-us' },
        currency: { id: 'currency-usd' },
        createdBy: { email: 'demo.us@example.com' },
      },
    },
    {
      company: {
        name: 'Smith and Co. Demo CPA',
        shortCode: 'firmDemoUS',
        companyType: 'accounting_firm',
        accountingBasis: 'modified_accrual_basis',
        country: { code: 'US', id: 'country-us' },
        currency: { id: 'currency-usd' },
        createdBy: { email: 'demo.us@example.com' },
        slug: 'us-demo',
      },
    },
    {
      company: {
        name: "Uma's Finances",
        shortCode: 'indDemoUS',
        companyType: 'individual',
        accountingBasis: 'modified_cash_basis',
        country: { code: 'US', id: 'country-us' },
        currency: { id: 'currency-usd' },
        createdBy: { email: 'demo.us@example.com' },
      },
    },
  ]),
}));

/**
 * Creates a simplified mock Knex transaction for testing.
 * Returns different responses based on the table being queried.
 */
const createMockTransaction = (): Knex.Transaction => {
  const mockTransaction = vi.fn((tableName: string) => {
    // Create a mock query builder with chaining methods
    const queryBuilder = {
      insert: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      first: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    };

    // Configure responses based on table
    switch (tableName) {
      case 'companies':
        queryBuilder.returning.mockResolvedValue([
          { id: 'comp-1', short_code: 'bizDemoUS' },
          { id: 'comp-2', short_code: 'firmDemoUS' },
          { id: 'comp-3', short_code: 'indDemoUS' },
        ]);
        queryBuilder.select.mockResolvedValue([
          { id: 'comp-1', short_code: 'bizDemoUS', type: 'business' },
          { id: 'comp-2', short_code: 'firmDemoUS', type: 'accounting_firm' },
          { id: 'comp-3', short_code: 'indDemoUS', type: 'individual' },
        ]);
        queryBuilder.delete.mockResolvedValue(3);
        break;
      case 'roles':
        queryBuilder.select.mockResolvedValue([
          { id: 'role-1', key: 'admin' },
          { id: 'role-2', key: 'client_owner' },
        ]);
        break;
      default:
        queryBuilder.first.mockResolvedValue({ id: 'platform-firm-1' });
        queryBuilder.select.mockResolvedValue([]);
        queryBuilder.delete.mockResolvedValue(0);
    }

    return queryBuilder;
  });

  return mockTransaction as any as Knex.Transaction;
};

// Test the main company creation function
describe('createDemoCompaniesAndUsers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should create companies successfully', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoCompaniesAndUsers(mockTransaction);

    // Should query companies table for insertion
    expect(mockTransaction).toHaveBeenCalledWith('companies');
  });

  test('should handle US GAAP vs IFRS reporting frameworks', async () => {
    const mockTransaction = createMockTransaction();

    // Test NG company gets IFRS
    const { generateDemoCompaniesMap } = await import('./companies.data.js');
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          name: 'Nigeria Demo Inc.',
          shortCode: 'bizDemoNG',
          companyType: 'business',
          country: { code: 'NG', id: 'country-ng' },
          currency: { id: 'currency-ngn' },
          createdBy: { email: 'demo.ng@example.com' },
        },
      },
    ]);

    await createDemoCompaniesAndUsers(mockTransaction);

    expect(mockTransaction).toHaveBeenCalledWith('companies');
  });

  test('should handle accounting firm metadata', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoCompaniesAndUsers(mockTransaction);

    // Should query accounting_firms_meta table
    expect(mockTransaction).toHaveBeenCalledWith('accounting_firms_meta');
  });

  test('should handle empty companies list', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty companies list
    const { generateDemoCompaniesMap } = await import('./companies.data.js');
    (generateDemoCompaniesMap as any).mockReturnValueOnce([]);

    await createDemoCompaniesAndUsers(mockTransaction);

    // Should log and exit early
    expect(console.log).toHaveBeenCalledWith(
      'No companies to create based on filters',
    );
  });

  test('should handle user not found error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty user map
    const { getDemoUserMap } = await import('../../shared/utils.js');
    (getDemoUserMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoCompaniesAndUsers(mockTransaction)).rejects.toThrow(
      'Demo user not found for email: demo.us@example.com',
    );
  });

  test('should handle filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { countryCodes: ['US' as any] };

    await createDemoCompaniesAndUsers(mockTransaction, filters);

    // Should pass filters to generateDemoCompaniesMap
    const { generateDemoCompaniesMap } = await import('./companies.data.js');
    expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filters);
  });
});

// Test the deletion function
describe('deleteDemoCompanies', () => {
  let mockTransaction: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create mock transaction that handles deletion queries
    mockTransaction = vi.fn((tableName: string) => {
      const queryBuilder = {
        whereIn: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        select: vi.fn(),
        delete: vi.fn(),
      };

      // Configure based on table
      if (tableName === 'companies') {
        queryBuilder.select.mockResolvedValue([
          { id: 'comp-1' },
          { id: 'comp-2' },
          { id: 'comp-3' },
        ]);
        queryBuilder.delete.mockResolvedValue(3);
      } else {
        queryBuilder.delete.mockResolvedValue(0);
      }

      return queryBuilder;
    });
  });

  test('should delete companies in correct order', async () => {
    const result = await deleteDemoCompanies(mockTransaction);

    // Should delete from multiple tables in proper order
    expect(mockTransaction).toHaveBeenCalledWith('accounting_firms_meta');
    expect(mockTransaction).toHaveBeenCalledWith('user_company_roles');
    expect(mockTransaction).toHaveBeenCalledWith('client_firm_assignments');
    expect(mockTransaction).toHaveBeenCalledWith('companies');

    // Should return deletion count
    expect(result).toBe(3);
  });

  test('should handle no companies found', async () => {
    // Mock empty result
    mockTransaction.mockImplementation(() => ({
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue([]), // No companies found
      delete: vi.fn(),
    }));

    const result = await deleteDemoCompanies(mockTransaction);

    expect(result).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      'No demo companies found to delete',
    );
  });

  test('should apply filters', async () => {
    const filters = { countryCodes: ['US' as any] };

    await deleteDemoCompanies(mockTransaction, filters);

    // Should call resolveFiltersToIds with filters
    const { resolveFiltersToIds } = await import('../../shared/utils.js');
    expect(resolveFiltersToIds).toHaveBeenCalledWith(filters);
  });
});
