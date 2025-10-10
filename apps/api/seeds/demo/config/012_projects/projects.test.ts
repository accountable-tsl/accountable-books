import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import {
  createDemoProjects,
  getOrCreateDemoProjectsMap,
  deleteDemoProjects,
} from './projects.fn.js';
import { demoProjectsByCompanyMap } from './projects.state.js';

// Mock shared utilities - handle company/user lookups and data deletion
vi.mock('../../shared/utils.js', () => ({
  getDemoUserMap: vi.fn().mockResolvedValue(
    new Map([
      ['alice@us-demo.com', 'user-1'],
      ['bob@ng-demo.com', 'user-2'],
    ]),
  ),
  getDemoCompanies: vi.fn().mockResolvedValue([
    { id: 'company-1', short_code: 'bizDemoUS', type: 'business' },
    { id: 'company-2', short_code: 'firmDemoUS', type: 'accounting_firm' },
    { id: 'company-3', short_code: 'indDemoUS', type: 'individual' },
  ]),
  deleteDemoData: vi.fn().mockResolvedValue(undefined),
}));

// Mock companies data - provides the demo companies for project creation
vi.mock('../002_companies/companies.data.js', () => ({
  generateDemoCompaniesMap: vi.fn().mockReturnValue([
    {
      company: {
        shortCode: 'bizDemoUS',
        companyType: 'business',
      },
      user: {
        id: 'user-1',
        email: 'alice@us-demo.com',
      },
      country: { code: 'US' },
    },
    {
      company: {
        shortCode: 'firmDemoUS',
        companyType: 'accounting_firm',
      },
      user: {
        id: 'user-1',
        email: 'alice@us-demo.com',
      },
      country: { code: 'US' },
    },
    {
      company: {
        shortCode: 'indDemoUS',
        companyType: 'individual',
      },
      user: {
        id: 'user-1',
        email: 'alice@us-demo.com',
      },
      country: { code: 'US' },
    },
  ]),
}));

// Mock project utilities - static and random project generation
vi.mock('./projects.utils.js', () => ({
  generateRandomProjects: vi.fn().mockReturnValue([
    {
      name: 'Random Project Alpha',
      code: 'RPA-01',
      description: 'Generated test project',
      status: 'in_progress',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
    },
  ]),
  getBusinessProjects: vi.fn().mockImplementation((countryCode) => [
    {
      name:
        countryCode === 'NG'
          ? 'Lagos Mainland Store Launch'
          : 'E-commerce Site Redesign',
      code: 'BUS-01',
      description: 'Business project for ' + countryCode,
      status: 'in_progress',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-08-01'),
    },
  ]),
  getFirmProjects: vi.fn().mockReturnValue([
    {
      name: 'Q2 Bookkeeping - Top Clients',
      code: 'BK-Q2',
      description: 'Monthly bookkeeping and reporting',
      status: 'in_progress',
      startDate: new Date('2024-04-01'),
      endDate: new Date('2024-06-30'),
    },
  ]),
}));

// Mock the real addNewProjects model function
vi.mock('../../../../src/domains/projects/projects.model.js', () => ({
  addNewProjects: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'project-1',
        name: 'Test Project',
        code: 'TEST-01',
        description: 'Test project description',
        status: 'in_progress',
        contactId: 'contact-1',
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ],
  }),
}));

/**
 * Creates a simplified mock Knex transaction for projects testing.
 * Simulates database queries for projects and contacts tables.
 */
const createMockTransaction = (
  options: {
    existingProjects?: boolean;
    hasContacts?: boolean;
  } = {},
): Knex.Transaction => {
  const mockTransaction = vi.fn((tableName: string) => {
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      select: vi.fn(),
      first: vi.fn(),
    };

    switch (tableName) {
      case 'projects':
        // Configure whether projects already exist
        queryBuilder.first.mockResolvedValue(
          options.existingProjects ? { id: 'existing-project' } : null,
        );
        break;
      case 'contacts':
        // Configure available contacts for assignment
        if (options.hasContacts === false) {
          queryBuilder.select.mockResolvedValue([]);
        } else {
          queryBuilder.select.mockResolvedValue([
            { id: 'contact-1', display_name: 'Test Contact 1' },
            { id: 'contact-2', display_name: 'Test Contact 2' },
          ]);
        }
        break;
    }

    return queryBuilder;
  });

  return mockTransaction as any as Knex.Transaction;
};

// Test projects creation functionality
describe('createDemoProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the state map before each test
    demoProjectsByCompanyMap.clear();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should create projects for companies', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    const result = await createDemoProjects(mockTransaction);

    // Should query contacts table for assignment and return results
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
    expect(Array.isArray(result)).toBe(true);
  });

  test('should handle business company projects', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock only business company
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-1', short_code: 'bizDemoUS', type: 'business' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoUS',
          companyType: 'business',
        },
        user: {
          id: 'user-1',
          email: 'alice@us-demo.com',
        },
        country: { code: 'US' },
      },
    ]);

    await createDemoProjects(mockTransaction);

    // Should call business project utilities
    const { getBusinessProjects } = await import('./projects.utils.js');
    expect(getBusinessProjects).toHaveBeenCalledWith('US');
  });

  test('should handle accounting firm projects', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock only accounting firm company
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-2', short_code: 'firmDemoUS', type: 'accounting_firm' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'firmDemoUS',
          companyType: 'accounting_firm',
        },
        user: {
          id: 'user-1',
          email: 'alice@us-demo.com',
        },
        country: { code: 'US' },
      },
    ]);

    await createDemoProjects(mockTransaction);

    // Should call firm project utilities
    const { getFirmProjects } = await import('./projects.utils.js');
    expect(getFirmProjects).toHaveBeenCalled();
  });

  test('should skip individual companies (no projects)', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock only individual company
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-3', short_code: 'indDemoUS', type: 'individual' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'indDemoUS',
          companyType: 'individual',
        },
        user: {
          id: 'user-1',
          email: 'alice@us-demo.com',
        },
        country: { code: 'US' },
      },
    ]);

    const result = await createDemoProjects(mockTransaction);

    // Should not call addNewProjects for individual companies (no projects)
    const { addNewProjects } = await import(
      '../../../../src/domains/projects/projects.model.js'
    );
    expect(addNewProjects).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  test('should handle different countries for business projects', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock NG business company
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-ng', short_code: 'bizDemoNG', type: 'business' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoNG',
          companyType: 'business',
        },
        user: {
          id: 'user-2',
          email: 'bob@ng-demo.com',
        },
        country: { code: 'NG' },
      },
    ]);

    await createDemoProjects(mockTransaction);

    // Should call getBusinessProjects with NG country code
    const { getBusinessProjects } = await import('./projects.utils.js');
    expect(getBusinessProjects).toHaveBeenCalledWith('NG');
  });

  test('should skip when projects already exist', async () => {
    const mockTransaction = createMockTransaction({
      existingProjects: true,
      hasContacts: true,
    });

    await createDemoProjects(mockTransaction);

    // Should check for existing projects but not create new ones
    expect(mockTransaction).toHaveBeenCalledWith('projects');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Projects already exist'),
    );
  });

  test('should handle missing contacts error', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: false });

    await expect(createDemoProjects(mockTransaction)).rejects.toThrow(
      'No contacts found for company',
    );
  });

  test('should handle empty companies list', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock empty companies list
    const { getDemoCompanies } = await import('../../shared/utils.js');
    (getDemoCompanies as any).mockResolvedValueOnce([]);

    const result = await createDemoProjects(mockTransaction);

    // Should log and return empty array
    expect(console.log).toHaveBeenCalledWith('Found no projects to create');
    expect(result).toEqual([]);
  });

  test('should handle user not found error', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock empty user map
    const { getDemoUserMap } = await import('../../shared/utils.js');
    (getDemoUserMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoProjects(mockTransaction)).rejects.toThrow(
      'Demo user not found for email',
    );
  });

  test('should handle addNewProjects failure', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Mock addNewProjects to return failure
    const { addNewProjects } = await import(
      '../../../../src/domains/projects/projects.model.js'
    );
    (addNewProjects as any).mockResolvedValueOnce({
      success: false,
      message: 'Project creation failed',
    });

    await expect(createDemoProjects(mockTransaction)).rejects.toThrow(
      'Project creation failed',
    );
  });

  test('should populate state map correctly', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    await createDemoProjects(mockTransaction);

    // Should populate the state map with created projects
    expect(demoProjectsByCompanyMap.size).toBeGreaterThan(0);
    expect(demoProjectsByCompanyMap.get('company-1')).toBeDefined();
  });

  test('should handle filters', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });
    const filters = { countryCodes: ['US' as any] };

    await createDemoProjects(mockTransaction, filters);

    // Should pass filters to getDemoCompanies and generateDemoCompaniesMap
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import(
      '../002_companies/companies.data.js'
    );

    expect(getDemoCompanies).toHaveBeenCalledWith(expect.anything(), filters);
    expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filters);
  });
});

// Test lazy creation functionality
describe('getOrCreateDemoProjectsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demoProjectsByCompanyMap.clear();
  });

  test('should return existing projects map when available', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // Populate state map
    demoProjectsByCompanyMap.set('company-1', [
      {
        id: 'project-1',
        name: 'Test Project',
        code: 'TEST-01',
        description: 'Test project',
        status: 'in_progress',
        contactId: 'contact-1',
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ]);

    const result = await getOrCreateDemoProjectsMap(mockTransaction);

    // Should return existing projects without creating new ones
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  test('should create projects when missing then return map', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });

    // State map is empty (cleared in beforeEach)
    const result = await getOrCreateDemoProjectsMap(mockTransaction);

    // Should create projects first, then return map
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  test('should handle filters in lazy creation', async () => {
    const mockTransaction = createMockTransaction({ hasContacts: true });
    const filters = { companyTypes: ['business' as any] };

    await getOrCreateDemoProjectsMap(mockTransaction, filters);

    // Should pass filters to underlying functions
    const { getDemoCompanies } = await import('../../shared/utils.js');
    expect(getDemoCompanies).toHaveBeenCalledWith(expect.anything(), filters);
  });
});

// Test projects deletion functionality
describe('deleteDemoProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Populate state map before testing deletion
    demoProjectsByCompanyMap.set('company-1', [
      {
        id: 'project-1',
        name: 'Test Project',
        code: 'TEST-01',
        description: 'Test project',
        status: 'in_progress',
        contactId: 'contact-1',
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ]);
  });

  test('should delete projects and clear state map', async () => {
    const mockTransaction = createMockTransaction();

    await deleteDemoProjects(mockTransaction);

    // Should call shared deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'projects',
      filters: undefined,
    });

    // Should clear the state map
    expect(demoProjectsByCompanyMap.size).toBe(0);
  });

  test('should delete projects with filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { companyIds: ['bizDemoUS'] };

    await deleteDemoProjects(mockTransaction, filters);

    // Should pass filters to deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'projects',
      filters: filters,
    });

    // Should still clear the state map
    expect(demoProjectsByCompanyMap.size).toBe(0);
  });
});
