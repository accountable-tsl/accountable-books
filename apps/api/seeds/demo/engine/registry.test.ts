import { describe, expect, test } from 'vitest';

import { SEED_STEPS } from './registry.js';

import type { DemoFilter } from '../shared/config.js';

describe('SEED_STEPS Registry', () => {
  test('should contain all expected steps', () => {
    const expectedSteps = [
      'user',
      'companies',
      'chart-of-accounts',
      'contacts',
      'projects',
      'bank-accounts',
      'bank-transactions',
    ];
    const actualSteps = SEED_STEPS.map((step) => step.name);

    expect(actualSteps).toEqual(expectedSteps);
  });

  test('should have steps in correct dependency order', () => {
    const steps = SEED_STEPS.map((step) => ({
      name: step.name,
      order: step.order,
    }));

    expect(steps).toEqual([
      { name: 'user', order: 1 },
      { name: 'companies', order: 2 },
      { name: 'chart-of-accounts', order: 3 },
      { name: 'contacts', order: 4 },
      { name: 'projects', order: 5 },
      { name: 'bank-accounts', order: 6 },
      { name: 'bank-transactions', order: 7 },
    ]);
  });

  test('should have ascending order numbers', () => {
    const orders = SEED_STEPS.map((step) => step.order);
    const sortedOrders = [...orders].sort((a, b) => a - b);

    expect(orders).toEqual(sortedOrders);
  });

  test('should have unique order numbers', () => {
    const orders = SEED_STEPS.map((step) => step.order);
    const uniqueOrders = [...new Set(orders)];

    expect(orders).toHaveLength(uniqueOrders.length);
  });

  test('should have unique step names', () => {
    const names = SEED_STEPS.map((step) => step.name);
    const uniqueNames = [...new Set(names)];

    expect(names).toHaveLength(uniqueNames.length);
  });

  test('all steps should have required properties', () => {
    SEED_STEPS.forEach((step, index) => {
      expect(step).toHaveProperty('name');
      expect(step).toHaveProperty('order');
      expect(typeof step.name).toBe('string');
      expect(typeof step.order).toBe('number');
      expect(step.name.length).toBeGreaterThan(0);
      expect(step.order).toBeGreaterThan(0);
    });
  });

  test('all steps should have either createFn or deleteFn', () => {
    SEED_STEPS.forEach((step) => {
      const hasCreateFn = typeof step.createFn === 'function';
      const hasDeleteFn = typeof step.deleteFn === 'function';

      expect(hasCreateFn || hasDeleteFn).toBe(true);
    });
  });

  test('foundational steps should have both create and delete functions', () => {
    const foundationalSteps = ['user', 'companies'];

    foundationalSteps.forEach((stepName) => {
      const step = SEED_STEPS.find((s) => s.name === stepName);
      expect(step).toBeDefined();
      expect(step!.createFn).toBeDefined();
      expect(step!.deleteFn).toBeDefined();
      expect(typeof step!.createFn).toBe('function');
      expect(typeof step!.deleteFn).toBe('function');
    });
  });
});

describe('Step Function Types', () => {
  test('createFn should accept correct parameters', () => {
    SEED_STEPS.forEach((step) => {
      if (step.createFn) {
        expect(step.createFn).toBeInstanceOf(Function);
        expect(step.createFn.length).toBeGreaterThanOrEqual(1); // At least transaction parameter
        expect(step.createFn.length).toBeLessThanOrEqual(2); // Transaction + optional filters
      }
    });
  });

  test('deleteFn should accept correct parameters', () => {
    SEED_STEPS.forEach((step) => {
      if (step.deleteFn) {
        expect(step.deleteFn).toBeInstanceOf(Function);
        expect(step.deleteFn.length).toBeGreaterThanOrEqual(1); // At least transaction parameter
        expect(step.deleteFn.length).toBeLessThanOrEqual(2); // Transaction + optional filters
      }
    });
  });
});

describe('Step Dependencies', () => {
  test('users should come before companies', () => {
    const userStep = SEED_STEPS.find((s) => s.name === 'user');
    const companiesStep = SEED_STEPS.find((s) => s.name === 'companies');

    expect(userStep!.order).toBeLessThan(companiesStep!.order);
  });

  test('companies should come before all dependent steps', () => {
    const companiesStep = SEED_STEPS.find((s) => s.name === 'companies');
    const dependentSteps = [
      'chart-of-accounts',
      'contacts',
      'projects',
      'bank-accounts',
      'bank-transactions',
    ];

    dependentSteps.forEach((stepName) => {
      const step = SEED_STEPS.find((s) => s.name === stepName);
      expect(companiesStep!.order).toBeLessThan(step!.order);
    });
  });

  test('chart-of-accounts should come before operational data', () => {
    const coaStep = SEED_STEPS.find((s) => s.name === 'chart-of-accounts');
    const operationalSteps = [
      'contacts',
      'projects',
      'bank-accounts',
      'bank-transactions',
    ];

    operationalSteps.forEach((stepName) => {
      const step = SEED_STEPS.find((s) => s.name === stepName);
      expect(coaStep!.order).toBeLessThan(step!.order);
    });
  });

  test('bank-transactions should come last', () => {
    const bankTransactionsStep = SEED_STEPS.find(
      (s) => s.name === 'bank-transactions',
    );
    const otherSteps = SEED_STEPS.filter((s) => s.name !== 'bank-transactions');

    otherSteps.forEach((step) => {
      expect(step.order).toBeLessThan(bankTransactionsStep!.order);
    });
  });
});

describe('Step Registration Validation', () => {
  test('should not have duplicate function references', () => {
    const createFunctions = SEED_STEPS.map((s) => s.createFn).filter(Boolean);
    const deleteFunctions = SEED_STEPS.map((s) => s.deleteFn).filter(Boolean);

    // Each function should be unique (no shared references)
    const createFunctionStrings = createFunctions.map((fn) => fn!.toString());
    const deleteFunctionStrings = deleteFunctions.map((fn) => fn!.toString());

    const uniqueCreateStrings = [...new Set(createFunctionStrings)];
    const uniqueDeleteStrings = [...new Set(deleteFunctionStrings)];

    expect(createFunctionStrings).toHaveLength(uniqueCreateStrings.length);
    expect(deleteFunctionStrings).toHaveLength(uniqueDeleteStrings.length);
  });

  test('step names should follow naming conventions', () => {
    SEED_STEPS.forEach((step) => {
      // Should be lowercase with optional dashes
      expect(step.name).toMatch(/^[a-z]+(-[a-z]+)*$/);

      // Should not start or end with dash
      expect(step.name).not.toMatch(/^-|-$/);

      // Should be descriptive (at least 3 characters)
      expect(step.name.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('order numbers should start from 1 and be consecutive', () => {
    const orders = SEED_STEPS.map((s) => s.order).sort((a, b) => a - b);

    orders.forEach((order, index) => {
      expect(order).toBe(index + 1);
    });
  });
});

describe('Step Function Import Validation', () => {
  test('all imported functions should be available', () => {
    SEED_STEPS.forEach((step) => {
      if (step.createFn) {
        expect(step.createFn).toBeDefined();
        expect(typeof step.createFn).toBe('function');
      }

      if (step.deleteFn) {
        expect(step.deleteFn).toBeDefined();
        expect(typeof step.deleteFn).toBe('function');
      }
    });
  });

  test('should import from correct modules', () => {
    // This is more of a structural test to ensure imports are working
    const stepFunctions = SEED_STEPS.map((step) => ({
      name: step.name,
      hasCreate: !!step.createFn,
      hasDelete: !!step.deleteFn,
    }));

    expect(stepFunctions).toEqual([
      { name: 'user', hasCreate: true, hasDelete: true },
      { name: 'companies', hasCreate: true, hasDelete: true },
      { name: 'chart-of-accounts', hasCreate: true, hasDelete: true },
      { name: 'contacts', hasCreate: true, hasDelete: true },
      { name: 'projects', hasCreate: true, hasDelete: true },
      { name: 'bank-accounts', hasCreate: true, hasDelete: true },
      { name: 'bank-transactions', hasCreate: true, hasDelete: true },
    ]);
  });
});

describe('Registry Integration', () => {
  test('should be suitable for sequential execution', () => {
    // Steps should be ordered such that they can be executed sequentially
    // without dependency violations
    let previousOrder = 0;

    SEED_STEPS.forEach((step) => {
      expect(step.order).toBeGreaterThan(previousOrder);
      previousOrder = step.order;
    });
  });

  test('should be suitable for reverse execution', () => {
    // When reversed, steps should be safe to delete in reverse order
    const reversedSteps = [...SEED_STEPS].reverse();

    // Bank transactions should be deleted first (most dependent)
    expect(reversedSteps[0].name).toBe('bank-transactions');

    // Companies should be deleted near the end (after all dependents)
    const companiesIndex = reversedSteps.findIndex(
      (s) => s.name === 'companies',
    );
    const usersIndex = reversedSteps.findIndex((s) => s.name === 'user');

    // Users should be deleted last (after companies)
    expect(companiesIndex).toBeLessThan(usersIndex);
  });

  test('should support partial execution', () => {
    // Registry should support executing only a subset of steps
    const firstThreeSteps = SEED_STEPS.slice(0, 3);

    expect(firstThreeSteps.map((s) => s.name)).toEqual([
      'user',
      'companies',
      'chart-of-accounts',
    ]);

    // These should form a valid subset for execution
    firstThreeSteps.forEach((step) => {
      expect(step.createFn).toBeDefined();
      expect(step.deleteFn).toBeDefined();
    });
  });
});
