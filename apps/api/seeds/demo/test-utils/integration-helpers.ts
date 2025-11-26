import type { Knex } from 'knex';
import {
  setupTestDatabase,
  getTestDb,
  closeTestDbConnection,
  assertTestEnvironment,
} from '../../../config/test-db.js';

/**
 * Integration test helper for demo seeds that use actual database
 */
export class SeedIntegrationTestHelper {
  private knex: Knex | null = null;
  private transaction: Knex.Transaction | null = null;

  /**
   * Setup test database and transaction
   */
  async setup(): Promise<void> {
    assertTestEnvironment();
    await setupTestDatabase();
    this.knex = getTestDb();
    this.transaction = await this.knex.transaction();
  }

  /**
   * Cleanup transaction and database connection
   */
  async cleanup(): Promise<void> {
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
    if (this.knex) {
      // Note: We don't destroy the knex instance as it's shared
      this.knex = null;
    }
  }

  /**
   * Get the test transaction
   */
  getTransaction(): Knex.Transaction {
    if (!this.transaction) {
      throw new Error('Test helper not setup. Call setup() first.');
    }
    return this.transaction;
  }

  /**
   * Get the knex instance
   */
  getKnex(): Knex {
    if (!this.knex) {
      throw new Error('Test helper not setup. Call setup() first.');
    }
    return this.knex;
  }

  /**
   * Count records in a table with optional conditions
   */
  async countRecords(
    tableName: string,
    where?: Record<string, any>,
  ): Promise<number> {
    const trx = this.getTransaction();
    let query = trx(tableName);

    if (where) {
      query = query.where(where);
    }

    const result = await query.count('* as count').first();
    return Number(result?.count) || 0;
  }

  /**
   * Check if records exist with specific conditions
   */
  async recordsExist(
    tableName: string,
    where: Record<string, any>,
  ): Promise<boolean> {
    const count = await this.countRecords(tableName, where);
    return count > 0;
  }

  /**
   * Get records from a table with optional conditions
   */
  async getRecords(
    tableName: string,
    where?: Record<string, any>,
  ): Promise<any[]> {
    const trx = this.getTransaction();
    let query = trx(tableName);

    if (where) {
      query = query.where(where);
    }

    return query.select('*');
  }

  /**
   * Create a fresh transaction (commits/rollback current one)
   */
  async refreshTransaction(): Promise<void> {
    if (this.transaction) {
      await this.transaction.rollback();
    }

    if (!this.knex) {
      throw new Error('Knex not initialized');
    }

    this.transaction = await this.knex.transaction();
  }

  /**
   * Execute a seed function and verify it completed successfully
   */
  async executeSeedFunction(
    seedFn: (trx: Knex.Transaction, filters?: any) => Promise<any>,
    filters?: any,
  ): Promise<any> {
    const trx = this.getTransaction();
    return await seedFn(trx, filters);
  }

  /**
   * Verify demo data structure and consistency
   */
  async verifyDemoDataStructure(): Promise<{
    users: number;
    companies: number;
    contacts: number;
    projects: number;
    bankAccounts: number;
    coa: number;
  }> {
    return {
      users: await this.countRecords('users', { is_demo_user: true }),
      companies: await this.countRecords('companies', {
        is_demo_company: true,
      }),
      contacts: await this.countRecords('contacts', {}),
      projects: await this.countRecords('projects', {}),
      bankAccounts: await this.countRecords('bank_accounts', {}),
      coa: await this.countRecords('coa', {}),
    };
  }
}

/**
 * Setup function for integration tests
 */
export async function setupIntegrationTest(): Promise<SeedIntegrationTestHelper> {
  const helper = new SeedIntegrationTestHelper();
  await helper.setup();
  return helper;
}

/**
 * Cleanup function for integration tests
 */
export async function cleanupIntegrationTest(
  helper: SeedIntegrationTestHelper,
): Promise<void> {
  await helper.cleanup();
  await closeTestDbConnection();
}

/**
 * Test data factories
 */
export const TestDataFactories = {
  /**
   * Create a minimal test user
   */
  createTestUser: (overrides: Partial<any> = {}) => ({
    firstname: 'Test',
    lastname: 'User',
    email: 'test@example.com',
    password: 'testpass',
    is_demo_user: true,
    ...overrides,
  }),

  /**
   * Create a minimal test company
   */
  createTestCompany: (overrides: Partial<any> = {}) => ({
    legal_name: 'Test Company',
    display_name: 'Test Company',
    short_code: 'testCo',
    type: 'business',
    is_demo_company: true,
    year_end_day: 31,
    year_end_month: 12,
    accounting_basis: 'modified_accrual_basis',
    reporting_framework: 'us_gaap',
    ...overrides,
  }),
};

/**
 * Common assertions for seed tests
 */
export const SeedTestAssertions = {
  /**
   * Assert that demo users were created correctly
   */
  async assertDemoUsersCreated(
    helper: SeedIntegrationTestHelper,
    expectedCount: number,
  ): Promise<void> {
    const count = await helper.countRecords('users', { is_demo_user: true });
    if (count !== expectedCount) {
      throw new Error(`Expected ${expectedCount} demo users, found ${count}`);
    }
  },

  /**
   * Assert that demo companies were created correctly
   */
  async assertDemoCompaniesCreated(
    helper: SeedIntegrationTestHelper,
    expectedCount: number,
  ): Promise<void> {
    const count = await helper.countRecords('companies', {
      is_demo_company: true,
    });
    if (count !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} demo companies, found ${count}`,
      );
    }
  },

  /**
   * Assert that foreign key relationships are maintained
   */
  async assertForeignKeyIntegrity(
    helper: SeedIntegrationTestHelper,
  ): Promise<void> {
    const trx = helper.getTransaction();

    // Check that all companies have valid created_by_id references
    const companiesWithInvalidUsers = await trx.raw(`
      SELECT c.id, c.short_code 
      FROM companies c 
      LEFT JOIN users u ON c.created_by_id = u.id 
      WHERE c.is_demo_company = true AND u.id IS NULL
    `);

    if (companiesWithInvalidUsers.rows.length > 0) {
      throw new Error(
        `Found companies with invalid user references: ${JSON.stringify(companiesWithInvalidUsers.rows)}`,
      );
    }

    // Check that all contacts belong to demo companies
    const contactsWithInvalidCompanies = await trx.raw(`
      SELECT ct.id, ct.normalized_name 
      FROM contacts ct 
      LEFT JOIN companies c ON ct.company_id = c.id 
      WHERE c.id IS NULL OR c.is_demo_company = false
    `);

    if (contactsWithInvalidCompanies.rows.length > 0) {
      throw new Error(
        `Found contacts with invalid company references: ${JSON.stringify(contactsWithInvalidCompanies.rows)}`,
      );
    }
  },

  /**
   * Assert that data follows demo seed conventions
   */
  async assertDemoSeedConventions(
    helper: SeedIntegrationTestHelper,
  ): Promise<void> {
    const trx = helper.getTransaction();

    // All demo companies should have proper short codes
    const invalidShortCodes = await trx('companies')
      .where('is_demo_company', true)
      .whereNot('short_code', 'like', '%Demo%')
      .select('id', 'short_code');

    if (invalidShortCodes.length > 0) {
      throw new Error(
        `Demo companies should have 'Demo' in short_code: ${JSON.stringify(invalidShortCodes)}`,
      );
    }

    // All demo users should have demo emails
    const invalidEmails = await trx('users')
      .where('is_demo_user', true)
      .whereNot('email', 'like', '%demo%')
      .select('id', 'email');

    if (invalidEmails.length > 0) {
      throw new Error(
        `Demo users should have 'demo' in email: ${JSON.stringify(invalidEmails)}`,
      );
    }
  },
};
