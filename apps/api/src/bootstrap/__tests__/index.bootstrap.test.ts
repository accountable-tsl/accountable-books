import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';

import {
  BootstrapPhaseExecutionError,
  resolveBootstrapPlan,
  runBootstrap,
} from '../index.js';

describe('resolveBootstrapPlan', () => {
  it('returns only default-enabled phases by default', () => {
    expect(resolveBootstrapPlan()).toEqual([
      'users',
      'roles',
      'countries',
      'currencies',
      'financial-statements',
      'account-elements',
      'account-types',
      'coa-templates',
    ]);
  });

  it('expands dependencies for explicit phases', () => {
    expect(resolveBootstrapPlan({ phases: ['fx-seeds'] })).toEqual([
      'currencies',
      'fx-seeds',
    ]);
  });

  it('expands accounting dependencies for coa-templates', () => {
    expect(resolveBootstrapPlan({ phases: ['coa-templates'] })).toEqual([
      'financial-statements',
      'account-elements',
      'account-types',
      'coa-templates',
    ]);
  });
});

describe('runBootstrap', () => {
  it('fails fast when fx-seeds is selected without pack ids', async () => {
    let transactionCalled = false;
    const fakeDb = {
      transaction: async () => {
        transactionCalled = true;
      },
    } as unknown as Knex;

    await expect(
      runBootstrap(fakeDb, { phases: ['fx-seeds'] }),
    ).rejects.toThrow(
      'Bootstrap phase "fx-seeds" requires one or more pack ids in "fxSeedPackIds".',
    );
    expect(transactionCalled).toBe(false);
  });

  it('captures phase telemetry on runtime failure', async () => {
    const fakeDb = {
      transaction: async (cb: (trx: Knex.Transaction) => Promise<unknown>) =>
        cb({} as Knex.Transaction),
    } as unknown as Knex;

    await expect(runBootstrap(fakeDb)).rejects.toBeInstanceOf(
      BootstrapPhaseExecutionError,
    );

    try {
      await runBootstrap(fakeDb);
    } catch (error) {
      expect(error).toBeInstanceOf(BootstrapPhaseExecutionError);
      const executionError = error as BootstrapPhaseExecutionError;
      expect(executionError.phaseExecutions[0]?.phase).toBe('users');
      expect(executionError.phaseExecutions[0]?.status).toBe('failed');
    }
  });
});
