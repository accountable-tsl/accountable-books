import type { Knex } from 'knex';
import { vi } from 'vitest';

/**
 * Comprehensive Knex mock factory for testing demo seeds
 * Provides all the methods and behaviors needed for proper testing
 */
export class KnexMockFactory {
  /**
   * Create a complete Knex transaction mock
   */
  static createTransactionMock(): Knex.Transaction {
    const mockTransaction = vi.fn() as any;

    // Mock the transaction method itself
    mockTransaction.transaction = vi.fn().mockResolvedValue(mockTransaction);

    // Mock all table access methods
    mockTransaction.mockImplementation((tableName: string) => {
      return this.createQueryBuilderMock(tableName);
    });

    // Mock transaction methods
    mockTransaction.commit = vi.fn().mockResolvedValue(undefined);
    mockTransaction.rollback = vi.fn().mockResolvedValue(undefined);

    return mockTransaction;
  }

  /**
   * Create a complete query builder mock
   */
  static createQueryBuilderMock(tableName?: string): any {
    const mockQueryBuilder = {
      // Basic query methods
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      whereNot: vi.fn().mockReturnThis(),
      whereNull: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      first: vi.fn().mockReturnThis(),

      // Conflict resolution methods
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockReturnThis(),
      merge: vi.fn().mockReturnThis(),

      // Return methods
      returning: vi.fn().mockReturnThis(),

      // Raw query method
      raw: vi.fn().mockReturnThis(),

      // Promise methods
      then: vi.fn().mockResolvedValue([]),
      catch: vi.fn().mockReturnThis(),

      // Mock return values
      mockResolvedValue: function (value: any) {
        this.then = vi.fn().mockResolvedValue(value);
        return this;
      },

      mockRejectedValue: function (error: any) {
        this.then = vi.fn().mockRejectedValue(error);
        return this;
      },

      // Mock specific return values for different methods
      mockSelectResult: function (result: any) {
        this.select.mockResolvedValue(result);
        return this;
      },

      mockInsertResult: function (result: any) {
        this.insert.mockResolvedValue(result);
        return this;
      },

      mockUpdateResult: function (result: any) {
        this.update.mockResolvedValue(result);
        return this;
      },

      mockDeleteResult: function (result: any) {
        this.delete.mockResolvedValue(result);
        return this;
      },

      mockCountResult: function (count: number) {
        this.count.mockResolvedValue([{ count: count.toString() }]);
        return this;
      },

      mockFirstResult: function (result: any) {
        this.first.mockResolvedValue(result);
        return this;
      },

      // Mock raw query results
      mockRawResult: function (result: any) {
        this.raw.mockResolvedValue(result);
        return this;
      },
    };

    return mockQueryBuilder;
  }

  /**
   * Create a mock for specific table operations
   */
  static createTableMock(tableName: string, defaultData: any[] = []): any {
    const mockTable = this.createQueryBuilderMock(tableName);

    // Store data for this table
    let tableData = [...defaultData];

    // Mock insert with data tracking
    mockTable.insert.mockImplementation((data: any) => {
      const insertData = Array.isArray(data) ? data : [data];
      tableData.push(...insertData);
      return mockTable.mockInsertResult(insertData);
    });

    // Mock select with data filtering
    mockTable.select.mockImplementation((columns = '*') => {
      return mockTable.mockSelectResult(tableData);
    });

    // Mock where with data filtering
    mockTable.where.mockImplementation((column: string, value: any) => {
      const filteredData = tableData.filter(
        (item: any) => item[column] === value,
      );
      return mockTable.mockSelectResult(filteredData);
    });

    // Mock count
    mockTable.count.mockImplementation(() => {
      return mockTable.mockCountResult(tableData.length);
    });

    // Mock delete
    mockTable.delete.mockImplementation(() => {
      const deletedCount = tableData.length;
      tableData = [];
      return mockTable.mockDeleteResult(deletedCount);
    });

    return mockTable;
  }

  /**
   * Create a mock for users table
   */
  static createUsersTableMock(): any {
    const defaultUsers = [
      {
        id: 'user-1',
        email: 'demo.us@example.com',
        firstname: 'Demo',
        lastname: 'User',
        is_demo_user: true,
      },
      {
        id: 'user-2',
        email: 'demo.ng@example.com',
        firstname: 'Demo',
        lastname: 'User',
        is_demo_user: true,
      },
    ];

    return this.createTableMock('users', defaultUsers);
  }

  /**
   * Create a mock for companies table
   */
  static createCompaniesTableMock(): any {
    const defaultCompanies = [
      {
        id: 'company-1',
        short_code: 'bizDemoUS',
        legal_name: 'Demo Business US',
        display_name: 'Demo Business US',
        type: 'business',
        is_demo_company: true,
        created_by_id: 'user-1',
      },
      {
        id: 'company-2',
        short_code: 'bizDemoNG',
        legal_name: 'Demo Business NG',
        display_name: 'Demo Business NG',
        type: 'business',
        is_demo_company: true,
        created_by_id: 'user-2',
      },
    ];

    return this.createTableMock('companies', defaultCompanies);
  }

  /**
   * Create a mock for contacts table
   */
  static createContactsTableMock(): any {
    const defaultContacts = [
      {
        id: 'contact-1',
        company_id: 'company-1',
        normalized_name: 'Test Contact 1',
        is_demo_contact: true,
      },
      {
        id: 'contact-2',
        company_id: 'company-2',
        normalized_name: 'Test Contact 2',
        is_demo_contact: true,
      },
    ];

    return this.createTableMock('contacts', defaultContacts);
  }

  /**
   * Create a mock for COA table
   */
  static createCoaTableMock(): any {
    const defaultCoa = [
      {
        id: 'coa-1',
        company_id: 'company-1',
        account_code: '1000',
        account_name: 'Cash',
        account_type: 'asset',
        is_demo_coa: true,
      },
      {
        id: 'coa-2',
        company_id: 'company-2',
        account_code: '2000',
        account_name: 'Accounts Payable',
        account_type: 'liability',
        is_demo_coa: true,
      },
    ];

    return this.createTableMock('coa', defaultCoa);
  }

  /**
   * Create a complete Knex instance mock
   */
  static createKnexMock(): Knex {
    const mockKnex = vi.fn() as any;

    // Mock table access
    mockKnex.mockImplementation((tableName: string) => {
      switch (tableName) {
        case 'users':
          return this.createUsersTableMock();
        case 'companies':
          return this.createCompaniesTableMock();
        case 'contacts':
          return this.createContactsTableMock();
        case 'coa':
          return this.createCoaTableMock();
        default:
          return this.createTableMock(tableName);
      }
    });

    // Mock transaction
    mockKnex.transaction = vi
      .fn()
      .mockImplementation(async (callback?: any) => {
        const transaction = this.createTransactionMock();

        if (callback) {
          return await callback(transaction);
        }

        return transaction;
      });

    // Mock raw queries
    mockKnex.raw = vi.fn().mockResolvedValue({ rows: [] });

    return mockKnex;
  }

  /**
   * Create a mock for console.log
   */
  static createConsoleMock(): any {
    return vi.spyOn(console, 'log').mockImplementation(() => {});
  }

  /**
   * Reset all mocks
   */
  static resetMocks(): void {
    vi.clearAllMocks();
  }
}

/**
 * Helper function to create a simple mock transaction for basic tests
 */
export function createSimpleTransactionMock(): Knex.Transaction {
  const mockTransaction = vi.fn() as any;

  // Mock table access
  mockTransaction.mockImplementation((tableName: string) => {
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockReturnThis(),
      merge: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      first: vi.fn().mockReturnThis(),
      raw: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue([]),
      catch: vi.fn().mockReturnThis(),
    };

    return queryBuilder;
  });

  // Mock transaction methods
  mockTransaction.commit = vi.fn().mockResolvedValue(undefined);
  mockTransaction.rollback = vi.fn().mockResolvedValue(undefined);

  return mockTransaction;
}
