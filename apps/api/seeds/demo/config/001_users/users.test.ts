import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { createDemoUsers, deleteDemoUsers } from './users.fn.js';
import { DEMO_USERS, US_USER, NG_USER } from './users.data.js';

// Mock the createUser function from the migration file
vi.mock('../../../../migrations/20250403184441_users.ts', () => ({
  createUser: vi.fn(),
}));

// Mock faker to return predictable avatar URLs in tests
vi.mock('@faker-js/faker', () => ({
  faker: {
    image: {
      avatar: vi.fn(() => 'https://fake-avatar.com/avatar.jpg'),
    },
  },
}));

// Test the static data structures to ensure they have the expected format
describe('Users Data', () => {
  test('should have correct structure for US user', () => {
    expect(US_USER).toEqual({
      firstname: 'Uma',
      lastname: 'Doe',
      email: 'demo.us@example.com',
      password: 'StrongDemoPass!',
      is_demo_user: true,
    });
  });

  test('should have correct structure for NG user', () => {
    expect(NG_USER).toEqual({
      firstname: 'Ronke',
      lastname: 'Doe',
      email: 'demo.ng@example.com',
      password: 'StrongDemoPass!',
      is_demo_user: true,
    });
  });

  test('DEMO_USERS should contain both users', () => {
    expect(DEMO_USERS).toHaveLength(2);
    expect(DEMO_USERS).toContain(US_USER);
    expect(DEMO_USERS).toContain(NG_USER);
  });

  test('users should have unique emails', () => {
    const emails = DEMO_USERS.map((user) => user.email);
    const uniqueEmails = [...new Set(emails)];
    expect(emails).toHaveLength(uniqueEmails.length);
  });

  test('users should have valid email format', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    DEMO_USERS.forEach((user) => {
      expect(user.email).toMatch(emailRegex);
    });
  });
});

/**
 * Creates a mock Knex transaction for testing user creation.
 * Simulates database queries to check for existing users.
 *
 * @param existingUsers - Array of users that should appear as already existing in the database
 * @returns Mock transaction that can be passed to createDemoUsers function
 */
const createMockTransaction = (
  existingUsers: { email: string }[] = [],
): Knex.Transaction => {
  // Create a mock query builder
  const mockQueryBuilder = {
    whereIn: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(existingUsers),
  };

  // Create a mock transaction function that returns the query builder when called with table name
  const mockTransaction = vi.fn().mockReturnValue(mockQueryBuilder);

  return mockTransaction as any as Knex.Transaction;
};

/**
 * Creates a mock Knex transaction for testing user deletion.
 * Provides access to individual mock functions for assertion testing.
 *
 * @returns Object containing the mock transaction and individual mock functions
 */
const createMockDeleteTransaction = () => {
  const mockDelete = vi.fn().mockResolvedValue(1);
  const mockWhere = vi.fn().mockReturnThis();
  const mockWhereIn = vi.fn().mockReturnThis();

  // Create a mock query builder
  const mockQueryBuilder = {
    where: mockWhere,
    whereIn: mockWhereIn,
    delete: mockDelete,
  };

  // Create a mock transaction function that returns the query builder when called with table name
  const mockTransaction = vi.fn().mockReturnValue(mockQueryBuilder);

  return {
    transaction: mockTransaction as any as Knex.Transaction,
    mockDelete,
    mockWhere,
    mockWhereIn,
  };
};

// Test the createDemoUsers function which handles idempotent user creation
describe('createDemoUsers', () => {
  let mockCreateUser: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Suppress console.log output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Get the mocked createUser function and configure it to succeed
    const { createUser } = (await vi.importMock(
      '../../../../migrations/20250403184441_users.ts',
    )) as any;
    mockCreateUser = createUser;
    mockCreateUser.mockResolvedValue(undefined);
  });

  test('should create all users when no filters provided', async () => {
    // Mock transaction that returns no existing users (empty database)
    const mockTransaction = createMockTransaction();

    await createDemoUsers(mockTransaction);

    // Should create both US and NG users
    expect(mockCreateUser).toHaveBeenCalledTimes(2);
    expect(mockCreateUser).toHaveBeenCalledWith({
      user: expect.objectContaining({
        email: 'demo.us@example.com',
        is_demo_user: true,
      }),
      trx: mockTransaction,
    });
    expect(mockCreateUser).toHaveBeenCalledWith({
      user: expect.objectContaining({
        email: 'demo.ng@example.com',
        is_demo_user: true,
      }),
      trx: mockTransaction,
    });
  });

  test('should filter users by country code', async () => {
    const mockTransaction = createMockTransaction();

    // Only create US user when filtered by US country code
    await createDemoUsers(mockTransaction, { countryCodes: ['US'] });

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith({
      user: expect.objectContaining({ email: 'demo.us@example.com' }),
      trx: mockTransaction,
    });
  });

  test('should create both users when both country codes provided', async () => {
    const mockTransaction = createMockTransaction();

    // Should create both users when both countries are specified
    await createDemoUsers(mockTransaction, { countryCodes: ['US', 'NG'] });

    expect(mockCreateUser).toHaveBeenCalledTimes(2);
  });

  test('should skip creation when no users match filters', async () => {
    const mockTransaction = createMockTransaction();

    // Should not create any users when invalid country code is provided
    await createDemoUsers(mockTransaction, { countryCodes: ['XX' as any] });

    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('should skip users that already exist', async () => {
    // Mock transaction that returns US user as already existing
    const mockTransaction = createMockTransaction([
      { email: 'demo.us@example.com' },
    ]);

    await createDemoUsers(mockTransaction);

    // Should only create the NG user (US user already exists)
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith({
      user: expect.objectContaining({ email: 'demo.ng@example.com' }),
      trx: mockTransaction,
    });
  });

  test('should skip creation when all users already exist', async () => {
    // Mock transaction that returns both users as already existing
    const mockTransaction = createMockTransaction([
      { email: 'demo.us@example.com' },
      { email: 'demo.ng@example.com' },
    ]);

    await createDemoUsers(mockTransaction);

    // Should not create any users (both already exist)
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});

// Test the deleteDemoUsers function which handles safe user deletion
describe('deleteDemoUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should delete all demo users when no filters provided', async () => {
    const { transaction, mockWhere, mockDelete } =
      createMockDeleteTransaction();

    // When no filters provided, should delete all demo users
    await deleteDemoUsers(transaction);

    expect(mockWhere).toHaveBeenCalledWith('is_demo_user', true);
    expect(mockDelete).toHaveBeenCalled();
  });

  test('should delete specific country users when safe to do so', async () => {
    const { transaction, mockWhereIn, mockDelete } =
      createMockDeleteTransaction();

    // Should delete US user when only US country is specified (complete country deletion)
    await deleteDemoUsers(transaction, { countryCodes: ['US'] });

    expect(mockWhereIn).toHaveBeenCalledWith('email', ['demo.us@example.com']);
    expect(mockDelete).toHaveBeenCalled();
  });

  test('should skip deletion when partial filters present', async () => {
    const { transaction, mockDelete } = createMockDeleteTransaction();

    // Should not delete users when additional filters are present
    // (to avoid foreign key violations from shared users)
    await deleteDemoUsers(transaction, {
      countryCodes: ['US'],
      companyTypes: ['business'],
    });

    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('should skip deletion when multiple countries specified', async () => {
    const { transaction, mockDelete } = createMockDeleteTransaction();

    // Should not delete users when multiple countries are specified
    // (not a complete country deletion)
    await deleteDemoUsers(transaction, { countryCodes: ['US', 'NG'] });

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
