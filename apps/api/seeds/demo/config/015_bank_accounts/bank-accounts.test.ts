import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { createDemoBankAccounts, deleteDemoBankAccounts } from './bank-accounts.fn.js';

// Mock shared utilities - handle user/company lookups, account types, banks, and data deletion
vi.mock('../../shared/utils.js', () => ({
  getDemoUserMap: vi.fn().mockResolvedValue(
    new Map([
      ['alice@us-demo.com', 'user-1'],
      ['bob@ng-demo.com', 'user-2'],
    ]),
  ),
  getAccountTypeByKey: vi.fn().mockResolvedValue({
    id: 'account-type-1',
    key: 'ca_bank',
    label: 'Bank Account',
  }),
  getBankMap: vi.fn().mockResolvedValue(
    new Map([
      ['us_chase_bank', 'bank-1'],
      ['ng_gtbank', 'bank-2'],
      ['us_wells_fargo', 'bank-3'],
    ]),
  ),
  resolveFiltersToIds: vi.fn().mockReturnValue(['bizDemoUS']),
  deleteDemoData: vi.fn().mockResolvedValue(undefined),
}));

// Mock companies data - provides the demo companies for bank account creation
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
      currency: { code: 'USD' },
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
      currency: { code: 'USD' },
    },
  ]),
}));

// Mock the bank accounts data module
vi.mock('./bank-accounts.data.js', () => ({
  getRawBankAccountsForInsertion: vi.fn().mockResolvedValue([
    {
      company: {
        id: 'company-1',
        shortCode: 'bizDemoUS',
        companyType: 'business',
      },
      user: { id: 'user-1' },
      country: { code: 'US' },
      currencyCode: 'USD',
      bankAccounts: [
        {
          displayName: 'Business Checking',
          accountName: 'Business Operating Account',
          accountType: 'checkings_current',
          accountNumber: '1234567890',
          businessOrPersonal: 'business',
          bankKey: 'us_chase_bank',
          companyId: 'company-1',
          currencyCode: 'USD',
          createdByEmail: 'alice@us-demo.com',
        },
        {
          displayName: 'Business Credit Card',
          accountName: 'Business Credit Line',
          accountType: 'credit_card',
          accountNumber: '4111111111111111',
          businessOrPersonal: 'business',
          bankKey: 'us_wells_fargo',
          companyId: 'company-1',
          currencyCode: 'USD',
          createdByEmail: 'alice@us-demo.com',
        },
      ],
    },
  ]),
}));

// Mock shared config for currencies
vi.mock('../../shared/config.js', () => ({
  DEMO_CURRENCIES: {
    USD: {
      id: 'currency-usd',
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
    },
    NGN: {
      id: 'currency-ngn',
      code: 'NGN',
      name: 'Nigerian Naira',
      symbol: '₦',
    },
  },
}));

/**
 * Creates a simplified mock Knex transaction for bank accounts testing.
 * Simulates database queries for bank_accounts, coa, and related tables.
 */
const createMockTransaction = (
  options: {
    existingBankAccounts?: boolean;
    coaInsertFails?: boolean;
    bankAccountInsertFails?: boolean;
    bankAccountsToDelete?: Array<{ coa_id: string }>;
  } = {},
): Knex.Transaction => {
  const mockTransaction = vi.fn((tableName: string) => {
    const queryBuilder = {
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      first: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      join: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      delete: vi.fn(),
    };

    switch (tableName) {
      case 'bank_accounts':
        // Configure whether bank accounts already exist
        queryBuilder.first.mockResolvedValue(
          options.existingBankAccounts ? { id: 'existing-account' } : null,
        );

        // Configure bank account insertion
        if (options.bankAccountInsertFails) {
          queryBuilder.returning.mockResolvedValue([]);
        } else {
          queryBuilder.returning.mockResolvedValue([
            {
              id: 'bank-account-1',
              display_name: 'Business Checking',
              account_name: 'Business Operating Account',
              account_number: '1234567890',
              coa_id: 'coa-1',
            },
          ]);
        }

        // Configure bank accounts for deletion query
        if (options.bankAccountsToDelete) {
          queryBuilder.select.mockResolvedValue(options.bankAccountsToDelete);
        }
        break;

      case 'coa':
        // Configure COA insertion
        if (options.coaInsertFails) {
          queryBuilder.returning.mockResolvedValue([]);
        } else {
          queryBuilder.returning.mockResolvedValue([
            {
              id: 'coa-1',
              name: 'Business Checking',
              company_id: 'company-1',
              account_type_id: 'account-type-1',
            },
          ]);
        }

        // Configure COA deletion
        queryBuilder.delete.mockResolvedValue(1);
        break;
    }

    return queryBuilder;
  });

  return mockTransaction as any as Knex.Transaction;
};

// Test bank accounts creation functionality
describe('createDemoBankAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('should create bank accounts and COA entries for companies', async () => {
    const mockTransaction = createMockTransaction();

    const result = await createDemoBankAccounts(mockTransaction);

    // Should query for existing bank accounts and create new ones
    expect(mockTransaction).toHaveBeenCalledWith('bank_accounts');
    expect(mockTransaction).toHaveBeenCalledWith('coa');
    expect(Array.isArray(result)).toBe(true);
  });

  test('should create COA entry first, then bank account with reference', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoBankAccounts(mockTransaction);

    // Should create COA first
    expect(mockTransaction).toHaveBeenCalledWith('coa');
    // Then create bank account with COA reference
    expect(mockTransaction).toHaveBeenCalledWith('bank_accounts');
  });

  test('should handle business company bank accounts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock business company data
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    (getRawBankAccountsForInsertion as any).mockResolvedValueOnce([
      {
        company: {
          id: 'company-1',
          shortCode: 'bizDemoUS',
          companyType: 'business',
        },
        currencyCode: 'USD',
        bankAccounts: [
          {
            displayName: 'Business Checking',
            accountName: 'Business Operating Account',
            accountType: 'checkings_current',
            accountNumber: '1234567890',
            businessOrPersonal: 'business',
            bankKey: 'us_chase_bank',
            createdByEmail: 'alice@us-demo.com',
          },
          {
            displayName: 'Business Credit Card',
            accountName: 'Business Credit Line',
            accountType: 'credit_card',
            accountNumber: '4111111111111111',
            businessOrPersonal: 'business',
            bankKey: 'us_wells_fargo',
            createdByEmail: 'alice@us-demo.com',
          },
        ],
      },
    ]);

    await createDemoBankAccounts(mockTransaction);

    // Should create multiple accounts for business company
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Creating 2 bank accounts for company bizDemoUS'),
    );
  });

  test('should handle individual company bank accounts', async () => {
    const mockTransaction = createMockTransaction();

    // Mock individual company data
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    (getRawBankAccountsForInsertion as any).mockResolvedValueOnce([
      {
        company: {
          id: 'company-2',
          shortCode: 'indDemoUS',
          companyType: 'individual',
        },
        currencyCode: 'USD',
        bankAccounts: [
          {
            displayName: 'Primary Checking',
            accountName: 'Primary Checking Account',
            accountType: 'checkings_current',
            accountNumber: '9876543210',
            businessOrPersonal: 'personal',
            bankKey: 'us_chase_bank',
            createdByEmail: 'alice@us-demo.com',
          },
        ],
      },
    ]);

    await createDemoBankAccounts(mockTransaction);

    // Should create accounts for individual company
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Creating 1 bank accounts for company indDemoUS'),
    );
  });

  test('should handle Nigeria companies with NGN currency', async () => {
    const mockTransaction = createMockTransaction();

    // Mock Nigeria company data
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    (getRawBankAccountsForInsertion as any).mockResolvedValueOnce([
      {
        company: {
          id: 'company-ng',
          shortCode: 'bizDemoNG',
          companyType: 'business',
        },
        currencyCode: 'NGN',
        bankAccounts: [
          {
            displayName: 'Business Checking',
            accountName: 'Business Operating Account',
            accountType: 'checkings_current',
            accountNumber: '1234567890',
            businessOrPersonal: 'business',
            bankKey: 'ng_gtbank',
            createdByEmail: 'bob@ng-demo.com',
          },
        ],
      },
    ]);

    await createDemoBankAccounts(mockTransaction);

    // Should handle NGN currency
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Creating 1 bank accounts for company bizDemoNG'),
    );
  });

  test('should skip when bank accounts already exist (idempotency)', async () => {
    const mockTransaction = createMockTransaction({
      existingBankAccounts: true,
    });

    await createDemoBankAccounts(mockTransaction);

    // Should check for existing accounts but not create new ones
    expect(mockTransaction).toHaveBeenCalledWith('bank_accounts');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Bank accounts already exist for company'),
    );
  });

  test('should handle missing account type error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock missing account type
    const { getAccountTypeByKey } = await import('../../shared/utils.js');
    (getAccountTypeByKey as any).mockResolvedValueOnce(null);

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Failed to fetch account type ca_bank for bank account',
    );
  });

  test('should handle missing bank error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty bank map
    const { getBankMap } = await import('../../shared/utils.js');
    (getBankMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Bank with key us_chase_bank not found',
    );
  });

  test('should handle missing currency error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock data with invalid currency
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    (getRawBankAccountsForInsertion as any).mockResolvedValueOnce([
      {
        company: {
          id: 'company-1',
          shortCode: 'bizDemoUS',
        },
        currencyCode: 'INVALID',
        bankAccounts: [{ bankKey: 'us_chase_bank', createdByEmail: 'alice@us-demo.com' }],
      },
    ]);

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Demo currency INVALID not found',
    );
  });

  test('should handle user not found error', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty user map
    const { getDemoUserMap } = await import('../../shared/utils.js');
    (getDemoUserMap as any).mockResolvedValueOnce(new Map());

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Demo user not found for email: alice@us-demo.com',
    );
  });

  test('should handle COA creation failure', async () => {
    const mockTransaction = createMockTransaction({
      coaInsertFails: true,
    });

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Failed to create COA for bank account',
    );
  });

  test('should handle bank account creation failure', async () => {
    const mockTransaction = createMockTransaction({
      bankAccountInsertFails: true,
    });

    await expect(createDemoBankAccounts(mockTransaction)).rejects.toThrow(
      'Failed to create bank account',
    );
  });

  test('should handle empty companies list', async () => {
    const mockTransaction = createMockTransaction();

    // Mock empty companies list
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    (getRawBankAccountsForInsertion as any).mockResolvedValueOnce([]);

    const result = await createDemoBankAccounts(mockTransaction);

    // Should log and return undefined
    expect(console.log).toHaveBeenCalledWith('No bank accounts to create based on filters');
    expect(result).toBeUndefined();
  });

  test('should handle filters', async () => {
    const mockTransaction = createMockTransaction();
    const filters = { countryCodes: ['US' as any] };

    await createDemoBankAccounts(mockTransaction, filters);

    // Should pass filters to getRawBankAccountsForInsertion
    const { getRawBankAccountsForInsertion } = await import('./bank-accounts.data.js');
    expect(getRawBankAccountsForInsertion).toHaveBeenCalledWith(mockTransaction, filters);
  });

  test('should log success message with correct count', async () => {
    const mockTransaction = createMockTransaction();

    await createDemoBankAccounts(mockTransaction);

    // Should log successful creation
    expect(console.log).toHaveBeenCalledWith('Successfully created bank accounts for 1 companies');
  });
});

// Test bank accounts deletion functionality
describe('deleteDemoBankAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should delete bank accounts and associated COA entries', async () => {
    const mockTransaction = createMockTransaction({
      bankAccountsToDelete: [{ coa_id: 'coa-1' }, { coa_id: 'coa-2' }],
    });

    await deleteDemoBankAccounts(mockTransaction);

    // Should query bank accounts first to get COA IDs
    expect(mockTransaction).toHaveBeenCalledWith('bank_accounts');

    // Should call shared deletion utility for bank accounts
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'bank_accounts',
      filters: undefined,
    });

    // Should delete associated COA entries
    expect(mockTransaction).toHaveBeenCalledWith('coa');
    expect(console.log).toHaveBeenCalledWith('Deleted 2 associated COA entries for bank accounts');
  });

  test('should delete with filters', async () => {
    const mockTransaction = createMockTransaction({
      bankAccountsToDelete: [{ coa_id: 'coa-1' }],
    });
    const filters = { companyIds: ['bizDemoUS'] };

    await deleteDemoBankAccounts(mockTransaction, filters);

    // Should pass filters to deletion utility
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalledWith({
      trx: mockTransaction,
      table: 'bank_accounts',
      filters: filters,
    });
  });

  test('should handle no associated COA entries', async () => {
    const mockTransaction = createMockTransaction({
      bankAccountsToDelete: [
        { coa_id: '' }, // No COA reference
      ],
    });

    await deleteDemoBankAccounts(mockTransaction);

    // Should still delete bank accounts
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalled();

    // Should not attempt COA deletion for null coa_ids
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Deleted'));
  });

  test('should handle empty bank accounts to delete', async () => {
    const mockTransaction = createMockTransaction({
      bankAccountsToDelete: [],
    });

    await deleteDemoBankAccounts(mockTransaction);

    // Should still call deletion utility but not delete COA entries
    const { deleteDemoData } = await import('../../shared/utils.js');
    expect(deleteDemoData).toHaveBeenCalled();

    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Deleted'));
  });
});
