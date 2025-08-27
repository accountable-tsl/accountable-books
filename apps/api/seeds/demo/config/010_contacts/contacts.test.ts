import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { createDemoContacts, deleteDemoContacts, getDemoContactsMap } from './contacts.fn.js';
import { demoContactsByCompanyMap } from './contacts.state.js';

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

// Mock companies data - provides the demo companies for contact creation
vi.mock('../002_companies/companies.data.js', () => ({
  generateDemoCompaniesMap: vi.fn().mockReturnValue([
    {
      company: {
        shortCode: 'bizDemoUS',
        companyType: 'business',
      },
      user: { email: 'alice@us-demo.com' },
      country: { code: 'US' },
    },
    {
      company: {
        shortCode: 'firmDemoUS',
        companyType: 'accounting_firm',
      },
      user: { email: 'alice@us-demo.com' },
      country: { code: 'US' },
    },
    {
      company: {
        shortCode: 'indDemoUS',
        companyType: 'individual',
      },
      user: { email: 'alice@us-demo.com' },
      country: { code: 'US' },
    },
  ]),
}));

// Mock contacts utils - random contact generation
vi.mock('./contacts.utils.js', () => ({
  generateRandomContacts: vi.fn().mockReturnValue([
    {
      displayName: 'Random Contact Corp',
      email: 'random@example.com',
      address: '123 Random St',
      notes: 'Generated contact',
      status: 'active',
    },
  ]),
}));

// Mock static JSON contact data
vi.mock('./raw/us_contacts.json', () => ({
  business: [
    {
      displayName: 'Stripe',
      email: 'support@stripe.com',
      notes: 'Payment gateway',
    },
    {
      displayName: 'AWS',
      email: 'billing@amazon.com',
      notes: 'Cloud hosting',
    },
  ],
  firm: [
    {
      displayName: 'CPA Partners',
      email: 'info@cpapartners.com',
      notes: 'Accounting services',
    },
  ],
  individual: [
    {
      displayName: 'Personal Vendor',
      email: 'vendor@personal.com',
      notes: 'Individual service provider',
    },
  ],
}));

vi.mock('./raw/ng_contacts.json', () => ({
  business: [
    {
      displayName: 'Nigerian Business Ltd',
      email: 'info@ngbiz.com',
      notes: 'Local business partner',
    },
  ],
  firm: [
    {
      displayName: 'Lagos Accounting',
      email: 'contact@lagosacct.ng',
      notes: 'Local accounting firm',
    },
  ],
  individual: [
    {
      displayName: 'Lagos Freelancer',
      email: 'freelancer@lagos.ng',
      notes: 'Individual contractor',
    },
  ],
}));

/**
 * Creates a simplified mock Knex transaction for contacts testing.
 * Simulates database queries for contacts table operations.
 */
const createMockTransaction = (options: { existingContacts?: boolean } = {}): Knex.Transaction => {
  const mockTransaction = vi.fn((tableName: string) => {
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockReturnThis(),
      returning: vi.fn(),
    };

    if (tableName === 'contacts') {
      // Configure whether contacts already exist
      queryBuilder.first.mockResolvedValue(
        options.existingContacts ? { id: 'existing-contact' } : null,
      );

      // Mock successful insertion
      queryBuilder.returning.mockResolvedValue([
        {
          id: 'contact-1',
          email: 'support@stripe.com',
          display_name: 'Stripe',
          status: 'active',
          company_id: 'company-1',
          created_by_id: 'user-1',
        },
        {
          id: 'contact-2',
          email: 'billing@amazon.com',
          display_name: 'AWS',
          status: 'active',
          company_id: 'company-1',
          created_by_id: 'user-1',
        },
      ]);
    }

    return queryBuilder;
  });

  return mockTransaction as any as Knex.Transaction;
};

// Test contacts creation functionality
describe('createDemoContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the state map before each test
    demoContactsByCompanyMap.clear();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should create contacts for companies', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoContacts(mockTransaction);

    // Should query contacts table for insertion
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
  });

  test('should handle business company contacts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only business company in both getDemoCompanies and generateDemoCompaniesMap
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-1', short_code: 'bizDemoUS', type: 'business' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoUS',
          companyType: 'business',
        },
        user: { email: 'alice@us-demo.com' },
        country: { code: 'US' },
      },
    ]);

    await createDemoContacts(mockTransaction);

    // Should include business contacts + random contacts
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
  });

  test('should handle accounting firm contacts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only accounting firm company in both mocks
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-2', short_code: 'firmDemoUS', type: 'accounting_firm' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'firmDemoUS',
          companyType: 'accounting_firm',
        },
        user: { email: 'alice@us-demo.com' },
        country: { code: 'US' },
      },
    ]);

    await createDemoContacts(mockTransaction);

    // Should include business + firm contacts + random contacts
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
  });

  test('should handle individual company contacts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock only individual company in both mocks
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-3', short_code: 'indDemoUS', type: 'individual' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'indDemoUS',
          companyType: 'individual',
        },
        user: { email: 'alice@us-demo.com' },
        country: { code: 'US' },
      },
    ]);

    await createDemoContacts(mockTransaction);

    // Should include individual contacts + random contacts
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
  });

  test('should handle Nigeria country contacts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock NG company in both mocks
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    (getDemoCompanies as any).mockResolvedValueOnce([
      { id: 'company-ng', short_code: 'bizDemoNG', type: 'business' },
    ]);
    (generateDemoCompaniesMap as any).mockReturnValueOnce([
      {
        company: {
          shortCode: 'bizDemoNG',
          companyType: 'business',
        },
        user: { email: 'bob@ng-demo.com' },
        country: { code: 'NG' },
      },
    ]);

    await createDemoContacts(mockTransaction);

    // Should query contacts table with NG-specific data
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
  });

  test('should skip when contacts already exist', async () => {
    const mockTransaction = createMockTransaction({ existingContacts: true });

    await createDemoContacts(mockTransaction);

    // Should check for existing contacts but not proceed with insertion
    expect(mockTransaction).toHaveBeenCalledWith('contacts');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Contacts already exist'));
  });

  test('should handle empty companies list', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty companies list from getRawContactsForInsertion
    const { getDemoCompanies } = await import('../../shared/utils.js');
    (getDemoCompanies as any).mockResolvedValueOnce([]);

    await createDemoContacts(mockTransaction);

    // Should log and exit early
    expect(console.log).toHaveBeenCalledWith('No companies found for contact creation');
  });

  test('should handle user not found error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty user map
    const { getDemoUserMap } = await import('../../shared/utils.js');
    (getDemoUserMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoContacts(mockTransaction)).rejects.toThrow(
      'Demo user not found for email',
    );
  });

  test('should populate state map correctly', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoContacts(mockTransaction);

    // Should populate the state map with created contacts
    expect(demoContactsByCompanyMap.size).toBeGreaterThan(0);
    expect(demoContactsByCompanyMap.get('company-1')).toBeDefined();
  });

  test('should handle filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { countryCodes: ['US' as any] };

    await createDemoContacts(mockTransaction, filters);

    // Should pass filters to getDemoCompanies and generateDemoCompaniesMap
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    expect(getDemoCompanies).toHaveBeenCalledWith(expect.anything(), filters);
    expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filters);
  });
});

// Test contacts deletion functionality
describe('deleteDemoContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Populate state map before testing deletion
    demoContactsByCompanyMap.set('company-1', [
      {
        id: 'contact-1',
        displayName: 'Test Contact',
        email: 'test@example.com',
        status: 'active',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ]);
  });

  test('should delete contacts and clear state map', async () => {
    const mockTransaction = createMockTransaction();

    await deleteDemoContacts(mockTransaction);

    // Should call shared deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'contacts',
      filters: undefined,
    });

    // Should clear the state map
    expect(demoContactsByCompanyMap.size).toBe(0);
  });

  test('should delete contacts with filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { companyIds: ['bizDemoUS'] };

    await deleteDemoContacts(mockTransaction, filters);

    // Should pass filters to deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'contacts',
      filters: filters,
    });

    // Should still clear the state map
    expect(demoContactsByCompanyMap.size).toBe(0);
  });
});

// Test contacts map functionality
describe('getDemoContactsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return contacts map when state is populated', async () => {
    const mockTransaction = createMockTransaction();

    // Populate state map
    demoContactsByCompanyMap.set('company-1', [
      {
        id: 'contact-1',
        displayName: 'Test Contact',
        email: 'test@example.com',
        status: 'active',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ]);

    const result = await getDemoContactsMap(mockTransaction);

    // Should return contacts map with populated data
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  test('should handle filters in contacts map', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { countryCodes: ['US' as any] };

    // Populate state map
    demoContactsByCompanyMap.set('company-1', [
      {
        id: 'contact-1',
        displayName: 'Test Contact',
        email: 'test@example.com',
        status: 'active',
        companyId: 'company-1',
        userId: 'user-1',
      },
    ]);

    await getDemoContactsMap(mockTransaction, filters);

    // Should pass filters to underlying functions
    const { getDemoCompanies } = await import('../../shared/utils.js');
    const { generateDemoCompaniesMap } = await import('../002_companies/companies.data.js');

    expect(getDemoCompanies).toHaveBeenCalledWith(expect.anything(), filters);
    expect(generateDemoCompaniesMap).toHaveBeenCalledWith(filters);
  });
});
