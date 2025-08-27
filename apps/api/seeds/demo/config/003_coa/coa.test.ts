import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { createDemoCoa, deleteDemoCoa } from './coa.fn.js';
import type { DemoFilter } from '../../shared/config.js';

// Mock transaction
let mockTransaction: any;

// Mock database query builder
const mockQueryBuilder = {
  where: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  onConflict: vi.fn().mockReturnThis(),
  ignore: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  first: vi.fn(),
};

// Mock COA template query builder
const mockCoaTemplateQuery = vi.fn().mockReturnValue(mockQueryBuilder);

// Mock utility functions
vi.mock('../../shared/utils.js', () => ({
  getCompanyIdMap: vi.fn().mockImplementation((trx) => {
    if (!trx) throw new Error('Transaction is required');
    return Promise.resolve(
      new Map([
        ['bizDemoUS', 'company-id-1'],
        ['firmDemoUS', 'company-id-2'],
        ['indDemoUS', 'company-id-3'],
      ]),
    );
  }),
  getDemoUserMap: vi.fn().mockImplementation((trx) => {
    if (!trx) throw new Error('Transaction is required');
    return Promise.resolve(
      new Map([
        ['alice@us-demo.com', 'user-id-1'],
        ['ngozi@ng-demo.com', 'user-id-2'],
      ]),
    );
  }),
  deleteDemoData: vi.fn().mockImplementation(({ trx }) => {
    if (!trx) throw new Error('Transaction is required');
    return Promise.resolve(undefined);
  }),
}));

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
        name: 'US Firm Demo',
        companyType: 'accounting_firm',
        currency: { id: 'currency-usd' },
        createdBy: { email: 'alice@us-demo.com' },
      },
    },
  ]),
}));

describe('COA Seeding Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryBuilder.first.mockResolvedValue(null);
    mockQueryBuilder.returning.mockResolvedValue([]);
    mockQueryBuilder.select.mockResolvedValue([]);

    // Reset mock transaction - it should be a function that returns query builders
    mockTransaction = vi.fn((tableName: string) => {
      if (tableName === 'coa_templates') {
        return mockCoaTemplateQuery();
      }
      return mockQueryBuilder;
    });
    mockTransaction.commit = vi.fn();
    mockTransaction.rollback = vi.fn();
  });

  describe('createDemoCoa', () => {
    test('should create COA entries with individual template', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'indDemoUS',
            companyType: 'individual',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          where: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([
              { code: '1000', name: 'Cash', account_type_id: 'asset-type', locked: false },
              {
                code: '2000',
                name: 'Accounts Payable',
                account_type_id: 'liability-type',
                locked: true,
              },
            ]),
          }),
        }),
      });

      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null), // No existing COA
        }),
        insert: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          onConflict: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            ignore: vi.fn().mockReturnValue({
              ...mockQueryBuilder,
              returning: vi.fn().mockResolvedValue([{ id: 'coa-1' }, { id: 'coa-2' }]),
            }),
          }),
        }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockCoaTable(),
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
      expect(mockTransaction).toHaveBeenCalledWith('coa');
    });

    test('should create COA entries with business template', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'bizDemoUS',
            companyType: 'business',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          where: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([
              { code: '1000', name: 'Cash', account_type_id: 'asset-type', locked: false },
              { code: '4000', name: 'Revenue', account_type_id: 'revenue-type', locked: false },
            ]),
          }),
        }),
      });

      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null),
        }),
        insert: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          onConflict: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            ignore: vi.fn().mockReturnValue({
              ...mockQueryBuilder,
              returning: vi.fn().mockResolvedValue([{ id: 'coa-1' }, { id: 'coa-2' }]),
            }),
          }),
        }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockCoaTable(),
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    });

    test('should create COA entries with accounting firm template', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'firmDemoUS',
            companyType: 'accounting_firm',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          where: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([
              { code: '1000', name: 'Cash', account_type_id: 'asset-type', locked: true },
              {
                code: '5000',
                name: 'Professional Fees',
                account_type_id: 'revenue-type',
                locked: false,
              },
            ]),
          }),
        }),
      });

      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null),
        }),
        insert: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          onConflict: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            ignore: vi.fn().mockReturnValue({
              ...mockQueryBuilder,
              returning: vi.fn().mockResolvedValue([{ id: 'coa-1' }, { id: 'coa-2' }]),
            }),
          }),
        }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockCoaTable(),
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    });

    test('should handle COA idempotency - skip existing COA', async () => {
      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue({ id: 'existing-coa-1' }), // Existing COA
        }),
      });

      (mockTransaction as any) = mockCoaTable;

      await createDemoCoa(mockTransaction);

      // Should not attempt to insert when COA already exists
      expect(mockCoaTable).toHaveBeenCalledWith('coa');
    });

    test('should handle missing company ID gracefully', async () => {
      const { getCompanyIdMap } = await import('../../shared/utils.js');
      (getCompanyIdMap as any).mockResolvedValue(new Map()); // Empty company map

      await createDemoCoa(mockTransaction);

      // Should skip companies without valid IDs
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test('should handle missing COA template gracefully', async () => {
      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          where: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([]), // No template found
          }),
        }),
      });

      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockCoaTable(),
      );

      // Should not throw error when template is not found
      await expect(createDemoCoa(mockTransaction)).resolves.not.toThrow();
    });

    test('should handle user lookup correctly', async () => {
      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null),
        }),
        insert: vi.fn().mockImplementation((coaData) => {
          // Validate that user ID is resolved correctly
          expect(Array.isArray(coaData)).toBe(true);
          coaData.forEach((coa: any) => {
            expect(coa).toHaveProperty('created_by_id', 'user-id-1');
            expect(coa).toHaveProperty('company_id', 'company-id-1');
            expect(coa).toHaveProperty('source', 'template');
            expect(coa).toHaveProperty('is_active', true);
          });

          return {
            ...mockQueryBuilder,
            onConflict: vi.fn().mockReturnValue({
              ...mockQueryBuilder,
              ignore: vi.fn().mockReturnValue({
                ...mockQueryBuilder,
                returning: vi.fn().mockResolvedValue([{ id: 'coa-1' }]),
              }),
            }),
          };
        }),
      });

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          where: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            select: vi
              .fn()
              .mockResolvedValue([
                { code: '1000', name: 'Cash', account_type_id: 'asset-type', locked: false },
              ]),
          }),
        }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockCoaTable(),
      );

      await createDemoCoa(mockTransaction);

      expect(mockCoaTable).toHaveBeenCalledWith('coa');
    });

    test('should handle filters correctly', async () => {
      const filter: DemoFilter = { countryCodes: ['US'] };

      await createDemoCoa(mockTransaction, filter);

      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filter);
    });

    test('should handle empty companies map', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([]);

      await createDemoCoa(mockTransaction);

      // Should exit early when no companies to process
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test('should handle user not found error', async () => {
      const { getDemoUserMap } = await import('../../shared/utils.js');
      (getDemoUserMap as any).mockResolvedValue(new Map()); // Empty user map

      await expect(createDemoCoa(mockTransaction)).rejects.toThrow('Demo user not found for email');
    });

    test('should handle unknown company type', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'unknownDemo',
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

  describe('deleteDemoCoa', () => {
    test('should delete COA entries', async () => {
      await deleteDemoCoa(mockTransaction);

      const { deleteDemoData } = await import('../../shared/utils.js');
      expect(deleteDemoData).toHaveBeenCalledWith({
        trx: mockTransaction,
        table: 'coa',
        filters: undefined,
      });
    });

    test('should delete COA entries with filters', async () => {
      const filter: DemoFilter = { companyIds: ['bizDemoUS'] };

      await deleteDemoCoa(mockTransaction, filter);

      const { deleteDemoData } = await import('../../shared/utils.js');
      expect(deleteDemoData).toHaveBeenCalledWith({
        trx: mockTransaction,
        table: 'coa',
        filters: filter,
      });
    });

    test('should handle deletion errors', async () => {
      const { deleteDemoData } = await import('../../shared/utils.js');
      const deletionError = new Error('Deletion failed');
      (deleteDemoData as any).mockRejectedValue(deletionError);

      await expect(deleteDemoCoa(mockTransaction)).rejects.toThrow(deletionError);
    });
  });

  describe('Template Selection Logic', () => {
    test('should select individual template for individual companies', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'indDemoUS',
            companyType: 'individual',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi
          .fn()
          .mockImplementation((field, value) => {
            if (field === 'template_name') {
              expect(value).toBe('ind:none:basic:nocode:v1');
            }
            return mockQueryBuilder;
          })
          .mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([]),
          }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockQueryBuilder,
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    });

    test('should select accounting firm template for accounting firms', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'firmDemoUS',
            companyType: 'accounting_firm',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi
          .fn()
          .mockImplementation((field, value) => {
            if (field === 'template_name') {
              expect(value).toBe('acc:prof:basic:code:v1');
            }
            return mockQueryBuilder;
          })
          .mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([]),
          }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockQueryBuilder,
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    });

    test('should select business template for business companies', async () => {
      const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');
      (generateDemoCompaniesMap as any).mockReturnValue([
        {
          company: {
            shortCode: 'bizDemoUS',
            companyType: 'business',
            currency: { id: 'currency-usd' },
            createdBy: { email: 'alice@us-demo.com' },
          },
        },
      ]);

      const mockCoaTemplateQuery = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi
          .fn()
          .mockImplementation((field, value) => {
            if (field === 'template_name') {
              // Business templates are randomized, so just check it's one of the valid ones
              const businessTemplates = [
                'biz:int_design:adv:code:v1',
                'biz:int_design:adv:nocode:v1',
                'biz:saas:basic:code:v1',
                'biz:none:basic:nocode:v1',
                'biz:saas:basic:nocode:v1',
              ];
              expect(businessTemplates).toContain(value);
            }
            return mockQueryBuilder;
          })
          .mockReturnValue({
            ...mockQueryBuilder,
            select: vi.fn().mockResolvedValue([]),
          }),
      });

      (mockTransaction as any) = vi.fn((table: string) =>
        table === 'coa_templates' ? mockCoaTemplateQuery() : mockQueryBuilder,
      );

      await createDemoCoa(mockTransaction);

      expect(mockTransaction).toHaveBeenCalledWith('coa_templates');
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined transaction', async () => {
      // These functions don't validate null transactions explicitly,
      // but they will fail when trying to use the transaction
      await expect(createDemoCoa(null as any)).rejects.toThrow();
      await expect(deleteDemoCoa(null as any)).rejects.toThrow();
    });

    test('should handle null/undefined filters', async () => {
      await expect(createDemoCoa(mockTransaction, undefined)).resolves.not.toThrow();
      await expect(createDemoCoa(mockTransaction, null as any)).resolves.not.toThrow();
      await expect(deleteDemoCoa(mockTransaction, undefined)).resolves.not.toThrow();
    });

    test('should handle database constraint violations during COA creation', async () => {
      const constraintError = new Error('duplicate key value violates unique constraint');
      const mockCoaTable = vi.fn().mockReturnValue({
        ...mockQueryBuilder,
        where: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          first: vi.fn().mockResolvedValue(null),
        }),
        insert: vi.fn().mockReturnValue({
          ...mockQueryBuilder,
          onConflict: vi.fn().mockReturnValue({
            ...mockQueryBuilder,
            ignore: vi.fn().mockRejectedValue(constraintError),
          }),
        }),
      });

      (mockTransaction as any) = mockCoaTable;

      await expect(createDemoCoa(mockTransaction)).rejects.toThrow(constraintError);
    });
  });
});
