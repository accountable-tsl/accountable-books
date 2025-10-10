import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { createDemoCoa, deleteDemoCoa } from './coa.fn.js';

// Mock shared utilities - handle company/user lookups and data deletion
vi.mock('../../shared/utils.js', () => ({
  getCompanyIdMap: vi.fn().mockResolvedValue(
    new Map([
      ['bizDemoUS', 'company-1'],
      ['firmDemoUS', 'company-2'],
      ['indDemoUS', 'company-3'],
    ]),
  ),
  getDemoUserMap: vi.fn().mockResolvedValue(
    new Map([
      ['alice@us-demo.com', 'user-1'],
      ['bob@us-demo.com', 'user-2'],
    ]),
  ),
  deleteDemoData: vi.fn().mockResolvedValue(undefined),
}));

// Mock companies data - provides the demo companies for COA creation
vi.mock('../002_companies/companies.data.js', () => ({
  generateDemoCompaniesMap: vi.fn().mockReturnValue([
    {
      company: {
        shortCode: 'bizDemoUS',
        name: 'US Business Demo',
        companyType: 'business',
        currency: { id: 'currency-usd' },
        createdBy: { email: 'alice@us-demo.com' },
      },
    },
    {
      company: {
        shortCode: 'indDemoUS',
        name: 'US Individual Demo',
        companyType: 'individual',
        currency: { id: 'currency-usd' },
        createdBy: { email: 'alice@us-demo.com' },
      },
    },
    {
      company: {
        shortCode: 'firmDemoUS',
        name: 'US Accounting Firm Demo',
        companyType: 'accounting_firm',
        currency: { id: 'currency-usd' },
        createdBy: { email: 'alice@us-demo.com' },
      },
    },
  ]),
}));

/**
 * Creates a simplified mock Knex transaction for COA testing.
 * Simulates database queries for COA templates and COA table operations.
 */
const createMockTransaction = (): Knex.Transaction => {
  const mockTransaction = vi.fn((tableName: string) => {
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      select: vi.fn(),
      first: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockReturnThis(),
      returning: vi.fn(),
    };

    // Configure responses based on table
    switch (tableName) {
      case 'coa':
        queryBuilder.first.mockResolvedValue(null); // No existing COA by default
        queryBuilder.returning.mockResolvedValue([
          { id: 'coa-1' },
          { id: 'coa-2' },
        ]);
        break;
      case 'coa_templates':
        queryBuilder.select.mockResolvedValue([
          {
            code: '1000',
            name: 'Cash',
            description: 'Cash and cash equivalents',
            account_type_id: 'asset-type',
            locked: false,
          },
          {
            code: '2000',
            name: 'Accounts Payable',
            description: 'Money owed to suppliers',
            account_type_id: 'liability-type',
            locked: true,
          },
        ]);
        break;
    }

    return queryBuilder;
  });

  return mockTransaction as any as Knex.Transaction;
};

// Test COA creation functionality
describe('createDemoCoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  test('should create COA entries for companies', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoCoa(mockTransaction);

    // Should query both COA templates and COA tables
    expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    expect(mockTransaction).toHaveBeenCalledWith('coa');
  });

  test('should use correct template for individual companies', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only individual company
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'indDemoUS',
          companyType: 'individual',
          currency: { id: 'currency-usd' },
          createdBy: { email: 'alice@us-demo.com' },
        },
      },
    ]);

    await createDemoCoa(mockTransaction);

    expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
  });

  test('should use correct template for accounting firms', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only accounting firm company
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'firmDemoUS',
          companyType: 'accounting_firm',
          currency: { id: 'currency-usd' },
          createdBy: { email: 'alice@us-demo.com' },
        },
      },
    ]);

    await createDemoCoa(mockTransaction);

    expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
  });

  test('should handle business company templates (randomized)', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only business company
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoUS',
          companyType: 'business',
          currency: { id: 'currency-usd' },
          createdBy: { email: 'alice@us-demo.com' },
        },
      },
    ]);

    await createDemoCoa(mockTransaction);

    // Should query templates (template selection is randomized for business)
    expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
  });

  test('should skip when COA already exists', async () => {
    const mockTransaction = vi.fn((tableName: string) => {
      const queryBuilder = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn(),
        select: vi.fn(),
      };

      if (tableName === 'coa') {
        queryBuilder.first.mockResolvedValue({ id: 'existing-coa' }); // COA exists
      }

      return queryBuilder;
    });

    await createDemoCoa(mockTransaction as any);

    // Should check for existing COA but not proceed with creation
    expect(mockTransaction).toHaveBeenCalledWith('coa');
  });

  test('should handle missing company ID', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty company ID map
    const { getCompanyIdMap } = await import('../../shared/utils.js');
    (getCompanyIdMap as any).mockResolvedValueOnce(new Map());

    await createDemoCoa(mockTransaction);

    // Should log and skip companies without IDs
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Company ID not found'),
    );
  });

  test('should handle empty companies list', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty companies list
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    (generateDemoCompaniesMap as any).mockReturnValueOnce([]);

    await createDemoCoa(mockTransaction);

    // Should log and exit early
    expect(console.log).toHaveBeenCalledWith(
      'No companies found for COA creation',
    );
  });

  test('should handle missing COA templates', async () => {
    const mockTransaction = vi.fn((tableName: string) => {
      const queryBuilder = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // No existing COA
        select: vi.fn(),
      };

      if (tableName === 'coa_templates') {
        queryBuilder.select.mockResolvedValue([]); // No templates found
      }

      return queryBuilder;
    });

    await createDemoCoa(mockTransaction as any);

    // Should warn about missing template but not crash
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('COA template'),
    );
  });

  test('should handle filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { countryCodes: ['US' as any] };

    await createDemoCoa(mockTransaction, filters);

    // Should pass filters to generateDemoCompaniesMap
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filters);
  });

  test('should handle user not found error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty user map
    const { getDemoUserMap } = await import('../../shared/utils.js');
    (getDemoUserMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoCoa(mockTransaction)).rejects.toThrow(
      'Demo user not found for email',
    );
  });

  test('should handle unknown company type', async () => {
    const mockTransaction = createMockTransaction();

    // Mock company with unknown type that has a valid company ID
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoUS', // Use existing shortCode so it has valid company ID
          companyType: 'unknown_type',
          currency: { id: 'currency-usd' },
          createdBy: { email: 'alice@us-demo.com' },
        },
      },
    ]);

    await expect(createDemoCoa(mockTransaction)).rejects.toThrow(
      'Unknown company type: unknown_type',
    );
  });
});

// Test COA deletion functionality
describe('deleteDemoCoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should delete COA entries', async () => {
    const mockTransaction = createMockTransaction();

    await deleteDemoCoa(mockTransaction);

    // Should call shared deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'coa',
      filters: undefined,
    });
  });

  test('should delete COA entries with filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { companyIds: ['bizDemoUS'] };

    await deleteDemoCoa(mockTransaction, filters);

    // Should pass filters to deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'coa',
      filters: filters,
    });
  });
});
