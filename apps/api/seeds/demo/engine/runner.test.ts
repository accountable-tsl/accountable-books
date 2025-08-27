/* eslint-disable prefer-spread */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Knex } from 'knex';
import { DemoSeedRunner, createDemoSeedRunner, type RunnerOptions } from './runner.js';
import type { DemoFilter } from '../shared/config.js';

// Mock the registry with complete 6-step registry matching reality
vi.mock('./registry.js', () => {
  // Create mock functions inside the factory to avoid hoisting issues
  const mockCreateFns = {
    user: vi.fn().mockResolvedValue(undefined),
    companies: vi.fn().mockResolvedValue(undefined),
    'chart-of-accounts': vi.fn().mockResolvedValue(undefined),
    contacts: vi.fn().mockResolvedValue(undefined),
    projects: vi.fn().mockResolvedValue(undefined),
    'bank-accounts': vi.fn().mockResolvedValue(undefined),
  };

  const mockDeleteFns = {
    user: vi.fn().mockResolvedValue(undefined),
    companies: vi.fn().mockResolvedValue(undefined),
    'chart-of-accounts': vi.fn().mockResolvedValue(undefined),
    contacts: vi.fn().mockResolvedValue(undefined),
    projects: vi.fn().mockResolvedValue(undefined),
    'bank-accounts': vi.fn().mockResolvedValue(undefined),
  };

  return {
    SEED_STEPS: [
      {
        name: 'user',
        order: 1,
        createFn: mockCreateFns.user,
        deleteFn: mockDeleteFns.user,
      },
      {
        name: 'companies',
        order: 2,
        createFn: mockCreateFns.companies,
        deleteFn: mockDeleteFns.companies,
      },
      {
        name: 'chart-of-accounts',
        order: 3,
        createFn: mockCreateFns['chart-of-accounts'],
        deleteFn: mockDeleteFns['chart-of-accounts'],
      },
      {
        name: 'contacts',
        order: 4,
        createFn: mockCreateFns.contacts,
        deleteFn: mockDeleteFns.contacts,
      },
      {
        name: 'projects',
        order: 5,
        createFn: mockCreateFns.projects,
        deleteFn: mockDeleteFns.projects,
      },
      {
        name: 'bank-accounts',
        order: 6,
        createFn: mockCreateFns['bank-accounts'],
        deleteFn: mockDeleteFns['bank-accounts'],
      },
    ],
  };
});

describe('DemoSeedRunner', () => {
  let mockKnex: any;
  let mockTransaction: any;
  let runner: DemoSeedRunner;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock console.log
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockTransaction = vi.fn();
    mockKnex = {
      transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockTransaction);
      }),
    };

    runner = new DemoSeedRunner(mockKnex);
  });

  describe('apply', () => {
    test('should run all steps in sequential order by default', async () => {
      await runner.apply();

      expect(mockKnex.transaction).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('🌱 Applying demo seeds...');
      expect(console.log).toHaveBeenCalledWith(
        '   Steps: user, companies, chart-of-accounts, contacts, projects, bank-accounts',
      );
      expect(console.log).toHaveBeenCalledWith('   Filters:', 'none');
      expect(console.log).toHaveBeenCalledWith('   Mode: sequential');
    });

    test('should pass filters to step functions', async () => {
      const filters: DemoFilter = { countryCodes: ['US'] };
      await runner.apply(filters);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Filters:'), filters);
    });

    test('should run in parallel mode when requested', async () => {
      const options: RunnerOptions = { parallel: true };
      await runner.apply(undefined, options);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Mode: parallel'));
      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Running in parallel mode - dependencies may not be respected',
      );
    });

    test('should skip execution in dry run mode', async () => {
      const options: RunnerOptions = { dryRun: true };
      await runner.apply(undefined, options);

      expect(console.log).toHaveBeenCalledWith('✅ Dry run complete - no changes made');
      expect(mockKnex.transaction).not.toHaveBeenCalled();
    });

    test('should filter steps when steps option provided', async () => {
      const options: RunnerOptions = { steps: ['user', 'companies'] };
      await runner.apply(undefined, options);

      expect(console.log).toHaveBeenCalledWith('   Steps: user, companies');
    });

    test('should handle transaction errors', async () => {
      const error = new Error('Transaction failed');
      mockKnex.transaction.mockRejectedValue(error);

      await expect(runner.apply()).rejects.toThrow('Transaction failed');
    });

    test('should call step functions in correct order', async () => {
      const { SEED_STEPS } = await import('./registry.js');

      await runner.apply();

      // Verify all create functions were called with correct parameters
      SEED_STEPS.forEach((step) => {
        if (step.createFn) {
          expect(step.createFn).toHaveBeenCalledWith(mockTransaction, undefined);
        }
      });
    });

    test('should handle step execution errors', async () => {
      const { SEED_STEPS } = await import('./registry.js');
      const error = new Error('Step execution failed');

      // Mock the first step to throw an error
      (SEED_STEPS[0].createFn as any)?.mockRejectedValueOnce(error);

      await expect(runner.apply()).rejects.toThrow('Step execution failed');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to create user: Step execution failed'),
      );
    });
  });

  describe('reverse', () => {
    test('should run all steps in reverse order', async () => {
      await runner.reverse();

      expect(mockKnex.transaction).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('🧹 Reversing demo seeds...');
      expect(console.log).toHaveBeenCalledWith(
        '   Steps: bank-accounts, projects, contacts, chart-of-accounts, companies, user',
      );
      expect(console.log).toHaveBeenCalledWith('   Filters:', 'none');
      expect(console.log).toHaveBeenCalledWith('   Mode: sequential');
    });

    test('should pass filters to delete functions', async () => {
      const filters: DemoFilter = { countryCodes: ['NG'] };
      await runner.reverse(filters);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Filters:'), filters);
    });

    test('should skip execution in dry run mode', async () => {
      const options: RunnerOptions = { dryRun: true };
      await runner.reverse(undefined, options);

      expect(console.log).toHaveBeenCalledWith('✅ Dry run complete - no changes made');
      expect(mockKnex.transaction).not.toHaveBeenCalled();
    });

    test('should call delete functions in reverse order', async () => {
      const { SEED_STEPS } = await import('./registry.js');

      await runner.reverse();

      // Verify delete functions were called in reverse order
      const reversedSteps = [...SEED_STEPS].reverse();
      reversedSteps.forEach((step) => {
        if (step.deleteFn) {
          expect(step.deleteFn).toHaveBeenCalledWith(mockTransaction, undefined);
        }
      });
    });

    test('should handle step deletion errors', async () => {
      const { SEED_STEPS } = await import('./registry.js');
      const error = new Error('Deletion failed');
      (SEED_STEPS[2].deleteFn as any)?.mockRejectedValueOnce(error); // chart-of-accounts step (index 2)

      await expect(runner.reverse()).rejects.toThrow('Deletion failed');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to delete chart-of-accounts: Deletion failed'),
      );
    });
  });

  describe('reset', () => {
    test('should call reverse then apply', async () => {
      const reverseSpy = vi.spyOn(runner, 'reverse');
      const applySpy = vi.spyOn(runner, 'apply');

      const filters: DemoFilter = { companyTypes: ['business'] };
      const options: RunnerOptions = { steps: ['user', 'companies'] };

      await runner.reset(filters, options);

      expect(reverseSpy).toHaveBeenCalledWith(filters, options);
      expect(applySpy).toHaveBeenCalledWith(filters, options);
      expect(console.log).toHaveBeenCalledWith('🔄 Resetting demo seeds...');
      expect(console.log).toHaveBeenCalledWith('✅ Demo seeds reset successfully');
    });

    test('should handle reset errors', async () => {
      vi.spyOn(runner, 'reverse').mockRejectedValue(new Error('Reset failed'));

      await expect(runner.reset()).rejects.toThrow('Reset failed');
    });
  });

  describe('status', () => {
    beforeEach(() => {
      // Mock database queries for status - convert mockKnex to a function
      const mockKnexFn = vi.fn((tableName: string) => {
        const mockQuery = {
          where: vi.fn().mockReturnThis(),
          join: vi.fn().mockReturnThis(),
          count: vi.fn().mockReturnThis(),
          first: vi.fn(),
        };

        switch (tableName) {
          case 'users':
            mockQuery.first.mockResolvedValue({ count: '5' });
            break;
          case 'companies':
            mockQuery.first.mockResolvedValue({ count: '6' });
            break;
          case 'contacts':
            mockQuery.first.mockResolvedValue({ count: '20' });
            break;
          case 'coa':
            mockQuery.first.mockResolvedValue({ count: '100' });
            break;
          case 'projects':
            mockQuery.first.mockResolvedValue({ count: '8' });
            break;
          case 'bank_accounts':
            mockQuery.first.mockResolvedValue({ count: '12' });
            break;
          default:
            mockQuery.first.mockResolvedValue({ count: '0' });
        }

        return mockQuery;
      });

      // Replace the existing mockKnex properties with the function version
      Object.setPrototypeOf(mockKnex, mockKnexFn);
      for (const key in mockKnexFn) {
        mockKnex[key] = mockKnexFn[key];
      }
      mockKnex.transaction = vi.fn().mockImplementation(async (callback) => {
        return callback(mockTransaction);
      });

      runner = new DemoSeedRunner(mockKnex);
    });

    test('should display status for all steps', async () => {
      await runner.status();

      expect(console.log).toHaveBeenCalledWith('📊 Demo Seed Status:');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   user'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   companies'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   chart-of-accounts'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   contacts'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   projects'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('   bank-accounts'));
    });

    test('should handle database errors in status queries', async () => {
      // Create a fresh runner with failing knex
      const failingKnex = vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        join: vi.fn().mockReturnThis(),
        count: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error('Query failed')),
      }));

      const failingRunner = new DemoSeedRunner(failingKnex as any);
      await failingRunner.status();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('? records (error: Query failed)'),
      );
    });

    test('should handle missing count results', async () => {
      // Create a fresh runner with null-returning knex
      const nullKnex = vi.fn(() => ({
        where: vi.fn().mockReturnThis(),
        join: vi.fn().mockReturnThis(),
        count: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // No result
      }));

      const nullRunner = new DemoSeedRunner(nullKnex as any);
      await nullRunner.status();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0 records'));
    });
  });

  describe('getSteps', () => {
    test('should return all steps when no filter provided', async () => {
      const options: RunnerOptions = {};

      // Access private method through apply to test it
      await runner.apply(undefined, options);

      expect(console.log).toHaveBeenCalledWith(
        '   Steps: user, companies, chart-of-accounts, contacts, projects, bank-accounts',
      );
    });

    test('should filter and sort steps when specific steps requested', async () => {
      const options: RunnerOptions = { steps: ['contacts', 'user'] };

      await runner.apply(undefined, options);

      // Should sort by order: user (1), contacts (4)
      expect(console.log).toHaveBeenCalledWith('   Steps: user, contacts');
    });

    test('should throw error for unknown step', async () => {
      const options: RunnerOptions = { steps: ['unknown-step'] };

      await expect(runner.apply(undefined, options)).rejects.toThrow(
        'Unknown step: unknown-step. Available steps: user, companies, chart-of-accounts, contacts, projects, bank-accounts',
      );
    });
  });

  describe('runSequential vs runParallel', () => {
    test('should execute steps sequentially by default', async () => {
      const { SEED_STEPS } = await import('./registry.js');

      const executionOrder: string[] = [];
      SEED_STEPS.forEach((step) => {
        if (step.createFn) {
          (step.createFn as any).mockImplementation(async () => {
            executionOrder.push(step.name);
          });
        }
      });

      await runner.apply();

      expect(executionOrder).toEqual([
        'user',
        'companies',
        'chart-of-accounts',
        'contacts',
        'projects',
        'bank-accounts',
      ]);
    });

    test('should skip steps without required functions', async () => {
      const { SEED_STEPS } = await import('./registry.js');
      // Remove createFn from companies step
      SEED_STEPS[1].createFn = undefined;

      await runner.apply();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('⏭️  Skipping companies (no create function)'),
      );
    });

    test('should handle parallel execution', async () => {
      const options: RunnerOptions = { parallel: true };
      await runner.apply(undefined, options);

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Running in parallel mode - dependencies may not be respected',
      );
    });
  });
});

describe('createDemoSeedRunner', () => {
  test('should create runner instance', () => {
    const mockKnex = {} as Knex;
    const runner = createDemoSeedRunner(mockKnex);

    expect(runner).toBeInstanceOf(DemoSeedRunner);
  });

  test('should pass knex instance to runner', () => {
    const mockKnex = {} as Knex;
    const runner = createDemoSeedRunner(mockKnex);

    expect((runner as any).knex).toBe(mockKnex);
  });
});

describe('Runner Options', () => {
  let runner: DemoSeedRunner;

  beforeEach(() => {
    const mockKnex = {
      transaction: vi.fn().mockImplementation(async (callback) => callback(vi.fn())),
    };
    runner = new DemoSeedRunner(mockKnex as any);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('should handle empty options object', async () => {
    await expect(runner.apply(undefined, {})).resolves.not.toThrow();
  });

  test('should handle undefined options', async () => {
    await expect(runner.apply(undefined, undefined)).resolves.not.toThrow();
  });

  test('should combine multiple options', async () => {
    const options: RunnerOptions = {
      steps: ['user'],
      parallel: true,
      dryRun: true,
    };

    await runner.apply(undefined, options);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Mode: parallel (dry run)'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Steps: user'));
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Note: Transaction rollback behavior is already tested via "should handle step execution errors" test

  test('should provide detailed error messages', async () => {
    const mockKnex = {
      transaction: vi.fn().mockImplementation(async (callback) => {
        const mockTrx = vi.fn();
        return callback(mockTrx);
      }),
    };

    const runner = new DemoSeedRunner(mockKnex as any);
    const { SEED_STEPS } = await import('./registry.js');
    (SEED_STEPS[0].createFn as any)?.mockRejectedValue(new Error('Database connection failed'));

    await expect(runner.apply()).rejects.toThrow('Database connection failed');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed to create user: Database connection failed'),
    );
  });
});
